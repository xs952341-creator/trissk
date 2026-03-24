// app/api/vendor/analytics/advanced/route.ts
// API de analytics industrial: MRR, ARR, Churn, LTV, Cohort, Funnel

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface SubscriptionRow {
  id: string;
  status: string;
  created_at: string;
  canceled_at?: string | null;
  product_tier_id?: string | null;
  product_tiers?: {
    price_monthly?: number | null;
    saas_products?: {
      id?: string;
      name?: string;
    };
  };
}

interface ProductRow {
  id: string;
  name: string;
  logo_url?: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

    const period = req.nextUrl.searchParams.get("period") ?? "6m";
    const months = period === "3m" ? 3 : period === "12m" ? 12 : 6;
    const admin = createAdminClient();
    const vendorId = user.id;

    // ── 1. Produtos do vendor ─────────────────────────────────────────────────
    const { data: products } = await admin
      .from("saas_products")
      .select("id, name, logo_url")
      .eq("vendor_id", vendorId);

    const productIds = (products ?? [] as ProductRow[]).map((p) => p.id);

    if (productIds.length === 0) {
      return success(emptyAnalytics());
    }

    // ── 2. Subscriptions ─────────────────────────────────────────────────────
    const { data: subs } = await admin
      .from("subscriptions")
      .select("id, status, created_at, canceled_at, product_tier_id, product_tiers(price_monthly, saas_products(id, name))")
      .in("product_tier_id", await getTierIds(admin, productIds));

    // ── 3. Orders (lifetime / one-time) ──────────────────────────────────────
    const { data: orders } = await admin
      .from("orders")
      .select("id, amount_gross, created_at, status, product_tier_id")
      .in("product_tier_id", await getTierIds(admin, productIds))
      .eq("status", "paid");

    const allSubs = (subs ?? []) as SubscriptionRow[];
    const allOrders = (orders ?? []) as { id: string; amount_gross?: number; created_at: string; status: string; product_tier_id?: string }[];
    const activeSubs = allSubs.filter((s) => s.status === "active");
    const canceledSubs = allSubs.filter((s) => s.status === "canceled");

    // ── 4. MRR ────────────────────────────────────────────────────────────────
    const mrr = activeSubs.reduce((sum: number, s: SubscriptionRow) =>
      sum + Number(s.product_tiers?.price_monthly ?? 0), 0);
    const arr = mrr * 12;

    // ── 5. Churn Rate (último mês) ────────────────────────────────────────────
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const churnedThisMonth = canceledSubs.filter((s) => {
      const d = new Date(s.canceled_at ?? s.created_at ?? "");
      return d >= thisMonth;
    }).length;

    const activeAtStartOfMonth = allSubs.filter((s) => {
      const created = new Date(s.created_at ?? "");
      return created < thisMonth && (s.status === "active" || (s.status === "canceled" && new Date(s.canceled_at ?? "").getTime() >= thisMonth.getTime()));
    }).length;

    const churnRate = activeAtStartOfMonth > 0 ? churnedThisMonth / activeAtStartOfMonth : 0;

    // ── 6. LTV & ARPU ─────────────────────────────────────────────────────────
    const arpu = activeSubs.length > 0 ? mrr / activeSubs.length : 0;
    const ltv = churnRate > 0 ? arpu / churnRate : arpu * 24; // fallback: 2 anos

    // ── 7. Revenue series (últimos N meses) ───────────────────────────────────
    const revenueSeries = buildRevenueSeries(allSubs, months);

    // ── 8. Churn series ───────────────────────────────────────────────────────
    const churnSeries = buildChurnSeries(allSubs, months);

    // ── 9. Cohort retention ───────────────────────────────────────────────────
    const cohortData = buildCohortRetention(allSubs, 6);

    // ── 10. Funnel ────────────────────────────────────────────────────────────
    const { data: views } = await admin.from("social_views").select("product_id").in("product_id", productIds);
    const { data: carts } = await admin.from("carts").select("id").in("product_id", productIds);
    const totalViews = (views ?? []).length;
    const totalCheckouts = (carts ?? []).length;
    const totalConversions = allOrders.length + allSubs.length;

    const funnel = [
      { stage: "Visitantes", count: totalViews, pct: 100 },
      { stage: "Checkouts iniciados", count: totalCheckouts, pct: totalViews > 0 ? (totalCheckouts / totalViews) * 100 : 0 },
      { stage: "Pagamentos", count: totalConversions, pct: totalViews > 0 ? (totalConversions / totalViews) * 100 : 0 },
      { stage: "Ativos hoje", count: activeSubs.length, pct: totalViews > 0 ? (activeSubs.length / totalViews) * 100 : 0 },
    ];

    // ── 11. Top products ──────────────────────────────────────────────────────
    const topProducts = (products ?? [] as ProductRow[]).map((p) => {
      const pSubs = activeSubs.filter((s) => s.product_tiers?.saas_products?.id === p.id);
      const pMrr = pSubs.reduce((sum: number, s: SubscriptionRow) => sum + Number(s.product_tiers?.price_monthly ?? 0), 0);
      const pCanceled = canceledSubs.filter((s) => {
        const d = new Date(s.canceled_at ?? "");
        return s.product_tiers?.saas_products?.id === p.id && d >= thisMonth;
      }).length;
      const pActive = allSubs.filter((s) => s.product_tiers?.saas_products?.id === p.id && new Date(s.created_at ?? "").getTime() < thisMonth.getTime()).length;
      const pChurn = pActive > 0 ? (pCanceled / pActive) * 100 : 0;
      return { name: p.name, mrr: pMrr, subs: pSubs.length, churn: pChurn };
    }).sort((a, b) => b.mrr - a.mrr).slice(0, 5);

