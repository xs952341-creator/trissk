// app/api/cron/reconcile/route.ts
// Cron de reconciliação financeira automática.
// Verifica divergências entre orders (Stripe) e financial_ledger.
// Schedule: diariamente às 04:00 UTC (vercel.json).
//
// Fluxo:
//   1. Chama runReconcile() — verifica orders paid vs ledger
//   2. Verifica affiliate_sales sem comissão no ledger
//   3. Limpa structured_logs com mais de 90 dias
//   4. Loga resultado no structured_logs

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/env-server";
import { runReconcile } from "@/lib/jobs/reconcile";

export const dynamic = 'force-dynamic';
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Verifica autenticação usando helper centralizado
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runReconcile();
}
