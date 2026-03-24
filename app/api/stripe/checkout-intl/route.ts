// app/api/stripe/checkout-intl/route.ts
// PaymentIntent para pagamentos internacionais (USD ou EUR) com câmbio dinâmico.

import { z } from "zod";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getExchangeRates } from "@/lib/exchange-rate";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { ensureTierStripePrice } from "@/lib/stripe/ensure-tier-price";
import { getErrorMessage } from "@/lib/errors";
import { buildStripeSaleMetadata } from "@/lib/checkout/metadata";
import { success, failure } from "@/lib/api/responses";
import { parseRequestBody } from "@/lib/api/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// Local types
interface TierRow {
  id: string;
  tier_name?: string;
  price_monthly?: number | null;
  price_annual?: number | null;
  price_lifetime?: number | null;
  saas_products?: {
    id?: string;
    vendor_id?: string;
    name?: string;
    stripe_connect_account_id?: string | null;
    stripe_connect_onboarded?: boolean | null;
  } | {
    id?: string;
    vendor_id?: string;
    name?: string;
    stripe_connect_account_id?: string | null;
    stripe_connect_onboarded?: boolean | null;
  }[];
}

interface ProfileRow {
  email?: string;
  full_name?: string;
}

interface SubscriptionRow {
  stripe_customer_id?: string | null;
}

const CheckoutIntlSchema = z.object({
  productTierId: z.string().uuid(),
  currency: z.enum(["USD", "EUR"]),
  billing: z.enum(["monthly", "annual", "lifetime"]).optional(),
  vendorId: z.string().uuid().optional(),
  affiliateCode: z.string().optional(),
  pointsRedeemed: z.number().int().min(0).optional(),
});

