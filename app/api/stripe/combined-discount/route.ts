// app/api/stripe/combined-discount/route.ts
// Cria um único Stripe Coupon combinando cupom de promoção + pontos resgatados.
// Necessário porque a API Stripe só aceita 1 item em `discounts[]`.
// Retorna um couponId efêmero (expira em 30 min) para ser usado no PaymentIntent/Subscription.

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";
import { parseRequestBody } from "@/lib/api/parse";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ── Schema ─────────────────────────────────────────────────────────────────────
const CombinedDiscountSchema = z.object({
  promotionCodeId: z.string().optional(),
  pointsCouponId: z.string().optional(),
  rawPriceBRL: z.number().positive("rawPriceBRL deve ser positivo."),
});

type CombinedDiscountPayload = z.infer<typeof CombinedDiscountSchema>;

export async function POST(req: NextRequest) {
  // Rate limit: 20 chamadas/min por IP
  const rl = await rateLimit(`combined-discount:${getIP(req)}`, 20, 60_000);
  if (!rl.success) return failure("RATE_LIMITED", 429, "Muitas tentativas.");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("UNAUTHORIZED", 401, "Não autenticado.");

  const parsed = await parseRequestBody<CombinedDiscountPayload>(req, CombinedDiscountSchema);
  if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

  const { promotionCodeId, pointsCouponId, rawPriceBRL } = parsed.data;

  try {
    // Se só um desconto está ativo, devolve o que veio sem criar novo coupon
    if (!promotionCodeId && pointsCouponId) {
      return success({ couponId: pointsCouponId, source: "points_only" });
    }
    if (promotionCodeId && !pointsCouponId) {
      return success({ promotionCodeId, source: "promo_only" });
    }
    if (!promotionCodeId && !pointsCouponId) {
      return failure("NO_DISCOUNT", 400, "Nenhum desconto informado.");
    }

    // ── Ambos presentes: calcular total e criar coupon combinado ──────────────

    // 1. Desconto do PromotionCode
    const promoCode = await stripe.promotionCodes.retrieve(promotionCodeId!, { expand: ["coupon"] });
    const promoCoupon = promoCode.coupon as Stripe.Coupon;
    let promoDiscountBRL = 0;
    if (promoCoupon.amount_off) {
      promoDiscountBRL = promoCoupon.amount_off / 100;
    } else if (promoCoupon.percent_off) {
      promoDiscountBRL = (rawPriceBRL * promoCoupon.percent_off) / 100;
    }

    // 2. Desconto dos pontos
    const pointsCoupon = await stripe.coupons.retrieve(pointsCouponId!);
    const pointsDiscountBRL = (pointsCoupon.amount_off ?? 0) / 100;

    // 3. Total combinado (nunca excede o preço bruto)
    const totalDiscountBRL = Math.min(rawPriceBRL - 0.50, promoDiscountBRL + pointsDiscountBRL);
    const totalDiscountCents = Math.round(totalDiscountBRL * 100);

    if (totalDiscountCents <= 0) {
      return failure("ZERO_DISCOUNT", 400, "Desconto combinado zero.");
    }

    // 4. Criar coupon combinado efêmero (30 min)
    const combined = await stripe.coupons.create({
      amount_off: totalDiscountCents,
      currency: "brl",
      duration: "once",
      name: "Desconto combinado (cupom + pontos)",
      redeem_by: Math.floor(Date.now() / 1000) + 1800,
      metadata: {
        userId: user.id,
        source: "combined",
        promoDiscountBRL: String(promoDiscountBRL.toFixed(2)),
        pointsDiscountBRL: String(pointsDiscountBRL.toFixed(2)),
        promotionCodeId: promotionCodeId ?? "",
        pointsCouponId: pointsCouponId ?? "",
      },
    });

    return success({
      couponId: combined.id,
      totalDiscountBRL,
      promoDiscountBRL,
      pointsDiscountBRL,
      source: "combined",
    });
  } catch (err: unknown) {
    console.error("[combined-discount]", getErrorMessage(err));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro interno."));
  }
}