    // ── MRR growth ────────────────────────────────────────────────────────────
    const mrrLastMonth = revenueSeries.length >= 2
      ? revenueSeries[revenueSeries.length - 2].mrr
      : mrr;
    const mrrGrowth = mrrLastMonth > 0 ? (mrr - mrrLastMonth) / mrrLastMonth : 0;

    return success({
      mrr, arr, mrrGrowth, churnRate, ltv, arpu,
      activeCustomers: activeSubs.length,
      newThisMonth: allSubs.filter((s) => new Date(s.created_at ?? "").getTime() >= thisMonth.getTime()).length,
      churnedThisMonth,
      revenueSeries,
      churnSeries,
      cohortData,
      funnel,
      topProducts,
    });

  } catch (e: unknown) {
    console.error("[vendor/analytics/advanced]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTierIds(admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, productIds: string[]): Promise<string[]> {
  const { data } = await admin
    .from("product_tiers")
    .select("id")
    .in("product_id", productIds);
  return (data ?? [] as { id: string }[]).map((t) => t.id);
}

function buildRevenueSeries(subs: SubscriptionRow[], months: number) {
  const series = [];
  const now = new Date();
  for (let m = months - 1; m >= 0; m--) {
    const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const label = date.toLocaleString("pt-BR", { month: "short", year: "2-digit" });
    const activeOnMonth = subs.filter((s) => {
      const created = new Date(s.created_at ?? "");
      const canceled = s.canceled_at ? new Date(s.canceled_at) : null;
      return created <= date && (!canceled || canceled > date) && s.status !== "failed";
    });
    const mrr = activeOnMonth.reduce((sum: number, s: SubscriptionRow) => sum + Number(s.product_tiers?.price_monthly ?? 0), 0);
    const newSubs = subs.filter((s) => {
      const d = new Date(s.created_at ?? "");
      return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });
    const new_revenue = newSubs.reduce((sum: number, s: SubscriptionRow) => sum + Number(s.product_tiers?.price_monthly ?? 0), 0);
    const churnedSubs = subs.filter((s) => {
      if (!s.canceled_at) return false;
      const d = new Date(s.canceled_at);
      return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });
    const churned_revenue = churnedSubs.reduce((sum: number, s: SubscriptionRow) => sum + Number(s.product_tiers?.price_monthly ?? 0), 0);
    series.push({ month: label, mrr, new_revenue, churned_revenue });
  }
  return series;
}

function buildChurnSeries(subs: SubscriptionRow[], months: number) {
  const series = [];
  const now = new Date();
  for (let m = months - 1; m >= 0; m--) {
    const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const label = date.toLocaleString("pt-BR", { month: "short", year: "2-digit" });
    const atStart = subs.filter((s) => {
      const created = new Date(s.created_at ?? "");
      return created < date;
    }).length;
    const churned = subs.filter((s) => {
      if (!s.canceled_at) return false;
      const d = new Date(s.canceled_at);
      return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    }).length;
    const churn_rate = atStart > 0 ? churned / atStart : 0;
    const retained = Math.max(0, atStart - churned);
    series.push({ month: label, churn_rate, retained });
  }
  return series;
}

function buildCohortRetention(subs: SubscriptionRow[], cohorts: number) {
  const now = new Date();
  const result = [];
  for (let c = cohorts - 1; c >= 0; c--) {
    const cohortStart = new Date(now.getFullYear(), now.getMonth() - c, 1);
    const cohortEnd = new Date(now.getFullYear(), now.getMonth() - c + 1, 0);
    const label = cohortStart.toLocaleString("pt-BR", { month: "short", year: "2-digit" });
    const cohortSubs = subs.filter((s) => {
      const d = new Date(s.created_at ?? "");
      return d >= cohortStart && d <= cohortEnd;
    });
    const total = cohortSubs.length;
    if (total === 0) { result.push({ cohort: label, m0: 0, m1: 0, m2: 0, m3: 0, m6: 0 }); continue; }

    const retAt = (months: number) => {
      const refDate = new Date(cohortStart.getFullYear(), cohortStart.getMonth() + months, 1);
      if (refDate > now) return 0;
      const active = cohortSubs.filter((s) => {
        const canceled = s.canceled_at ? new Date(s.canceled_at) : null;
        return !canceled || canceled > refDate;
      }).length;
      return Math.round((active / total) * 100);
    };

    result.push({ cohort: label, m0: 100, m1: retAt(1), m2: retAt(2), m3: retAt(3), m6: retAt(6) });
  }
  return result;
}

function emptyAnalytics() {
  return {
    mrr: 0, arr: 0, mrrGrowth: 0, churnRate: 0, ltv: 0, arpu: 0,
    activeCustomers: 0, newThisMonth: 0, churnedThisMonth: 0,
    revenueSeries: [], churnSeries: [], cohortData: [], funnel: [], topProducts: [],
  };
}
