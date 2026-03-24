// app/api/cron/health-score-batch/route.ts
// Calcula o Health Score preditivo para todas as assinaturas SaaS ativas.
// Schedule: a cada 6h (vercel.json) — desfasado 1h do churn-recovery
//
// Fluxo:
//  1. Busca todos os vendors com produtos SaaS ativos
//  2. Para cada vendor, chama calculateHealthBatch (lib/analytics/health-score.ts)
//  3. O motor escreve na tabela subscription_health_scores (upsert)
//  4. Se status=churning → marca churn_risk_flagged_at na subscription
//     → o cron churn-recovery (a cada 6h) processa esses flags e envia emails
//
// Performance:
//  - Limite de 20 vendors por execução (evita timeout Vercel 10s)
//  - Cada vendor processa até 100 assinaturas em paralelo
//  - Best-effort: erro num vendor não para os outros
//
// Segurança: autenticado por CRON_SECRET

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }        from "@/lib/supabase/admin";
import { CRON_SECRET }              from "@/lib/env-server";
import { calculateHealthBatch }     from "@/lib/analytics/health-score";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Máximo 60s (Vercel Pro) — suficiente para 20 vendors × 100 subs
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // ── Autenticação ────────────────────────────────────────────────────────────
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase  = createAdminClient();
  const startedAt = Date.now();

  // ── Buscar vendors com produtos SaaS ativos ─────────────────────────────────
  const { data: vendors, error } = await supabase
    .from("saas_products")
    .select("vendor_id")
    .eq("status", "active")
    .not("vendor_id", "is", null)
    .limit(20);   // cap por execução para não ultrapassar timeout

  if (error) {
    console.error("[health-score-batch] DB error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  // Deduplicate vendor IDs
  const vendorIds = [...new Set((vendors ?? []).map((v: Record<string, unknown>) => v.vendor_id as string))];

  if (vendorIds.length === 0) {
    return NextResponse.json({ processed: 0, message: "Nenhum vendor com produtos SaaS activos" });
  }

  let totalSubs = 0, totalHealthy = 0, totalAtRisk = 0, totalChurning = 0, errors = 0;

  // ── Processar cada vendor ───────────────────────────────────────────────────
  for (const vendorId of vendorIds) {
    try {
      const result = await calculateHealthBatch(vendorId);
      totalSubs     += result.total;
      totalHealthy  += result.healthy;
      totalAtRisk   += result.at_risk;
      totalChurning += result.churning;

      console.log(
        `[health-score-batch] vendor=${vendorId} ` +
        `subs=${result.total} healthy=${result.healthy} ` +
        `at_risk=${result.at_risk} churning=${result.churning}`
      );
    } catch (err: unknown) {
      errors++;
      console.error(`[health-score-batch] vendor=${vendorId} error:`, getErrorMessage(err));
    }
  }

  const duration = Date.now() - startedAt;
  console.log(
    `[health-score-batch] done in ${duration}ms — ` +
    `vendors=${vendorIds.length} subs=${totalSubs} ` +
    `healthy=${totalHealthy} at_risk=${totalAtRisk} churning=${totalChurning} errors=${errors}`
  );

  return NextResponse.json({
    vendors:    vendorIds.length,
    subs:       totalSubs,
    healthy:    totalHealthy,
    at_risk:    totalAtRisk,
    churning:   totalChurning,
    errors,
    duration_ms: duration,
  });
}
