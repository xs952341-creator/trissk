
"use client";
// app/(dashboards)/admin/revenue/page.tsx
// Painel de receita consolidado: GMV, taxas, NF-e por status, breakdown por vendor.
// Exige role = "admin".

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart2, DollarSign, FileText, Loader2, RefreshCw,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, X, Zap,
  Users,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  type TooltipProps,
} from "recharts";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface RevenueRow {
  month:          string;  // "2025-01"
  gmv:            number;
  platform_fee:   number;
  vendor_payouts: number;
  count:          number;
}

interface FiscalSummary {
  pending:     number;
  processing:  number;
  emitted:      number;
  error:        number;
  failed:       number;
  aborted:      number;
}


interface VendorRevenue {
  vendor_id:   string;
  name:        string;
  email:       string;
  gmv:         number;
  fee:         number;
  payout:      number;
  fiscal_mode: string | null;
}

type Period = "30d" | "90d" | "12m" | "all";

export default function AdminRevenuePage() {
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    (async () => {
      const supa = createClient();
      const { data: { user } } = await supa.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supa.from("profiles").select("role").eq("id", user.id).single();
      if (data?.role !== "admin") router.push("/dashboard");
    })();
  }, [router]);

  const supabase = createClient();
  const [period,        setPeriod]        = useState<Period>("30d");
  const [loading,       setLoading]       = useState(true);
  const [emittingAll,   setEmittingAll]   = useState(false);
  const [chartData,     setChartData]     = useState<RevenueRow[]>([]);
  const [fiscalSummary, setFiscalSummary] = useState<FiscalSummary>({ pending: 0, processing: 0, emitted: 0, error: 0, failed: 0, aborted: 0 });
  const [vendors,       setVendors]       = useState<VendorRevenue[]>([]);
  const [totals,        setTotals]        = useState({ gmv: 0, fee: 0, payout: 0, count: 0 });

  const periodDays: Record<Period, number | null> = { "30d": 30, "90d": 90, "12m": 365, "all": null };

  const load = async () => {
    setLoading(true);
    try {
      const days = periodDays[period];
      const since = days
        ? new Date(Date.now() - days * 86400_000).toISOString()
        : "2000-01-01";

      // 1. Receita por mês
      const { data: rev } = await supabase
        .from("platform_revenue")
        .select("gross_amount, platform_fee, vendor_payouts, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      // Agrupar por mês
      const byMonth: Record<string, RevenueRow> = {};
      (rev ?? []).forEach((r: Record<string, unknown>) => {
        const d  = new Date(String(r.created_at ?? ""));
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonth[mk]) byMonth[mk] = { month: mk, gmv: 0, platform_fee: 0, vendor_payouts: 0, count: 0 };
        byMonth[mk].gmv            += Number(r.gross_amount   ?? 0);
        byMonth[mk].platform_fee   += Number(r.platform_fee   ?? 0);
        byMonth[mk].vendor_payouts += Number(r.vendor_payouts ?? 0);
        byMonth[mk].count          += 1;
      });

      const rows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
      setChartData(rows);

      const t = rows.reduce((a, r) => ({
        gmv:    a.gmv    + r.gmv,
        fee:    a.fee    + r.platform_fee,
        payout: a.payout + r.vendor_payouts,
        count:  a.count  + r.count,
      }), { gmv: 0, fee: 0, payout: 0, count: 0 });
      setTotals(t);

      // 2. Status fiscal (fiscal_jobs)
      const { data: fiscalData } = await supabase
        .from("fiscal_jobs")
        .select("status")
        .gte("created_at", since);

      const fs: FiscalSummary = { pending: 0, processing: 0, emitted: 0, error: 0, failed: 0, aborted: 0 };
      (fiscalData ?? []).forEach((f: Record<string, unknown>) => {
        const s = String(f.status ?? "").toLowerCase();
        if (s === "pending")  fs.pending++;
        if (s === "emitted")  fs.emitted++;
        if (s === "failed")   fs.failed++;
        if (s === "aborted")  fs.aborted++;
      });
      setFiscalSummary(fs);

      // 3. Top vendors por receita
      const { data: vRev } = await supabase
        .from("platform_revenue")
        .select("vendor_id, gross_amount, platform_fee, vendor_payouts")
        .not("vendor_id", "is", null)
        .gte("created_at", since);

      const vMap: Record<string, { gmv: number; fee: number; payout: number }> = {};
      (vRev ?? []).forEach((r: Record<string, unknown>) => {
        const vid = String(r.vendor_id ?? "");
        if (!vMap[vid]) vMap[vid] = { gmv: 0, fee: 0, payout: 0 };
        vMap[vid].gmv    += Number(r.gross_amount   ?? 0);
        vMap[vid].fee    += Number(r.platform_fee   ?? 0);
        vMap[vid].payout += Number(r.vendor_payouts ?? 0);
      });

      const vendorIds = Object.keys(vMap);
      let vList: VendorRevenue[] = [];
      if (vendorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, fiscal_mode")
          .in("id", vendorIds);

        vList = vendorIds.map((vid) => {
          const p = (profs ?? []).find((x: Record<string, unknown>) => x.id === vid);
          return {
            vendor_id:   vid,
            name:        String((p as Record<string, unknown>)?.full_name ?? vid.slice(0, 8)),
            email:       String((p as Record<string, unknown>)?.email ?? ""),
            fiscal_mode: ((p as Record<string, unknown>)?.fiscal_mode as string | null) ?? null,
            ...vMap[vid],
          };
        }).sort((a, b) => b.gmv - a.gmv).slice(0, 10);
      }
      setVendors(vList);

    } catch (e: unknown) {
      toast.error("Erro ao carregar dados: " + getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  // Disparar emissão manual de NFs pendentes
  const emitPendingNFs = async () => {
    setEmittingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/run-fiscal-jobs", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.processed !== undefined) {
        toast.success(`${data.succeeded} NFs emitidas, ${data.failed} falhas`);
        await load();
      } else {
        toast.error(data.reason ?? data.error ?? "Erro");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setEmittingAll(false);
    }
  };

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const chartTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs shadow-xl">
        <p className="text-zinc-400 mb-2">{label}</p>
        {payload.map((p, index) => (
          <p key={index} style={{ color: p.color }} className="font-medium">
            {p.name}: R$ {Number(p.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Receita Consolidada</h1>
          <p className="text-zinc-500 text-sm mt-1">GMV, taxas, repasses e status fiscal</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-xl border border-white/10 overflow-hidden">
            {(["30d", "90d", "12m", "all"] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors
                  ${period === p ? "bg-white/10 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}>
                {p === "all" ? "Tudo" : p}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-sm transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" size={28} /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="GMV" value={fmt(totals.gmv)} icon={<TrendingUp size={16} />} color="text-emerald-400" />
            <KpiCard label="Taxa da plataforma" value={fmt(totals.fee)} icon={<DollarSign size={16} />} color="text-blue-400" />
            <KpiCard label="Repasse vendors" value={fmt(totals.payout)} icon={<Users size={16} />} color="text-violet-400" />
            <KpiCard label="Transações" value={totals.count.toLocaleString("pt-BR")} icon={<BarChart2 size={16} />} />
          </div>

          {/* Gráfico */}
          {chartData.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-zinc-300 font-semibold text-sm mb-4">GMV vs Taxa vs Repasse (por mês)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#71717a" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
                  <Tooltip content={chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="gmv"            name="GMV"     fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="platform_fee"   name="Taxa"    fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vendor_payouts" name="Repasse" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Notas fiscais */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-zinc-300 font-semibold text-sm">Status Fiscal (NF-e via eNotas)</h3>
              <button onClick={emitPendingNFs} disabled={emittingAll || fiscalSummary.pending === 0}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors">
                {emittingAll ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Emitir pendentes ({fiscalSummary.pending})
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FiscalCard label="Pendentes" count={fiscalSummary.pending} icon={<Clock size={14} />} color="text-amber-400 bg-amber-500/10 border-amber-500/20" />
              <FiscalCard label="Emitidas"  count={fiscalSummary.emitted} icon={<CheckCircle2 size={14} />} color="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" />
              <FiscalCard label="Com falha" count={fiscalSummary.failed}  icon={<AlertTriangle size={14} />} color="text-red-400 bg-red-500/10 border-red-500/20" />
              <FiscalCard label="Abortadas" count={fiscalSummary.aborted} icon={<X size={14} />} color="text-zinc-400 bg-zinc-500/10 border-zinc-500/20" />
            </div>
            <p className="text-zinc-600 text-xs mt-3">
              NFs pendentes são emitidas automaticamente pelo cron diário às 09:00. 
              Use o botão acima para emissão imediata.
            </p>
          </div>

          {/* Top vendors */}
          {vendors.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="text-zinc-300 font-semibold text-sm">Top Vendors por Receita</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-zinc-500">
                      <th className="px-5 py-3 text-left font-medium">Vendor</th>
                      <th className="px-5 py-3 text-right font-medium">GMV</th>
                      <th className="px-5 py-3 text-right font-medium">Taxa</th>
                      <th className="px-5 py-3 text-right font-medium">Repasse</th>
                      <th className="px-5 py-3 text-left font-medium">Fiscal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {vendors.map((v) => (
                      <tr key={v.vendor_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-zinc-200 font-medium">{v.name}</p>
                          <p className="text-zinc-600">{v.email}</p>
                        </td>
                        <td className="px-5 py-3 text-right text-emerald-400 font-mono">{fmt(v.gmv)}</td>
                        <td className="px-5 py-3 text-right text-blue-400 font-mono">{fmt(v.fee)}</td>
                        <td className="px-5 py-3 text-right text-violet-400 font-mono">{fmt(v.payout)}</td>
                        <td className="px-5 py-3">
                          <FiscalModeBadge mode={v.fiscal_mode} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color = "text-zinc-100" }: {
  label: string; value: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="text-zinc-600 mb-3">{icon}</div>
      <p className={`font-bold text-xl tracking-tight ${color}`}>{value}</p>
      <p className="text-zinc-500 text-xs mt-1">{label}</p>
    </div>
  );
}

function FiscalCard({ label, count, icon, color }: {
  label: string; count: number; icon: React.ReactNode; color: string;
}) {
  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3 ${color}`}>
      {icon}
      <div>
        <p className="font-bold text-lg leading-none">{count}</p>
        <p className="text-xs opacity-70 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function FiscalModeBadge({ mode }: { mode: string | null }) {
  if (mode === "self")     return <span className="text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5 text-[10px]">Própria</span>;
  if (mode === "platform") return <span className="text-blue-400 bg-blue-500/10 rounded-full px-2 py-0.5 text-[10px]">Plataforma</span>;
  if (mode === "none")     return <span className="text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5 text-[10px]">Manual</span>;
  return <span className="text-zinc-500 bg-zinc-500/10 rounded-full px-2 py-0.5 text-[10px]">Não config.</span>;
}
