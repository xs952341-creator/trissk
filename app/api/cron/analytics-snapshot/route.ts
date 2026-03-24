// app/api/cron/analytics-snapshot/route.ts
// Gera snapshots mensais de analytics para todos os vendors.
// Calcula MRR, ARR, Churn Rate, LTV, Retenção.
// Cron: 0 2 1 * * (dia 1 de cada mês às 02:00 UTC)

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeMonthlySnapshot, saveMonthlySnapshot } from "@/lib/analytics/churn-ltv";
import { retryFailedWebhooks } from "@/lib/webhooks/outbound";
import { retryFailedProvisionings } from "@/lib/provisioning";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";
import { verifyCronAuth } from "@/lib/env-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Verifica autenticação usando helper centralizado
    if (!verifyCronAuth(req.headers.get("authorization"))) {
      return failure("UNAUTHORIZED", 401, "Acesso negado.");
    }

    const traceId = `snapshot-${Date.now()}`;
    const admin = createAdminClient();

    // Período: mês anterior
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = prev.toISOString().slice(0, 7); // YYYY-MM

    void log.info("cron/analytics-snapshot", "run.start", `Computando snapshots para ${period}`, { traceId });

    // 1. Buscar todos os vendors ativos
    const { data: vendors } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "vendor");

    let snapshotsCreated = 0;
    const errors: string[] = [];

    // 2. Para cada vendor, calcular snapshot
    for (const vendor of vendors ?? []) {
      try {
        // Snapshot global (todos os produtos)
        const globalSnap = await computeMonthlySnapshot(vendor.id, period);
        await saveMonthlySnapshot(globalSnap);
        snapshotsCreated++;

        // Snapshots por produto
        const { data: products } = await admin
          .from("saas_products")
          .select("id")
          .eq("vendor_id", vendor.id);

        for (const product of products ?? []) {
          try {
            const productSnap = await computeMonthlySnapshot(vendor.id, period, product.id);
            await saveMonthlySnapshot(productSnap);
            snapshotsCreated++;
          } catch (e: unknown) {
            errors.push(`vendor:${vendor.id} product:${product.id}: ${getErrorMessage(e)}`);
          }
        }
      } catch (e: unknown) {
        errors.push(`vendor:${vendor.id}: ${getErrorMessage(e)}`);
      }
    }

    // 3. Retry webhooks outbound falhos
    const webhookRetry = await retryFailedWebhooks();

    // 4. Retry provisionamentos falhos
    const provisionRetry = await retryFailedProvisionings();

    void log.info("cron/analytics-snapshot", "run.complete", "Snapshots concluídos", {
      traceId, snapshotsCreated, errors: errors.length,
      webhookRetry, provisionRetry,
    });

    return success({
      ok: true,
      period,
      snapshotsCreated,
      vendorsProcessed: vendors?.length ?? 0,
      errors,
      webhookRetry,
      provisionRetry,
    });
  } catch (e: unknown) {
    void log.error("cron/analytics-snapshot", "run.error", getErrorMessage(e), { error: String(e) });
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
