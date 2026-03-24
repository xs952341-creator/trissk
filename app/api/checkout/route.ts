// app/api/checkout/route.ts
// ✅ STRIPE CONNECT EXPRESS NO CHECKOUT
// Usa application_fee_amount + on_behalf_of para split direto na sessão.
// Chargeback cai na conta do vendor, não na plataforma.
// Fallback para checkout normal se vendor não concluiu KYC.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { DEFAULT_PLATFORM_FEE_PCT, UTM_COOKIE_PREFIX } from "@/lib/config";
import { detectFraud } from "@/lib/fraud/detector";
import { getOrSetDeviceIdCookie, recordCheckoutAttempt } from "@/lib/fraud/device";
import { computeTaxForCheckout } from "@/lib/tax/engine";
import { getErrorMessage } from "@/lib/errors";
import { buildStripeSaleMetadata } from "@/lib/checkout/metadata";
import { parseRequestBody } from "@/lib/api/parse";
import { failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// ── Local types ────────────────────────────────────────────────────────────────
type CheckoutTier = {
  id: string;
  tier_name: string;
  price_monthly?: number | null;
  price_lifetime?: number | null;
  trial_days?: number | null;
  pay_what_you_want_enabled?: boolean | null;
  pay_what_you_want_min_amount?: number | null;
  saas_products: {
    id: string;
    vendor_id: string;
    name: string;
    profiles: {
      stripe_connect_account_id?: string | null;
      stripe_connect_onboarded?:  boolean | null;
      custom_platform_fee_pct?:   number | null;
    } | null;
  } | null;
};

// ── Schema ─────────────────────────────────────────────────────────────────────
const CheckoutPayloadSchema = z.object({
  priceId:          z.string().min(1, "priceId é obrigatório."),
  productTierId:    z.string().uuid("productTierId deve ser UUID."),
  type:             z.enum(["payment", "subscription"]).optional(),
  vendorId:         z.string().uuid().optional(),
  userId:           z.string().uuid().optional(),   // fallback para guests (deprecado)
  affiliateCode:    z.string().optional(),
  includeOrderBump: z.boolean().optional(),
  orderBumpPriceId: z.string().optional(),
  customAmount:     z.number().positive().optional(),
  addonPriceIds:    z.array(z.string()).optional(),
  promotionCodeId:  z.string().optional(),
  pointsCouponId:   z.string().optional(),
  pointsRedeemed:   z.number().int().min(0).optional(),
  utm_source:       z.string().optional(),
  utm_medium:       z.string().optional(),
  utm_campaign:     z.string().optional(),
  utm_content:      z.string().optional(),
  utm_term:         z.string().optional(),
});

type CheckoutPayload = z.infer<typeof CheckoutPayloadSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────────
type UserResolution = {
  userId: string | null;
  source: "session" | "body" | "none";
};

function resolveCheckoutUserId(
  sessionId?: string | null,
  bodyId?:    string
): UserResolution {
  if (sessionId) return { userId: sessionId, source: "session" };
  if (bodyId)    return { userId: bodyId,    source: "body" };
  return           { userId: null,           source: "none" };
}

async function calculateFeeAmount(priceId: string, feePct: number): Promise<number> {
  try {
    const price  = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount ?? 0;
    return Math.round(amount * (feePct / 100));
  } catch {
    return 0;
  }
}

// ── Route ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`checkout:${getIP(req)}`, 10, 60_000);
  if (!rl.success) {
    return failure("RATE_LIMITED", 429, "Muitas tentativas. Aguarde um momento.");
  }

  const parsed = await parseRequestBody<CheckoutPayload>(req, CheckoutPayloadSchema);
  if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

  const body = parsed.data;

  // ── UTM: body has priority; fallback to httpOnly cookies ──────────────────
  const utm_source   = body.utm_source   ?? req.cookies.get(`${UTM_COOKIE_PREFIX}utm_source`)?.value;
  const utm_medium   = body.utm_medium   ?? req.cookies.get(`${UTM_COOKIE_PREFIX}utm_medium`)?.value;
  const utm_campaign = body.utm_campaign ?? req.cookies.get(`${UTM_COOKIE_PREFIX}utm_campaign`)?.value;
  const utm_content  = body.utm_content  ?? req.cookies.get(`${UTM_COOKIE_PREFIX}utm_content`)?.value;
  const utm_term     = body.utm_term     ?? req.cookies.get(`${UTM_COOKIE_PREFIX}utm_term`)?.value;
  const referrer     = req.cookies.get(`${UTM_COOKIE_PREFIX}referrer`)?.value;

  const appUrl = NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authClient = createServerClient();
  const { data: { user: sessionUser } } = await authClient.auth.getUser();

  const { userId, source: userSource } = resolveCheckoutUserId(
    sessionUser?.id,
    body.userId
  );

  if (!userId) {
    return failure("MISSING_USER", 401, "priceId, userId e productTierId são obrigatórios.");
  }

  // Warn if relying on body userId (deprecated path)
  if (userSource === "body") {
    console.warn("[checkout] userId resolved from body — session auth preferred", {
      productTierId: body.productTierId,
    });
  }

  try {
    // ── Device + velocity fraud check ────────────────────────────────────────
    const device  = await getOrSetDeviceIdCookie(req);
    const attempt = await recordCheckoutAttempt({
      userId,
      vendorId: body.vendorId ?? null,
      deviceId: device.deviceId,
      ip:       getIP(req),
    });
    if (attempt.blocked) {
      const r = failure("FRAUD_BLOCKED", 429, attempt.reason ?? "Transação bloqueada.");
      if (device.setCookie) r.headers.set("Set-Cookie", device.setCookie);
      return r;
    }

    // ── Blacklist ─────────────────────────────────────────────────────────────
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
    if (blacklisted) {
      return failure("ACCOUNT_SUSPENDED", 403, "Conta suspensa. Entre em contato com o suporte.");
    }

    // ── Fraud detection ───────────────────────────────────────────────────────
    const fraudResult = await detectFraud({
      userId,
      ip:     getIP(req),
      email:  profile.email ?? "",
      amount: 0,
    });
    if (fraudResult.blocked) {
      return failure("FRAUD_BLOCKED", 403, fraudResult.reason ?? "Transação bloqueada.");
    }

    // ── Load tier + vendor connect info ───────────────────────────────────────
    const { data: rawTier } = await supabase
      .from("product_tiers")
      .select("*, saas_products(id, vendor_id, name, profiles!vendor_id(stripe_connect_account_id, stripe_connect_onboarded, custom_platform_fee_pct))")
      .eq("id", body.productTierId)
      .single();
    if (!rawTier) return failure("TIER_NOT_FOUND", 404, "Plano não encontrado.");

    const tier             = rawTier as CheckoutTier;
    const vendorProfile    = tier.saas_products?.profiles;
    const connectAccountId = vendorProfile?.stripe_connect_account_id ?? null;
    const connectOnboarded = vendorProfile?.stripe_connect_onboarded  ?? false;
    const platformFeePct   = vendorProfile?.custom_platform_fee_pct   ?? DEFAULT_PLATFORM_FEE_PCT;

    // ── Stripe customer (idempotent) ──────────────────────────────────────────
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

    // ── Affiliate: body has priority; fallback httpOnly cookie ────────────────
    const cookieAffiliate = req.cookies.get("playbook_affiliate_id")?.value ?? null;
    const affiliateCode   = (body.affiliateCode ?? cookieAffiliate) || undefined;

    // ── Metadata ──────────────────────────────────────────────────────────────
    const metadata = buildStripeSaleMetadata({
      userId,
      vendorId:      body.vendorId ?? tier.saas_products?.vendor_id ?? "",
      productId:     tier.saas_products?.id ?? "",
      tierId:        body.productTierId,
      playbookId:    "",
      affiliateCode: affiliateCode ?? "",
      type:          body.type ?? "subscription",
      extras: {
        splitMode: (connectAccountId && connectOnboarded) ? "connect_express" : "transfer",
        pointsRedeemed: body.pointsRedeemed,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer,
      },
    });

    // ── Tax engine (MoR-ready, best-effort) ───────────────────────────────────
    try {
      const tax = await computeTaxForCheckout({
        userId,
        productTierId: body.productTierId,
        currencyHint:  undefined,
      });
      if (tax?.total_tax_cents != null) {
        metadata.tax_total_cents = String(tax.total_tax_cents);
        metadata.tax_breakdown   = JSON.stringify(tax.breakdown ?? {});
      }
    } catch { /* best-effort */ }

    // ── Line items ────────────────────────────────────────────────────────────
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const isSubscription = body.type === "subscription";

    if (body.customAmount != null) {
      const amt = Number(body.customAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return failure("INVALID_AMOUNT", 400, "Valor inválido.");
      }
      if (body.type !== "payment") {
        return failure("PWYW_SUBSCRIPTION", 400, "Pay-what-you-want só é suportado em pagamento único.");
      }
      const enabled = Boolean(tier.pay_what_you_want_enabled ?? false);
      const min     = Number(tier.pay_what_you_want_min_amount ?? 0);
      if (!enabled) {
        return failure("PWYW_DISABLED", 400, "Este plano não permite Pay-what-you-want.");
      }
      if (min > 0 && amt < min) {
        return failure("BELOW_MINIMUM", 400, `Valor mínimo é ${min}.`);
      }
      const basePrice  = await stripe.prices.retrieve(body.priceId);
      const currency   = (basePrice.currency ?? "brl") as string;
      const unitAmount = Math.round(amt * 100);
      lineItems.push({
        price_data: {
          currency,
          unit_amount: unitAmount,
          product_data: {
            name: `${tier.saas_products?.name ?? "Produto"} — ${tier.tier_name}`,
          },
        },
        quantity: 1,
      });
      metadata.customAmount = String(amt);
    } else {
      lineItems.push({ price: body.priceId, quantity: 1 });
    }

    // Add-ons (subscriptions only)
    if (Array.isArray(body.addonPriceIds) && body.addonPriceIds.length > 0) {
      if (!isSubscription) {
        return failure("ADDON_NOT_SUB", 400, "Add-ons só funcionam em assinatura.");
      }
      for (const ap of body.addonPriceIds) {
        if (typeof ap === "string" && ap.startsWith("price_")) {
          lineItems.push({ price: ap, quantity: 1 });
        }
      }
      metadata.addonPriceIds = body.addonPriceIds
        .filter((x): x is string => typeof x === "string")
        .join(",");
    }

    if (body.includeOrderBump && body.orderBumpPriceId) {
      lineItems.push({ price: body.orderBumpPriceId, quantity: 1 });
    }

    // ── Connect Express split params ──────────────────────────────────────────
    const useConnectSplit = !!(connectAccountId && connectOnboarded);
    type ConnectParams = Record<string, unknown>;

    const connectSplitParams: ConnectParams = useConnectSplit
      ? {
          on_behalf_of: connectAccountId!,
          ...(isSubscription
            ? {
                subscription_data: {
                  metadata,
                  ...(Number(tier.trial_days ?? 0) > 0
                    ? { trial_period_days: Number(tier.trial_days) }
                    : {}),
                  application_fee_percent: platformFeePct,
                  on_behalf_of:            connectAccountId!,
                },
              }
            : {
                payment_intent_data: {
                  metadata,
                  application_fee_amount: await calculateFeeAmount(body.priceId, platformFeePct),
                  on_behalf_of: connectAccountId!,
                },
              }),
        }
      : {
          ...(isSubscription
            ? {
                subscription_data: {
                  metadata,
                  ...(Number(tier.trial_days ?? 0) > 0
                    ? { trial_period_days: Number(tier.trial_days) }
                    : {}),
                },
              }
            : { payment_intent_data: { metadata } }),
        };

    // ── Create Stripe Checkout Session ────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      customer:    stripeCustomerId,
      mode:        isSubscription ? "subscription" : "payment",
      line_items:  lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/checkout/cancel`,
      metadata,
      ...(body.promotionCodeId
        ? { discounts: [{ promotion_code: body.promotionCodeId }] }
        : body.pointsCouponId
          ? { discounts: [{ coupon: body.pointsCouponId }] }
          : { allow_promotion_codes: true }),
      ...(process.env.STRIPE_TAX_ENABLED === "true"
        ? {
            automatic_tax:    { enabled: true },
            tax_id_collection: { enabled: true },
            customer_update:  { address: "auto", name: "auto" },
          }
        : {}),
      ...connectSplitParams,
    });

    // ── Abandoned cart tracking (best-effort) ─────────────────────────────────
    try {
      const productId    = tier.saas_products?.id ?? null;
      const priceForCart = body.customAmount != null
        ? Number(body.customAmount)
        : Number(tier.price_monthly ?? 0);

      await supabase.from("carts").insert({
        user_id:    userId,
        email:      profile.email,
        product_id: productId,
        tier_id:    body.productTierId,
        amount:     Number.isFinite(priceForCart) ? priceForCart : null,
        currency:   "brl",
        status:     "open",
        metadata:   {
          checkout_session_id: session.id,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          referrer, affiliateCode,
        },
      });
      await supabase.from("marketing_events").insert({
        user_id: userId,
        email:   profile.email,
        kind:    "cart_opened",
        ref_id:  session.id,
        payload: { productTierId: body.productTierId, productId, utm_source, utm_medium, utm_campaign },
      });
    } catch { /* noop */ }

    const r = NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
    if (device?.setCookie) r.headers.set("Set-Cookie", device.setCookie);
    return r;

  } catch (err: unknown) {
    console.error("[checkout]", err);
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Internal Server Error"));
  }
}
