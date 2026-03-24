// lib/webhooks/handlers/invoice-payment-failed.ts
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { sendEmailQueued } from "@/lib/email";
import { initiateDunning } from "@/lib/dunning";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { extractStripeId } from "@/lib/types/stripe-extended";

export { handleInvoicePaymentFailed };

void log;

const APP_URL = NEXT_PUBLIC_APP_URL || "";

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  const supabase = createAdminClient();
  void eventId;

  const meta = {
    ...(invoice.subscription_details?.metadata ?? {}),
    ...(invoice.metadata ?? {}),
  } as Record<string, string>;

  const { userId, vendorId } = meta;

  const subId = extractStripeId(invoice.subscription as string | null);
  if (subId) {
    try {
      await supabase
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subId);
    } catch (e: unknown) {
      console.error("[wh] subscription past_due:", getErrorMessage(e));
    }
  }

  if (userId) {
    try {
      await supabase.from("notifications").insert({
        user_id:    userId,
        type:       "payment_failed",
        title:      "⚠️ Pagamento com problema",
        body:       "Seu pagamento falhou. Atualize seu cartão para não perder o acesso.",
        action_url: "/dashboard/billing",
      });
    } catch (e: unknown) {
      console.error("[wh] notification payment_failed:", getErrorMessage(e));
    }

    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser.user?.email ?? "";
      if (email) {
        await sendEmailQueued({
          to: email,
          subject: "⚠️ Falha no pagamento — atualize seu cartão",
          html: `<p>Olá,</p><p>Houve uma falha ao processar seu pagamento. Por favor, acesse o portal de cobrança para atualizar seus dados.</p><p><a href="${APP_URL}/dashboard/billing">Atualizar cartão</a></p>`,
        });
      }
    } catch { /* não crítico */ }
  }

  if (subId && userId) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const buyerEmail = authUser.user?.email ?? "";
      const { data: product } = await supabase
        .from("saas_products")
        .select("name")
        .eq("vendor_id", vendorId ?? "")
        .limit(1)
        .maybeSingle();

      await initiateDunning({
        subscriptionId: subId,
        userId,
        vendorId:     vendorId ?? undefined,
        email:        buyerEmail,
        currentStep:  0,
        invoiceId:    invoice.id,
        productName:  (product as { name?: string } | null)?.name ?? "seu produto",
        amountBRL:    (invoice.amount_due ?? 0) / 100,
        portalUrl:    `${APP_URL}/dashboard/billing`,
      });
    } catch (dErr: unknown) {
      console.error("[wh] dunning.init failed:", getErrorMessage(dErr));
    }
  }

  try {
    await log.info("webhook", "invoice.payment_failed", "Pagamento falhou", {
      invoiceId: invoice.id, userId, vendorId, subId,
    });
  } catch (e: unknown) {
    console.error("[wh] log.info payment_failed:", getErrorMessage(e));
  }
}
