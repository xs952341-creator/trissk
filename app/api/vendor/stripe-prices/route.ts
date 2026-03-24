// app/api/vendor/stripe-prices/route.ts
// Cria prices no Stripe para USD e/ou EUR para um tier existente.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// Campos por moeda que precisamos salvar no Supabase
const CURRENCY_FIELDS: Record<string, {
  monthly_price_field: string; monthly_stripe_field: string;
  lifetime_price_field: string; lifetime_stripe_field: string;
}> = {
  usd: {
    monthly_price_field: "price_usd_monthly",
    monthly_stripe_field: "stripe_usd_monthly_price_id",
    lifetime_price_field: "price_usd_lifetime",
    lifetime_stripe_field: "stripe_usd_lifetime_price_id",
  },
  eur: {
    monthly_price_field: "price_eur_monthly",
    monthly_stripe_field: "stripe_eur_monthly_price_id",
    lifetime_price_field: "price_eur_lifetime",
    lifetime_stripe_field: "stripe_eur_lifetime_price_id",
  },
};

// Local types
interface TierRow {
  id: string;
  tier_name?: string;
  stripe_monthly_price_id?: string | null;
  stripe_lifetime_price_id?: string | null;
  saas_products?: {
    id?: string;
    name?: string;
    vendor_id?: string;
  } | {
    id?: string;
    name?: string;
    vendor_id?: string;
  }[];
}

interface StripePriceUpdates {
  stripe_monthly_price_id?: string | null;
  stripe_annual_price_id?: string | null;
  stripe_lifetime_price_id?: string | null;
  stripe_usd_monthly_price_id?: string | null;
  stripe_usd_annual_price_id?: string | null;
  stripe_usd_lifetime_price_id?: string | null;
  stripe_eur_monthly_price_id?: string | null;
  stripe_eur_annual_price_id?: string | null;
  stripe_eur_lifetime_price_id?: string | null;
  [key: string]: string | number | null | undefined;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const adminSupabase = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

    const {
      tierId,
      currency,
      monthlyPrice,
      lifetimePrice,
      productName,
      tierName,
    } = await req.json() as {
      tierId: string;
      currency: "usd" | "eur";
      monthlyPrice?: number | null;
      lifetimePrice?: number | null;
      productName?: string;
      tierName?: string;
    };

    if (!tierId || !currency || !["usd", "eur"].includes(currency)) {
      return failure("INVALID_CURRENCY", 400, "tierId e currency (usd|eur) são obrigatórios");
    }
    if (!monthlyPrice && !lifetimePrice) {
      return failure("MISSING_PRICE", 400, "Informe pelo menos um preço (monthly ou lifetime)");
    }

    // 1. Verificar se o vendor é dono do tier
    const { data: tierRaw } = await adminSupabase
      .from("product_tiers")
      .select("id, tier_name, stripe_monthly_price_id, stripe_lifetime_price_id, saas_products(id, name, vendor_id)")
      .eq("id", tierId)
      .single();

    if (!tierRaw) return failure("NOT_FOUND", 404, "Tier não encontrado");

    const tier = tierRaw as unknown as TierRow;
    const saasProduct = Array.isArray(tier.saas_products) ? tier.saas_products[0] : tier.saas_products;
    if (saasProduct?.vendor_id !== user.id) {
      return failure("FORBIDDEN", 403, "Sem permissão para este tier");
    }

    const fields = CURRENCY_FIELDS[currency];
    const updates: StripePriceUpdates = {};
    const curr = currency.toUpperCase();
    const productLabel = productName ?? saasProduct?.name ?? "Produto";
    const tierLabel = tierName ?? tier.tier_name ?? "Tier";
  
