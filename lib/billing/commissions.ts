// lib/billing/commissions.ts
// Serviço centralizado de comissões — nível industrial.
// Única fonte de verdade para: cálculo, criação, anti-duplicata, multi-level, notificação.

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AffiliateLink {
  affiliate_id: string;
}
interface AffiliateCommissionProduct {
  affiliate_commission_type_v2: "fixed" | "percent" | null;
  affiliate_commission_percent: number | null;
  affiliate_commission_fixed:   number | null;
  affiliate_l2_percent:         number | null;
  affiliate_l3_percent:         number | null;
  vendor_id:                    string;
}
interface AffiliateProfile {
  referred_by_id: string | null;
}


export interface CommissionInput {
  orderId:        string;
  productId:      string;
  vendorId:       string;
  buyerUserId:    string;
  grossAmountBRL: number;
  currency:       string;
  invoiceId?:     string;
  source:         "stripe" | "pagarme" | "manual";
  traceId?:       string;
}

export interface CommissionResult {
  created:        boolean;
  affiliateId?:   string;
  commissionBRL?: number;
  tier?:          "L1" | "L2" | "L3";
  skipped?:       string;
}

export async function processAffiliateCommission(input: CommissionInput): Promise<CommissionResult> {
  const admin = createAdminClient();
  const trace = input.traceId ?? `comm-${input.orderId}`;

  try {
    const { data: affLink } = await admin
      .from("affiliate_links")
      .select("id, affiliate_id, code, product_id")
      .eq("product_id", input.productId)
      .eq("last_buyer_id", input.buyerUserId)
      .order("last_click_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const affiliateId = (affLink as AffiliateLink | null)?.affiliate_id ?? null;
    if (!affiliateId) return { created: false, skipped: "no_affiliate_attribution" };

    const { data: existing } = await admin
      .from("affiliate_commissions")
      .select("id")
      .eq("order_id", input.orderId)
      .eq("affiliate_id", affiliateId)
      .limit(1)
      .maybeSingle();

    if (existing) return { created: false, skipped: "already_processed", affiliateId };

    const { data: product } = await admin
      .from("saas_products")
      .select("id, vendor_id, affiliate_commission_percent, affiliate_commission_type_v2, affiliate_commission_fixed, affiliate_l2_percent, affiliate_l3_percent")
      .eq("id", input.productId)
      .single();

    if (!product) return { created: false, skipped: "product_not_found" };

    const commType  = (product as AffiliateCommissionProduct).affiliate_commission_type_v2 ?? "percent";
    const commPct   = Number((product as AffiliateCommissionProduct).affiliate_commission_percent ?? 30);
    const commFixed = Number((product as AffiliateCommissionProduct).affiliate_commission_fixed ?? 0);
    // Round to 2 decimal places (BRL cents precision) to avoid Stripe float errors
    const commissionBRL = commType === "fixed"
      ? Math.round(commFixed * 100) / 100
      : Math.round((input.grossAmountBRL * commPct) / 100 * 100) / 100;

    if (commissionBRL <= 0) return { created: false, skipped: "zero_commission" };

    const { error: insertErr } = await admin.from("affiliate_commissions").insert({
      affiliate_id: affiliateId,
      order_id:     input.orderId,
      product_id:   input.productId,
      vendor_id:    input.vendorId,
      amount:       commissionBRL,
      currency:     input.currency,
      tier:         "L1",
      status:       "pending",
      source:       input.source,
      invoice_id:   input.invoiceId ?? null,
    });

    if (insertErr) {
      void log.error("billing/commissions", "insert.failed", insertErr.message, { trace });
      return { created: false, skipped: `db_error: ${insertErr.message}` };
    }

    await admin.from("financial_ledger").insert({
      user_id:     affiliateId,
      type:        "commission",
      amount:      commissionBRL,
      currency:    input.currency,
      reference:   `order:${input.orderId}`,
      description: `Comissão L1 — pedido ${input.orderId}`,
      status:      "pending",
    }).then(undefined, (e: unknown) => console.error("[billing/commissions]", getErrorMessage(e)));

    await admin.from("notifications").insert({
      user_id: affiliateId,
      type:    "commission_earned",
      title:   "💰 Nova comissão!",
      body:    `Você ganhou R$ ${commissionBRL.toFixed(2)} de comissão.`,
      read:    false,
    }).then(undefined, (e: unknown) => console.error("[billing/commissions]", getErrorMessage(e)));

    await processUplineCommissions(admin, affiliateId, input, product as AffiliateCommissionProduct, commissionBRL);

    void log.info("billing/commissions", "commission.created", `R$ ${commissionBRL}`, { orderId: input.orderId, affiliateId, trace });
    return { created: true, affiliateId, commissionBRL, tier: "L1" };

  } catch (e: unknown) {
    void log.error("billing/commissions", "unexpected", getErrorMessage(e), { trace });
    return { created: false, skipped: `exception: ${getErrorMessage(e)}` };
  }
}

async function processUplineCommissions(
  admin: ReturnType<typeof createAdminClient>,
  affiliateId: string,
  input: CommissionInput,
  product: AffiliateCommissionProduct,
  l1Amount: number
): Promise<void> {
  const { data: affProfile } = await admin
    .from("affiliate_profiles")
    .select("referred_by_id")
    .eq("user_id", affiliateId)
    .maybeSingle();

  const l2Id  = (affProfile as AffiliateProfile | null)?.referred_by_id ?? null;
  const l2Pct = Number(product.affiliate_l2_percent ?? 0);
  if (!l2Id || l2Pct <= 0) return;
  const l2Amount = Math.round((l1Amount * l2Pct) / 100 * 100) / 100;

  await admin.from("affiliate_commissions").insert({
    affiliate_id: l2Id, order_id: input.orderId, product_id: input.productId,
    vendor_id: input.vendorId, amount: l2Amount, currency: input.currency,
    tier: "L2", status: "pending", source: input.source,
  }).then(undefined, (e: unknown) => console.error("[billing/commissions]", getErrorMessage(e)));

  const { data: l2Profile } = await admin
    .from("affiliate_profiles").select("referred_by_id").eq("user_id", l2Id).maybeSingle();

  const l3Id  = (l2Profile as AffiliateProfile | null)?.referred_by_id ?? null;
  const l3Pct = Number(product.affiliate_l3_percent ?? 0);
  if (!l3Id || l3Pct <= 0) return;

  await admin.from("affiliate_commissions").insert({
    affiliate_id: l3Id, order_id: input.orderId, product_id: input.productId,
    vendor_id: input.vendorId, amount: Math.round((l1Amount * l3Pct) / 100 * 100) / 100, currency: input.currency,
    tier: "L3", status: "pending", source: input.source,
  }).then(undefined, (e: unknown) => console.error("[billing/commissions]", getErrorMessage(e)));
}
