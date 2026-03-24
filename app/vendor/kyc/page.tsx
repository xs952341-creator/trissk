
"use client";
// app/vendor/kyc/page.tsx
// Onboarding KYC embarcado do Stripe Connect — sem redirect.
// O formulário do Stripe roda dentro do app via Stripe Connect Components.
//
// Pré-requisito: @stripe/connect-js e @stripe/react-connect-js instalados
// npm install @stripe/connect-js @stripe/react-connect-js

import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, CheckCircle2, AlertTriangle, ShieldCheck,
  CreditCard, Zap, ArrowRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

// ─── Import dinâmico para evitar SSR (Stripe Connect exige browser) ──────────
const ConnectComponents = dynamic(
  () => import("./_ConnectComponents"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    ),
  }
);

// ─── Página principal ────────────────────────────────────────────────────────
export default function VendorKYCPage() {
  const supabase = createClient();
  const [loading,  setLoading]  = useState(true);
  const [kycStatus, setKycStatus] = useState<{
    onboarded: boolean;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    account_id: string | null;
  }>({ onboarded: false, charges_enabled: false, payouts_enabled: false, account_id: null });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id, stripe_connect_onboarded, stripe_kyc_enabled, stripe_payouts_enabled")
        .eq("id", session.user.id)
        .single();

      setKycStatus({
        onboarded:       !!(prof as Record<string, unknown>)?.stripe_connect_onboarded,
        charges_enabled: !!(prof as Record<string, unknown>)?.stripe_kyc_enabled,
        payouts_enabled: !!(prof as Record<string, unknown>)?.stripe_payouts_enabled,
        account_id:      ((prof as Record<string, unknown>)?.stripe_connect_account_id as string | null) ?? null,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-zinc-500" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">Verificação KYC</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Identidade e conta bancária para receber seus pagamentos via Stripe Connect
        </p>
      </div>

      {/* Status atual */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          label="Dados enviados"
          ok={kycStatus.onboarded}
          icon={<ShieldCheck size={16} />}
        />
        <StatusCard
          label="Cobranças ativas"
          ok={kycStatus.charges_enabled}
          icon={<CreditCard size={16} />}
        />
        <StatusCard
          label="Saques liberados"
          ok={kycStatus.payouts_enabled}
          icon={<Zap size={16} />}
        />
      </div>

      {/* KYC completo */}
      {kycStatus.charges_enabled && kycStatus.payouts_enabled ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 flex items-start gap-4">
          <CheckCircle2 size={28} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-zinc-100 font-semibold">KYC aprovado! 🎉</h3>
            <p className="text-zinc-400 text-sm mt-1">
              Sua conta está verificada. Você pode receber pagamentos e sacar seus ganhos.
            </p>
            {kycStatus.account_id && (
              <a
                href={`https://dashboard.stripe.com/express/${kycStatus.account_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
              >
                Ver Stripe Dashboard <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Aviso pendente */}
          {kycStatus.onboarded && !kycStatus.charges_enabled && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-zinc-400 text-sm">
                Dados enviados! O Stripe está revisando sua conta. Isso pode levar alguns minutos.
                Você receberá um e-mail quando for aprovado.
              </p>
            </div>
          )}

          {/* Componente embarcado do Stripe */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h3 className="text-zinc-200 font-semibold text-sm">Complete sua verificação</h3>
              <p className="text-zinc-500 text-xs mt-0.5">
                O formulário abaixo é diretamente do Stripe — seus dados são protegidos
              </p>
            </div>
            <div className="p-4">
              <ConnectComponents onComplete={() => {
                toast.success("Verificação concluída! Aguardando aprovação do Stripe.");
                setKycStatus(prev => ({ ...prev, onboarded: true }));
              }} />
            </div>
          </div>
        </>
      )}

      {/* Benefícios */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-zinc-300 font-semibold text-sm mb-4">Por que verificar?</h3>
        <ul className="space-y-2">
          {[
            "Receba pagamentos diretamente na sua conta bancária",
            "Split automático de cada venda (sem esperar repasse manual)",
            "Dashboard Stripe com histórico de transações",
            "Proteção contra disputas e chargebacks",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2 text-zinc-400 text-sm">
              <ArrowRight size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusCard({ label, ok, icon }: { label: string; ok: boolean; icon: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 text-center transition-all
      ${ok
        ? "border-emerald-500/20 bg-emerald-500/5"
        : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className={`flex justify-center mb-1.5 ${ok ? "text-emerald-400" : "text-zinc-600"}`}>
        {icon}
      </div>
      <p className={`text-xs font-medium ${ok ? "text-zinc-300" : "text-zinc-600"}`}>{label}</p>
      <p className={`text-[10px] mt-0.5 ${ok ? "text-emerald-500" : "text-zinc-700"}`}>
        {ok ? "✓ Ativo" : "Pendente"}
      </p>
    </div>
  );
}
