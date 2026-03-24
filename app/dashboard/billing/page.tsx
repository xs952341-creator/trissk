"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { CreditCard, Loader2, ExternalLink, AlertCircle } from "lucide-react";

export default function Billing() {
  const supabase = createClient();
  const [loading,   setLoading]   = useState(false);
  const [hasSub,    setHasSub]    = useState<boolean | null>(null);
  const [checking,  setChecking]  = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setChecking(false); return; }
      const { data } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", session.user.id)
        .not("stripe_customer_id", "is", null)
        .limit(1)
        .maybeSingle();
      setHasSub(!!data);
      setChecking(false);
    })();
  }, []);

  async function openPortal() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const res = await fetch("/api/stripe/portal", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        redirect: "manual",
      });

      // O endpoint retorna um redirect — seguimos o Location manualmente
      if (res.type === "opaqueredirect" || res.status === 302 || res.status === 301) {
        window.location.href = "/api/stripe/portal";
        return;
      }

      // Fallback: chamar via window.location para o browser seguir o redirect
      window.location.href = "/api/stripe/portal";
    } catch {
      window.location.href = "/api/stripe/portal";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-5 py-10 space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Faturamento</h1>
          <p className="text-zinc-400">Gerencie assinatura, cartão e pagamentos.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <CreditCard size={18} className="text-zinc-400" />
            </div>
            <div>
              <div className="font-medium text-zinc-100">Portal de Cobrança (Stripe)</div>
              <div className="text-xs text-zinc-500">Gerenciado com segurança pelo Stripe</div>
            </div>
          </div>

          <p className="text-sm text-zinc-400">
            Pelo portal você pode atualizar seu cartão de crédito, cancelar ou trocar de plano,
            e ver o histórico completo de faturas.
          </p>

          {checking ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 size={14} className="animate-spin" /> Verificando assinatura…
            </div>
          ) : !hasSub ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">
                Nenhuma assinatura ativa encontrada. Adquira um produto para acessar o portal de faturamento.
              </p>
            </div>
          ) : (
            <button
              onClick={openPortal}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-white text-black px-5 py-2.5 text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> Abrindo portal…</>
              ) : (
                <><ExternalLink size={14} /> Abrir Portal de Cobrança</>
              )}
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-3">
          <div className="font-medium text-zinc-100 text-sm">Precisa de ajuda?</div>
          <p className="text-sm text-zinc-500">
            Para reembolsos dentro de 7 dias, acesse <strong className="text-zinc-300">Minhas Compras</strong> → selecione o pedido → Solicitar Reembolso.
            Para outros problemas, entre em contato pelo suporte.
          </p>
        </div>
      </div>
    </div>
  );
}
