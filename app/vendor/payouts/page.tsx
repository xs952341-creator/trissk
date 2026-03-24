
"use client";
// app/vendor/payouts/page.tsx
// Dashboard de repasses v18 — saldo real (ledger) + hold breakdown + histórico

import { useEffect, useState } from "react";
import {
  Loader2, DollarSign, Clock, CheckCircle2, AlertCircle, Lock,
  CreditCard, RefreshCw, ArrowRight, Shield,
} from "lucide-react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/errors";

interface BalanceData {
  gross: number; fees: number; affiliate: number;
  refunds: number; chargebacks: number; held: number;
  available: number; updated_at: string;
}
interface HoldEntry  { amount: number; hold_until: string; invoice_id: string; }
interface PayoutRow  { id: string; amount: number; status: string; initiated_at?: string; paid_at?: string; }
interface StripeBalance { available_brl: number; pending_brl: number; currency: string; }
interface StripePayoutRow { status: string; paid_at?: string; initiated_at?: string; arrival_date?: number; amount?: number; }
interface PayloadData {
  connected: boolean; hold_days: number; balance: BalanceData | null;
  hold_entries: HoldEntry[]; stripe_balance: StripeBalance | null;
  payouts: PayoutRow[]; stripe_payouts: StripePayoutRow[];
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  paid:       { label: "Pago",        color: "text-emerald-400" },
  processing: { label: "Processando", color: "text-blue-400"    },
  pending:    { label: "Pendente",    color: "text-amber-400"   },
  in_transit: { label: "Em trânsito", color: "text-blue-400"    },
  failed:     { label: "Falhou",      color: "text-red-400"     },
  canceled:   { label: "Cancelado",   color: "text-zinc-500"    },
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | number) =>
  (typeof d === "number" ? new Date(String(d * 1000)) : new Date(String(d ?? ""))).toLocaleDateString("pt-BR");
const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(String(iso ?? "")).getTime() - Date.now()) / 86400_000));

