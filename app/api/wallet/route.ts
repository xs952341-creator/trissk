// app/api/wallet/route.ts
// Carteira interna em BRL.
// Permite que compradores mantenham saldo na plataforma para recompras sem Stripe.
// Créditos são adicionados via cashback, promoções, reembolsos internos, ou compra direta.
// Para usar o saldo: passa wallet_amount no checkout → desconta antes de processar Stripe.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// GET: saldo da carteira do usuário logado
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const adminSupabase = createAdminClient();
  
    const { data: wallet } = await adminSupabase
      .from("user_brl_wallets")
      .select("balance, total_credited, total_debited, last_transaction_at")
      .eq("user_id", user.id)
      .maybeSingle();
  
    // Últimas transações
    const { data: transactions } = await adminSupabase
      .from("wallet_transactions")
      .select("id, type, amount, description, reference_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
  
    return NextResponse.json({
      balance:           wallet?.balance             ?? 0,
      total_credited:    wallet?.total_credited      ?? 0,
      total_debited:     wallet?.total_debited       ?? 0,
      last_transaction:  wallet?.last_transaction_at ?? null,
      transactions:      transactions ?? [],
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
