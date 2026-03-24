// lib/webhooks/handlers/dispute.ts
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { sendEmailQueued, emailDisputeOpened, emailVendorDisputeOpened } from "@/lib/email";
import { getErrorMessage } from "@/lib/errors";
import { deprovision } from "@/lib/webhooks/services/deprovision";

export { handleDispute };

const APP_URL = NEXT_PUBLIC_APP_URL || "";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

async function handleDispute(dispute: Stripe.Dispute) {
  const supabase = createAdminClient();
  const charge    = await stripe.charges.retrieve(dispute.charge as string);
  const invoice   = charge.invoice ? await stripe.invoices.retrieve(charge.invoice as string) : null;
  const subStripe = invoice?.subscription ? await stripe.subscriptions.retrieve(invoice.subscription as string) : null;

  if (subStripe) {
    try { await stripe.subscriptions.cancel(subStripe.id); }
    catch (e: unknown) { console.error("[wh] stripe subscription cancel failed:", getErrorMessage(e)); }
  }

  try {
    const meta = (invoice?.metadata ?? (charge.metadata ?? {})) as Record<string, string | null>;
    const vendorId = meta.vendorId ?? meta.vendor_id ?? null;
    if (vendorId) {
      await supabase.from("fraud_events").insert({
        kind: "charge_dispute", user_id: null, device_id: null, ip: null,
        meta: { vendor_id: vendorId, dispute_id: dispute.id, amount: dispute.amount, reason: dispute.reason },
        created_at: new Date().toISOString(),
      }).then(undefined, () => {});
      const { data: existing } = await supabase.from("fraud_vendor_risk").select("vendor_id, dispute_count, risk_score").eq("vendor_id", vendorId).maybeSingle();
      const disputes = Number((existing as { dispute_count?: number } | null)?.dispute_count ?? 0) + 1;
      const score = Math.min(100, Number((existing as { risk_score?: number } | null)?.risk_score ?? 0) + 15);
      await supabase.from("fraud_vendor_risk").upsert({ vendor_id: vendorId, dispute_count: disputes, risk_score: score, updated_at: new Date().toISOString() }, { onConflict: "vendor_id" }).then(undefined, () => {});
    }
  } catch { /* best-effort */ }

  const { data: dbSub } = await supabase.from("subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", subStripe?.id ?? "NONE")
    .select("id, user_id, playbook_id, product_tier_id")
    .maybeSingle();

  if (dbSub) {
    await supabase.from("dispute_log").insert({
      stripe_charge_id: dispute.charge as string,
      subscription_id:  dbSub.id,
      user_id:          dbSub.user_id,
      amount:           dispute.amount / 100,
      status:           "open",
    });

    await deprovision({
      userId: dbSub.user_id, playbookId: dbSub.playbook_id,
      productTierId: dbSub.product_tier_id, reason: "chargeback_dispute",
    });

    const { data: buyer } = await supabase.auth.admin.getUserById(dbSub.user_id);
    if (buyer.user?.email) {
      await supabase.from("blacklisted_emails").upsert(
        { email: buyer.user.email, reason: "chargeback" },
        { onConflict: "email" }
      );
    }

    try {
      const accessLogs: string[] = [];
      if (dbSub?.user_id && (dbSub?.product_tier_id || dbSub?.playbook_id)) {
        const { data: deliveryLogs } = await supabase
          .from("delivery_events")
          .select("created_at, url, status")
          .eq("user_id", dbSub.user_id)
          .eq("status", "success")
          .order("created_at", { ascending: true })
          .limit(5);
        (deliveryLogs ?? []).forEach((dl: { created_at: string; url: string; status: string }) => {
          accessLogs.push(`Acesso provisionado em ${new Date(dl.created_at).toLocaleString("pt-BR")} - ${dl.url}`);
        });
      }
      const { data: orderRecord } = await supabase
        .from("orders")
        .select("created_at, amount_gross, stripe_invoice_id")
        .eq("user_id", dbSub?.user_id ?? "")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const buyerEmail = buyer.user?.email ?? "";
      const buyerName  = buyer.user?.user_metadata?.full_name ?? "Comprador";
      const serviceDate = orderRecord?.created_at
        ? new Date(orderRecord.created_at).toLocaleDateString("pt-BR")
        : "Data registrada no sistema";
      const evidenceSummary = [
        `Cliente: ${buyerName} (${buyerEmail})`,
        `Data da compra: ${serviceDate}`,
        `Valor: R$ ${(orderRecord?.amount_gross as number | null)?.toFixed(2) ?? (dispute.amount / 100).toFixed(2)}`,
        `Invoice: ${orderRecord?.stripe_invoice_id ?? dispute.charge}`,
        `Produto: Assinatura digital com acesso imediato após pagamento.`,
        `Política: Serviço de entrega digital conforme acordado no momento da compra.`,
        ...(accessLogs.length > 0 ? ["", "Registros de entrega:"] : []),
        ...accessLogs,
      ].join("\n");

      await stripe.disputes.update(dispute.id, {
        evidence: {
          customer_email_address: buyerEmail || undefined,
          customer_name:          buyerName  || undefined,
          service_date:           serviceDate,
          uncategorized_text:     evidenceSummary,
        },
        submit: true,
      });
      await supabase.from("dispute_log")
        .update({ status: "under_review", evidence_submitted_at: new Date().toISOString() })
        .eq("stripe_charge_id", dispute.charge as string);
      console.log("[dispute] auto-evidence submitted for dispute", dispute.id);
    } catch (evidenceErr: unknown) {
      console.error("[dispute] auto-evidence failed:", getErrorMessage(evidenceErr));
    }

    try {
      const buyerEmail = buyer.user?.email ?? "";
      if (buyerEmail) {
        const tpl = emailDisputeOpened({ accessUrl: `${APP_URL}/dashboard/billing` });
        await sendEmailQueued({ to: buyerEmail, subject: tpl.subject, html: tpl.html, tags: [{ name: "event", value: "dispute_opened" }] });
      }
    } catch (e) { console.error("[email] dispute:", getErrorMessage(e)); }

    try {
      if (dbSub?.product_tier_id) {
        const { data: tierRow } = await supabase
          .from("product_tiers")
          .select("saas_products(vendor_id)")
          .eq("id", dbSub.product_tier_id)
          .maybeSingle();
        const vendorId = (tierRow as { saas_products?: { vendor_id?: string } } | null)?.saas_products?.vendor_id;
        if (vendorId) {
          const { data: vProf } = await supabase.from("profiles").select("email, full_name").eq("id", vendorId).single();
          if (vProf?.email) {
            const tpl = emailVendorDisputeOpened({
              vendorName: (vProf as { full_name?: string | null }).full_name ?? undefined,
              buyerEmail: buyer.user?.email ?? "Comprador",
              amountBRL: `R$ ${(dispute.amount / 100).toFixed(2)}`,
              dashUrl: `${APP_URL}/vendor/sales`,
            });
            await sendEmailQueued({ to: vProf.email as string, subject: tpl.subject, html: tpl.html });
          }
        }
      }
    } catch (e) { console.error("[email] vendor dispute:", getErrorMessage(e)); }
  }
}