export default function PayoutsPage() {
  const [data, setData]       = useState<PayloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch("/api/vendor/payout");
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json()); setError(null);
    } catch (e: unknown) { setError(getErrorMessage(e)); }
    setLoading(false); setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-2 text-zinc-500">
      <Loader2 size={18} className="animate-spin" /> Calculando saldo…
    </div>
  );

  if (error || !data) return (
    <div className="p-6 text-center">
      <AlertCircle size={28} className="text-red-400 mx-auto mb-2" />
      <p className="text-zinc-400 text-sm">{error ?? "Erro desconhecido"}</p>
    </div>
  );

  const b = data.balance;
  const nextRelease = [...data.hold_entries].sort(
    (a, c) => new Date(String(a.hold_until ?? "")).getTime() - new Date(String(c.hold_until ?? "")).getTime()
  )[0];

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Saldo & Repasses</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Calculado em tempo real. Hold padrão: {data.hold_days} dias por venda.
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-400 hover:text-zinc-200 transition disabled:opacity-60">
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <div className="flex items-center gap-2 text-emerald-500 mb-3">
            <DollarSign size={18} /><span className="text-sm font-medium">Disponível para Saque</span>
          </div>
          <p className="text-3xl font-bold text-emerald-400">{fmt(b?.available ?? 0)}</p>
          {data.connected
            ? <p className="text-emerald-700 text-xs mt-2">Saque via Stripe Connect</p>
            : <Link href="/vendor/kyc" className="flex items-center gap-1 text-amber-400 text-xs mt-2 hover:underline">
                Configure KYC para sacar <ArrowRight size={10} />
              </Link>
          }
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-center gap-2 text-amber-400 mb-3">
            <Lock size={18} /><span className="text-sm font-medium">Em Hold ({data.hold_days}d)</span>
          </div>
          <p className="text-3xl font-bold text-amber-300">{fmt(b?.held ?? 0)}</p>
          {nextRelease
            ? <p className="text-amber-700 text-xs mt-2">
                Próxima liberação: {daysUntil(nextRelease.hold_until)}d ({fmt(nextRelease.amount)})
              </p>
            : <p className="text-zinc-600 text-xs mt-2">Nenhum valor em hold</p>
          }
        </div>

        <div className={`rounded-2xl border p-6 ${data.stripe_balance ? "border-blue-500/20 bg-blue-500/5" : "border-white/10 bg-white/[0.02]"}`}>
          <div className="flex items-center gap-2 text-zinc-400 mb-3">
            <CreditCard size={18} /><span className="text-sm font-medium">Stripe Connect</span>
          </div>
          {data.stripe_balance
            ? <>
                <p className="text-3xl font-bold text-blue-300">{fmt(data.stripe_balance.available_brl)}</p>
                <p className="text-blue-700 text-xs mt-2">Pendente: {fmt(data.stripe_balance.pending_brl)}</p>
              </>
            : <><p className="text-zinc-600 text-2xl font-bold">—</p><p className="text-zinc-700 text-xs mt-2">KYC não concluído</p></>
          }
        </div>
      </div>

      {/* Breakdown */}
      {b && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-zinc-200 font-semibold text-sm">Composição do Saldo</h3>
            <span className="text-zinc-600 text-xs">Atualizado: {new Date(String(b.updated_at ?? "")).toLocaleString("pt-BR")}</span>
          </div>
          <div className="divide-y divide-white/5">
            {[
              { label: "Vendas brutas",           value: b.gross,       color: "text-emerald-400", sign: "+" },
              { label: "Taxas da plataforma",      value: b.fees,        color: "text-red-400",     sign: "−" },
              { label: "Comissões de afiliados",   value: b.affiliate,   color: "text-violet-400",  sign: "−" },
              { label: "Reembolsos",               value: b.refunds,     color: "text-amber-400",   sign: "−" },
              { label: "Chargebacks",              value: b.chargebacks, color: "text-red-500",     sign: "−" },
              { label: `Hold (${data.hold_days}d)`,value: b.held,        color: "text-amber-500",   sign: "−" },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.01]">
                <span className="text-zinc-400 text-sm">{row.label}</span>
                <span className={`font-semibold text-sm ${row.color}`}>{row.sign} {fmt(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-6 py-4 bg-emerald-500/5 border-t border-emerald-500/20">
              <span className="text-emerald-300 font-semibold">= Disponível</span>
              <span className="text-emerald-400 font-bold text-lg">{fmt(b.available)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Hold entries */}
      {data.hold_entries.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-500/20 flex items-center gap-2">
            <Lock size={14} className="text-amber-400" />
            <h3 className="text-zinc-200 font-semibold text-sm">Próximas Liberações de Hold</h3>
          </div>
          <div className="divide-y divide-amber-500/10">
            {data.hold_entries.slice(0, 6).map((e, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-zinc-200 text-sm font-semibold">{fmt(e.amount)}</p>
                  <p className="text-zinc-600 text-xs font-mono truncate max-w-[200px]">{e.invoice_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 text-sm font-semibold">{daysUntil(e.hold_until)} dias</p>
                  <p className="text-zinc-600 text-xs">{fmtDate(e.hold_until)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de saques */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h3 className="text-zinc-200 font-semibold text-sm">Histórico de Saques</h3>
        </div>
        {[...(data.payouts ?? []), ...(data.stripe_payouts ?? [])].length === 0
          ? <div className="text-center py-10 text-zinc-600">
              <DollarSign size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum saque realizado ainda.</p>
            </div>
          : <div className="divide-y divide-white/5">
              {[...(data.payouts ?? []), ...(data.stripe_payouts ?? [])].map((p: PayoutRow | StripePayoutRow, i) => {
                const cfg = STATUS_CFG[String(p.status) as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                const date = ("paid_at" in p ? p.paid_at : "initiated_at" in p ? p.initiated_at : ("arrival_date" in p && p.arrival_date ? new Date(String(p.arrival_date * 1000)).toISOString() : null));
                return (
                  <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.01]">
                    <div>
                      <p className="text-zinc-200 text-sm font-semibold">{fmt(Number(p.amount))}</p>
                      <p className="text-zinc-600 text-xs">{date ? fmtDate(date as string | number) : "—"}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color} bg-white/5 border border-white/10`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
        <Shield size={16} className="text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-blue-300 text-sm font-medium">Sobre o Período de Hold</p>
          <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
            Cada venda fica retida por {data.hold_days} dias para proteção contra chargebacks.
            O valor é liberado automaticamente após o período e você recebe uma notificação.
            Em caso de disputa, o valor pode ser retido até a resolução.
          </p>
        </div>
      </div>
    </div>
  );
}

