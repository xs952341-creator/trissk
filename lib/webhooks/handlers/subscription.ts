// lib/webhooks/handlers/subscription.ts
// Handler para customer.subscription.updated e customer.subscription.deleted.
// Gere downgrades, upgrades, cancelamentos e reactivações.

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { sendEmailQueued, emailSubscriptionCanceled } from "@/lib/email";
import { initiateDunning, resolveDunning } from "@/lib/dunning";
import { inngest } from "@/lib/inngest";
import { getErrorMessage } from "@/lib/errors";
import { deprovision } from "@/lib/webhooks/services/deprovision";
import type { Profile, ProductTierWithProduct } from "@/lib/types/database";

export { handleSubChange };

void resolveDunning; // available for future use

const APP_URL = NEXT_PUBLIC_APP_URL || "";

async function handleSubChange(sub: Stripe.Subscription) {
  const supabase = createAdminClient();

  const statusMap: Record<string, string> = {
    active: "active", canceled: "canceled", past_due: "past_due", trialing: "trialing",
  };
  const newStatus = statusMap[sub.status] ?? "canceled";

  const { data: dbSub } = await supabase.from("subscriptions")
    .update({ status: newStatus, canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id)
    .select("id, user_id, playbook_id, product_tier_id, stripe_subscription_id")
    .single();

  // ✅ Para metered billing: salvar subscription_item_id na instância SaaS (se existir)
  try {
    const itemId = sub.items?.data?.[0]?.id ?? null;
    if (dbSub?.user_id && dbSub?.product_tier_id) {
      await supabase.from("saas_instances").update({
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : (sub.customer as Stripe.Customer)?.id ?? null,
        stripe_subscription_id: sub.id,
        stripe_subscription_item_id: itemId,
      })
      .eq("user_id", dbSub.user_id)
      .eq("product_tier_id", dbSub.product_tier_id);
    }
  } catch {}

  if (dbSub && (newStatus === "canceled" || newStatus === "past_due")) {
    await deprovision({
      userId: dbSub.user_id, playbookId: dbSub.playbook_id,
      productTierId: dbSub.product_tier_id,
      reason: newStatus === "past_due" ? "payment_failed" : "subscription_canceled",
    });

    if (newStatus === "canceled") {
      if (dbSub.stripe_subscription_id) {
        const { data: invoices } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .limit(1)
          .maybeSingle();
        if (invoices) {
          await supabase
            .from("fiscal_jobs")
            .update({ status: "ABORTED" })
            .eq("status", "PENDING")
            .eq("invoice_id", sub.latest_invoice as string);
        }
      }
    } else if (newStatus === "past_due") {
      await supabase.from("subscriptions").update({ payout_frozen: true }).eq("id", dbSub.id);
    }

    // Notificar buyer
    try {
      await supabase.from("notifications").insert({
        user_id:    dbSub.user_id,
        type:       newStatus === "past_due" ? "payment_failed" : "subscription_canceled",
        title:      newStatus === "past_due" ? "⚠️ Pagamento com problema" : "Assinatura cancelada",
        body:       newStatus === "past_due"
          ? "Seu pagamento falhou. Atualize seu cartão para não perder o acesso."
          : "Sua assinatura foi cancelada e o acesso foi revogado.",
        action_url: "/dashboard/billing",
      });
    } catch (e: unknown) {
      console.error("[sub] notification failed:", getErrorMessage(e));
    }

    // 📧 Email transacional: cancelamento / pagamento com problema (buyer)
    try {
      const { data: buyer } = await supabase.auth.admin.getUserById(dbSub.user_id);
      const buyerEmail = buyer.user?.email ?? "";
      if (buyerEmail) {
        if (newStatus === "canceled") {
          const tpl = emailSubscriptionCanceled({ accessUrl: `${APP_URL}/dashboard/billing` });
          await sendEmailQueued({ to: buyerEmail, subject: tpl.subject, html: tpl.html, tags: [{ name: "event", value: "subscription_canceled" }] });
        }
      }
    } catch (e) {
      console.error("[email] sub change:", getErrorMessage(e));
    }

    // 📱 SMS/WhatsApp de cancelamento via Inngest (non-blocking)
    if (newStatus === "canceled") {
      try {
        const { data: buyer }  = await supabase.auth.admin.getUserById(dbSub.user_id);
        const { data: prof }   = await supabase.from("profiles").select("phone, full_name").eq("id", dbSub.user_id).maybeSingle();
        let productName = "seu produto";
        if (dbSub.product_tier_id) {
          const { data: tier } = await supabase.from("product_tiers").select("tier_name, saas_products(name)").eq("id", dbSub.product_tier_id).maybeSingle();
          productName = (tier as ProductTierWithProduct | null)?.saas_products?.name ?? (tier as Record<string,unknown> | null)?.tier_name as string ?? productName;
        }
        await inngest.send({
          name: "subscription/canceled",
          data: {
            userId:         dbSub.user_id,
            email:          buyer.user?.email ?? "",
            name:           (prof as Profile | null)?.full_name ?? buyer.user?.user_metadata?.full_name ?? "",
            phone:          (prof as Profile | null)?.phone ?? null,
            productName,
            subscriptionId: sub.id,
          },
        });
      } catch { /* não crítico */ }
    }

    // Dunning para past_due
    if (newStatus === "past_due" && dbSub.user_id) {
      try {
        await initiateDunning({
          subscriptionId: sub.id,
          userId: dbSub.user_id,
          email: "",
          currentStep: 0,
          invoiceId: typeof sub.latest_invoice === "string" ? sub.latest_invoice : "",
          productName: "sua assinatura",
          amountBRL: 0,
          portalUrl: `${APP_URL}/dashboard/billing`,
        });
      } catch { /* não crítico */ }
    }
  }
}