type CheckoutIntlPayload = z.infer<typeof CheckoutIntlSchema>;

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`checkout-intl:${getIP(req)}`, 10, 60_000);
  if (!rl.success) return failure("RATE_LIMIT", 429, "Muitas tentativas.");

  const clientSupa = createClient();
  const { data: { user: authUser } } = await clientSupa.auth.getUser();
  if (!authUser) return failure("UNAUTHORIZED", 401, "Não autenticado.");

  const parsed = await parseRequestBody<CheckoutIntlPayload>(req, CheckoutIntlSchema);
  if (!parsed.success) {
    return failure("INVALID_PAYLOAD", 400, parsed.message);
  }

  const {
    productTierId,
    currency,
    billing,
    vendorId,
    affiliateCode,
    pointsRedeemed,
  } = parsed.data;

  try {
    if (!productTierId || !currency) {
      return failure("MISSING_FIELDS", 400, "productTierId e currency são obrigatórios.");
    }
    if (!["USD", "EUR"].includes(currency)) {
      return failure("INVALID_CURRENCY", 400, "Moeda inválida. Use USD ou EUR.");
    }

    const userId = authUser.id;
    const billingCycle = billing ?? "lifetime";

    // Buscar tier
    const { data: tierRaw } = await supabase
      .from("product_tiers")
      .select("*, saas_products(id, vendor_id, name, stripe_connect_account_id, stripe_connect_onboarded)")
      .eq("id", productTierId)
      .single();

    if (!tierRaw) return failure("NOT_FOUND", 404, "Plano não encontrado.");

    const tier = tierRaw as TierRow;
    const saasProduct = Array.isArray(tier.saas_products) ? tier.saas_products[0] : tier.saas_products;
    const effectiveVendorId = vendorId ?? saasProduct?.vendor_id ?? "";

    // Buscar profile
    const { data: profile } = await supabase.from("profiles")
      .select("email, full_name").eq("id", userId).single();

    // Verificar blacklist
    const { data: blacklisted } = await supabase.from("blacklisted_emails")
      .select("id").eq("email", profile?.email ?? "").maybeSingle();
    if (blacklisted) return failure("BLACKLISTED", 403, "Conta suspensa.");

    // ── Resolver/garantir Price para esta moeda (auto-create se faltar) ─────
    const ensured = await ensureTierStripePrice({
      tierId: productTierId,
      currency,
      billing: billingCycle,
    });
    const fixedPriceId: string | null = ensured?.priceId ?? null;

    // Obter taxa de câmbio
    const rates = await getExchangeRates();
    const brlRate = rates[currency] ?? (currency === "USD" ? 5.5 : 6.0);

    // Calcular valor na moeda alvo
    const brlPriceField =
      billingCycle === "lifetime" ? "price_lifetime" :
        billingCycle === "annual" ? "price_annual" : "price_monthly";
    const tierRecord = tier as unknown as Record<string, number | null | undefined>;
    const brlPrice = Number(tierRecord[brlPriceField] ?? 0);
    if (brlPrice <= 0) {
      return failure("INVALID_PRICE", 400, `Tier sem preço para o ciclo "${billingCycle}".`);
    }

    const foreignPrice = brlPrice / brlRate;
    const amountCents = Math.max(50, Math.ceil(foreignPrice * 100));

    // Criar/buscar cliente Stripe
    let stripeCustomerId: string;
    const { data: existingSub } = await supabase.from("subscriptions")
      .select("stripe_customer_id").eq("user_id", userId).limit(1).maybeSingle();
    const existingSubTyped = existingSub as SubscriptionRow | null;
    if (existingSubTyped?.stripe_customer_id) {
      stripeCustomerId = existingSubTyped.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: profile?.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
    }

    const metadata = buildStripeSaleMetadata({
      userId,
      vendorId: effectiveVendorId,
      productId: saasProduct?.id ?? "",
      tierId: productTierId,
      playbookId: "",
      affiliateCode: affiliateCode ?? "",
      type: billingCycle === "lifetime" ? "lifetime" : "subscription",
      extras: {
        billing: billingCycle,
        currency,
        rate_used: String(brlRate),
        brl_price: String(brlPrice),
        splitMode: "transfer",
        pointsRedeemed,
      },
    });

    // ── Lifetime: PaymentIntent (PIX não é suportado fora do BRL) ──────────
    if (billingCycle === "lifetime") {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: currency.toLowerCase(),
        customer: stripeCustomerId,
        setup_future_usage: "off_session",
        payment_method_types: ["card"],
        metadata,
        description: `${saasProduct?.name ?? "Produto"} — ${tier.tier_name} (${currency})`,
      });

      return success({
        clientSecret: paymentIntent.client_secret,
        intentType: "payment_intent",
        currency,
        amountFormatted: (amountCents / 100).toLocaleString("en-US", { style: "currency", currency }),
        rateUsed: brlRate,
        isDynamic: !fixedPriceId,
      });
    }

    // ── Subscription: exige um Price (agora auto-criado) ───────────────────
    if (!fixedPriceId) {
      return failure("NO_PRICE", 400, "Não foi possível resolver o preço Stripe para essa moeda. Configure um preço BRL no tier e tente novamente.");
    }

    // ── Subscription com Price → Subscription com moeda real ───────────────
    const existingIncompleteSub = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "incomplete",
      limit: 1,
    });

    if (existingIncompleteSub.data.length > 0) {
      const sub = existingIncompleteSub.data[0];
      const latestInvoice = await stripe.invoices.retrieve(sub.latest_invoice as string);
      const pi = await stripe.paymentIntents.retrieve(latestInvoice.payment_intent as string);
      return success({
        clientSecret: pi.client_secret,
        intentType: "subscription",
        currency,
        rateUsed: brlRate,
        isDynamic: false,
      });
    }

    const sub = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: fixedPriceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
      metadata,
    });

    const invoice = sub.latest_invoice as Stripe.Invoice | undefined;
    const pi = invoice?.payment_intent as Stripe.PaymentIntent | undefined;

    return success({
      clientSecret: pi?.client_secret ?? null,
      intentType: "subscription",
      currency,
      rateUsed: brlRate,
      isDynamic: false,
    });

  } catch (err: unknown) {
    console.error("[checkout-intl]", getErrorMessage(err));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err) ?? "Erro interno");
  }
}
