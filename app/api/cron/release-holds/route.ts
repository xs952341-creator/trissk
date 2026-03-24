// app/api/cron/release-holds/route.ts
// Libera diariamente os valores em hold cujo prazo expirou.
// Schedule: 06:00 UTC todo dia (vercel.json)
//
// Fluxo:
//   1. Chama release_expired_holds() — marca released_at, recalcula saldo
//   2. Notifica vendor sobre valor liberado
//   3. Registra no structured_logs

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const traceId = crypto.randomUUID();
  void log.info("cron/release-holds", "run.started", "Liberando holds expirados", { traceId });

  try {
    // 1. Executar release via RPC
    const { data: count, error } = await supabase.rpc("release_expired_holds");
    if (error) throw error;

    void log.info("cron/release-holds", "run.completed", `${count ?? 0} entradas liberadas do hold`, {
      count, traceId,
    });

    // 2. Notificar vendors que tiveram valores liberados hoje
    try {
      const { data: releasedToday } = await supabase
        .from("financial_ledger")
        .select("vendor_id, amount")
        .eq("entry_type", "vendor_payout")
        .gte("released_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
        .not("vendor_id", "is", null);

      // Agrupar por vendor
      const byVendor: Record<string, number> = {};
      for (const row of (releasedToday ?? [])) {
        if (!row.vendor_id) continue;
        byVendor[row.vendor_id] = (byVendor[row.vendor_id] ?? 0) + Number(row.amount);
      }

      for (const [vendorId, totalReleased] of Object.entries(byVendor)) {
        // Buscar saldo atual
        const { data: balance } = await supabase
          .from("vendor_balance_snapshots")
          .select("available")
          .eq("vendor_id", vendorId)
          .maybeSingle();

        const available = Number((balance as Record<string, unknown>)?.available ?? 0);

        await supabase.from("notifications").insert({
          user_id:    vendorId,
          type:       "payout_available",
          title:      "💸 Valor liberado para saque!",
          body:       `R$ ${totalReleased.toFixed(2)} foram liberados do período de hold. Saldo disponível: R$ ${available.toFixed(2)}.`,
          action_url: "/vendor/payouts",
        });
      }
    } catch { /* notificações são best-effort */ }

    // 3. Limpar fraud_velocity_events com mais de 7 dias
    try {
      const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const { count: deletedFraud } = await supabase
        .from("fraud_velocity_events")
        .delete({ count: "exact" })
        .lt("created_at", cutoff7d);
      void log.info("cron/release-holds", "cleanup.fraud_velocity",
        `${deletedFraud ?? 0} eventos de velocidade removidos`, { traceId });
    } catch { /* não crítico */ }

    return NextResponse.json({
      ok: true,
      released_entries: count ?? 0,
      trace_id: traceId,
    });

  } catch (e: unknown) {
    void log.error("cron/release-holds", "run.failed", getErrorMessage(e), { traceId });
    return NextResponse.json({ error: getErrorMessage(e), trace_id: traceId }, { status: 500 });
  }
}
