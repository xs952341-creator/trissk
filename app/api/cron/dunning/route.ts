// app/api/cron/dunning/route.ts
// Processa dunning steps da fila de jobs.
// Cron: a cada hora (processa steps pendentes)

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeDunningStep, resolveDunning } from "@/lib/dunning";
import type { DunningStep } from "@/lib/dunning";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface JobQueueRow {
  id: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return failure("UNAUTHORIZED", 401, "Acesso negado.");
    }

    const admin = createAdminClient();

    // Buscar jobs de dunning prontos para execução
    const { data: jobs } = await admin
      .from("job_queue")
      .select("id, payload, retry_count")
      .eq("event_name", "dunning/step")
      .eq("status", "pending")
      .lte("run_after", new Date().toISOString())
      .order("priority", { ascending: false })
      .limit(30);

    if (!jobs?.length) {
      return success({ processed: 0, message: "No dunning jobs ready" });
    }

    let successCount = 0, failed = 0;

    for (const job of jobs as JobQueueRow[]) {
      const payload = job.payload;
      try {
        await executeDunningStep(payload as unknown as Parameters<typeof executeDunningStep>[0]);

        await admin.from("job_queue")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", job.id);

        successCount++;
      } catch (e: unknown) {
        const retries = (job.retry_count ?? 0) + 1;
        await admin.from("job_queue").update({
          status: retries >= 3 ? "failed" : "pending",
          retry_count: retries,
          run_after: retries >= 3 ? null : new Date(Date.now() + 30 * 60_000).toISOString(),
          error: getErrorMessage(e)?.slice(0, 500),
        }).eq("id", job.id);
        failed++;
        void log.error("cron/dunning", "step.failed", getErrorMessage(e), { jobId: job.id });
      }
    }

    void log.info("cron/dunning", "run.finished", `${successCount} ok, ${failed} falhas`, {});
    return success({ processed: jobs.length, success: successCount, failed });

  } catch (e: unknown) {
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
