"use client";
// app/(dashboards)/vendor/analytics/page.tsx
// Dashboard de Analytics Industrial: MRR, ARR, Churn, LTV, Retenção, Cohort, Funil

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { getErrorMessage } from "@/lib/errors";
import {
  TrendingUp, TrendingDown, Users, DollarSign, Activity,
  AlertTriangle, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricCard {
  label:    string;
  value:    string;
  change?:  number;
  icon:     React.ReactNode;
  color:    string;
  sub?:     string;
}

interface Analytics {
  mrr:           number;
  arr:           number;
  mrrGrowth:     number;
  churnRate:     number;
  ltv:           number;
  arpu:          number;
  activeCustomers: number;
  newThisMonth:  number;
  churnedThisMonth: number;
  revenueSeries: { month: string; mrr: number; new_revenue: number; churned_revenue: number }[];
  churnSeries:   { month: string; churn_rate: number; retained: number }[];
  cohortData:    { cohort: string; m0: number; m1: number; m2: number; m3: number; m6: number }[];
  funnel:        { stage: string; count: number; pct: number }[];
  topProducts:   { name: string; mrr: number; subs: number; churn: number }[];
}

const fmtBRL = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${v.toFixed(0)}`;

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

// ─── Componente principal ─────────────────────────────────────────────────────

function VendorAnalyticsInner() {
  const supabase = createClient();
  const [loading, setLoading]   = useState(true);
  const [data,    setData]      = useState<Analytics | null>(null);
  const [period,  setPeriod]    = useState<"3m" | "6m" | "12m">("6m");
  const [error,   setError]     = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor/analytics/advanced?period=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
      setData(json);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  const metrics: MetricCard[] = data ? [
    {
      label: "MRR",
      value: fmtBRL(data.mrr),
      change: data.mrrGrowth,
      icon: <DollarSign size={16} />,
      color: "text-emerald-400",
      sub: `ARR: ${fmtBRL(data.arr)}`,
    },
    {
      label: "Churn Rate",
      value: fmtPct(data.churnRate),
      icon: data.churnRate > 0.05 ? <TrendingDown size={16} /> : <TrendingUp size={16} />,
      color: data.churnRate > 0.05 ? "text-red-400" : "text-emerald-400",
      sub: `${data.churnedThisMonth} clientes saíram`,
    },
    {
      label: "LTV Médio",
      value: fmtBRL(data.ltv),
      icon: <Activity size={16} />,
      color: "text-blue-400",
      sub: `ARPU: ${fmtBRL(data.arpu)}/mês`,
    },
    {
      label: "Clientes Ativos",
      value: String(data.activeCustomers),
      change: data.newThisMonth > 0 ? data.newThisMonth / Math.max(data.activeCustomers, 1) : 0,
      icon: <Users size={16} />,
      color: "text-violet-400",
      sub: `+${data.newThisMonth} novos este mês`,
    },
  ] : [];

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Analytics Avançado</h1>
          <p className="text-sm text-zinc-500 mt-0.5">MRR · Churn · LTV · Cohort · Funil</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex bg-zinc-900 border border-white/10 rounded-xl p-1 gap-1">
            {(["3m","6m","12m"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {p === "3m" ? "3 meses" : p === "6m" ? "6 meses" : "12 meses"}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 bg-zinc-800 text-zinc-300 text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-emerald-500" />
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map(m => (
              <div key={m.label} className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">{m.label}</span>
                  <span className={`${m.color} opacity-70`}>{m.icon}</span>
                </div>
                <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                {m.change !== undefined && (
                  <div className={`flex items-center gap-1 mt-1 text-xs ${m.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {m.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {m.change >= 0 ? "+" : ""}{fmtPct(m.change)} vs mês anterior
                  </div>
                )}
                {m.sub && <p className="text-xs text-zinc-600 mt-1">{m.sub}</p>}
              </div>
            ))}
          </div>

          {/* MRR Chart */}
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-4">MRR — Evolução mensal</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.revenueSeries}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                  formatter={(v: number) => [`R$ ${v.toFixed(2)}`, ""]}
                />
                <Area type="monotone" dataKey="mrr" stroke="#10b981" fill="url(#mrrGrad)" strokeWidth={2} name="MRR" />
                <Area type="monotone" dataKey="new_revenue" stroke="#6366f1" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Receita Nova" />
                <Area type="monotone" dataKey="churned_revenue" stroke="#ef4444" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Receita Perdida" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Churn + Cohort side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Churn Rate */}
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Taxa de Churn Mensal</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.churnSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={v => `${(v*100).toFixed(1)}%`} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                    formatter={(v: number) => [`${(v*100).toFixed(2)}%`, "Churn"]}
                  />
                  <Line type="monotone" dataKey="churn_rate" stroke="#ef4444" strokeWidth={2} dot={false} name="Churn Rate" />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                Meta: abaixo de 5% ao mês
              </div>
            </div>

            {/* Cohort Retention */}
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Retenção por Coorte</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="text-left pb-2">Coorte</th>
                      <th className="text-center pb-2">M0</th>
                      <th className="text-center pb-2">M1</th>
                      <th className="text-center pb-2">M2</th>
                      <th className="text-center pb-2">M3</th>
                      <th className="text-center pb-2">M6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohortData.map(row => (
                      <tr key={row.cohort} className="border-t border-white/5">
                        <td className="py-2 text-zinc-400">{row.cohort}</td>
                        {([row.m0, row.m1, row.m2, row.m3, row.m6] as number[]).map((v, i) => (
                          <td key={i} className="text-center py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              v >= 80 ? "bg-emerald-500/20 text-emerald-400" :
                              v >= 60 ? "bg-yellow-500/20 text-yellow-400" :
                              v >= 40 ? "bg-orange-500/20 text-orange-400" :
                              v > 0   ? "bg-red-500/20 text-red-400" :
                              "text-zinc-700"
                            }`}>
                              {v > 0 ? `${v}%` : "—"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Conversion Funnel + Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Funnel */}
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Funil de Conversão</h3>
              <div className="space-y-3">
                {data.funnel.map((stage, i) => (
                  <div key={stage.stage}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">{stage.stage}</span>
                      <span className="text-zinc-300 font-medium">
                        {stage.count.toLocaleString("pt-BR")}
                        <span className="text-zinc-600 ml-1">({stage.pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${stage.pct}%`,
                          background: i === 0 ? "#6366f1" : i === 1 ? "#3b82f6" : i === 2 ? "#10b981" : "#f59e0b",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Produtos — Performance</h3>
              <div className="space-y-3">
                {data.topProducts.map(p => (
                  <div key={p.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-sm text-zinc-200 font-medium truncate max-w-[160px]">{p.name}</p>
                      <p className="text-xs text-zinc-600">{p.subs} assinaturas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-400">{fmtBRL(p.mrr)}<span className="text-zinc-600 text-xs">/mês</span></p>
                      <p className={`text-xs ${p.churn > 5 ? "text-red-400" : "text-zinc-500"}`}>
                        {p.churn.toFixed(1)}% churn
                      </p>
                    </div>
                  </div>
                ))}
                {data.topProducts.length === 0 && (
                  <p className="text-sm text-zinc-600 text-center py-4">Nenhum produto com dados ainda</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function VendorAnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <VendorAnalyticsInner />
    </Suspense>
  );
}
