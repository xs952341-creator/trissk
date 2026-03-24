
"use client";
/**
 * Health Score Preditivo — Dashboard do Vendor
 * Mostra o risco de churn de cada assinatura em tempo real.
 * Padrão Apple: skeleton, cores semânticas, insights acionáveis.
 */

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { TrendingUp, AlertTriangle, TrendingDown, CheckCircle2, Loader2, Calendar, ChevronRight, Shield, ArrowUpRight, Zap, RefreshCw, Activity } from "lucide-react";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type HealthStatus = "healthy" | "at_risk" | "churning";

interface HealthRecord {
  stripe_subscription_id: string;
  score:                  number;
  status:                 HealthStatus;
  reasons:                string[];
  calculated_at:          string;
  user_email?:            string;
  product_name?:          string;
}

type HealthQueryRow = {
  stripe_subscription_id: string;
  score: number;
  status: HealthStatus;
  reasons: string[] | string | null;
  calculated_at: string;
  subscriptions?: {
    profiles?: { email?: string | null } | null;
    saas_products?: { name?: string | null } | null;
  } | null;
}

// ── Helpers visuais ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<HealthStatus, { label: string; color: string; bg: string; border: string; icon: LucideIcon }> = {
  healthy:  { label: "Saudável",  color: "var(--brand)",   bg: "rgba(34,212,160,0.08)",   border: "rgba(34,212,160,0.2)",   icon: TrendingUp },
  at_risk:  { label: "Em risco",  color: "#fbbf24",        bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.2)",   icon: AlertTriangle },
  churning: { label: "Crítico",   color: "#f87171",        bg: "rgba(248,113,113,0.08)",  border: "rgba(248,113,113,0.2)",  icon: TrendingDown },
};

function ScoreBar({ score, status }: { score: number; status: HealthStatus }) {
  const color = STATUS_CFG[status].color;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ background: color }}
        />
      </div>
      <span className="text-sm font-bold w-10 text-right shrink-0" style={{ color, fontFamily: "var(--font-display)" }}>
        {score}
      </span>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function HealthSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="card p-4 flex items-center gap-4">
          <div className="skeleton w-9 h-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-2/5 rounded" />
            <div className="skeleton h-2 w-3/5 rounded" />
          </div>
          <div className="skeleton h-1.5 w-28 rounded-full" />
          <div className="skeleton h-3 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: LucideIcon; color: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={13} style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

