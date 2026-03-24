"use client";
/**
 * VendorSalesPage v2 — Padrão Apple/Stripe
 * Tabela responsiva (vira cards no mobile via responsive-table),
 * skeleton loaders, insights proativos, exportação CSV, filtros acessíveis.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import ProactiveInsights, { buildInsights } from "@/components/ui/ProactiveInsights";
import {
  TrendingUp, DollarSign, Package, Search,
  CheckCircle2, Clock, XCircle, RefreshCw, Download,
  BarChart2, Users, ArrowUpRight, Zap,
} from "lucide-react";
import type { ComponentType } from "react";

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Order {
  id: string;
  created_at: string;
  status: string;
  amount_gross: number;
  currency: string;
  saas_products: { name: string; logo_url?: string } | null;
  profiles?: { full_name?: string; email?: string } | null;
}

interface StatusConfig {
  label: string;
  icon: ComponentType<{ size?: number | string }>;
  cls: string;
}

const STATUS_CFG: Record<string, StatusConfig> = {
  paid:     { label: "Pago",        icon: CheckCircle2, cls: "badge-emerald" },
  pending:  { label: "Pendente",    icon: Clock,        cls: "badge-amber" },
  refunded: { label: "Reembolsado", icon: RefreshCw,    cls: "badge-sky" },
  failed:   { label: "Falhou",      icon: XCircle,      cls: "badge-rose" },
};

const fmt = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SalesTableSkeleton() {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="skeleton h-4 w-28 rounded" />
      </div>
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] items-center px-5 py-4 gap-4 animate-pulse"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="skeleton h-3 w-20 rounded" />
          <div className="flex items-center gap-2.5">
            <div className="skeleton w-7 h-7 rounded-lg flex-shrink-0" />
            <div className="skeleton h-3 w-28 rounded" />
          </div>
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-4 w-16 rounded ml-auto" />
          <div className="skeleton h-5 w-16 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent }: { icon: ComponentType<{ size?: number | string; style?: React.CSSProperties }>; label: string; value: string; accent: string }) {
  const colors: Record<string, { bg: string; icon: string }> = {
    brand:  { bg: "rgba(34,212,160,0.08)",  icon: "var(--brand)" },
    violet: { bg: "rgba(139,92,246,0.08)",  icon: "#a78bfa" },
    sky:    { bg: "rgba(56,189,248,0.08)",  icon: "#7dd3fc" },
    zinc:   { bg: "rgba(255,255,255,0.05)", icon: "var(--text-muted)" },
  };
  const c = colors[accent] ?? colors.zinc;
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: c.bg }}>
          <Icon size={14} style={{ color: c.icon }} />
        </div>
      </div>
      <p className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────
export default function VendorSalesPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let q = supabase
        .from("orders")
        .select("id,created_at,status,amount_gross,currency,saas_products(name,logo_url),profiles!user_id(full_name,email)")
        .eq("vendor_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (period !== "all") {
        const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
        q = q.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as Order[]);
    } catch {
      toast.error("Não foi possível carregar as vendas.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = useMemo(() => rows.filter(r => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const name = (r.saas_products?.name?.toLowerCase() ?? "");
    const buyer = r.profiles as { full_name?: string; email?: string } | null;
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      buyer?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      buyer?.email?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }), [rows, search, statusFilter]);

  const paid = rows.filter(r => r.status === "paid");
  const revenue = paid.reduce((s, r) => s + Number(r.amount_gross ?? 0), 0);
  const avgTicket = paid.length ? revenue / paid.length : 0;

  // Insights proativos baseados em dados reais
  const insights = buildInsights({
    conversionDrop: paid.length > 5 ? 0 : 0, // real: comparar com período anterior
    abandonedCarts: 0, // real: buscar da tabela checkout_sessions
    pendingPayouts: 0, // real: buscar da tabela vendor_balance
  });

  const exportCSV = useCallback(() => {
    const header = "Data,Produto,Comprador,Email,Valor (BRL),Status\n";
    const body = filtered.map(r => {
      const buyer = r.profiles as unknown;
      const buyerName = (buyer as { full_name?: string; email?: string } | null)?.full_name ?? "";
      const buyerEmail = (buyer as { full_name?: string; email?: string } | null)?.email ?? "";
      const date = new Date(String(r.created_at ?? "")).toLocaleDateString("pt-BR");
      return `"${date}","${(r.saas_products?.name ?? "")}","${buyerName}","${buyerEmail}","${Number(r.amount_gross ?? 0).toFixed(2)}","${r.status}"`;
    }).join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendas-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  }, [filtered]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <h1
            className="text-2xl font-bold tracking-tight mb-1"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Vendas
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Histórico completo de pedidos e receita.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div
            className="flex rounded-xl p-0.5 gap-0.5"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
          >
            {(["7d", "30d", "90d", "all"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                style={period === p
                  ? { background: "var(--text-primary)", color: "var(--surface-0)" }
                  : { color: "var(--text-muted)" }
                }
                aria-pressed={period === p}
              >
                {p === "all" ? "Tudo" : p}
              </button>
            ))}
          </div>

          {/* Export */}
          <button
            onClick={exportCSV}
            className="btn-secondary px-3 py-2"
            title="Exportar CSV"
            aria-label="Exportar CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline text-xs">Exportar</span>
          </button>
        </div>
      </div>

      {/* Insights proativos */}
      {insights.length > 0 && <ProactiveInsights insights={insights} />}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatCard icon={DollarSign} label="Receita"       value={fmt(revenue)}          accent="brand" />
        <StatCard icon={Package}    label="Vendas pagas"  value={String(paid.length)}   accent="violet" />
        <StatCard icon={BarChart2}  label="Ticket médio"  value={fmt(avgTicket)}        accent="sky" />
        <StatCard icon={TrendingUp} label="Total pedidos" value={String(rows.length)}   accent="zinc" />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por produto ou comprador..."
            className="input-base pl-9"
            aria-label="Buscar vendas"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "paid", "pending", "refunded", "failed"] as const).map(s => {
            const cfg = STATUS_CFG[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-200"
                style={statusFilter === s
                  ? s === "all"
                    ? { background: "var(--text-primary)", color: "var(--surface-0)", borderColor: "transparent" }
                    : { background: s === "paid" ? "rgba(34,212,160,0.12)" : s === "failed" ? "rgba(251,113,133,0.12)" : "rgba(255,255,255,0.06)", color: "var(--text-primary)", borderColor: "transparent" }
                  : { color: "var(--text-muted)", borderColor: "var(--border-subtle)", background: "transparent" }
                }
                aria-pressed={statusFilter === s}
              >
                {s === "all" ? "Todos" : cfg?.label ?? s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabela / Skeleton / Vazio */}
      <AnimatePresence mode="wait">
        {loading ? (
          <SalesTableSkeleton />
        ) : filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-20 text-center"
          >
            <div
              className="w-14 h-14 rounded-3xl flex items-center justify-center mb-4"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            >
              <Package size={22} style={{ color: "var(--text-faint)" }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}>
              {search || statusFilter !== "all" ? "Nenhum resultado" : "Sem vendas nesse período"}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {search || statusFilter !== "all" ? "Tente outros filtros." : "Compartilhe seu link de vendas para começar!"}
            </p>
          </motion.div>
        ) : (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Desktop table */}
            <div className="rounded-2xl border overflow-hidden hidden sm:block" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
              {/* Thead */}
              <div
                className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] px-5 py-3 text-[10px] uppercase tracking-widest font-semibold"
                style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
              >
                <span>Data</span>
                <span>Produto</span>
                <span>Comprador</span>
                <span className="text-right">Valor</span>
                <span className="text-right">Status</span>
              </div>

              {/* Rows */}
              <div>
                {filtered.map((r, i) => {
                  const StatusIcon = STATUS_CFG[r.status]?.icon ?? Clock;
                  const buyer = r.profiles as unknown;
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.25) }}
                      className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] items-center px-5 py-3.5 transition-colors duration-150"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(String(r.created_at ?? "")).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>

                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center text-[9px] font-bold shrink-0"
                          style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                        >
                          {r.saas_products?.logo_url
                            ? <img src={r.saas_products.logo_url} className="w-full h-full object-cover" alt="" />
                            : r.saas_products?.name?.slice(0, 2) ?? "?"}
                        </div>
                        <span className="text-xs font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                          {r.saas_products?.name ?? "—"}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                          {(r.profiles as { full_name?: string; email?: string } | null)?.full_name || (r.profiles as { full_name?: string; email?: string } | null)?.email || "—"}
                        </p>
                        {r.profiles?.full_name && r.profiles?.email && (
                          <p className="text-[10px] truncate" style={{ color: "var(--text-faint)" }}>{(r.profiles as { full_name?: string; email?: string } | null)?.email}</p>
                        )}
                      </div>

                      <span className="text-sm font-bold text-right" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                        {fmt(Number(r.amount_gross ?? 0))}
                      </span>

                      <div className="flex justify-end">
                        <span className={`${STATUS_CFG[r.status]?.cls ?? "badge"} flex items-center gap-1`}>
                          <StatusIcon size={9} />
                          {STATUS_CFG[r.status]?.label ?? r.status}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Footer */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Total filtrado: {fmt(filtered.filter(r => r.status === "paid").reduce((s, r) => s + Number(r.amount_gross ?? 0), 0))}
                </p>
              </div>
            </div>

            {/* Mobile — cards responsivos */}
            <div className="sm:hidden space-y-3">
              {filtered.map((r, i) => {
                const StatusIcon = STATUS_CFG[r.status]?.icon ?? Clock;
                const buyer = r.profiles as unknown;
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                    className="card p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                        >
                          {r.saas_products?.logo_url
                            ? <img src={r.saas_products.logo_url} className="w-full h-full object-cover" alt="" />
                            : r.saas_products?.name?.slice(0, 2) ?? "?"}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {r.saas_products?.name ?? "—"}
                          </p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {new Date(String(r.created_at ?? "")).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <span className={`${STATUS_CFG[r.status]?.cls ?? "badge"} flex items-center gap-1`}>
                        <StatusIcon size={9} />{STATUS_CFG[r.status]?.label ?? r.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {(r.profiles as { full_name?: string; email?: string } | null)?.full_name || (r.profiles as { full_name?: string; email?: string } | null)?.email || "—"}
                      </span>
                      <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                        {fmt(Number(r.amount_gross ?? 0))}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
