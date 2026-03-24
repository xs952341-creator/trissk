// lib/stripe/ensure-tier-price.ts
// Ensure a Stripe Price exists for a tier in a given currency + billing cycle.
// - Uses existing tier currency columns if present
// - Falls back to a mapping table (tier_currency_prices) if you add it
// - If nothing exists, creates a new Stripe Price (recurring or one-time)
// - Best-effort persistence: will not crash if DB schema doesn't have the column/table

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getExchangeRates } from "@/lib/exchange-rate";

export type BillingCycle = "monthly" | "annual" | "lifetime";
export type CurrencyISO = "BRL" | "USD" | "EUR";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

function tierColumnFor(currency: CurrencyISO, billing: BillingCycle): string | null {
  if (currency === "BRL") {
    if (billing === "monthly") return "stripe_monthly_price_id";
    if (billing === "annual") return "stripe_annual_price_id";
    return "stripe_lifetime_price_id";
  }
  if (currency === "USD") {
    if (billing === "monthly") return "stripe_usd_monthly_price_id";
    if (billing === "annual") return "stripe_usd_annual_price_id";
    return "stripe_usd_lifetime_price_id";
  }
  if (currency === "EUR") {
    if (billing === "monthly") return "stripe_eur_monthly_price_id";
    if (billing === "annual") return "stripe_eur_annual_price_id";
    return "stripe_eur_lifetime_price_id";
  }
  return null;
}

function brlPriceFieldFor(billing: BillingCycle): string {
  if (billing === "monthly") return "price_monthly";
  if (billing === "annual") return "price_annual";
  return "price_lifetime";
}

async function readFromMappingTable(tierId: string, currency: CurrencyISO, billing: BillingCycle): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("tier_currency_prices")
      .select("stripe_price_id")
      .eq("tier_id", tierId)
      .eq("currency", currency)
      .eq("billing", billing)
      .maybeSingle();
    return (data as Record<string, unknown> | null)?.stripe_price_id as string ?? null;
  } catch {
    return null;
  }
}

async function writeToMappingTable(tierId: string, currency: CurrencyISO, billing: BillingCycle, priceId: string) {
  try {
    await supabase
      .from("tier_currency_prices")
      .upsert({ tier_id: tierId, currency, billing, stripe_price_id: priceId }, { onConflict: "tier_id,currency,billing" });
  } catch {
    // optional
  }
}

async function bestEffortUpdateTierColumn(tierId: string, column: string, priceId: string) {
  try {
    await supabase.from("product_tiers").update({ [column]: priceId } as Record<string, string>).eq("id", tierId);
  } catch {
    // optional (older schema)
  }
}

async function resolveProductIdFromAnyPriceId(priceId: string): Promise<string | null> {
  const p = await stripe.prices.retrieve(priceId);
  const prod = p.product;
  return typeof prod === "string" ? prod : prod?.id ?? null;
}

export async function ensureTierStripePrice(opts: {
  tierId: string;
  currency: CurrencyISO;
  billing: BillingCycle;
}): Promise<{ priceId: string; created: boolean; amountCents?: number; rateUsed?: number } | null> {
  const { tierId, currency, billing } = opts;

  // Load tier
  const { data: tier } = await supabase
    .from("product_tiers")
    .select("*")
    .eq("id", tierId)
    .single();
  if (!tier) return null;

  // 1) Prefer direct column if present
  const col = tierColumnFor(currency, billing);
  const colVal = col ? (tier as Record<string, unknown>)[col] : null;
  if (colVal) return { priceId: colVal as string, created: false };

  // 2) Mapping table
  const mapped = await readFromMappingTable(tierId, currency, billing);
  if (mapped) return { priceId: mapped, created: false };

  // 3) Create new price
  // Need a Stripe product reference: reuse BRL price's product if available
  const tierTyped = tier as Record<string, unknown>;
  const basePriceId =
    billing === "monthly" ? tierTyped.stripe_monthly_price_id as string | undefined :
    billing === "annual"  ? tierTyped.stripe_annual_price_id as string | undefined :
    tierTyped.stripe_lifetime_price_id as string | undefined;

  if (!basePriceId) {
    // Can't infer product without at least one existing Stripe price.
    return null;
  }

  const stripeProductId = await resolveProductIdFromAnyPriceId(basePriceId);
  if (!stripeProductId) return null;

  // Amount in BRL for this billing
  const brlField = brlPriceFieldFor(billing);
  const brlAmount = Number((tier as Record<string, unknown>)[brlField] ?? 0);
  if (!Number.isFinite(brlAmount) || brlAmount <= 0) return null;

  // Convert
  let amountCents: number;
  let rateUsed = 1;
  if (currency === "BRL") {
    amountCents = Math.max(50, Math.round(brlAmount * 100));
  } else {
    const rates = await getExchangeRates();
    const rate = rates[currency] ?? (currency === "USD" ? 5.5 : 6.0);
    rateUsed = rate;
    const foreign = brlAmount / rate;
    amountCents = Math.max(50, Math.ceil(foreign * 100));
  }

  const params: Stripe.PriceCreateParams = {
    product: stripeProductId,
    currency: currency.toLowerCase(),
    unit_amount: amountCents,
    metadata: {
      tierId,
      billing,
      currency,
      createdBy: "playbook-hub:auto",
      ...(currency !== "BRL" ? { rateUsed: String(rateUsed), brlAmount: String(brlAmount) } : {}),
    },
  };
  if (billing !== "lifetime") {
    params.recurring = { interval: billing === "annual" ? "year" : "month" };
  }

  const created = await stripe.prices.create(params);

  // Persist best-effort
  if (col) await bestEffortUpdateTierColumn(tierId, col, created.id);
  await writeToMappingTable(tierId, currency, billing, created.id);

  return { priceId: created.id, created: true, amountCents, rateUsed };
}
