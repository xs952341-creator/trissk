// app/api/points/route.ts
// API de pontos/cashback do usuário.
// GET  /api/points          → saldo e histórico do usuário autenticado
// POST /api/points          → criar cupom Stripe one-time para resgate de pontos no checkout

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export const runtime = "nodejs";

// Conversão: 1 ponto = R$ 0,01
const POINT_VALUE_BRL = 0.01;
// Máximo que o usuário pode resgatar: 20% do valor do pedido
const MAX_REDEEM_PCT  = 0.20;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Saldo consolidado
  const { data: wallet } = await admin
    .from("points_wallets")
    .select("balance, lifetime_earned, lifetime_redeemed")
    .eq("user_id", user.id)
    .maybeSingle();

  // Histórico recente (20 últimas entradas)
  const { data: ledger } = await admin
    .from("points_ledger")
    .select("id, amount, type, description, created_at, reference_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    balance:           wallet?.balance ?? 0,
    lifetime_earned:   wallet?.lifetime_earned ?? 0,
    lifetime_redeemed: wallet?.lifetime_redeemed ?? 0,
    ledger:            ledger ?? [],
  });
}

// POST /api/points → Criar cupom Stripe efêmero para resgate de pontos no checkout
// O débito real dos pontos só acontece no webhook invoice.paid (idempotente via pointsRedeemedId)
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  try {
    const { pointsToRedeem, orderAmountBRL } = await req.json();

    // Validações
    if (!pointsToRedeem || pointsToRedeem < 100) {
      return NextResponse.json({ error: "Mínimo de 100 pontos para resgate." }, { status: 400 });
    }
    if (!orderAmountBRL || orderAmountBRL <= 0) {
      return NextResponse.json({ error: "Valor do pedido inválido." }, { status: 400 });
    }

    // Verificar saldo
    const { data: wallet } = await admin
      .from("points_wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    const balance = wallet?.balance ?? 0;
    if (balance < pointsToRedeem) {
      return NextResponse.json({ error: `Saldo insuficiente. Você tem ${balance} pontos.` }, { status: 400 });
    }

    // Calcular desconto respeitando o limite de 20% do pedido
    const maxDiscountBRL = orderAmountBRL * MAX_REDEEM_PCT;
    const requestedBRL   = pointsToRedeem * POINT_VALUE_BRL;
    const discountBRL    = Math.min(requestedBRL, maxDiscountBRL);
    const actualPoints   = Math.floor(discountBRL / POINT_VALUE_BRL);
    const discountCents  = Math.floor(discountBRL * 100);

    if (discountCents < 1) {
      return NextResponse.json({ error: "Desconto calculado é zero." }, { status: 400 });
    }

    // Criar cupom Stripe one-time (expira em 30 min)
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency:   "brl",
      duration:   "once",
      name:       `Resgate ${actualPoints} pontos`,
      redeem_by:  Math.floor(Date.now() / 1000) + 1800, // 30 min
      metadata:   { userId: user.id, pointsRedeemed: String(actualPoints), source: "points_wallet" },
    });

    return NextResponse.json({
      couponId:      coupon.id,
      discountBRL,
      actualPoints,
      description:   `${actualPoints} pontos → ${discountBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`,
    });

  } catch (err: unknown) {
    console.error("[points/redeem]", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err) ?? "Erro interno" }, { status: 500 });
  }
}
