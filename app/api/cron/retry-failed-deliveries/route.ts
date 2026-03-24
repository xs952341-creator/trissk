// app/api/cron/retry-failed-deliveries/route.ts
// Cron job para re-tentar entregas falhas com backoff exponencial.
// Configurar no vercel.json: "schedule": "0 */2 * * *" (a cada 2h)
//
// Lógica de backoff:
//   attempt 1 → retry após 15min
//   attempt 2 → retry após 1h
//   attempt 3 → retry após 4h
//   attempt 4 → retry após 12h
//   attempt 5+ → desiste (marca como permanently_failed)

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase = createAdminClient();

const BACKOFF_MINUTES = [15, 60, 240, 720]; // 15min, 1h, 4h, 12h

function nextRetryAt(attempt: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000);
}

// Local types
interface DeliveryEvent {
  id: string;
  user_id?: string;
  product_id?: string;
  vendor_id?: string;
  playbook_id?: string;
  stripe_invoice_id?: string;
  url: string;
  retry_count: number;
}

export async function GET(req: NextRequest) {
  // Verificar autorização (Vercel Cron envia o header CRON_SECRET)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return failure("UNAUTHORIZED", 401, "Acesso negado.");
  }

  try {
    // Buscar deliveries falhos que estão prontos para retry
    const now = new Date().toISOString();
    const { data: failedDeliveries, error } = await supabase
      .from("delivery_events")
      .select("id, user_id, product_id, vendor_id, playbook_id, stripe_invoice_id, url, retry_count")
      .eq("status", "failed")
      .lt("retry_count", 5)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .limit(50);

    if (error) {
      console.error("[retry-cron] Query error:", error);
      return failure("DB_ERROR", 500, getErrorMessage(error));
    }

    if (!failedDeliveries || failedDeliveries.length === 0) {
      return success({ retried: 0 });
    }

    let retried = 0, succeeded = 0, stillFailed = 0;

    await Promise.allSettled(failedDeliveries.map(async (delivery) => {
      const d = delivery as DeliveryEvent;
      retried++;
      const attempt = (d.retry_count ?? 0) + 1;

      try {
        // Buscar dados do usuário para o payload
        const { data: authUser } = await supabase.auth.admin.getUserById(String(d.user_id ?? ""));
        const email = authUser.user?.email ?? "";
        const name = (authUser.user?.user_metadata as { full_name?: string })?.full_name ?? "";

        // Construir payload de re-entrega
        const payload = {
          event: "user.provisioned",
          is_retry: true,
          attempt,
          buyer: { id: d.user_id, email, name },
          product_id: d.product_id,
          playbook_id: d.playbook_id,
          stripe_invoice_id: d.stripe_invoice_id,
          timestamp: new Date().toISOString(),
        };

        const res = await fetch(d.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          // Sucesso: marcar como recuperado
          await supabase
            .from("delivery_events")
            .update({
              status: "success",
              http_status: res.status,
              error_message: null,
              retry_count: attempt,
              last_retried_at: new Date().toISOString(),
              next_retry_at: null,
            })
            .eq("id", d.id);

          succeeded++;
        } else {
          // Ainda falhou
          const willGiveUp = attempt >= 5;
          await supabase
            .from("delivery_events")
            .update({
              status: willGiveUp ? "permanently_failed" : "failed",
              http_status: res.status,
              error_message: `HTTP ${res.status} (retry #${attempt})`,
              retry_count: attempt,
              last_retried_at: new Date().toISOString(),
              next_retry_at: willGiveUp ? null : nextRetryAt(attempt).toISOString(),
            })
            .eq("id", d.id);

          stillFailed++;
        }
      } catch (e: unknown) {
        const willGiveUp = attempt >= 5;
        await supabase
          .from("delivery_events")
          .update({
            status: willGiveUp ? "permanently_failed" : "failed",
            error_message: `${getErrorMessage(e, "fetch_failed")} (retry #${attempt})`,
            retry_count: attempt,
            last_retried_at: new Date().toISOString(),
            next_retry_at: willGiveUp ? null : nextRetryAt(attempt).toISOString(),
          })
          .eq("id", d.id);

        stillFailed++;
      }
    }));

    console.log(`[retry-cron] retried=${retried} succeeded=${succeeded} still_failed=${stillFailed}`);
    return success({ retried, succeeded, stillFailed });

  } catch (err: unknown) {
    console.error("[retry-cron] Fatal:", err);
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro interno."));
  }
}
