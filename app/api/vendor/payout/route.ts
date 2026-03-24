// app/api/vendor/payout/route.ts
// Retorna saldo em tempo real do vendor:
//   - Saldo calculado internamente pelo ledger (gross - fees - affiliate - chargebacks - held)
//   - Saldo do Stripe Connect (se KYC completo)
//   - Histórico de payouts

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";
const stripe  = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabaseAdmin = createAdminClient();

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id, stripe_connect_onboarded, payout_hold_days")
    .eq("id", user.id)
    .single();

  // ── 1. Saldo interno calculado pelo ledger ─────────────────────────────────
  // Recalcular snapshot antes de retornar (garante dados frescos)
  await supabaseAdmin.rpc("recalculate_vendor_balance", { p_vendor_id: user.id });

  const { data: snapshot } = await supabase
    .from("vendor_balance_snapshots")
    .select("gross_total, platform_fees, affiliate_commissions, refunds, chargebacks, held_amount, available, last_calculated_at")
    .eq("vendor_id", user.id)
    .maybeSingle();

  // Entradas em hold (com data de liberação)
  const { data: holdEntries } = await supabase
    .from("financial_ledger")
    .select("amount, hold_until, stripe_invoice_id")
    .eq("vendor_id", user.id)
    .eq("entry_type", "vendor_payout")
    .not("hold_until", "is", null)
    .gt("hold_until", new Date().toISOString())
    .order("hold_until", { ascending: true })
    .limit(10);

  // ── 2. Histórico de payouts internos ──────────────────────────────────────
  const { data: payoutHistory } = await supabase
    .from("vendor_payouts_history")
    .select("id, amount, currency, status, initiated_at, paid_at, stripe_payout_id")
    .eq("vendor_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // ── 3. Stripe Connect (se KYC completo) ───────────────────────────────────
  let stripeBalance = null;
  let stripePayouts: Record<string, unknown>[] = [];

  if (profile?.stripe_connect_account_id && profile.stripe_connect_onboarded) {
    try {
      const [balance, payouts] = await Promise.all([
        stripe.balance.retrieve({ stripeAccount: profile.stripe_connect_account_id }),
        stripe.payouts.list({ limit: 10 }, { stripeAccount: profile.stripe_connect_account_id }),
      ]);

      stripeBalance = {
        available_brl: balance.available.reduce((s, b) => s + b.amount, 0) / 100,
        pending_brl:   balance.pending.reduce((s, b) => s + b.amount, 0) / 100,
        currency:      balance.available[0]?.currency ?? "brl",
      };

      stripePayouts = payouts.data.map(p => ({
        id:           p.id,
        amount:       p.amount / 100,
        currency:     p.currency,
        status:       p.status,
        arrival_date: p.arrival_date,
        description:  p.description,
        created:      p.created,
      }));
    } catch { /* Stripe Connect pode estar em manutenção */ }
  }

  const holdDays = (profile as Record<string, unknown>)?.payout_hold_days ?? 14;

  return NextResponse.json({
    connected:   !!(profile?.stripe_connect_account_id && profile.stripe_connect_onboarded),
    hold_days:   holdDays,
    // Saldo calculado internamente (fonte da verdade)
    balance: snapshot ? {
      gross:       Number(snapshot.gross_total),
      fees:        Number(snapshot.platform_fees),
      affiliate:   Number(snapshot.affiliate_commissions),
      refunds:     Number(snapshot.refunds),
      chargebacks: Number(snapshot.chargebacks),
      held:        Number(snapshot.held_amount),
      available:   Number(snapshot.available),
      updated_at:  snapshot.last_calculated_at,
    } : null,
    // Entradas em hold (próximas a liberar)
    hold_entries: (holdEntries ?? []).map(e => ({
      amount:     Number(e.amount),
      hold_until: e.hold_until,
      invoice_id: e.stripe_invoice_id,
    })),
    // Saldo do Stripe Connect (se disponível)
    stripe_balance: stripeBalance,
    // Histórico de payouts
    payouts:       payoutHistory ?? [],
    stripe_payouts: stripePayouts,
  });
}

