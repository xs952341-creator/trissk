// app/api/vendor/analytics/route.ts
// Retorna dados de funil de conversão por tier para o vendor autenticado.
// Funil: Views → Checkouts iniciados → Pagamentos confirmados
// Também retorna: MRR por tier, churn por tier, LTV estimado

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const admin = createAdminClient();
    const vendorId = user.id;
  
    // ── 1. Produtos e tiers do vendor ────────────────────────────────────────
    const { data: products } = await admin
      .from("saas_products")
      .select(`id, name, slug, logo_url,
        product_tiers(id, tier_name, price_monthly, price_lifetime, is_popular)`)
      .eq("vendor_id", vendorId)
      .eq("approval_status", "APPROVED");
  
    if (!products?.length) {
      return NextResponse.json({ funnel: [], revenueSeries: [], summary: {} });
    }
  
    const tierIds    = (Array.isArray(products) ? products as unknown as Record<string,unknown>[] : []).flatMap((p: Record<string, unknown>) => ((p.product_tiers ?? []) as Record<string,unknown>[]).map((t: Record<string, unknown>) => String(t.id)));
    const productIds = products.map((p: Record<string, unknown>) => p.id);
  
    // ── 2. Views por produto (tabela social_views ou product_views) ───────────
    const { data: views } = await admin
      .from("social_views")
      .select("product_id")
      .in("product_id", productIds);
  
    const viewsByProduct = (views ?? []).reduce<Record<string, number>>((acc, v: Record<string, unknown>) => {
      acc[String(v.product_id)] = (acc[String(v.product_id)] ?? 0) + 1;
      return acc;
    }, {});
  
    // ── 3. Checkouts iniciados (subscriptions com status incomplete) ──────────
    const { data: incompletes } = tierIds.length
      ? await admin.from("subscriptions").select("product_tier_id").in("product_tier_id", tierIds)
      : { data: [] };
  
    const checkoutsByTier = (incompletes ?? []).reduce<Record<string, number>>((acc, s: Record<string, unknown>) => {
      acc[String(s.product_tier_id)] = (acc[String(s.product_tier_id)] ?? 0) + 1;
      return acc;
    }, {});
  
    // ── 4. Vendas confirmadas por tier ────────────────────────────────────────
    const { data: orders } = productIds.length
      ? await admin.from("orders")
          .select("product_tier_id, amount_gross, created_at")
          .eq("vendor_id", vendorId)
          .eq("status", "paid")
      : { data: [] };
  
    const salesByTier     = (orders ?? []).reduce<Record<string, number>>((acc, o: Record<string, unknown>) => {
      if (o.product_tier_id) acc[String(o.product_tier_id)] = (acc[String(o.product_tier_id)] ?? 0) + 1;
      return acc;
    }, {});
    const revenueByTier   = (orders ?? []).reduce<Record<string, number>>((acc, o: Record<string, unknown>) => {
      if (o.product_tier_id) acc[String(o.product_tier_id)] = (acc[String(o.product_tier_id)] ?? 0) + Number(o.amount_gross ?? 0);
      return acc;
    }, {});
  
    // ── 5. Assinantes ativos por tier (MRR) ───────────────────────────────────
    const { data: activeSubs } = tierIds.length
      ? await admin.from("subscriptions")
          .select("product_tier_id, status")
          .in("product_tier_id", tierIds)
          .eq("status", "active")
      : { data: [] };
  
    const activeByTier = (activeSubs ?? []).reduce<Record<string, number>>((acc, s: Record<string, unknown>) => {
      acc[String(s.product_tier_id)] = (acc[String(s.product_tier_id)] ?? 0) + 1;
      return acc;
    }, {});
  
    // ── 6. Cancelamentos últimos 30 dias (churn) ──────────────────────────────
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: canceledRecent } = tierIds.length
      ? await admin.from("subscriptions")
          .select("product_tier_id")
          .in("product_tier_id", tierIds)
          .in("status", ["canceled", "past_due"])
          .gte("updated_at", last30)
      : { data: [] };
  
    const churnByTier = (canceledRecent ?? []).reduce<Record<string, number>>((acc, s: Record<string, unknown>) => {
      acc[String(s.product_tier_id)] = (acc[String(s.product_tier_id)] ?? 0) + 1;
      return acc;
    }, {});
  
    // ── 7. Receita por mês (últimos 6 meses) para gráfico ────────────────────
    const since6m = new Date();
    since6m.setMonth(since6m.getMonth() - 6);
    const { data: monthlyRev } = await admin
      .from("platform_revenue")
      .select("vendor_payouts, gross_amount, created_at")
      .eq("vendor_id", vendorId)
      .gte("created_at", since6m.toISOString());
  
    const buckets: Record<string, number> = {};
    (monthlyRev ?? []).forEach((r: Record<string, unknown>) => {
      const d   = new Date(String(r.created_at ?? new Date().toISOString()));
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      buckets[key] = (buckets[key] ?? 0) + Number(r.vendor_payouts ?? 0);
    });
    const revenueSeries = Object.entries(buckets)
      .map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => {
        const [ma, ya] = a.month.split("/").map(Number);
        const [mb, yb] = b.month.split("/").map(Number);
        return ya === yb ? ma - mb : ya - yb;
      });
  
    // ── 8. Montar resposta do funil por tier ──────────────────────────────────
    const funnel = (Array.isArray(products) ? products as unknown as Record<string,unknown>[] : []).flatMap((p: Record<string, unknown>) =>
      ((p.product_tiers ?? []) as Record<string,unknown>[]).map((t: Record<string, unknown>) => {
        const views       = viewsByProduct[String(p.id)] ?? 0;
        const checkouts   = checkoutsByTier[String(t.id)] ?? 0;
        const sales       = salesByTier[String(t.id)]     ?? 0;
        const active      = activeByTier[String(t.id)]    ?? 0;
        const churn30d    = churnByTier[String(t.id)]     ?? 0;
        const revenue     = revenueByTier[String(t.id)]   ?? 0;
        const priceMonthly = Number(t.price_monthly ?? 0);
  
        const churnRate  = (active + churn30d) > 0 ? churn30d / (active + churn30d) : 0;
        const mrr        = active * priceMonthly;
        const ltv        = churnRate > 0 ? mrr / churnRate : mrr * 12;
        const conversionViewToSale  = views  > 0 ? ((sales / views)    * 100).toFixed(1) : "0";
        const conversionViewToStart = views  > 0 ? ((checkouts / views) * 100).toFixed(1) : "0";
        const conversionStartToSale = checkouts > 0 ? ((sales / checkouts) * 100).toFixed(1) : "0";
  
        return {
          productId:   p.id,
          productName: p.name,
          productLogo: p.logo_url,
          tierId:      t.id,
          tierName:    t.tier_name,
          isPopular:   t.is_popular,
          priceMonthly,
          priceLifetime: t.price_lifetime,
          // Funil
          views,
          checkoutsStarted:  checkouts,
          salesConfirmed:    sales,
          activeSubscribers: active,
          // Conversões
          conversionViewToSale:  Number(conversionViewToSale),
          conversionViewToStart: Number(conversionViewToStart),
          conversionStartToSale: Number(conversionStartToSale),
          // Financeiro
          revenueTotal: Math.round(revenue * 100) / 100,
          mrr:          Math.round(mrr * 100) / 100,
          churnRate30d: Math.round(churnRate * 1000) / 10,
          ltv:          Math.round(ltv),
        };
      })
    );
  
    // ── 9. Summary global ─────────────────────────────────────────────────────
    const totalMRR      = funnel.reduce((s, f) => s + f.mrr, 0);
    const totalSales    = funnel.reduce((s, f) => s + f.salesConfirmed, 0);
    const totalRevenue  = funnel.reduce((s, f) => s + f.revenueTotal, 0);
    const totalActive   = funnel.reduce((s, f) => s + f.activeSubscribers, 0);
    const avgConversion = funnel.length > 0
      ? funnel.reduce((s, f) => s + f.conversionViewToSale, 0) / funnel.length
      : 0;
  
    return NextResponse.json({
      funnel,
      revenueSeries,
      summary: {
        totalMRR:          Math.round(totalMRR * 100) / 100,
        totalSales,
        totalRevenue:      Math.round(totalRevenue * 100) / 100,
        totalActiveSubscribers: totalActive,
        avgConversionPct:  Math.round(avgConversion * 10) / 10,
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
