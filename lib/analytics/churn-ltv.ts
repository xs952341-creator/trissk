// lib/analytics/churn-ltv.ts
// Cálculo de Churn Rate, LTV, MRR, ARR, Retenção — nível industrial.
// Usado pelo cron /api/cron/analytics-snapshot e pelo dashboard do vendor.

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  vendorId:         string;
  productId:        string | null;
  period:           string; // 'YYYY-MM'
  mrrCents:         number;
  arrCents:         number;
  newCustomers:     number;
  churnedCustomers: number;
  activeCustomers:  number;
  churnRate:        number; // 0.05 = 5%
  ltvCents:         number;
  revenueCents:     number;
  refundsCents:     number;
  netRevenueCents:  number;
}

export interface ChurnAnalysis {
  period:           string;
  mrr:              number;
  arr:              number;
  churnRate:        number;
  newCustomers:     number;
  churnedCustomers: number;
  activeCustomers:  number;
  ltv:              number;
  netRevenue:       number;
  refunds:          number;
  revenueByMonth:   { month: string; revenue: number; refunds: number; net: number }[];
  cohortRetention:  CohortData[];
}

export interface CohortData {
  cohort:     string; // 'YYYY-MM'
  size:       number;
  retained:   number[];  // % retidos em cada mês subsequente
}

// ─── Snapshot mensal ──────────────────────────────────────────────────────────

export async function computeMonthlySnapshot(
  vendorId: string,
  period: string, // 'YYYY-MM'
  productId?: string
): Promise<AnalyticsSnapshot> {
  const admin = createAdminClient();

  const [year, month] = period.split("-").map(Number);
  const periodStart = new Date(year, month - 1, 1).toISOString();
  const periodEnd   = new Date(year, month, 0, 23, 59, 59).toISOString();

  // ── Receita bruta no período ──
  let revenueQ = admin
    .from("financial_ledger")
    .select("amount_cents, type")
    .eq("vendor_id", vendorId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd)
    .in("type", ["sale", "subscription_renewal", "refund"]);

  if (productId) revenueQ = revenueQ.eq("product_id", productId);

  const { data: ledgerRows } = await revenueQ;
  const revenueCents = (ledgerRows ?? [])
    .filter((r: { type: string; amount_cents?: number }) => r.type !== "refund")
    .reduce((s: number, r: { amount_cents?: number }) => s + (r.amount_cents ?? 0), 0);
  const refundsCents = (ledgerRows ?? [])
    .filter((r: { type: string; amount_cents?: number }) => r.type === "refund")
    .reduce((s: number, r: { amount_cents?: number }) => s + Math.abs(r.amount_cents ?? 0), 0);

  // ── Clientes ativos (subscriptions) ──
  let subQ = admin
    .from("subscriptions")
    .select("id, user_id, status, created_at")
    .eq("vendor_id", vendorId)
    .lte("created_at", periodEnd);

  if (productId) subQ = subQ.eq("product_id", productId);

  const { data: allSubs } = await subQ;

  const activeAtEnd = (allSubs ?? []).filter(
    (s: { status: string }) => s.status === "active" || s.status === "trialing"
  ).length;

  // ── Novos clientes no período ──
  const newCustomers = (allSubs ?? []).filter(
    (s: { created_at: string }) => s.created_at >= periodStart && s.created_at <= periodEnd
  ).length;

  // ── Churnados no período ──
  let cancelQ = admin
    .from("subscriptions")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("status", "canceled")
    .gte("updated_at", periodStart)
    .lte("updated_at", periodEnd);

  if (productId) cancelQ = cancelQ.eq("product_id", productId);
  const { data: canceled } = await cancelQ;
  const churnedCustomers = canceled?.length ?? 0;

  // ── MRR ──
  // MRR = receita recorrente mensal de assinaturas ativas
  let mrrQ = admin
    .from("subscriptions")
    .select("monthly_amount_cents")
    .eq("vendor_id", vendorId)
    .in("status", ["active", "trialing"]);

  if (productId) mrrQ = mrrQ.eq("product_id", productId);
  const { data: activeSubs } = await mrrQ;
  const mrrCents = (activeSubs ?? []).reduce(
    (s: number, r: { monthly_amount_cents?: number }) => s + (r.monthly_amount_cents ?? 0), 0
  );

  // ── Churn Rate ──
  const previousActive = Math.max(1, activeAtEnd - newCustomers + churnedCustomers);
  const churnRate = churnedCustomers / previousActive;

  // ── LTV estimado ──
  // LTV = ARPU / Churn Rate mensal
  const arpu = activeAtEnd > 0 ? mrrCents / activeAtEnd : 0;
  const safeChurn = churnRate > 0 ? churnRate : 0.05; // fallback 5%
  const ltvCents = Math.round(arpu / safeChurn);

  return {
    vendorId,
    productId:        productId ?? null,
    period,
    mrrCents,
    arrCents:         mrrCents * 12,
    newCustomers,
    churnedCustomers,
    activeCustomers:  activeAtEnd,
    churnRate:        Math.min(1, churnRate),
    ltvCents,
    revenueCents,
    refundsCents,
    netRevenueCents:  revenueCents - refundsCents,
  };
}

// ─── Salvar snapshot ──────────────────────────────────────────────────────────

