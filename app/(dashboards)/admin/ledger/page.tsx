
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, RefreshCw, CheckCircle2, AlertTriangle, DollarSign } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

type LedgerEntry = {
  id: string;
  entry_type: string;
  amount: number;
  currency: string;
  direction: string;
  description?: string;
  stripe_invoice_id?: string;
  reconciled: boolean;
  created_at: string;
  vendor_id?: string;
  affiliate_id?: string;
  user_id?: string;
};

type ReconciliationRun = {
  id: string;
  started_at: string;
  status: string;
  orders_checked: number;
  ledger_entries_ok: number;
  discrepancies_found: number;
  discrepancies_fixed: number;
};

const ENTRY_TYPES: Record<string, { label: string; color: string; dirSign: string }> = {
  sale:                { label: "Venda",        color: "text-emerald-400", dirSign: "+" },
  platform_fee:        { label: "Taxa",         color: "text-red-400",     dirSign: "-" },
  vendor_payout:       { label: "Repasse",      color: "text-blue-400",    dirSign: "+" },
  affiliate_commission:{ label: "Comissão Aff", color: "text-violet-400",  dirSign: "+" },
  refund:              { label: "Reembolso",    color: "text-amber-400",   dirSign: "-" },
  dispute_chargeback:  { label: "Chargeback",   color: "text-red-500",     dirSign: "-" },
  adjustment:          { label: "Ajuste",       color: "text-zinc-400",    dirSign: "±" },
};

