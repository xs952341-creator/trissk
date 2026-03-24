// app/api/stripe/payment-intent/route.ts
// Cria PaymentIntent (lifetime) ou Subscription incompleta (mensal) para Stripe Elements.
// O checkout fica 100% no domínio — nunca redireciona para o Stripe Hosted Page.
//
// FLUXO:
//   POST → { clientSecret, intentType, subscriptionId? }
//   Client → <Elements> → <PaymentElement> → stripe.confirmPayment()
//   Webhook → invoice.paid ou payment_intent.succeeded → provisiona acesso

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";
import { buildStripeSaleMetadata } from "@/lib/checkout/metadata";
import { parseRequestBody } from "@/lib/api/parse";
import { failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// ── Local types ────────────────────────────────────────────────────────────────
type TierWithVendor = {
  id: string;
  tier_name: string;
  price_lifetime: number | null;
  trial_days?: number | null;
  saas_products: {
    id: string;
    vendor_id: string;
    name: string;
  } | null;
};

// ── Schema ─────────────────────────────────────────────────────────────────────
const PaymentIntentSchema = z.object({
  priceId:          z.string().min(1, "priceId é obrigatório."),
  productTierId:    z.string().uuid("productTierId deve ser um UUID válido."),
  type:             z.enum(["subscription", "lifetime"]),
  vendorId:         z.string().uuid().optional(),
  couponId:         z.string().optional(),
  promotionCodeId:  z.string().optional(),
  pointsRedeemed:   z.number().int().min(0).optional(),
  includeOrderBump: z.boolean().optional(),
  orderBumpPriceId: z.string().optional(),
  affiliateCode:    z.string().optional(),
  utm_source:       z.string().optional(),
  utm_medium:       z.string().optional(),
  utm_campaign:     z.string().optional(),
  utm_content:      z.string().optional(),
  utm_term:         z.string().optional(),
});

type PaymentIntentPayload = z.infer<typeof PaymentIntentSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns the lifetime amount in cents, or null if not configured. */
function getLifetimeAmountCents(priceLifetime: number | null | undefined): number | null {
  const brl = Number(priceLifetime ?? 0);
  if (!Number.isFinite(brl) || brl <= 0) return null;
  return Math.max(50, Math.round(brl * 100));
}

/** Resolves discount in cents from a coupon or promotion code. */
async function resolveDiscountCents(opts: {
  stripe:           Stripe;
  baseAmountCents:  number;
  couponId?:        string;
  promotionCodeId?: string;
}): Promise<number> {
  const { stripe: s, baseAmountCents, couponId, promotionCodeId } = opts;
  let discountCents = 0;

  if (couponId) {
    try {
      const c = await s.coupons.retrieve(couponId);
      discountCents =
        c.amount_off ??
        Math.round((baseAmountCents * (c.percent_off ?? 0)) / 100);
    } catch { /* invalid coupon — ignore */ }

  } else if (promotionCodeId) {
    try {
      const pc = await s.promotionCodes.retrieve(promotionCodeId, {
        expand: ["coupon"],
      });
      const pcCoupon = pc.coupon as Stripe.Coupon;
      discountCents =
        pcCoupon.amount_off ??
        Math.round((baseAmountCents * (pcCoupon.percent_off ?? 0)) / 100);
    } catch { /* invalid promo code — ignore */ }
  }

  return Math.max(0, discountCents);
}

// ── Route ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`payment-intent:${getIP(req)}`, 10, 60_000);
  if (!rl.success) return failure("RATE_LIMITED", 429, "Muitas tentativas.");

  // Auth via session cookie
  const clientSupa = createClient();
  const { data: { user: authUser } } = await clientSupa.auth.getUser();
  if (!authUser) return failure("UNAUTHORIZED", 401, "Não autenticado.");

  const parsed = await parseRequestBody<PaymentIntentPayload>(req, PaymentIntentSchema);
  if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

  const {
    priceId, productTierId, type, vendorId,
    couponId, promotionCodeId, pointsRedeemed,
    includeOrderBump, orderBumpPriceId, affiliateCode,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  } = parsed.data;

  const userId = authUser.id;

  try {
    // 1. Blacklist check
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();
    if (!profile) return failure("USER_NOT_FOUND", 404, "Usuário não encontrado.");

    const { data: blacklisted } = await supabase
      .from("blacklisted_emails")
      .select("id")
      .eq("email", profile.email ?? "")
      .maybeSingle();
    if (blacklisted) return failure("ACCOUNT_SUSPENDED", 403, "Conta suspensa.");

    // 2. Load tier
    const { data: rawTier } = await supabase
      .from("product_tiers")
      .select("*, saas_products(id, vendor_id, name)")
      .eq("id", productTierId)
      .single();
    if (!rawTier) return failure("TIER_NOT_FOUND", 404, "Plano não encontrado.");

    const tier             = rawTier as TierWithVendor;
    const effectiveVendorId  = vendorId ?? tier.saas_products?.vendor_id ?? "";
    const effectiveProductId = tier.saas_products?.id ?? "";

    // 3. Get or create Stripe customer (idempotent)
    let stripeCustomerId: string;
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      stripeCustomerId = existingSub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email:    profile.email    ?? undefined,
        name:     profile.full_name ?? undefined,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
    }

    // 4. Shared metadata
    const metadata = buildStripeSaleMetadata({
      userId,
      vendorId:      effectiveVendorId,
      productId:     effectiveProductId,
      tierId:        productTierId,
      playbookId:    "",
      affiliateCode: affiliateCode ?? "",
      type,
      extras: {
        pointsRedeemed,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      },
    });

    // 5. Discount resolution
    const discounts: Stripe.SubscriptionCreateParams.Discount[] = couponId
      ? [{ coupon: couponId }]
      : promotionCodeId
        ? [{ promotion_code: promotionCodeId }]
        : [];

    // ──────────────────────────────────────────────────────────────────────────
    // BRANCH A: SUBSCRIPTION (monthly / annual)
    // ──────────────────────────────────────────────────────────────────────────
    if (type === "subscription") {
      // Reuse existing incomplete subscription if present
      const { data: existingIncomplete } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id, stripe_customer_id")
        .eq("user_id", userId)
        .eq("product_tier_id", productTierId)
        .eq("status", "incomplete")
        .maybeSingle();

      if (existingIncomplete?.stripe_subscription_id) {
        try {
          const existing = await stripe.subscriptions.retrieve(
            existingIncomplete.stripe_subscription_id,
            { expand: ["latest_invoice.payment_intent"] }
          );
          if (existing.status === "incomplete") {
            const pi = (existing.latest_invoice as Stripe.Invoice)
              ?.payment_intent as Stripe.PaymentIntent;
            if (pi?.client_secret) {
              return NextResponse.json({
                clientSecret:   pi.client_secret,
                intentType:     "subscription",
                subscriptionId: existing.id,
              });
            }
          }
        } catch { /* subscription no longer exists in Stripe — create new */ }
      }

      const items: Stripe.SubscriptionCreateParams.Item[] = [
        { price: priceId },
        ...(includeOrderBump && orderBumpPriceId
          ? [{ price: orderBumpPriceId }]
          : []),
      ];

      const subscription = await stripe.subscriptions.create({
        customer:          stripeCustomerId,
        items,
        payment_behavior:  "default_incomplete",
        payment_settings:  {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        expand:            ["latest_invoice.payment_intent"],
        metadata,
        ...(discounts.length ? { discounts } : {}),
      });

      // Persist as incomplete for idempotency
      await supabase.from("subscriptions").upsert(
        {
          user_id:                userId,
          stripe_customer_id:     stripeCustomerId,
          stripe_subscription_id: subscription.id,
          product_tier_id:        productTierId,
          status:                 "incomplete",
        },
        { onConflict: "stripe_subscription_id" }
      );

      const pi = (subscription.latest_invoice as Stripe.Invoice)
        ?.payment_intent as Stripe.PaymentIntent;
      if (!pi?.client_secret) {
        throw new Error("Não foi possível obter client_secret da assinatura.");
      }

      return NextResponse.json({
        clientSecret:   pi.client_secret,
        intentType:     "subscription",
        subscriptionId: subscription.id,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BRANCH B: LIFETIME (one-time payment)
    // ──────────────────────────────────────────────────────────────────────────
    const baseAmountCents = getLifetimeAmountCents(tier.price_lifetime);
    if (!baseAmountCents) {
      return failure("NO_LIFETIME_PRICE", 400, "Tier sem preço vitalício configurado.");
    }

    const discountCents = await resolveDiscountCents({
      stripe,
      baseAmountCents,
      couponId,
      promotionCodeId,
    });

    const finalCents = Math.max(50, baseAmountCents - discountCents);

    // Order bump
    let orderBumpCents = 0;
    if (includeOrderBump && orderBumpPriceId) {
      try {
        const bumpPrice = await stripe.prices.retrieve(orderBumpPriceId);
        orderBumpCents  = bumpPrice.unit_amount ?? 0;
      } catch { /* ignore */ }
    }

    const totalCents = finalCents + orderBumpCents;

    const paymentIntent = await stripe.paymentIntents.create({
      amount:              totalCents,
      currency:            "brl",
      customer:            stripeCustomerId,
      setup_future_usage:  "off_session",
      payment_method_types: ["card", "pix"],
      payment_method_options: {
        pix: { expires_after_seconds: 3600 },
      },
      metadata,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      intentType:   "payment_intent",
    });

  } catch (err: unknown) {
    console.error("[payment-intent]", getErrorMessage(err));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro interno."));
  }
}
