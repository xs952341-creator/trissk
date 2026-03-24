// app/api/wallet/add-funds/route.ts
// Checkout para adicionar créditos na carteira interna (BRL).
// Cria sessão Stripe para comprar R$ X de saldo.
// Webhook invoice.paid credita na user_brl_wallets.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// Pacotes de crédito disponíveis (em BRL)
const CREDIT_PACKAGES = [
  { amount: 50,   label: "R$ 50 em créditos" },
  { amount: 100,  label: "R$ 100 em créditos" },
  { amount: 250,  label: "R$ 250 em créditos" },
  { amount: 500,  label: "R$ 500 em créditos" },
  { amount: 1000, label: "R$ 1.000 em créditos" },
];

export async function GET() {
  try {
    return NextResponse.json({ packages: CREDIT_PACKAGES });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const { amount } = await req.json();
    const amountNum = Number(amount);
  
    // Validar amount (mín R$ 10, máx R$ 5000)
    if (!amountNum || amountNum < 10 || amountNum > 5000) {
      return NextResponse.json({ error: "Valor deve ser entre R$ 10 e R$ 5.000" }, { status: 400 });
    }
  
    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();
  
    const appUrl = NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  
    // Buscar ou criar customer Stripe
    let stripeCustomerId: string;
    const { data: existingSub } = await adminSupabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
  
    if (existingSub?.stripe_customer_id) {
      stripeCustomerId = existingSub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name:  profile?.full_name ?? undefined,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;
    }
  
    // Criar sessão de checkout para recarga
    const session = await stripe.checkout.sessions.create({
      customer:    stripeCustomerId,
      mode:        "payment",
      line_items:  [{
        price_data: {
          currency:     "brl",
          unit_amount:  Math.round(amountNum * 100),
          product_data: {
            name:        `Créditos Playbook — R$ ${amountNum.toFixed(2)}`,
            description: "Saldo interno para compras na plataforma",
            metadata:    { type: "wallet_credit" },
          },
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/carteira?funded=true`,
      cancel_url:  `${appUrl}/carteira`,
      metadata:    {
        type:         "wallet_credit",
        userId:       user.id,
        creditAmount: String(amountNum),
      },
      payment_intent_data: {
        metadata: {
          type:         "wallet_credit",
          userId:       user.id,
          creditAmount: String(amountNum),
        },
      },
    });
  
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
