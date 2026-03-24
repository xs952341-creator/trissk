/**
 * lib/analytics/health-score.ts
 * Motor de Health Score Preditivo para assinaturas B2B.
 *
 * Lógica:
 *  - Parte de 100 e penaliza por inatividade, baixo uso de assentos,
 *    pagamentos vencidos, falta de login recente e uso de features.
 *  - Classifica em: healthy (70-100), at_risk (40-69), churning (<40).
 *  - Se churning → dispara notificação + evento de recuperação automático.
 *
 * Segurança:
 *  - Cada cálculo é isolado em try/catch → um erro numa sub nunca trava as outras.
 *  - Fallback seguro retorna score=50/at_risk (nunca propaga erro para o cron).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/errors";

// ── Tipos ──────────────────────────────────────────────────────────────────────
export type HealthStatus = "healthy" | "at_risk" | "churning";

export interface HealthScoreResult {
  subscriptionId:  string;
  userId:          string;
  productId:       string | null;
  score:           number;          // 0–100
  status:          HealthStatus;
  reasons:         string[];        // motivos de penalização (para debug/log)
  calculatedAt:    string;          // ISO timestamp
}

interface SubRow {
  stripe_subscription_id: string;
  user_id:                string;
  product_id:             string | null;
  status:                 string;
  total_seats:            number | null;
  used_seats:             number | null;
  created_at:             string;
  current_period_end:     string | null;
}

// ── Calcular health score de uma única assinatura ─────────────────────────────
export async function calculateHealthScore(
  stripeSubscriptionId: string
): Promise<HealthScoreResult> {
  const supabase = createAdminClient();
  const now = new Date();

  const FALLBACK: HealthScoreResult = {
    subscriptionId: stripeSubscriptionId,
    userId:         "",
    productId:      null,
    score:          50,
    status:         "at_risk",
    reasons:        ["fallback: erro ao calcular"],
    calculatedAt:   now.toISOString(),
  };

  try {
    // 1. Buscar dados da assinatura
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id,user_id,product_id,status,total_seats,used_seats,created_at,current_period_end")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .single();

    if (error || !sub) return { ...FALLBACK, reasons: ["assinatura não encontrada"] };
    const row = sub as SubRow;

    // Assinatura cancelada = score zero
    if (row.status === "canceled") {
      return { subscriptionId: stripeSubscriptionId, userId: row.user_id, productId: row.product_id,
        score: 0, status: "churning", reasons: ["status=canceled"], calculatedAt: now.toISOString() };
    }

    let score = 100;
    const reasons: string[] = [];

    // 2. Penalidade: uso de assentos baixo (só aplica se total_seats > 1)
    const total = row.total_seats ?? 1;
    const used  = row.used_seats  ?? 1;
    if (total > 1) {
      const ratio = used / total;
      if (ratio < 0.3) { score -= 35; reasons.push(`uso de assentos muito baixo (${(ratio * 100).toFixed(0)}%)`); }
      else if (ratio < 0.6) { score -= 15; reasons.push(`uso de assentos médio (${(ratio * 100).toFixed(0)}%)`); }
    }

    // 3. Penalidade: último login dos membros (buscar da tabela de sessões/perfis)
    const { data: loginData } = await supabase
      .from("profiles")
      .select("last_sign_in_at")
      .eq("id", row.user_id)
      .single();

    const lastLogin = loginData?.last_sign_in_at ? new Date(loginData.last_sign_in_at) : null;
    if (lastLogin) {
      const daysSince = Math.floor((now.getTime() - lastLogin.getTime()) / 86_400_000);
      if (daysSince > 21)      { score -= 30; reasons.push(`sem login há ${daysSince} dias`); }
      else if (daysSince > 10) { score -= 15; reasons.push(`sem login há ${daysSince} dias`); }
      else if (daysSince > 7)  { score -= 5;  reasons.push(`sem login há ${daysSince} dias`); }
    } else {
      score -= 20; reasons.push("nunca fez login após compra");
    }

    // 4. Penalidade: pagamento vencido
    if (row.status === "past_due") { score -= 25; reasons.push("pagamento vencido"); }

    // 5. Penalidade: sem uso de API/eventos nos últimos 14 dias
    const cutoff14d = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const { count: recentEvents } = await supabase
      .from("saas_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.user_id)
      .gte("created_at", cutoff14d);

    if ((recentEvents ?? 0) === 0 && row.product_id) {
      score -= 10; reasons.push("sem eventos de uso nos últimos 14 dias");
    }

    // 6. Bonus: cliente antigo e fiel (> 6 meses)
    const createdAt = new Date(row.created_at);
    const monthsOld = (now.getTime() - createdAt.getTime()) / (30 * 86_400_000);
    if (monthsOld > 6 && score >= 70) { score = Math.min(100, score + 5); }

    // 7. Clamp entre 0 e 100
    score = Math.max(0, Math.min(100, score));

    // 8. Classificação
    let status: HealthStatus = "healthy";
    if (score < 40) status = "churning";
    else if (score < 70) status = "at_risk";

    const result: HealthScoreResult = {
      subscriptionId: stripeSubscriptionId,
      userId:         row.user_id,
      productId:      row.product_id,
      score,
      status,
      reasons,
      calculatedAt:   now.toISOString(),
    };

    // 9. Persistir no banco (best-effort: não quebra se tabela não existir ainda)
    await supabase.from("subscription_health_scores").upsert({
      stripe_subscription_id: stripeSubscriptionId,
      user_id:     row.user_id,
      product_id:  row.product_id,
      score,
      status,
      reasons:     JSON.stringify(reasons),
      calculated_at: now.toISOString(),
    }, { onConflict: "stripe_subscription_id" }).then(undefined, () => {});

    // 10. Se em risco crítico, disparar notificação de resgate
    if (status === "churning") {
      await triggerChurnRecovery(result, supabase).then(undefined, () => {});
    }

    return result;

  } catch (err: unknown) {
    console.error(`[HealthScore] Erro ao calcular ${stripeSubscriptionId}:`, getErrorMessage(err));
    return FALLBACK;
  }
}

// ── Dispara notificação para que o sistema de dunning tente salvar o cliente ──
async function triggerChurnRecovery(result: HealthScoreResult, supabase: ReturnType<typeof createAdminClient>) {
  // Buscar vendor do produto
  if (!result.productId) return;

  const { data: product } = await supabase
    .from("saas_products")
    .select("vendor_id, name")
    .eq("id", result.productId)
    .single();

  if (!product?.vendor_id) return;

  // Notificar o vendor
  await supabase.from("notifications").insert({
    user_id:    product.vendor_id,
    type:       "churn_risk_alert",
    title:      `⚠️ Cliente em risco de cancelar — ${product.name}`,
    body:       `Health Score caiu para ${result.score}/100. Motivos: ${result.reasons.slice(0, 2).join(", ")}. Considere enviar um email de reengajamento.`,
    action_url: `/vendor/analytics`,
  }).then(undefined, () => {});

  // Marcar no banco para o cron de dunning pegar
  await supabase.from("subscriptions")
    .update({ churn_risk_flagged_at: new Date().toISOString() })
    .eq("stripe_subscription_id", result.subscriptionId)
    .then(undefined, () => {});
}

// ── Batch: calcular para todos os ativos de um vendor ─────────────────────────
export async function calculateHealthBatch(vendorId: string): Promise<{
  total: number;
  healthy: number;
  at_risk: number;
  churning: number;
  results: HealthScoreResult[];
}> {
  const supabase = createAdminClient();

  // Buscar assinaturas ativas dos produtos do vendor
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, saas_products!product_id(vendor_id)")
    .eq("status", "active")
    .not("stripe_subscription_id", "is", null);

  type SubRow = { saas_products?: { vendor_id?: string } | null; stripe_subscription_id?: string | null };
  const vendorSubs = ((subs ?? []) as SubRow[]).filter(
    (s: SubRow) => s.saas_products?.vendor_id === vendorId && s.stripe_subscription_id
  ) as Array<{ stripe_subscription_id: string }>;

  const results = await Promise.all(
    vendorSubs.map((s) => calculateHealthScore(s.stripe_subscription_id))
  );

  const total    = results.length;
  const healthy  = results.filter((r) => r.status === "healthy").length;
  const at_risk  = results.filter((r) => r.status === "at_risk").length;
  const churning = results.filter((r) => r.status === "churning").length;

  return { total, healthy, at_risk, churning, results };
}
