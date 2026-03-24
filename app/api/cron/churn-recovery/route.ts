// app/api/cron/churn-recovery/route.ts
// Cron de recuperação de clientes em risco de churn.
// Schedule: a cada 6h (adicionado no vercel.json)
//
// Fluxo:
//  1. Busca assinaturas com churn_risk_flagged_at definido nas últimas 48h
//     E que NÃO tenham ainda recebido email de recuperação (churn_recovery_sent_at IS NULL
//     ou enviado há mais de 14 dias)
//  2. Para cada uma, chama processChurnRecovery (lib/inngest-functions/health-recovery.ts)
//  3. Limpa o flag após processamento para não reprocessar
//
// Segurança:
//  - Auth por CRON_SECRET (igual a todos os outros crons)
//  - Best-effort: erro num cliente não para os outros
//  - Rate-limited: máximo 50 por execução

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRON_SECRET } from "@/lib/env-server";
import { processChurnRecovery } from "@/lib/inngest-functions/health-recovery";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local types
interface SubscriptionRow {
  stripe_subscription_id: string;
  user_id: string;
  product_id: string;
  churn_recovery_sent_at?: string | null;
}

interface HealthScore {
  stripe_subscription_id: string;
  score?: number;
  status?: string;
  reasons?: string | string[];
}

export async function GET(req: NextRequest) {
  // ── Autenticação ────────────────────────────────────────────────────────────
  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return failure("UNAUTHORIZED", 401, "Acesso negado.");
    }
  }

  const supabase = createAdminClient();
  const now = new Date();
  const cutoff48h = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const cutoff14d = new Date(now.getTime() - 14 * 24 * 3_600_000).toISOString();

  // ── Buscar assinaturas flagged para recuperação ─────────────────────────────
  // Condição: flag setado nas últimas 48h E (nunca enviou OR enviou há mais de 14 dias)
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, user_id, product_id, churn_recovery_sent_at")
    .not("churn_risk_flagged_at", "is", null)
    .gte("churn_risk_flagged_at", cutoff48h)
    .or(`churn_recovery_sent_at.is.null,churn_recovery_sent_at.lte.${cutoff14d}`)
    .in("status", ["active", "trialing", "past_due"])
    .limit(50);

  if (error) {
    console.error("[cron/churn-recovery] DB error:", getErrorMessage(error));
    return failure("DB_ERROR", 500, getErrorMessage(error));
  }

  if (!subs || subs.length === 0) {
    return success({ processed: 0, message: "Nenhuma assinatura em risco pendente" });
  }

  let processed = 0, succeeded = 0, skipped = 0, failed = 0;

  // ── Buscar health scores para enriquecer o payload ──────────────────────────
  const subscriptionIds = subs.map((s) => (s as SubscriptionRow).stripe_subscription_id).filter(Boolean);
  const { data: scores } = await supabase
    .from("subscription_health_scores")
    .select("stripe_subscription_id, score, status, reasons")
    .in("stripe_subscription_id", subscriptionIds);

  const scoreMap = new Map(
    (scores ?? []).map((s) => [(s as HealthScore).stripe_subscription_id, s as HealthScore])
  );

  // ── Processar cada assinatura ───────────────────────────────────────────────
  for (const sub of subs as SubscriptionRow[]) {
    processed++;
    const scoreData = scoreMap.get(sub.stripe_subscription_id);

    try {
      const result = await processChurnRecovery({
        subscriptionId: sub.stripe_subscription_id,
        score:          scoreData?.score          ?? 30,
        status:         (scoreData?.status as "churning" | "at_risk")         ?? "churning",
        reasons:        typeof scoreData?.reasons === "string"
                          ? JSON.parse(scoreData.reasons)
                          : (scoreData?.reasons ?? []),
        productId:      sub.product_id,
        userId:         sub.user_id,
      });

      if (result.skipped) {
        skipped++;
        console.log(`[cron/churn-recovery] Pulado ${sub.stripe_subscription_id}: ${result.skipReason}`);
      } else if (result.success) {
        succeeded++;
        console.log(`[cron/churn-recovery] ✅ Email enviado: ${result.email}`);

        // Limpar o flag para não reprocessar na próxima execução
        await supabase
          .from("subscriptions")
          .update({ churn_risk_flagged_at: null })
          .eq("stripe_subscription_id", sub.stripe_subscription_id)
          .then(undefined, () => {});
      } else {
        failed++;
        console.error(`[cron/churn-recovery] ❌ Falhou ${sub.stripe_subscription_id}: ${result.message}`);
      }
    } catch (err: unknown) {
      failed++;
      console.error(`[cron/churn-recovery] Erro inesperado ${sub.stripe_subscription_id}:`, getErrorMessage(err));
    }
  }

  console.log(`[cron/churn-recovery] done — processed=${processed} succeeded=${succeeded} skipped=${skipped} failed=${failed}`);

  return success({
    processed,
    succeeded,
    skipped,
    failed,
    message: `${succeeded} emails de recuperação enviados, ${skipped} pulados (anti-spam), ${failed} erros`,
  });
}
