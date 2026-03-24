// app/api/coupons/validate/route.ts
// Valida um cupom e retorna desconto aplicável.
// Suporta cupons internos (tabela coupons) e Stripe Promotion Codes.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

export async function POST(req: NextRequest) {
  try {
    const { code, productId } = await req.json();
    if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

    const normalizedCode = String(code).toUpperCase().trim();

    // 1. Buscar cupom interno (tabela coupons — criada pelo migration abaixo)
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", normalizedCode)
      .eq("active", true)
      .maybeSingle();

    if (!coupon) {
      // 2. Fallback: Stripe Promotion Code
      try {
        const promos = await stripe.promotionCodes.list({ code: normalizedCode, active: true, limit: 1 });
        if (promos.data.length === 0) {
          return NextResponse.json({ valid: false, error: "Cupom inválido ou expirado" });
        }
        const promo        = promos.data[0];
        const stripeCoupon = promo.coupon;
        const discountPct  = stripeCoupon.percent_off ?? null;
        const discountAmt  = stripeCoupon.amount_off ? stripeCoupon.amount_off / 100 : null;

        return NextResponse.json({
          valid:           true,
          source:          "stripe",
          promotionCodeId: promo.id,
          couponId:        stripeCoupon.id,
          discountPct,
          discountAmt,
          description: discountPct
            ? `${discountPct}% de desconto`
            : discountAmt ? `R$ ${discountAmt.toFixed(2)} de desconto` : "Desconto aplicado",
        });
      } catch {
        return NextResponse.json({ valid: false, error: "Cupom inválido ou expirado" });
      }
    }

    // Validar expiração
    if (coupon.expires_at && new Date(String(coupon.expires_at ?? "")) < new Date()) {
      return NextResponse.json({ valid: false, error: "Cupom expirado" });
    }

    // Validar uso máximo
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      return NextResponse.json({ valid: false, error: "Cupom esgotado" });
    }

    // Validar produto específico (se coupon for restrito a um produto)
    if (coupon.product_id && productId && coupon.product_id !== productId) {
      return NextResponse.json({ valid: false, error: "Cupom não válido para este produto" });
    }

    return NextResponse.json({
      valid:           true,
      source:          "internal",
      couponDbId:      coupon.id,
      promotionCodeId: coupon.stripe_promotion_code_id ?? null,
      discountPct:     coupon.discount_pct ?? null,
      discountAmt:     coupon.discount_amt ?? null,
      description: coupon.discount_pct
        ? `${coupon.discount_pct}% de desconto`
        : `R$ ${Number(coupon.discount_amt ?? 0).toFixed(2)} de desconto`,
    });

  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
