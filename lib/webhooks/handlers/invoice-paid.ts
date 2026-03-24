// lib/webhooks/handlers/invoice-paid.ts
// Handler extraído do webhook Stripe para manter o arquivo principal limpo.
// Responsável por: ledger, entitlements, licenças, provisioning, afiliados, fiscal, notificações.

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlatformFeePct } from "@/lib/payments/platform-fee";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { sendEmailQueued, emailPurchaseReceipt, emailVendorNewSale } from "@/lib/email";
import { DEFAULT_PLATFORM_FEE_PCT, FISCAL_EMIT_DELAY_DAYS } from "@/lib/config";
import { log } from "@/lib/logger";
import { createLicenseKey } from "@/lib/licenses";
import { provisionInstance } from "@/lib/provisioning";
import { resolveDunning } from "@/lib/dunning";
import { dispatchProductWebhook } from "@/lib/webhooks/outbound";
import { processAffiliateCommission } from "@/lib/billing/commissions";
import { getErrorMessage } from "@/lib/errors";
import { splitPayments } from "@/lib/webhooks/services/split-payments";
import { splitTierPayments } from "@/lib/webhooks/services/split-tier-payments";

const APP_URL = NEXT_PUBLIC_APP_URL || "";

// Re-export so route.ts can import from here
export { handleInvoicePaid };

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const supabase = createAdminClient();
  const { data: existingRevenue } = await supabase
    .from("platform_revenue")
    .select("stripe_invoice_id")
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle();

  const ledgerSaleReference = `invoice:${invoice.id}:sale`;
  const ledgerFeeReference = `invoice:${invoice.id}:platform_fee`;

  const meta = {
    ...(invoice.subscription_details?.metadata ?? {}),
    ...(invoice.metadata ?? {}),
  } as Record<string, string>;

  const userId      = meta.userId      ?? meta.user_id      ?? null;
  const vendorId    = meta.vendorId    ?? meta.vendor_id    ?? null;
  const productId   = meta.productId   ?? meta.product_id   ?? null;
  const tierId      = meta.tierId      ?? meta.tier_id      ?? meta.productTierId ?? meta.product_tier_id ?? null;
  const playbookId  = meta.playbookId  ?? meta.playbook_id  ?? null;
  const affiliateCode = meta.affiliateCode ?? meta.affiliate_code ?? null;
  const paymentIntentId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : (invoice.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  if (!userId || !vendorId) {
    void log.warn("invoice-paid", "missing_meta", `Invoice ${invoice.id} missing userId/vendorId`, {});
    return;
  }

  const gross     = invoice.amount_paid / 100;
  const feePct    = await getEffectivePlatformFeePct({ vendorId, defaultFeePct: DEFAULT_PLATFORM_FEE_PCT }).catch(() => DEFAULT_PLATFORM_FEE_PCT);
  const fee       = (gross * feePct) / 100;
  const net       = gross - fee;
  const currency  = (invoice.currency ?? "brl").toUpperCase();
  const isRenewal = Number(meta.renewalCount ?? "0") > 0;
  const subId     = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id ?? null;

  // ── 1. Resolver dunning ──────────────────────────────────────────────────
  if (subId) {
    await resolveDunning(subId).then(undefined, () => {});
  }

  // ── 2. Platform revenue ──────────────────────────────────────────────────
  if (!existingRevenue) {
    await supabase.from("platform_revenue").insert({
      stripe_invoice_id:  invoice.id,
      vendor_id:          vendorId,
      user_id:            userId,
      gross_amount:       gross,
      platform_fee:       fee,
      net_amount:         net,
      currency,
      is_renewal:         isRenewal,
      product_id:         productId ?? null,
      product_tier_id:    tierId ?? null,
      metadata:           meta,
    }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
  }

  // ── 3. Ledger entries ─────────────────────────────────────────────────────
  const { data: existingSaleLedger } = await supabase
    .from("financial_ledger")
    .select("id")
    .eq("reference", ledgerSaleReference)
    .eq("type", "sale")
    .maybeSingle();

  if (!existingSaleLedger) {
    await supabase.from("financial_ledger").insert({
      user_id:     vendorId,
      type:        "sale",
      amount:      net,
      currency,
      reference:   ledgerSaleReference,
      description: `Venda — ${isRenewal ? "renovação" : "nova"} (Invoice ${invoice.id})`,
      status:      "pending",
    }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
  }

  const { data: existingFeeLedger } = await supabase
    .from("financial_ledger")
    .select("id")
    .eq("reference", ledgerFeeReference)
    .eq("type", "platform_fee")
    .maybeSingle();

  if (!existingFeeLedger) {
    await supabase.from("financial_ledger").insert({
      user_id:     vendorId,
      type:        "platform_fee",
      amount:      -fee,
      currency,
      reference:   ledgerFeeReference,
      description: `Taxa da plataforma (${feePct}%)`,
      status:      "pending",
    }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
  }

  // ── 4. Order record ───────────────────────────────────────────────────────
  let orderId: string | null = null;
  const { data: existingOrder } = !isRenewal && tierId
    ? await supabase
        .from("orders")
        .select("id")
        .eq("stripe_invoice_id", invoice.id)
        .maybeSingle()
    : { data: null };

  if (!isRenewal && tierId && !existingOrder) {
    const { data: order } = await supabase.from("orders").insert({
      user_id:            userId,
      vendor_id:          vendorId,
      product_tier_id:    tierId,
      stripe_invoice_id:  invoice.id,
      amount_gross:       gross,
      amount_net:         net,
      platform_fee_pct:   feePct,
      currency,
      status:             "paid",
    }).select("id").single();
    orderId = (order as Record<string, string> | null)?.id ?? null;
  } else {
    orderId = (existingOrder as Record<string, string> | null)?.id ?? null;
  }

  // ── 5. Entitlement ────────────────────────────────────────────────────────
  if (tierId && !isRenewal) {
    await supabase.from("user_entitlements").upsert({
      user_id:         userId,
      product_tier_id: tierId,
      source:          "purchase",
      valid_from:      new Date().toISOString(),
      valid_until:     null,
      is_active:       true,
    }, { onConflict: "user_id,product_tier_id" }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
  }

  // ── 6. Licença ────────────────────────────────────────────────────────────
  if (productId && !isRenewal) {
    const { data: prod } = await supabase
      .from("saas_products")
      .select("license_mode")
      .eq("id", productId)
      .maybeSingle();

    if (prod && typeof (prod as Record<string, unknown>).license_mode === "string" && (prod as Record<string, unknown>).license_mode !== "none") {
      await createLicenseKey({
        userId,
        productId,
        orderId: orderId ?? undefined,
        machineLimit: (prod as Record<string, unknown>).license_mode === "multi" ? 5 : 1,
      }).then(undefined, () => {});
    }
  }

  // ── 7. Provisioning SaaS ──────────────────────────────────────────────────
  if (productId && tierId && !isRenewal) {
    const { data: tierData } = await supabase
      .from("product_tiers")
      .select("id, tier_name, saas_products(name, provisioning_webhook_url, magic_link_url, auto_provision)")
      .eq("id", tierId)
      .maybeSingle();

    const prodData = (tierData as Record<string, unknown> | null)?.saas_products as Record<string, unknown> | null | undefined;
    if (prodData?.auto_provision && (prodData?.provisioning_webhook_url || prodData?.magic_link_url)) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const buyerEmail = authUser?.user?.email ?? "";
      const buyerName  = authUser?.user?.user_metadata?.full_name ?? "";

      await provisionInstance({
        instanceId: `${userId}:${tierId}`,
        orderId:    orderId ?? invoice.id,
        userId,
        productId,
        vendorId,
        buyerEmail,
        buyerName,
        tierName:   (tierData as Record<string, unknown> | null)?.tier_name as string ?? "Plano",
      }).then(undefined, () => {});
    }
  }

  // ── 8. Comissão de afiliado ───────────────────────────────────────────────
  if (orderId && productId && !isRenewal) {
    await processAffiliateCommission({
      orderId,
      productId,
      vendorId,
      buyerUserId:    userId,
      grossAmountBRL: gross,
      currency,
      invoiceId:      invoice.id,
      source:         "stripe",
    }).then(undefined, () => {});
  }

  // ── 9. Outbound webhook para vendor ──────────────────────────────────────
  if (!isRenewal && orderId) {
    await dispatchProductWebhook(
      productId ?? "",
      vendorId,
      subId ? "subscription.created" : "sale.created",
      {
        order_id:      orderId,
        invoice_id:    invoice.id,
        amount:        gross,
        currency,
        product_id:    productId ?? undefined,
        tier_id:       tierId ?? undefined,
        buyer_user_id: userId,
      }
    ).then(undefined, () => {});
  }

  // ── 10. Split / payout (best-effort, com idempotência própria) ─────────────
  if (paymentIntentId && meta.splitMode !== "connect_express") {
    try {
      if (tierId) {
        await splitTierPayments({
          vendorId,
          productTierId: tierId,
          paymentIntentId,
          totalCents: invoice.amount_paid ?? 0,
          affiliateCode: affiliateCode ?? undefined,
          billingReason: invoice.billing_reason ?? undefined,
          currency: (invoice.currency ?? "brl").toLowerCase(),
        });
      } else if (playbookId) {
        await splitPayments({
          playbookId,
          paymentIntentId,
          totalCents: invoice.amount_paid ?? 0,
          affiliateCode: affiliateCode ?? undefined,
          billingReason: invoice.billing_reason ?? undefined,
          vendorId,
          currency: (invoice.currency ?? "brl").toLowerCase(),
        });
      }
    } catch (err) {
      const splitError = getErrorMessage(err, "Split payment failed");
      console.error("[invoice-paid][split]", splitError);
      void log.warn("invoice-paid", "split_failed", "Falha no split do pagamento", {
        invoiceId: invoice.id,
        paymentIntentId,
        vendorId,
        tierId,
        playbookId,
        error: splitError,
      });
      await supabase.from("webhook_failures").insert({
        source: "invoice-paid",
        entity_id: invoice.id,
        reason: splitError,
        payload: invoice,
        created_at: new Date().toISOString(),
      }).then(undefined, () => {});
    }
  }

  // ── 10. Fila fiscal ────────────────────────────────────────────────────────
  const emitAfter = new Date(Date.now() + FISCAL_EMIT_DELAY_DAYS * 24 * 3_600_000).toISOString();
  const { data: existingFiscalQueue } = await supabase
    .from("fiscal_emission_queue")
    .select("invoice_id")
    .eq("invoice_id", invoice.id)
    .maybeSingle();

  if (!existingFiscalQueue) {
    await supabase.from("fiscal_emission_queue").insert({
      invoice_id:     invoice.id,
      vendor_id:      vendorId,
      buyer_user_id:  userId,
      amount_gross:   gross,
      platform_fee:   fee,
      currency,
      emit_after:     emitAfter,
      status:         "pending",
    }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
  }

  // ── 11. Notificações ──────────────────────────────────────────────────────
  const { data: existingNotification } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "purchase_confirmed")
    .eq("title", "✅ Compra confirmada!")
    .eq("action_url", "/dashboard")
    .maybeSingle();

  if (!existingNotification) {
    await supabase.from("notifications").insert({
      user_id:    userId,
      type:       "purchase_confirmed",
      title:      "✅ Compra confirmada!",
      body:       `Seu pagamento foi processado com sucesso.`,
      action_url: "/dashboard",
      read:       false,
    }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
  }

  // ── 12. Emails ────────────────────────────────────────────────────────────
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const buyerEmail = authUser?.user?.email ?? "";
    if (buyerEmail && !isRenewal) {
      await sendEmailQueued({ to: buyerEmail, subject: "✅ Compra confirmada!", html: emailPurchaseReceipt({ amountBRL: gross.toFixed(2), productName: productId ?? "Produto", accessUrl: `${APP_URL}/dashboard` }).html });
    }
  } catch { /* non-critical */ }

  try {
    const { data: vendorProfile } = await supabase.from("profiles").select("email").eq("id", vendorId).maybeSingle();
    const vendorEmail = (vendorProfile as Record<string, unknown> | null)?.email as string ?? "";
    if (vendorEmail && !isRenewal) {
      await sendEmailQueued({ to: vendorEmail, subject: "💰 Nova venda!", html: emailVendorNewSale({ amountBRL: net.toFixed(2), productName: productId ?? "Produto", buyerEmail: "", dashUrl: `${APP_URL}/vendor` }).html });
    }
  } catch { /* non-critical */ }

  // ── 13. Social proof ──────────────────────────────────────────────────────
  if (productId) {
    const { data: existingRecentSale } = await supabase
      .from("recent_sales_log")
      .select("id")
      .eq("product_id", productId)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .maybeSingle();

    if (!existingRecentSale) {
      await supabase.from("recent_sales_log").insert({
        product_id: productId,
        created_at: new Date().toISOString(),
      }).then(undefined, (e: unknown) => console.error("[webhooks/handlers/invoice-paid]", getErrorMessage(e)));
    }
  }

  void log.info("invoice-paid", "processed", `Invoice ${invoice.id} OK — R$ ${gross}`, { invoiceId: invoice.id, userId, vendorId });
}
