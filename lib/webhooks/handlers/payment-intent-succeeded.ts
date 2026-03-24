// lib/webhooks/handlers/payment-intent-succeeded.ts
// Handler para payment_intent.succeeded
// Processa pagamentos únicos (one-time), order bumps e upsells.
// NÃO processa assinaturas — estas são tratadas via invoice.paid.

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { sendEmailQueued, emailPurchaseReceipt } from "@/lib/email";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { getChargeCardData } from "@/lib/types/stripe-extended";
import { sendPushToUser } from "@/lib/webhooks/services/webhook-utils";
import { provisionTier } from "@/lib/webhooks/services/provision-tier";
import type {
  Profile,
  ProductTierWithProduct,
} from "@/lib/types/database";

export { handlePaymentIntentSucceeded };

const APP_URL = NEXT_PUBLIC_APP_URL || "";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const supabase = createAdminClient();
  const meta = (pi.metadata ?? {}) as Record<string, string>;
  const { userId, productTierId, vendorId, type, affiliateCode, pointsRedeemed,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term } = meta;

  // suppress unused variable warnings
  void affiliateCode; void utm_source; void utm_medium; void utm_campaign; void utm_content; void utm_term;

  if (!userId) return;

  // 🔐 Fraud signals: card fingerprint/BIN + vendor linkage (best-effort)
  try {
    const charges = await stripe.charges.list({ payment_intent: pi.id, limit: 1 });
    const ch = charges.data?.[0];
    const card = ch ? getChargeCardData(ch) : null;
    const fingerprint = card?.fingerprint ?? null;
    const bin = card?.first6 ?? card?.iin ?? null;
    const country = card?.country ?? null;

    if (vendorId || fingerprint || bin) {
      await supabase.from("fraud_events").insert({
        kind: "payment_succeeded",
        user_id: userId ?? null,
        device_id: null,
        ip: null,
        meta: { vendor_id: vendorId ?? null, fingerprint, bin, country, amount: pi.amount },
        created_at: new Date().toISOString(),
      }).then(undefined, () => {});
      if (fingerprint) {
        await supabase.from("fraud_card_fingerprints").upsert({
          fingerprint,
          last_seen_at: new Date().toISOString(),
          last_vendor_id: vendorId ?? null,
          last_user_id: userId ?? null,
          last_bin: bin,
          last_country: country,
        }, { onConflict: "fingerprint" }).then(undefined, () => {});
      }
    }
  } catch {
    // best-effort
  }

  // ── Wallet credit (recarga de carteira) ───────────────────────────────────
  if (type === "wallet_credit" && meta.creditAmount) {
    const walletAmount = Number(meta.creditAmount ?? 0);
    if (walletAmount > 0) {
      await supabase.rpc("credit_brl_wallet", {
        p_user_id: userId,
        p_amount: walletAmount,
        p_reference: pi.id,
        p_description: `Recarga de carteira — R$ ${walletAmount.toFixed(2)}`,
      }).then(undefined, (e: unknown) => console.error("[wallet] credit_brl_wallet failed:", getErrorMessage(e)));

      try {
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "wallet_credited",
          title: "💰 Saldo adicionado!",
          body: `R$ ${walletAmount.toFixed(2)} foram adicionados à sua carteira Playbook.`,
          action_url: "/carteira",
        });
      } catch (e: unknown) {
        console.error("[wh] wallet notification:", getErrorMessage(e));
      }

      console.log("[wallet] credited", walletAmount, "BRL to user", userId, "via PI", pi.id);
    }
    return; // Não processar como compra de produto
  }

  if (!productTierId) return;
  // Não processar subscriptions aqui (elas chegam via invoice.paid)
  if (type === "subscription") return;

  // Idempotência: verifica se já processamos este PaymentIntent
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("stripe_payment_intent_id")
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();
  if (existingOrder) return;

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser.user?.email ?? "";
  const name  = authUser.user?.user_metadata?.full_name ?? "";

  // Buscar product_id do tier
  const { data: tier } = await supabase.from("product_tiers")
    .select("product_id, saas_products(name, vendor_id)")
    .eq("id", productTierId).maybeSingle();
  const productId = (tier as ProductTierWithProduct | null)?.product_id ?? null;
  const effectiveVendorId = vendorId || (tier as ProductTierWithProduct | null)?.saas_products?.vendor_id || null;

  // Provisionar acesso
  await provisionTier({ productTierId, userId, email, name });

  // Registrar order + entitlement
  await supabase.from("orders").insert({
    user_id:                    userId,
    vendor_id:                  effectiveVendorId,
    product_id:                 productId,
    product_tier_id:            productTierId,
    stripe_payment_intent_id:   pi.id,
    stripe_invoice_id:          null,
    amount_gross:               (pi.amount_received ?? 0) / 100,
    currency:                   pi.currency ?? "brl",
    status:                     "paid",
  });

  await supabase.from("entitlements").upsert({
    user_id:          userId,
    product_id:       productId,
    product_tier_id:  productTierId,
    source_invoice_id: null,
    status:           "active",
  }, { onConflict: "user_id,product_id,product_tier_id,playbook_id" });

  // Receita da plataforma
  const amountCents = pi.amount_received ?? 0;
  if (effectiveVendorId && amountCents > 0) {
    const { data: vendorProfile } = await supabase.from("profiles")
      .select("custom_platform_fee_pct").eq("id", effectiveVendorId).maybeSingle();
    const feePct    = Number((vendorProfile as { custom_platform_fee_pct?: number } | null)?.custom_platform_fee_pct ?? 15);
    const feeCents  = Math.round(amountCents * feePct / 100);
    const payoutCents = amountCents - feeCents;

    await supabase.from("platform_revenue").insert({
      stripe_payment_intent_id: pi.id,
      stripe_invoice_id:        null,
      user_id:                  userId,
      vendor_id:                effectiveVendorId,
      gross_amount:             amountCents / 100,
      platform_fee:             feeCents / 100,
      vendor_payouts:           payoutCents / 100,
      currency:                 pi.currency ?? "brl",
    });
  }

  // 🎁 Cashback com taxa variável por tier de fidelidade
  try {
    const grossBRL = (pi.amount_received ?? 0) / 100;
    const { data: loyaltyProf } = await supabase
      .from("profiles").select("loyalty_tier").eq("id", userId).maybeSingle();
    const loyaltyTier = (loyaltyProf as Profile | null)?.loyalty_tier ?? "bronze";
    const rateByTier: Record<string, number> = { bronze: 2, silver: 3, gold: 4, diamond: 5 };
    const earnRate = rateByTier[loyaltyTier ?? "bronze"] ?? 2;
    const pts = Math.max(1, Math.floor(grossBRL * earnRate));
    await supabase.rpc("upsert_points", { p_user_id: userId, p_pts: pts, p_desc: `Cashback ${earnRate}% (${loyaltyTier}) por compra` });
  } catch { /* não crítico */ }

  // 💸 Debitar pontos resgatados
  if (pointsRedeemed) {
    try {
      const pts = parseInt(pointsRedeemed, 10);
      if (pts > 0) {
        const refKey = `${pi.id}:redeem`;
        const { data: existingDebit } = await supabase.from("points_ledger")
          .select("id").eq("user_id", userId).eq("reference_id", refKey).maybeSingle();
        if (!existingDebit) {
          await supabase.rpc("debit_points", { p_user_id: userId, p_pts: pts, p_desc: "Resgatados na compra", p_ref: refKey });
        }
      }
    } catch { /* não crítico */ }
  }

  // 📧 Email de confirmação
  try {
    if (email) {
      const productName = (tier as ProductTierWithProduct | null)?.saas_products?.name ?? "produto";
      await sendEmailQueued({
        to: email,
        ...emailPurchaseReceipt({
          name,
          amountBRL: `R$ ${((pi.amount_received ?? 0) / 100).toFixed(2)}`,
          productName,
          accessUrl: `${APP_URL}/dashboard`,
        }),
      });
    }
  } catch { /* não crítico */ }

  // 🔔 Notificação push ao vendedor
  try {
    if (effectiveVendorId) {
      await sendPushToUser(effectiveVendorId, {
        title: "💰 Nova venda!",
        body: `${name || "Um comprador"} adquiriu ${(tier as ProductTierWithProduct | null)?.saas_products?.name ?? "seu produto"}.`,
        url: `${APP_URL}/vendor/sales`,
      });
    }
  } catch { /* não crítico */ }

  void log; void inngest; // available if needed by future handlers
}