// ── Página Principal ───────────────────────────────────────────────────────────
export default function HealthScorePage() {
  const supabase = createClient();
  const [records,    setRecords]    = useState<HealthRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [filter,        setFilter]        = useState<HealthStatus | "all">("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Buscar health scores das assinaturas dos produtos do vendor
      const { data, error } = await supabase
        .from("subscription_health_scores")
        .select(`
          stripe_subscription_id,
          score,
          status,
          reasons,
          calculated_at,
          subscriptions!stripe_subscription_id (
            user_id,
            profiles!user_id (email),
            saas_products!product_id (name)
          )
        `)
        .order("score", { ascending: true })
        .limit(100);

      if (error) throw error;

      const mapped: HealthRecord[] = ((data ?? []) as HealthQueryRow[]).map((r) => ({
        stripe_subscription_id: r.stripe_subscription_id,
        score:                  r.score,
        status:                 r.status,
        reasons:                typeof r.reasons === "string" ? JSON.parse(r.reasons) : (r.reasons ?? []),
        calculated_at:          r.calculated_at,
        user_email:             r.subscriptions?.profiles?.email ?? "—",
        product_name:           r.subscriptions?.saas_products?.name ?? "—",
      }));

      setRecords(mapped);
    } catch (err: unknown) {
      toast.error("Erro ao carregar health scores.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Dispara recálculo no servidor e depois recarrega os dados
  const recalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch("/api/vendor/health-score/recalculate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.total} assinaturas analisadas — dados atualizados!`);
        await load(true);
      } else if (res.status === 429) {
        toast.error("Aguarde 5 minutos entre recálculos.");
      } else {
        toast.error(data.error ?? "Erro ao recalcular.");
      }
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setRecalculating(false);
    }
  };

  const filtered = filter === "all" ? records : records.filter(r => r.status === filter);

  const stats = {
    healthy:  records.filter(r => r.status === "healthy").length,
    at_risk:  records.filter(r => r.status === "at_risk").length,
    churning: records.filter(r => r.status === "churning").length,
    avg:      records.length ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length) : 0,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <span className="section-eyebrow mb-1 block">Analytics B2B</span>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Health Score Preditivo
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Identifique clientes em risco antes que cancelem.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={recalculate}
            disabled={recalculating || refreshing}
            className="btn-primary px-4 py-2 text-xs gap-2"
            title="Recalcula o score de todas as assinaturas agora (máx 1x / 5min)"
          >
            {recalculating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Recalcular
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing || recalculating}
            className="btn-secondary px-4 py-2 text-xs gap-2"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatCard label="Saudáveis"  value={stats.healthy}  icon={TrendingUp}   color="var(--brand)" />
        <StatCard label="Em risco"   value={stats.at_risk}  icon={AlertTriangle} color="#fbbf24" />
        <StatCard label="Críticos"   value={stats.churning} icon={TrendingDown}  color="#f87171" />
        <StatCard label="Score médio" value={`${stats.avg}/100`} icon={Activity} color="#7dd3fc" />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {(["all", "healthy", "at_risk", "churning"] as const).map(f => {
          const label = f === "all" ? "Todos" : STATUS_CFG[f].label;
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200"
              style={active
                ? { background: f === "all" ? "var(--text-primary)" : STATUS_CFG[f as HealthStatus].bg,
                    color: f === "all" ? "var(--surface-0)" : STATUS_CFG[f as HealthStatus].color,
                    borderColor: "transparent" }
                : { color: "var(--text-muted)", borderColor: "var(--border-subtle)" }
              }
              aria-pressed={active}
            >
              {label}
              {f !== "all" && <span className="ml-1.5 opacity-60">{stats[f]}</span>}
            </button>
          );
        })}
      </div>

      {/* Records */}
      <AnimatePresence mode="wait">
        {loading ? (
          <HealthSkeleton />
        ) : filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center py-20 text-center"
          >
            <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-4"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
              <Shield size={22} style={{ color: "var(--text-faint)" }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}>
              {filter === "all" ? "Nenhum score calculado ainda" : `Nenhuma assinatura ${STATUS_CFG[filter as HealthStatus]?.label.toLowerCase()}`}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Os scores são calculados automaticamente a cada 6 horas.
            </p>
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {filtered.map((r, i) => {
              const cfg      = STATUS_CFG[r.status];
              const StatusIcon = cfg.icon;
              return (
                <motion.div
                  key={r.stripe_subscription_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="card p-4"
                >
                  <div className="flex items-center gap-4">
                    {/* Status icon */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                    >
                      <StatusIcon size={15} style={{ color: cfg.color }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold truncate"
                          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                          {r.user_email}
                        </p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0"
                          style={{ color: cfg.color, borderColor: cfg.border, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {r.product_name}
                        {r.reasons.length > 0 && (
                          <span className="ml-2 opacity-70">— {r.reasons[0]}</span>
                        )}
                      </p>
                    </div>

                    {/* Score bar */}
                    <div className="w-40 shrink-0 hidden sm:block">
                      <ScoreBar score={r.score} status={r.status} />
                    </div>

                    {/* Action */}
                    {r.status !== "healthy" && (
                      <button
                        className="shrink-0 text-xs font-semibold flex items-center gap-1 transition-colors"
                        style={{ color: "var(--brand)" }}
                        onClick={() => toast.info("Abra a página de email marketing para criar campanha de reengajamento.")}
                      >
                        Resgatar<ChevronRight size={11} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