const fmtBRL = (v: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function LedgerPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [reconciledFilter, setReconciledFilter] = useState("all");
  const [runningReconcile, setRunningReconcile] = useState(false);
  const [tab, setTab] = useState<"ledger" | "reconciliation">("ledger");

  const loadEntries = async () => {
    setLoading(true);
    let q = supabase
      .from("financial_ledger")
      .select("id, entry_type, amount, currency, direction, description, stripe_invoice_id, reconciled, created_at, vendor_id, affiliate_id, user_id")
      .order("created_at", { ascending: false })
      .limit(300);

    if (typeFilter !== "all") q = q.eq("entry_type", typeFilter);
    if (reconciledFilter === "yes") q = q.eq("reconciled", true);
    if (reconciledFilter === "no") q = q.eq("reconciled", false);

    const { data } = await q;
    setEntries((data ?? []) as LedgerEntry[]);
    setLoading(false);
  };

  const loadRuns = async () => {
    const { data } = await supabase
      .from("reconciliation_runs")
      .select("id, started_at, status, orders_checked, ledger_entries_ok, discrepancies_found, discrepancies_fixed")
      .order("started_at", { ascending: false })
      .limit(20);
    setRuns((data ?? []) as ReconciliationRun[]);
  };

  useEffect(() => { loadEntries(); loadRuns(); }, [typeFilter, reconciledFilter]);

  const exportCSV = () => {
    const keys = ["id","entry_type","direction","amount","currency","description","stripe_invoice_id","reconciled","created_at"];
    const csv = [keys.join(","), ...entries.map(e => keys.map(k => JSON.stringify((e as Record<string, unknown>)[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const runReconcile = async () => {
    setRunningReconcile(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/run-reconcile", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      await loadRuns();
      alert(`Reconciliação concluída:\n• Orders verificados: ${data.orders_reconciliation?.orders_checked ?? 0}\n• Divergências corrigidas: ${data.orders_reconciliation?.discrepancies ?? 0}`);
    } catch (e: unknown) {
      alert(`Erro: ${getErrorMessage(e)}`);
    }
    setRunningReconcile(false);
  };

  // Totais
  const totals = entries.reduce((acc, e) => {
    const key = e.entry_type;
    if (!acc[key]) acc[key] = 0;
    acc[key] += Number(e.amount);
    return acc;
  }, {} as Record<string, number>);

  const grossRevenue = totals.sale || 0;
  const platformFees = totals.platform_fee || 0;
  const vendorPayouts = totals.vendor_payout || 0;
  const affiliateCommissions = totals.affiliate_commission || 0;

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Ledger Financeiro</h1>
          <p className="text-zinc-500 text-sm mt-1">Registro imutável de todas as transações financeiras</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runReconcile} disabled={runningReconcile}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-white/20 transition-all disabled:opacity-60">
            {runningReconcile ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Reconciliar agora
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-white/20 transition-all">
            <Download size={13} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Receita Bruta",    value: grossRevenue,          color: "text-emerald-400" },
          { label: "Taxas Plataforma", value: platformFees,          color: "text-red-400"     },
          { label: "Repasse Vendors",  value: vendorPayouts,         color: "text-blue-400"    },
          { label: "Comissões Afil.",  value: affiliateCommissions,  color: "text-violet-400"  },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className={`font-bold text-lg ${k.color}`}>{fmtBRL(k.value)}</p>
            <p className="text-zinc-600 text-xs mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit">
        {(["ledger", "reconciliation"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
            {t === "ledger" ? "Entradas" : "Reconciliações"}
          </button>
        ))}
      </div>

      {tab === "ledger" && (
        <>
          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none">
              <option value="all">Todos os tipos</option>
              {Object.entries(ENTRY_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select value={reconciledFilter} onChange={e => setReconciledFilter(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none">
              <option value="all">Todos</option>
              <option value="yes">Reconciliados</option>
              <option value="no">Pendentes</option>
            </select>
          </div>

          {/* Tabela */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="hidden md:grid grid-cols-12 px-5 py-3 text-zinc-700 text-[10px] uppercase tracking-widest border-b border-white/5">
              <span className="col-span-2">Tipo</span>
              <span className="col-span-2">Valor</span>
              <span className="col-span-3">Invoice Stripe</span>
              <span className="col-span-3">Descrição</span>
              <span className="col-span-1 text-center">Reconcil.</span>
              <span className="col-span-1 text-right">Data</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-zinc-500 p-8 justify-center">
                <Loader2 size={16} className="animate-spin" /> Carregando...
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-zinc-600">
                <DollarSign size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma entrada no ledger ainda.</p>
              </div>
            ) : entries.map(e => {
              const cfg = ENTRY_TYPES[String(e.entry_type)] ?? { label: e.entry_type, color: "text-zinc-400", dirSign: "?" };
              return (
                <div key={e.id} className="grid grid-cols-12 px-5 py-3 border-b border-white/5 hover:bg-white/[0.01] items-center">
                  <div className="col-span-2">
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-sm font-semibold ${e.direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>
                      {e.direction === "credit" ? "+" : "-"}{fmtBRL(e.amount)}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-zinc-600 text-xs font-mono truncate block">{e.stripe_invoice_id ?? "—"}</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-zinc-500 text-xs truncate block">{e.description ?? "—"}</span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {e.reconciled
                      ? <CheckCircle2 size={13} className="text-emerald-500" />
                      : <AlertTriangle size={13} className="text-amber-500" />
                    }
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-zinc-700 text-xs">{new Date(String(e.created_at ?? "")).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "reconciliation" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h3 className="text-zinc-200 font-semibold text-sm">Histórico de Reconciliações</h3>
          </div>
          {runs.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <RefreshCw size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma reconciliação executada ainda.</p>
              <button onClick={runReconcile} className="mt-3 text-emerald-500 text-sm hover:underline">Executar agora →</button>
            </div>
          ) : runs.map(r => (
            <div key={r.id} className="flex items-center justify-between px-5 py-4 border-b border-white/5 hover:bg-white/[0.01]">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${r.status === "completed" ? "bg-emerald-500" : r.status === "partial" ? "bg-amber-500" : r.status === "failed" ? "bg-red-500" : "bg-blue-500 animate-pulse"}`} />
                  <p className="text-zinc-300 text-sm font-medium capitalize">{r.status}</p>
                </div>
                <p className="text-zinc-600 text-xs mt-0.5">{new Date(String(r.started_at ?? "")).toLocaleString("pt-BR")}</p>
              </div>
              <div className="text-right text-xs">
                <p className="text-zinc-400">{r.orders_checked} orders verificados</p>
                <p className="text-zinc-600">{r.ledger_entries_ok} ok · {r.discrepancies_found} divergências · {r.discrepancies_fixed} corrigidas</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
