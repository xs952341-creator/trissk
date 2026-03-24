// app/api/stripe/save-offer/route.ts
// Gera um Stripe Promotion Code de 1 mês grátis (100% off, 1 use, 30 dias)
// para o "save offer" na página de cancelamento.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { reason } = await req.json();

    // Criar coupon de 1 mês grátis (100% off, duração = 1 mês)
    const coupon = await stripe.coupons.create({
      percent_off:       100,
      duration:          "once",      // aplica apenas na primeira fatura
      name:              "1 Mês Grátis — Oferta Especial",
      max_redemptions:   1,
      redeem_by:         Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // expira em 7 dias
      metadata: {
        userId:         user.id,
        reason:         reason ?? "unknown",
        source:         "save_offer",
      },
    });

    // Criar Promotion Code legível pelo usuário
    const promoPrefix = "VOLTA";
    const promoSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const promoCode = await stripe.promotionCodes.create({
      coupon:          coupon.id,
      code:            `${promoPrefix}${promoSuffix}`,
      max_redemptions: 1,
      // Sem first_time_transaction pois esta oferta é direcionada a clientes EXISTENTES
      // que estão cancelando — eles não são first-time e ficariam bloqueados.
    });

    // Log no banco
    try {
      await supabase.from("save_offers").insert({
        user_id:   user.id,
        coupon_id: coupon.id,
        promo_code: promoCode.code,
        reason,
        expires_at: new Date(coupon.redeem_by! * 1000).toISOString(),
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ couponCode: promoCode.code });
  } catch (err: unknown) {
    console.error("[save-offer]:", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
