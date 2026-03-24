"use client";
// app/(dashboards)/buyer/pedidos/page.tsx — Pedidos do comprador premium
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Receipt, CheckCircle2, Clock, XCircle,
  RefreshCw, Search, ExternalLink, Download, Package,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

interface Order {
  id: string;
  created_at: string;
  status: string;
  amount_gross: number;
  currency: string;
  saas_products: {
    id: string;
    name: string;
    logo_url?: string;
    slug?: string;
  } | null;
  stripe_invoice_id?: string;
}

interface StatusConfig {
  label: string;
  icon: ComponentType<{ size?: number | string }>; 
  cls: string;
}

const STATUS_CFG: Record<string, StatusConfig> = {
  paid:     { label: "Pago",        icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  pending:  { label: "Pendente",    icon: Clock,        cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  refunded: { label: "Reembolsado", icon: RefreshCw,    cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  failed:   { label: "Falhou",      icon: XCircle,      cls: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

const fmt = (v: number, currency = "brl") =>
  currency === "brl"
    ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function BuyerPedidosPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("orders")
        .select("id,created_at,status,amount_gross,currency,saas_products(id,name,logo_url,slug),stripe_invoice_id")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });
      setOrders((data ?? []) as unknown as Order[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => orders.filter(o => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchSearch = !search || (o.saas_products?.name?.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  }), [orders, search, statusFilter]);

  const totalPaid = orders.filter(o => o.status === "paid").reduce((s, o) => s + Number(o.amount_gross ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-1">Meus Pedidos</h1>
          <p className="text-zinc-600 text-sm">Histórico completo de compras e pagamentos.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-right shrink-0">
          <p className="text-zinc-600 text-[10px] uppercase tracking-wider">Total investido</p>
          <p className="text-emerald-400 font-black text-lg tracking-tight">{fmt(totalPaid)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por produto..."
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700" />
        </div>
        <div className="flex gap-1.5">
          {["all", "paid", "pending", "refunded"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${statusFilter === s
                ? s === "all" ? "bg-white text-zinc-950 border-transparent" : STATUS_CFG[s]?.cls ?? ""
                : "border-white/[0.07] text-zinc-600 hover:text-zinc-300"}`}>
              {s === "all" ? "Todos" : STATUS_CFG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-700">
          <Loader2 size={18} className="animate-spin mr-2" />Carregando pedidos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-zinc-700 text-center">
          <Receipt size={28} className="mb-3 opacity-30" />
          <p className="text-sm">{search || statusFilter !== "all" ? "Nenhum pedido com esses filtros." : "Você ainda não fez nenhum pedido."}</p>
          {!search && statusFilter === "all" && (
            <Link href="/explorar" className="text-emerald-500 text-sm hover:underline mt-2">Explorar produtos →</Link>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] px-5 py-3 bg-zinc-900/60 border-b border-white/[0.07] text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">
            <span>Produto</span><span>Data</span><span className="text-right">Valor</span><span className="text-center">Status</span><span />
          </div>
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((o, i) => {
              const cfg = STATUS_CFG[String(o.status)] ?? STATUS_CFG.pending;
              const StatusIcon = cfg.icon;
              const prod = o.saas_products;
              return (
                <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.025, 0.4) }}
                  className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto] items-center px-5 py-4 hover:bg-white/[0.02] transition-colors gap-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-white/[0.07] overflow-hidden flex items-center justify-center text-zinc-600 text-xs font-bold shrink-0">
                      {prod?.logo_url ? <img src={prod.logo_url} className="w-full h-full object-cover" alt="" /> : prod?.name?.slice(0, 2) ?? <Receipt size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-zinc-100 text-sm font-semibold truncate">{prod?.name ?? "Produto"}</p>
                      <p className="text-zinc-600 text-[10px]">ID: {o.id.slice(0, 8)}…</p>
                    </div>
                  </div>
                  <span className="text-zinc-500 text-xs">{new Date(String(o.created_at ?? "")).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  <span className="text-zinc-100 text-sm font-bold text-right">{fmt(Number(o.amount_gross ?? 0), o.currency)}</span>
                  <div className="flex justify-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cfg.cls}`}>
                      <StatusIcon size={9} />{cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    {prod?.slug && (
                      <Link href={`/produtos/${prod.slug ?? prod.id}`}
                        className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.07] flex items-center justify-center text-zinc-600 hover:text-zinc-200 transition-all" title="Ver produto">
                        <ExternalLink size={11} />
                      </Link>
                    )}
                    <Link href={`/api/reports/order/${o.id}/pdf`} target="_blank"
                      className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.07] flex items-center justify-center text-zinc-600 hover:text-zinc-200 transition-all" title="Baixar recibo">
                      <Download size={11} />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="px-5 py-3 border-t border-white/[0.07] bg-zinc-900/40">
            <p className="text-zinc-700 text-xs">{filtered.length} pedido{filtered.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}
    </div>
  );
}