    // 2. Criar price mensal no Stripe (se pedido)
    if (monthlyPrice && monthlyPrice > 0) {
      // Precisa de um product no Stripe — reusar o do BRL ou criar
      // Descobrir o product_id a partir do stripe_monthly_price_id existente
      let stripeProductId: string | null = null;
      if (tier.stripe_monthly_price_id) {
        const existing = await stripe.prices.retrieve(tier.stripe_monthly_price_id);
        stripeProductId = typeof existing.product === "string" ? existing.product : existing.product.id;
      }
  
      const monthlyParams: Stripe.PriceCreateParams = {
        currency:          currency,
        unit_amount:       Math.round(monthlyPrice * 100),
        recurring:         { interval: "month" },
        nickname:          `${productLabel} — ${tierLabel} (${curr}/mês)`,
        metadata:          { tierId, currency, billing: "monthly" },
        ...(stripeProductId ? { product: stripeProductId } : {
          product_data: { name: `${productLabel} — ${tierLabel}` },
        }),
      };
  
      const monthlyStripe = await stripe.prices.create(monthlyParams);
      updates[String(fields.monthly_price_field)]  = monthlyPrice;
      updates[String(fields.monthly_stripe_field)] = monthlyStripe.id;
    }
  
    // 3. Criar price lifetime no Stripe (se pedido)
    if (lifetimePrice && lifetimePrice > 0) {
      let stripeProductId: string | null = null;
      if (tier.stripe_lifetime_price_id) {
        const existing = await stripe.prices.retrieve(tier.stripe_lifetime_price_id);
        stripeProductId = typeof existing.product === "string" ? existing.product : existing.product.id;
      } else if (tier.stripe_monthly_price_id) {
        const existing = await stripe.prices.retrieve(tier.stripe_monthly_price_id);
        stripeProductId = typeof existing.product === "string" ? existing.product : existing.product.id;
      }
  
      const lifetimeParams: Stripe.PriceCreateParams = {
        currency:     currency,
        unit_amount:  Math.round(lifetimePrice * 100),
        nickname:     `${productLabel} — ${tierLabel} (${curr}/lifetime)`,
        metadata:     { tierId, currency, billing: "lifetime" },
        ...(stripeProductId ? { product: stripeProductId } : {
          product_data: { name: `${productLabel} — ${tierLabel}` },
        }),
      };
  
      const lifetimeStripe = await stripe.prices.create(lifetimeParams);
      updates[String(fields.lifetime_price_field)]  = lifetimePrice;
      updates[String(fields.lifetime_stripe_field)] = lifetimeStripe.id;
    }
  
    // 4. Salvar no Supabase
    if (Object.keys(updates).length === 0) {
      return failure("NO_UPDATES", 400, "Nenhum price criado");
    }

    const { error: updateError } = await adminSupabase
      .from("product_tiers")
      .update(updates)
      .eq("id", tierId);

    if (updateError) {
      console.error("[stripe-prices] Supabase update error:", updateError);
      return failure("UPDATE_ERROR", 500, "Erro ao salvar IDs no banco");
    }

    return success({ success: true, updates, currency: curr });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}

// GET: lista os prices de um tier
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

    const tierId = req.nextUrl.searchParams.get("tierId");
    if (!tierId) return failure("MISSING_TIER", 400, "tierId obrigatório");

    const adminSupabase = createAdminClient();
    const { data: tierRaw } = await adminSupabase
      .from("product_tiers")
      .select(`
        id, tier_name,
        stripe_monthly_price_id, stripe_lifetime_price_id,
        stripe_usd_monthly_price_id, stripe_usd_lifetime_price_id,
        stripe_eur_monthly_price_id, stripe_eur_lifetime_price_id,
        price_monthly, price_lifetime,
        price_usd_monthly, price_usd_lifetime,
        price_eur_monthly, price_eur_lifetime,
        saas_products(vendor_id)
      `)
      .eq("id", tierId)
      .single();

    if (!tierRaw) return failure("NOT_FOUND", 404, "Tier não encontrado");

    const tier = tierRaw as unknown as TierRow;
    const saasProduct = Array.isArray(tier.saas_products) ? tier.saas_products[0] : tier.saas_products;
    if (saasProduct?.vendor_id !== user.id) {
      return failure("FORBIDDEN", 403, "Sem permissão");
    }

    return success({ tier });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
