
"use client";
// app/vendor/kyc/_ConnectComponents.tsx
// Componente interno: carrega o Stripe Connect Embedded Onboarding.
// Importado via dynamic() na página principal para evitar SSR.

import { useEffect, useState } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY } from "@/lib/env";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from "@stripe/react-connect-js";
import { Loader2, AlertTriangle } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

interface Props {
  onComplete: () => void;
}

export default function ConnectComponents({ onComplete }: Props) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Buscar client_secret do servidor
        const res = await fetch("/api/stripe/connect/account-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Erro ao iniciar verificação");
        }

        const { client_secret } = await res.json();

        if (!mounted) return;

        // Inicializar Connect com o client_secret
        const publishableKey = NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
        const instance = await loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: async () => client_secret,
          appearance: {
            overlays: "dialog",
            variables: {
              colorPrimary:    "#10b981",
              colorBackground: "#18181b",
              colorText:       "#f4f4f5",
              borderRadius:    "12px",
              fontFamily:      "inherit",
            },
          },
        });

        if (mounted) setStripeConnectInstance(instance);
      } catch (e: unknown) {
        if (mounted) setError(getErrorMessage(e) ?? "Erro inesperado");
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-300 font-medium text-sm">Erro ao carregar verificação</p>
          <p className="text-red-400/70 text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!stripeConnectInstance) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
        <span className="text-zinc-500 text-sm ml-2">Carregando verificação Stripe...</span>
      </div>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      <ConnectAccountOnboarding
        onExit={onComplete}
      />
    </ConnectComponentsProvider>
  );
}
