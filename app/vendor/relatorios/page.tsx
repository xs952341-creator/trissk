
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type RevRow = { stripe_invoice_id: string; gross_amount: number; platform_fee: number; vendor_payouts: number; created_at?: string };
type SubRow = { status: string; updated_at: string; product_tier_id: string | null };
type TierRow = { id: string; price_monthly: number | null };

export default function VendorReports() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);

  const [mrr, setMrr] = useState<number>(0);
  const [churn, setChurn] = useState<number>(0);
  const [ltv, setLtv] = useState<number>(0);
  const [series, setSeries] = useState<{ month: string; revenue: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login?next=/vendor/relatorios"; return; }

      const vendorId = session.user.id;

      // Receita por mês (últimos 6 meses) via platform_revenue
      const since = new Date();
      since.setMonth(since.getMonth() - 6);

      const { data: rev } = await supabase
        .from("platform_revenue")
        .select("vendor_payouts, gross_amount, platform_fee, created_at, vendor_id")
        .eq("vendor_id", vendorId)
        .gte("created_at", since.toISOString());

      const buckets: Record<string, number> = {};
      (rev ?? []).forEach((r: Record<string, unknown>) => {
        const d = new Date(String(r.created_at ?? new Date().toISOString()));
        const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        buckets[key] = (buckets[key] ?? 0) + Number(r.vendor_payouts ?? 0);
      });

      const sorted = Object.entries(buckets)
        .map(([month, revenue]) => ({ month, revenue: Number(revenue.toFixed(2)) }))
        .sort((a, b) => {
          const [ma, ya] = a.month.split("/").map(Number);
          const [mb, yb] = b.month.split("/").map(Number);
          return ya === yb ? ma - mb : ya - yb;
        });

      setSeries(sorted);

      // Subscriptions para MRR / churn (aproximação)
      const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: tiers } = await supabase
        .from("product_tiers")
        .select("id, price_monthly, saas_products!inner(vendor_id)")
        .eq("saas_products.vendor_id", vendorId);

      const tierMap = new Map<string, number>();
      (tiers ?? []).forEach((t: TierRow) => tierMap.set(t.id, Number(t.price_monthly ?? 0)));

      const tierIds = (tiers ?? []).map((t: TierRow) => t.id);

      let subs: Record<string, unknown>[] = [];
      if (tierIds.length) {
        const { data } = await supabase
          .from("subscriptions")
          .select("status, updated_at, product_tier_id")
          .in("product_tier_id", tierIds);
        subs = data ?? [];
      }

      const active = subs.filter((s) => s.status === "active");
      const canceledRecent = subs.filter((s) => (s.status === "canceled" || s.status === "past_due") && (s.updated_at ?? "") >= last30);

      const mrrVal = active.reduce((sum, s) => sum + Number(tierMap.get(s.product_tier_id as string) ?? 0), 0);
      setMrr(Number(mrrVal.toFixed(2)));

      const base = Math.max(1, active.length + canceledRecent.length);
      const churnRate = canceledRecent.length / base;
      setChurn(Number((churnRate * 100).toFixed(1)));

      const ltvApprox = churnRate > 0 ? (mrrVal / churnRate) : mrrVal * 12;
      setLtv(Number(ltvApprox.toFixed(0)));

      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
            <p className="text-zinc-400 mt-1">MRR, churn e LTV (estimado) — sem sair do estilo do painel.</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/vendor/export?type=sales"
              download
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900 text-zinc-300 px-3 py-2 text-xs font-medium hover:border-white/20 hover:text-zinc-100 transition"
            >
              ↓ Vendas CSV
            </a>
            <a
              href="/api/vendor/export?type=subscribers"
              download
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900 text-zinc-300 px-3 py-2 text-xs font-medium hover:border-white/20 hover:text-zinc-100 transition"
            >
              ↓ Assinantes CSV
            </a>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex items-center gap-2 text-zinc-300">
            <Loader2 className="animate-spin" size={18} /> Carregando...
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <div className="text-sm text-zinc-400">MRR (aprox.)</div>
                <div className="text-2xl font-bold mt-1">R$ {mrr.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <div className="text-sm text-zinc-400">Churn 30d (aprox.)</div>
                <div className="text-2xl font-bold mt-1">{churn.toFixed(1)}%</div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <div className="text-sm text-zinc-400">LTV (estimado)</div>
                <div className="text-2xl font-bold mt-1">R$ {ltv.toFixed(0)}</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="font-semibold tracking-tight">Receita (payout) por mês</div>
              <div className="text-xs text-zinc-400 mt-1">Baseado em platform_revenue → vendor_payouts.</div>

              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="revenue" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
