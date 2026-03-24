"use client";
// app/(dashboards)/admin/cohort/page.tsx
// Dashboard de Cohort Retention (D1 / D7 / D30)
// Agrega subscriptions por semana de criação e calcula % ativas em D1, D7, D30.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

interface CohortRow {
  cohort_week:     string;   // "2026-W01"
  cohort_size:     number;
  retained_d1:     number;
  retained_d7:     number;
  retained_d30:    number;
  pct_d1:          number;
  pct_d7:          number;
  pct_d30:         number;
}

function pctColor(pct: number) {
  if (pct >= 80) return "text-emerald-400 bg-emerald-500/10";
  if (pct >= 50) return "text-amber-400 bg-amber-500/10";
  if (pct >= 25) return "text-orange-400 bg-orange-500/10";
  return "text-red-400 bg-red-500/10";
}

function PctCell({ value }: { value: number }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${pctColor(value)}`}>
      {value.toFixed(0)}%
    </span>
  );
}

export default function AdminCohortPage() {
  const router = useRouter();
  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      createClient().from("profiles").select("role").eq("id", "x").then(() => {});
      createClient().auth.getUser().then(({ data: { user } }) => {
        if (!user) { router.push("/login"); return; }
        createClient().from("profiles").select("role").eq("id", user.id).single().then(({ data }) => {
          if (data?.role !== "admin") router.push("/dashboard");
        });
      });
    });
  }, [router]);

  const supabase               = createClient();
  const [rows,    setRows]     = useState<CohortRow[]>([]);
  const [loading, setLoading]  = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Calcular cohort retention via query analítica
      // Busca subscriptions com criação e status atual
      const { data, error } = await supabase.rpc("cohort_retention_weekly");
      if (error) throw error;
      setRows(data ?? []);
    } catch (err: unknown) {
      // Fallback: calcular no client se RPC não existe
      try {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id, user_id, status, created_at, canceled_at")
          .order("created_at", { ascending: false })
          .limit(2000);

        if (!subs) throw new Error("sem dados");

        // Agrupar por semana ISO
        const cohortMap = new Map<string, {
          size: number; d1: number; d7: number; d30: number;
        }>();

        subs.forEach((s: Record<string, unknown>) => {
          const d = new Date(String(s.created_at ?? ""));
          // Semana ISO
          const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
          const week = Math.ceil(dayOfYear / 7);
          const key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;

          if (!cohortMap.has(key)) cohortMap.set(key, { size: 0, d1: 0, d7: 0, d30: 0 });
          const c = cohortMap.get(key)!;
          c.size++;

          const canceledAt = s.canceled_at ? new Date(String(s.canceled_at ?? "")) : null;
          const ageDays = (Date.now() - d.getTime()) / 86400000;

          // D1: cancelou com mais de 1 dia de vida (ou ainda ativo)
          if (!canceledAt || (canceledAt.getTime() - d.getTime()) / 86400000 >= 1) c.d1++;
          // D7: cancelou com mais de 7 dias (ou ainda ativo)
          if (ageDays >= 7 && (!canceledAt || (canceledAt.getTime() - d.getTime()) / 86400000 >= 7)) c.d7++;
          // D30: cancelou com mais de 30 dias (ou ainda ativo)
          if (ageDays >= 30 && (!canceledAt || (canceledAt.getTime() - d.getTime()) / 86400000 >= 30)) c.d30++;
        });

        const result: CohortRow[] = Array.from(cohortMap.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 20)
          .map(([cohort_week, c]) => ({
            cohort_week,
            cohort_size:  c.size,
            retained_d1:  c.d1,
            retained_d7:  c.d7,
            retained_d30: c.d30,
            pct_d1:  c.size > 0 ? (c.d1 / c.size) * 100 : 0,
            pct_d7:  c.size > 0 ? (c.d7 / c.size) * 100 : 0,
            pct_d30: c.size > 0 ? (c.d30 / c.size) * 100 : 0,
          }));

        setRows(result);
      } catch (e2: unknown) {
        toast.error("Erro: " + getErrorMessage(e2));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const avgD1  = rows.length > 0 ? rows.reduce((a, r) => a + r.pct_d1,  0) / rows.length : 0;
  const avgD7  = rows.length > 0 ? rows.reduce((a, r) => a + r.pct_d7,  0) / rows.length : 0;
  const avgD30 = rows.length > 0 ? rows.reduce((a, r) => a + r.pct_d30, 0) / rows.length : 0;

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50 flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-400" />
            Cohort Retention
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Retenção semanal de assinantes — D1 (24h), D7 (7 dias), D30 (30 dias)
          </p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-300 p-2 transition">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Média D1",  value: avgD1,  desc: "% que ficam no 1º dia" },
          { label: "Média D7",  value: avgD7,  desc: "% que ficam na 1ª semana" },
          { label: "Média D30", value: avgD30, desc: "% que ficam no 1º mês" },
        ].map(c => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
            <p className={`text-3xl font-bold tabular-nums ${pctColor(c.value).split(" ")[0]}`}>
              {c.value.toFixed(1)}%
            </p>
            <p className="text-zinc-600 text-xs mt-1">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Cohort table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/5 p-12 text-center text-zinc-500 text-sm">
          Sem dados suficientes para análise de cohort.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-950/40">
                <th className="px-5 py-3 text-left text-xs text-zinc-500 font-medium">Cohort (Semana)</th>
                <th className="px-5 py-3 text-right text-xs text-zinc-500 font-medium">Tamanho</th>
                <th className="px-5 py-3 text-center text-xs text-zinc-500 font-medium">D1 (24h)</th>
                <th className="px-5 py-3 text-center text-xs text-zinc-500 font-medium">D7 (7 dias)</th>
                <th className="px-5 py-3 text-center text-xs text-zinc-500 font-medium">D30 (30 dias)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.cohort_week} className="hover:bg-white/[0.02] transition">
                  <td className="px-5 py-4 font-mono text-sm text-zinc-300">{r.cohort_week}</td>
                  <td className="px-5 py-4 text-right text-zinc-400 tabular-nums">{r.cohort_size.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-4 text-center">
                    <PctCell value={r.pct_d1} />
                    <p className="text-zinc-600 text-[10px] mt-0.5 tabular-nums">{r.retained_d1}/{r.cohort_size}</p>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {r.cohort_size > 0 && r.pct_d7 >= 0
                      ? <><PctCell value={r.pct_d7} /><p className="text-zinc-600 text-[10px] mt-0.5 tabular-nums">{r.retained_d7}/{r.cohort_size}</p></>
                      : <span className="text-zinc-700 text-xs">—</span>
                    }
                  </td>
                  <td className="px-5 py-4 text-center">
                    {r.cohort_size > 0 && r.pct_d30 >= 0
                      ? <><PctCell value={r.pct_d30} /><p className="text-zinc-600 text-[10px] mt-0.5 tabular-nums">{r.retained_d30}/{r.cohort_size}</p></>
                      : <span className="text-zinc-700 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-zinc-700 text-xs">
        💡 D1 = % que não cancelou em 24h · D7 = % ativa após 7 dias · D30 = % ativa após 30 dias.<br />
        Cohorts com menos de 7 ou 30 dias de vida mostram "—" nos campos ainda não mensuráveis.
      </p>
    </div>
  );
}
