"use client";
// app/(dashboards)/admin/ab-results/page.tsx
// Dashboard de resultados dos A/B tests (experimentos de checkout)

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, RefreshCw, GitBranch, CheckCircle2 } from "lucide-react";
import { EXPERIMENTS } from "@/lib/ab-test";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

interface VariantResult {
  variant_id:     string;
  impressions:    number;
  conversions:    number;
  cvr:            number;   // conversion rate %
  lift:           number;   // % lift vs control
  is_winner:      boolean;
}

type ProfileRoleRow = {
  role: string | null;
};

type ABEventRow = {
  experiment_id: string;
  variant_id: string;
  event: "impression" | "conversion";
};

export default function ABResultsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [results, setResults] = useState<Record<string, VariantResult[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ensureAdmin = async (): Promise<void> => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const profile = profileData as ProfileRoleRow | null;
      if (profile?.role !== "admin") {
        router.push("/dashboard");
      }
    };

    void ensureAdmin();
  }, [router, supabase]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Agregar eventos por experimento + variante
      const { data, error } = await supabase
        .from("ab_test_events")
        .select("experiment_id, variant_id, event")
        .order("created_at", { ascending: false })
        .limit(10000);

      if (error) throw error;

      const events: ABEventRow[] = (data ?? []) as ABEventRow[];
      const agg: Record<string, Record<string, { imp: number; conv: number }>> = {};

      events.forEach((e: ABEventRow) => {
        if (!agg[e.experiment_id]) agg[e.experiment_id] = {};
        if (!agg[e.experiment_id][e.variant_id]) agg[e.experiment_id][e.variant_id] = { imp: 0, conv: 0 };
        if (e.event === "impression") agg[e.experiment_id][e.variant_id].imp++;
        if (e.event === "conversion") agg[e.experiment_id][e.variant_id].conv++;
      });

      const byExp: Record<string, VariantResult[]> = {};
      Object.entries(agg).forEach(([expId, variants]) => {
        const controlCvr = variants["control"]
          ? (variants["control"].conv / Math.max(1, variants["control"].imp)) * 100
          : 0;

        byExp[expId] = Object.entries(variants).map(([variantId, counts]) => {
          const cvr  = (counts.conv / Math.max(1, counts.imp)) * 100;
          const lift = controlCvr > 0 ? ((cvr - controlCvr) / controlCvr) * 100 : 0;
          return {
            variant_id:  variantId,
            impressions: counts.imp,
            conversions: counts.conv,
            cvr,
            lift,
            is_winner: false,
          };
        });

        // Marcar winner
        const sorted = [...byExp[expId]].sort((a, b) => b.cvr - a.cvr);
        if (sorted.length > 0) sorted[0].is_winner = true;
      });

      setResults(byExp);
    } catch (err: unknown) {
      toast.error("Erro: " + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50 flex items-center gap-2">
            <GitBranch size={22} className="text-emerald-400" />
            Resultados A/B Tests
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Experimentos ativos: {EXPERIMENTS.filter(e => e.active).length} ·
            Para criar novos experimentos, edite <code className="text-emerald-400 text-xs">lib/ab-test.ts</code>
          </p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-300 p-2 transition">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : (
        EXPERIMENTS.map((exp) => {
          const variantResults = results[exp.id] ?? [];
          const hasData = variantResults.length > 0;

          return (
            <div key={exp.id} className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 bg-zinc-950/40 flex items-center justify-between">
                <div>
                  <h2 className="text-zinc-100 font-semibold">{exp.name}</h2>
                  <p className="text-zinc-500 text-xs mt-0.5">ID: {exp.id} · {exp.variants.length} variantes</p>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                  exp.active
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-zinc-500 bg-zinc-800/60 border-zinc-700"
                }`}>
                  {exp.active ? "Ativo" : "Inativo"}
                </span>
              </div>

              {!hasData ? (
                <div className="px-5 py-8 text-center text-zinc-500 text-sm">
                  Sem dados ainda. Impressões começarão a aparecer assim que usuários acessarem o checkout.
                </div>
              ) : (
                <div>
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-xs text-zinc-500 border-b border-white/5 bg-zinc-950/20">
                    <span>Variante</span>
                    <span className="text-right">Impressões</span>
                    <span className="text-right">Conversões</span>
                    <span className="text-right">CVR</span>
                    <span className="text-right">Lift vs control</span>
                  </div>
                  {variantResults
                    .sort((a, b) => b.cvr - a.cvr)
                    .map((v) => {
                      const expVariant = exp.variants.find(ev => ev.id === v.variant_id);
                      return (
                        <div key={v.variant_id} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-4 items-center border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition ${v.is_winner ? "bg-emerald-500/[0.02]" : ""}`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-200 font-medium text-sm">{v.variant_id}</span>
                              {v.is_winner && <CheckCircle2 size={13} className="text-emerald-400" />}
                              {v.variant_id === "control" && <span className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1.5 py-0.5">controle</span>}
                            </div>
                            {expVariant && (
                              <p className="text-zinc-600 text-xs mt-0.5">{expVariant.cta}</p>
                            )}
                          </div>
                          <span className="text-zinc-400 tabular-nums text-right text-sm">{v.impressions.toLocaleString("pt-BR")}</span>
                          <span className="text-zinc-400 tabular-nums text-right text-sm">{v.conversions.toLocaleString("pt-BR")}</span>
                          <span className={`tabular-nums text-right text-sm font-bold ${v.is_winner ? "text-emerald-400" : "text-zinc-300"}`}>
                            {v.cvr.toFixed(1)}%
                          </span>
                          <span className={`tabular-nums text-right text-sm ${
                            v.variant_id === "control"
                              ? "text-zinc-600"
                              : v.lift >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {v.variant_id === "control" ? "—" : `${v.lift >= 0 ? "+" : ""}${v.lift.toFixed(1)}%`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })
      )}

      <p className="text-zinc-700 text-xs">
        💡 CVR = Conversions / Impressões · Lift = (CVR variante - CVR controle) / CVR controle · 100.<br />
        Resultados com menos de 100 impressões por variante podem ter alta variância estatística.
      </p>
    </div>
  );
}
