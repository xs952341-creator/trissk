// app/api/wallet/use/route.ts
// Usa saldo da carteira interna para pagar (parcial ou total) um produto.
// Se o valor do produto ≤ saldo da carteira → checkout gratuito (sem Stripe).
// Se o valor > saldo → desconta o saldo e cobra o restante no Stripe.
// Retorna: { deducted, remaining, stripeAmount } para o checkout processar.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const { amount, productTierId, dryRun = false } = await req.json();
    const amountNum = Number(amount);
  
    if (!amountNum || amountNum <= 0) {
      return NextResponse.json({ error: "amount inválido" }, { status: 400 });
    }
  
    const adminSupabase = createAdminClient();
  
    // Buscar saldo atual
    const { data: wallet } = await adminSupabase
      .from("user_brl_wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
  
    const currentBalance = Number(wallet?.balance ?? 0);
    const deducted       = Math.min(currentBalance, amountNum);
    const stripeAmount   = Math.max(0, amountNum - deducted);
  
    // Se dry run, apenas simular sem debitar
    if (dryRun) {
      return NextResponse.json({
        balance:       currentBalance,
        deducted,
        stripeAmount,
        fullyCovered:  stripeAmount === 0,
      });
    }
  
    // Débitar da carteira
    if (deducted > 0) {
      const { error } = await adminSupabase.rpc("debit_brl_wallet", {
        p_user_id:    user.id,
        p_amount:     deducted,
        p_reference:  productTierId ?? "checkout",
        p_description: `Compra via carteira — R$ ${deducted.toFixed(2)}`,
      });
  
      if (error) {
        console.error("[wallet/use] debit failed:", getErrorMessage(error));
        return NextResponse.json({ error: "Erro ao debitar carteira. Tente novamente." }, { status: 500 });
      }
    }
  
    return NextResponse.json({
      balance:      currentBalance,
      deducted,
      stripeAmount,
      fullyCovered: stripeAmount === 0,
      newBalance:   currentBalance - deducted,
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
