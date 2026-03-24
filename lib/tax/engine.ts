import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Global MoR tax engine (Stripe-only friendly).
 * - Best-effort: if no rules/profile, returns null (checkout never breaks).
 * - Supports: VAT/GST by country/region, reverse charge (B2B), withholding, service types.
 * - Persists calculation for audit + liability accounting.
 */
export interface TaxBreakdown {
  rule_id?: string;
  buyer_country?: string | null;
  buyer_region?: string | null;
  buyer_is_b2b?: boolean;
  reverse_charge?: boolean;
  vat_cents?: number;
  gst_cents?: number;
  iss_cents?: number;
  cbs_cents?: number;
  ibs_cents?: number;
  withholding_cents?: number;
}

export interface TaxEngineResult {
  total_tax_cents: number;
  breakdown: TaxBreakdown;
}

export async function computeTaxForCheckout(args: {
  userId: string;
  productTierId: string;
  currencyHint?: string;
  // Optional signals (checkout can pass these, but not required)
  buyerCountry?: string | null; // ISO2
  buyerRegion?: string | null; // state/province code
  buyerIsB2B?: boolean | null;
}): Promise<TaxEngineResult | null> {
  const supabase = createAdminClient();

  // Tier + product/vendor
  const { data: tier } = await supabase
    .from("product_tiers")
    .select("id, product_id, price_monthly, price_yearly, saas_products(vendor_id)")
    .eq("id", args.productTierId)
    .maybeSingle();

  const productId = (tier as Record<string, unknown> | null)?.product_id as string | undefined;
  const vendorId = (tier as Record<string, unknown> & { saas_products?: { vendor_id?: string } } | null)?.saas_products?.vendor_id;
  if (!productId || !vendorId) return null;

  // Vendor tax profile (MoR)
  const { data: vprof } = await supabase
    .from("tax_profiles")
    .select("vendor_id, country, uf, city_code, regime, default_b2b, service_type")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  // Buyer tax profile (optional)
  const { data: bprof } = await supabase
    .from("buyer_tax_profiles")
    .select("user_id, country, region, is_b2b, tax_id_country, tax_id_value")
    .eq("user_id", args.userId)
    .maybeSingle();

  const buyerCountry = (args.buyerCountry ?? bprof?.country ?? null)?.toString().toUpperCase() || null;
  const buyerRegion = (args.buyerRegion ?? bprof?.region ?? null)?.toString().toUpperCase() || null;
  const buyerIsB2B = (args.buyerIsB2B ?? bprof?.is_b2b ?? false) === true;
  const buyerHasTaxId = !!(bprof?.tax_id_value);

  // Base amount (assumimos monthly para auditoria; para yearly o checkout usa outro fluxo)
  const amount = Number((tier as Record<string, unknown> | null)?.price_monthly ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const baseCents = Math.round(amount * 100);

  // 1) Try global rules by country (VAT/GST)
  // Priority order: exact country+region+regime+b2b+service -> country+regime -> fallback BR rules
  const serviceType = (vprof as Record<string, unknown> | null)?.service_type as string ?? null;

  const { data: rulesGlobal } = await supabase
    .from("tax_rules_global")
    .select("*")
    .eq("buyer_country", buyerCountry ?? "")
    .order("priority", { ascending: false });

  let applied: Record<string, unknown> | null = null;
  if (buyerCountry && (rulesGlobal ?? []).length) {
    const candidates = rulesGlobal ?? [];
    applied =
      candidates.find(r =>
        (r.buyer_region ? r.buyer_region === buyerRegion : true) &&
        (r.vendor_country ? r.vendor_country === ((vprof as Record<string, unknown> | null)?.country as string ?? null) : true) &&
        (r.regime ? r.regime === ((vprof as Record<string, unknown> | null)?.regime as string ?? null) : true) &&
        (r.b2b === null || r.b2b === buyerIsB2B) &&
        (r.service_type ? r.service_type === serviceType : true)
      ) ?? candidates[0];
  }

  // 2) Fallback BR rules (UF/cidade)
  const vprof_uf = (vprof as Record<string, unknown> | null)?.uf as string | undefined;
  if (!applied && vprof_uf) {
    const { data: rulesBR } = await supabase
      .from("tax_rules")
      .select("*")
      .eq("uf", vprof_uf)
      .order("priority", { ascending: false });

    applied = (rulesBR ?? [])[0] ?? null;
  }

  if (!applied) return null;

  // Compute taxes
  const rateVat = Number(applied.vat_rate ?? 0);
  const rateGst = Number(applied.gst_rate ?? 0);
  const rateIss = Number(applied.iss_rate ?? 0);
  const rateCbs = Number(applied.cbs_rate ?? 0);
  const rateIbs = Number(applied.ibs_rate ?? 0);

  // Reverse charge: B2B + tax_id + rule allows it => customer self-assesses => platform tax = 0
  const reverseCharge = !!(applied.reverse_charge && buyerIsB2B && buyerHasTaxId);

  const vat = reverseCharge ? 0 : Math.round(baseCents * rateVat);
  const gst = reverseCharge ? 0 : Math.round(baseCents * rateGst);
  const iss = reverseCharge ? 0 : Math.round(baseCents * rateIss);
  const cbs = reverseCharge ? 0 : Math.round(baseCents * rateCbs);
  const ibs = reverseCharge ? 0 : Math.round(baseCents * rateIbs);

  // Withholding (retencao) - stored for reporting; does not change collected tax unless you want it to
  const wht = Math.round(baseCents * Number(applied.withholding_rate ?? 0));

  const total = vat + gst + iss + cbs + ibs;

  // Persist audit record
  await supabase.from("tax_calculations").insert({
    vendor_id: vendorId,
    user_id: args.userId,
    product_id: productId,
    tier_id: args.productTierId,
    currency: args.currencyHint ?? "brl",
    base_amount_cents: baseCents,
    total_tax_cents: total,
    breakdown: {
      rule_id: applied.id,
      buyer_country: buyerCountry,
      buyer_region: buyerRegion,
      buyer_is_b2b: buyerIsB2B,
      reverse_charge: reverseCharge,
      vat_cents: vat,
      gst_cents: gst,
      iss_cents: iss,
      cbs_cents: cbs,
      ibs_cents: ibs,
      withholding_cents: wht,
    },
  });

  return {
    total_tax_cents: total,
    breakdown: {
      reverse_charge: reverseCharge,
      vat_cents: vat,
      gst_cents: gst,
      iss_cents: iss,
      cbs_cents: cbs,
      ibs_cents: ibs,
      withholding_cents: wht,
      buyer_country: buyerCountry,
    },
  };
}
