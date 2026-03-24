import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  const supa = createClient();
  const { data } = await supa.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orderId, amount } = await req.json().catch(() => ({}));
  const amt = Number(amount);
  if (!orderId || !Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "orderId e amount são obrigatórios" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verifica se o order é do vendor
  const { data: order } = await admin
    .from("orders")
    .select("id, vendor_id, stripe_payment_intent_id, currency, amount_gross")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (order.vendor_id !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!order.stripe_payment_intent_id) {
    return NextResponse.json({ error: "Pedido não possui payment_intent no Stripe" }, { status: 400 });
  }

  const cents = Math.round(amt * 100);

  // Criar refund parcial
  const refund = await stripe.refunds.create({
    payment_intent: order.stripe_payment_intent_id,
    amount: cents,
    metadata: { orderId: order.id, vendorId: uid },
  });

  // Registrar no banco (não quebra se tabela não existir)
  try {
    await admin.from("refunds").insert({
      order_id: order.id,
      vendor_id: uid,
      stripe_refund_id: refund.id,
      amount: amt,
      currency: order.currency ?? "brl",
      status: refund.status ?? "pending",
    });
  } catch {
    // opcional
  }

  return NextResponse.json({ ok: true, refundId: refund.id });
}
