"use client";
// app/carteira/page.tsx
// Carteira interna em BRL — saldo para recompras sem precisar inserir cartão novamente.
// Funcionalidades: ver saldo, histórico de transações, adicionar créditos via Stripe Checkout.

import { useState, useEffect, Suspense } from "react";
import { Wallet, Plus, RefreshCw, Loader2, CheckCircle2, ArrowUpRight, ArrowDownLeft, Info, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

const PACKAGES = [50, 100, 250, 500, 1000];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CarteiraPageInner() {
  const searchParams = useSearchParams();
  const justFunded   = searchParams?.get("funded") === "true";

  const [balance,       setBalance]       = useState(0);
  const [totalCredited, setTotalCredited] = useState(0);
  const [totalDebited,  setTotalDebited]  = useState(0);
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [addingFunds,   setAddingFunds]   = useState(false);
  const [customAmount,  setCustomAmount]  = useState("");
  const [showCustom,    setShowCustom]    = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadWallet = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/wallet");
      const data = await res.json();
      setBalance(data.balance       ?? 0);
      setTotalCredited(data.total_credited ?? 0);
      setTotalDebited(data.total_debited   ?? 0);
      setTransactions(data.transactions    ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadWallet();
    if (justFunded) showToast("Saldo adicionado com sucesso!");
  }, []);

  const addFunds = async (amount: number) => {
    if (amount < 10 || amount > 5000) {
      showToast("Valor deve ser entre R$ 10 e R$ 5.000", "err");
      return;
    }
    setAddingFunds(true);
    try {
      const res  = await fetch("/api/wallet/add-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Erro ao processar", "err"); return; }
      window.location.href = data.checkoutUrl;
    } catch { showToast("Erro de conexão", "err"); }
    finally { setAddingFunds(false); }
  };

  const txIcon = (type: string) => {
    if (type === "credit" || type === "cashback" || type === "refund_credit") {
      return <ArrowDownLeft size={14} className="text-emerald-400" />;
    }
    return <ArrowUpRight size={14} className="text-red-400" />;
  };
  const txColor = (type: string) =>
    (type === "credit" || type === "cashback" || type === "refund_credit") ? "text-emerald-400" : "text-red-400";
  const txSign  = (type: string) =>
    (type === "credit" || type === "cashback" || type === "refund_credit") ? "+" : "-";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium
          ${toast.type === "ok" ? "bg-emerald-950 border-emerald-500/40 text-emerald-300" : "bg-red-950 border-red-500/40 text-red-300"}`}>
          {toast.type === "ok" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Wallet size={22} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Minha Carteira</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Saldo em BRL para compras na plataforma</p>
            </div>
          </div>
          <button onClick={loadWallet} disabled={loading}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-xl hover:bg-white/[0.04]">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Saldo principal */}
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-transparent p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500"><Loader2 size={18} className="animate-spin" /> Carregando...</div>
          ) : (
            <>
              <p className="text-sm text-zinc-400 mb-1">Saldo disponível</p>
              <p className="text-4xl font-bold tracking-tight text-zinc-50">{fmtBRL(balance)}</p>
              <div className="flex gap-4 mt-4 pt-4 border-t border-white/5 text-xs text-zinc-500">
                <div>
                  <span className="text-emerald-400 font-semibold">{fmtBRL(totalCredited)}</span>
                  <span className="ml-1">creditados no total</span>
                </div>
                <div>
                  <span className="text-red-400 font-semibold">{fmtBRL(totalDebited)}</span>
                  <span className="ml-1">utilizados no total</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Adicionar créditos */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-violet-400" />
            <h2 className="text-base font-semibold text-zinc-200">Adicionar Créditos</h2>
          </div>

          <div className="flex gap-2 flex-wrap">
            {PACKAGES.map((pkg) => (
              <button key={pkg}
                onClick={() => addFunds(pkg)}
                disabled={addingFunds}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 hover:border-violet-500/40 hover:bg-violet-500/[0.05] hover:text-violet-300 transition-all disabled:opacity-50">
                {fmtBRL(pkg)}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="px-4 py-2.5 rounded-xl border border-dashed border-white/10 text-sm text-zinc-500 hover:border-white/20 hover:text-zinc-400 transition-all">
              Outro valor
            </button>
          </div>

          {showCustom && (
            <div className="flex gap-2">
              <div className="flex items-center gap-2 flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5">
                <span className="text-zinc-500 text-sm">R$</span>
                <input
                  type="number" min="10" max="5000" step="10"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="ex: 150"
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none" />
              </div>
              <button
                onClick={() => addFunds(parseFloat(customAmount))}
                disabled={addingFunds || !customAmount || parseFloat(customAmount) < 10}
                className="px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
                {addingFunds ? <Loader2 size={14} className="animate-spin" /> : "Adicionar"}
              </button>
            </div>
          )}

          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-3 flex gap-2">
            <Info size={13} className="text-zinc-600 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-600">
              Créditos não expiram e podem ser usados em qualquer compra na plataforma.
              Recargas processadas via Stripe — pagamento seguro com cartão de crédito ou PIX.
              <strong className="text-zinc-500"> Saldo não é reembolsável.</strong>
            </p>
          </div>
        </div>

        {/* Como usar */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Como usar a carteira</p>
          <div className="space-y-1.5 text-xs text-zinc-500">
            {[
              "No checkout, selecione 'Usar saldo da carteira' antes de pagar",
              "Se o saldo cobrir o valor total, a compra é concluída sem inserir cartão",
              "Se o saldo for insuficiente, o restante é cobrado normalmente no Stripe",
              "Cashbacks e reembolsos de cancelamento dentro do prazo são creditados aqui",
            ].map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] text-violet-400 font-bold">{i + 1}</span>
                </div>
                <p>{tip}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Histórico */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-base font-semibold text-zinc-200 mb-4">Histórico ({transactions.length})</h2>
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 size={18} className="animate-spin" /> Carregando...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-zinc-600 text-sm">
              Nenhuma transação ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/20">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                    ${tx.type === "credit" || tx.type === "cashback" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    {txIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{tx.description}</p>
                    <p className="text-xs text-zinc-600">{fmtDate(tx.created_at)}</p>
                  </div>
                  <span className={`text-sm font-semibold ${txColor(tx.type)}`}>
                    {txSign(tx.type)}{fmtBRL(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CarteiraPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <CarteiraPageInner />
    </Suspense>
  );
}
