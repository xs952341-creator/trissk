"use client";
// app/checkout/cancel/page.tsx
// Checkout cancelado — Save Offer: "Fique e ganhe 1 mês grátis"
// Captura motivo do cancelamento e oferece coupon antes de devolver à loja.

import { useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowLeft, Gift, Loader2, ChevronDown, X, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

const REASONS = [
  { value: "too_expensive",  label: "O preço está acima do meu orçamento" },
  { value: "not_sure",       label: "Não tenho certeza se preciso do produto" },
  { value: "just_looking",   label: "Só estava explorando" },
  { value: "competitor",     label: "Encontrei uma alternativa" },
  { value: "need_more_info", label: "Preciso de mais informações" },
  { value: "other",          label: "Outro motivo" },
];

// Motivos que recebem a oferta de 1 mês grátis
const ELIGIBLE_FOR_OFFER = new Set(["too_expensive", "not_sure"]);

function CancelContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const sessionId    = searchParams.get("session_id");

  const [step,     setStep]     = useState<"reason" | "offer" | "done">("reason");
  const [reason,   setReason]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [coupon,   setCoupon]   = useState<string | null>(null);

  const supabase = createClient();

  const handleReason = async () => {
    if (!reason) { toast.error("Selecione um motivo."); return; }
    setLoading(true);

    // Log abandono (best-effort)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.id) {
        await supabase.from("checkout_abandons").insert({
          user_id:    session.user.id,
          reason,
          session_id: sessionId ?? null,
        });
      }
    } catch { /* non-critical */ }

    setLoading(false);

    // Oferecer desconto para motivos elegíveis
    if (ELIGIBLE_FOR_OFFER.has(reason)) {
      setStep("offer");
    } else {
      router.push("/");
    }
  };

  const handleAcceptOffer = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/save-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.couponCode) {
        setCoupon(data.couponCode);
        setStep("done");
        toast.success("Oferta gerada!");
      } else {
        throw new Error(data.error ?? "Erro");
      }
    } catch (err: unknown) {
      toast.error("Erro ao gerar oferta: " + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-amber-500/[0.04] blur-3xl rounded-full" />
      </div>

      <AnimatePresence mode="wait">

        {/* Step 1: Motivo */}
        {step === "reason" && (
          <motion.div key="reason"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative text-center max-w-sm w-full"
          >
            <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center mb-6">
              <AlertTriangle size={36} className="text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-zinc-50 mb-2">O pagamento não foi concluído</h1>
            <p className="text-zinc-500 text-sm mb-6">Nenhuma cobrança foi feita. Pode nos dizer o motivo?</p>

            {/* Selector motivo */}
            <div className="relative mb-4 text-left">
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full appearance-none bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50 transition"
              >
                <option value="" disabled>Selecione um motivo...</option>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>

            <div className="flex gap-3 justify-center">
              <button onClick={() => router.push("/")}
                className="flex items-center gap-1.5 border border-white/10 text-zinc-400 hover:text-zinc-200 rounded-full px-5 py-2.5 text-sm transition-colors">
                <X size={14} /> Pular
              </button>
              <button onClick={handleReason} disabled={loading || !reason}
                className="flex items-center gap-2 bg-amber-500 text-zinc-950 rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40">
                {loading ? <Loader2 size={14} className="animate-spin" /> : "Continuar"}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Save Offer */}
        {step === "offer" && (
          <motion.div key="offer"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative text-center max-w-sm w-full"
          >
            <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mb-6">
              <Gift size={36} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-zinc-50 mb-2">Espera — temos uma oferta para você!</h1>
            <p className="text-zinc-400 text-sm mb-6">
              Entendemos que o preço é um fator importante. Que tal começar com
              <strong className="text-emerald-400"> 1 mês grátis</strong>?<br />
              Sem compromisso — cancele quando quiser.
            </p>

            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 mb-6 text-sm text-zinc-300">
              <p className="text-emerald-400 font-bold text-lg mb-1">1 mês grátis</p>
              <p className="text-zinc-500 text-xs">Coupon aplicado automaticamente no checkout.</p>
            </div>

            <div className="flex gap-3 justify-center">
              <button onClick={() => router.push("/")}
                className="flex items-center gap-1.5 border border-white/10 text-zinc-400 hover:text-zinc-200 rounded-full px-5 py-2.5 text-sm transition-colors">
                Não, obrigado
              </button>
              <button onClick={handleAcceptOffer} disabled={loading}
                className="flex items-center gap-2 bg-emerald-500 text-zinc-950 rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-40">
                {loading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <><Gift size={14} /> Quero meu mês grátis!</>
                }
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Coupon gerado */}
        {step === "done" && coupon && (
          <motion.div key="done"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="relative text-center max-w-sm w-full"
          >
            <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mb-6">
              <CheckCircle2 size={36} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-zinc-50 mb-2">Oferta gerada!</h1>
            <p className="text-zinc-500 text-sm mb-4">Use o código abaixo no checkout:</p>
            <div
              className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-4 mb-6 font-mono text-emerald-400 text-xl tracking-widest cursor-pointer select-all"
              onClick={() => { navigator.clipboard.writeText(coupon); toast.success("Copiado!"); }}
            >
              {coupon}
              <p className="text-zinc-600 text-xs font-sans mt-1 tracking-normal">Clique para copiar</p>
            </div>
            <button onClick={() => router.push("/")}
              className="bg-white text-zinc-950 rounded-full px-6 py-3 text-sm font-semibold hover:bg-zinc-200 transition-colors">
              Voltar à Loja e Usar o Cupom →
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-500" />
      </div>
    }>
      <CancelContent />
    </Suspense>
  );
}