export async function saveMonthlySnapshot(snap: AnalyticsSnapshot): Promise<void> {
  const admin = createAdminClient();

  await admin.from("analytics_monthly_snapshots").upsert(
    {
      vendor_id:         snap.vendorId,
      product_id:        snap.productId,
      period:            snap.period,
      mrr_cents:         snap.mrrCents,
      arr_cents:         snap.arrCents,
      new_customers:     snap.newCustomers,
      churned_customers: snap.churnedCustomers,
      active_customers:  snap.activeCustomers,
      churn_rate:        snap.churnRate,
      ltv_cents:         snap.ltvCents,
      revenue_cents:     snap.revenueCents,
      refunds_cents:     snap.refundsCents,
      net_revenue_cents: snap.netRevenueCents,
    },
    { onConflict: "vendor_id,product_id,period" }
  );
}

// ─── Análise completa para o dashboard ───────────────────────────────────────

export async function getVendorChurnAnalysis(
  vendorId: string,
  months = 12,
  productId?: string
): Promise<ChurnAnalysis> {
  const admin = createAdminClient();

  // Pegar últimos N meses de snapshots
  let q = admin
    .from("analytics_monthly_snapshots")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("period", { ascending: false })
    .limit(months);

  if (productId) q = q.eq("product_id", productId);
  else q = q.is("product_id", null);

  const { data: snapshots } = await q;

  if (!snapshots?.length) {
    // Calcular on-the-fly se não há snapshot salvo
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const snap = await computeMonthlySnapshot(vendorId, currentPeriod, productId);
    return buildAnalysisFromSnap(snap, []);
  }

  const latest = snapshots[0];
  const revenueByMonth = snapshots.reverse().map((s: Record<string, number | string>) => ({
    month:    String(s.period),
    revenue:  Number(s.revenue_cents) / 100,
    refunds:  Number(s.refunds_cents) / 100,
    net:      Number(s.net_revenue_cents) / 100,
  }));

  // Cohort retention (últimos 6 meses)
  const cohortRetention = await computeCohortRetention(vendorId, productId, 6);

  return {
    period:           latest.period,
    mrr:              latest.mrr_cents / 100,
    arr:              latest.arr_cents / 100,
    churnRate:        latest.churn_rate,
    newCustomers:     latest.new_customers,
    churnedCustomers: latest.churned_customers,
    activeCustomers:  latest.active_customers,
    ltv:              latest.ltv_cents / 100,
    netRevenue:       latest.net_revenue_cents / 100,
    refunds:          latest.refunds_cents / 100,
    revenueByMonth,
    cohortRetention,
  };
}

// ─── Cohort Retention ─────────────────────────────────────────────────────────

async function computeCohortRetention(
  vendorId: string,
  productId: string | undefined,
  cohorts: number
): Promise<CohortData[]> {
  const admin = createAdminClient();

  const result: CohortData[] = [];
  const now = new Date();

  for (let c = cohorts - 1; c >= 0; c--) {
    const cohortDate = new Date(now.getFullYear(), now.getMonth() - c, 1);
    const cohortPeriod = cohortDate.toISOString().slice(0, 7);
    const cohortStart = cohortDate.toISOString();
    const cohortEnd = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + 1, 0).toISOString();

    let cohortQ = admin
      .from("subscriptions")
      .select("id, user_id")
      .eq("vendor_id", vendorId)
      .gte("created_at", cohortStart)
      .lte("created_at", cohortEnd);

    if (productId) cohortQ = cohortQ.eq("product_id", productId);

    const { data: cohortSubs } = await cohortQ;
    const cohortSize = cohortSubs?.length ?? 0;
    if (cohortSize === 0) continue;

    const cohortUserIds = (cohortSubs ?? []).map((s: { user_id: string }) => s.user_id);

    // Verificar retenção para cada mês subsequente (até 6 meses)
    const retained: number[] = [];
    for (let m = 1; m <= Math.min(6, cohorts - c); m++) {
      const checkDate = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + m, 1);
      const checkStart = checkDate.toISOString();

      let retQ = admin
        .from("subscriptions")
        .select("id")
        .eq("vendor_id", vendorId)
        .in("user_id", cohortUserIds)
        .in("status", ["active", "trialing"])
        .lte("created_at", checkStart);

      if (productId) retQ = retQ.eq("product_id", productId);

      const { data: retainedSubs } = await retQ;
      const retainedCount = retainedSubs?.length ?? 0;
      retained.push(Math.round((retainedCount / cohortSize) * 100));
    }

    result.push({ cohort: cohortPeriod, size: cohortSize, retained });
  }

  return result;
}

function buildAnalysisFromSnap(snap: AnalyticsSnapshot, history: { month: string; revenue: number; refunds: number; net: number }[]): ChurnAnalysis {
  return {
    period:           snap.period,
    mrr:              snap.mrrCents / 100,
    arr:              snap.arrCents / 100,
    churnRate:        snap.churnRate,
    newCustomers:     snap.newCustomers,
    churnedCustomers: snap.churnedCustomers,
    activeCustomers:  snap.activeCustomers,
    ltv:              snap.ltvCents / 100,
    netRevenue:       snap.netRevenueCents / 100,
    refunds:          snap.refundsCents / 100,
    revenueByMonth:   history,
    cohortRetention:  [],
  };
}
