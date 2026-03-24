"use client";
/**
 * app/checkout/embed/[slug]/page.tsx
 * Página de checkout "limpa" para uso dentro do iframe do widget headless.
 *
 * Características:
 *  - Sem header/footer da plataforma (white-label friendly)
 *  - Carrega dados do produto via Supabase (público, sem auth)
 *  - Redireciona para /login se produto requer auth
 *  - Envia postMessage("PB_CHECKOUT_SUCCESS") ao parent após compra
 *  - Suporta parâmetros: ?tier=ID&ref=AFFILIATE_CODE
 *  - Design minimalista que encaixa em qualquer iframe
 *
 * Segurança:
 *  - Não expõe dados sensíveis via postMessage (apenas tipo + slug)
 *  - iframe sandbox limita o que pode fazer
 */

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { createClient } from "@/lib/supabase/client";
import { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY } from "@/lib/env";
import {
  Loader2, CheckCircle2, ShieldCheck, Lock,
  ArrowRight, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

const stripePromise = NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface Tier {
  id:                      string;
  tier_name:               string;
  price_monthly:           number | null;
  price_lifetime:          number | null;
  stripe_monthly_price_id: string | null;
  stripe_lifetime_price_id: string | null;
  features:                string[];
}

interface Product {
  id:               string;
  name:             string;
  description:      string;
  logo_url?:        string | null;
  product_tiers:    Tier[];
}

// ── Formulário Stripe Elements ──────────────────────────────────────────────
function EmbedPaymentForm({
  clientSecret,
  productName,
  amountBRL,
  onSuccess,
}: {
  clientSecret: string;
  productName:  string;
  amountBRL:    number;
  onSuccess:    () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const { error: stripeErr } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?embed=1`,
      },
      redirect: "if_required",
    });

    if (stripeErr) {
      setError(getErrorMessage(stripeErr) ?? "Erro no pagamento.");
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handlePay} className="space-y-4">
      {/* Resumo */}
      <div
        className="rounded-xl p-4 flex items-center justify-between"
        style={{
          background: "rgba(34,212,160,0.05)",
          border: "1px solid rgba(34,212,160,0.15)",
        }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {productName}
        </p>
        <p className="text-base font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--brand)" }}>
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountBRL)}
        </p>
      </div>

      {/* Stripe Elements */}
      <PaymentElement
        options={{
          layout: "tabs",
          wallets: { applePay: "auto", googlePay: "auto" },
        }}
      />

      {/* Erro */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-xl p-3"
            style={{
              background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.2)",
            }}
            role="alert"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: "#f87171" }} />
            <p className="text-xs" style={{ color: "#fca5a5" }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Segurança */}
      <div className="flex items-center gap-1.5">
        <Lock size={11} style={{ color: "var(--text-faint)" }} />
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Pagamento processado com segurança via Stripe
        </p>
      </div>

      <button
        type="submit"
        disabled={loading || !stripe}
        className="btn-primary w-full py-3.5 text-sm gap-2"
        aria-label="Confirmar pagamento"
      >
        {loading ? (
          <><Loader2 size={15} className="animate-spin" />Processando…</>
        ) : (
          <><ShieldCheck size={15} />Pagar com Segurança</>
        )}
      </button>
    </form>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
function EmbedCheckoutContent() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const slug         = params?.slug as string;
  const tierId       = searchParams?.get("tier");

  const supabase = createClient();
  const [product,       setProduct]       = useState<Product | null>(null);
  const [selectedTier,  setSelectedTier]  = useState<Tier | null>(null);
  const [clientSecret,  setClientSecret]  = useState<string | null>(null);
  const [loadingData,   setLoadingData]   = useState(true);
  const [loadingPI,     setLoadingPI]     = useState(false);
  const [success,       setSuccess]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // ── Carregar produto ─────────────────────────────────────────────────────
  const loadProduct = useCallback(async () => {
    if (!slug) return;
    setLoadingData(true);

    const { data, error: err } = await supabase
      .from("saas_products")
      .select(`
        id, name, description, logo_url,
        product_tiers (
          id, tier_name,
          price_monthly, price_lifetime,
          stripe_monthly_price_id, stripe_lifetime_price_id,
          features
        )
      `)
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (err || !data) {
      setError("Produto não encontrado ou indisponível.");
      setLoadingData(false);
      return;
    }

    setProduct(data as Product);

    // Selecionar tier: parâmetro URL > primeiro tier
    const tiers = Array.isArray(data?.product_tiers) ? data.product_tiers : [];
    const initialTier = tierId
      ? tiers.find((t: Tier) => t.id === tierId) ?? tiers[0]
      : tiers[0];

    setSelectedTier(initialTier ?? null);
    setLoadingData(false);
  }, [slug, tierId]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  // ── Criar PaymentIntent quando tier selecionado ─────────────────────────
  const createPI = useCallback(async (tier: Tier) => {
    if (!tier.stripe_monthly_price_id) return;
    setLoadingPI(true);
    setClientSecret(null);
    setError(null);

    try {
      const res = await fetch("/api/stripe/payment-intent", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          priceId:       tier.stripe_monthly_price_id,
          productTierId: tier.id,
          type:          "subscription",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Produto requer login
        if (res.status === 401) {
          window.location.href = `/login?next=/checkout/embed/${slug}?tier=${tier.id}`;
          return;
        }
        setError(data.error ?? "Erro ao preparar pagamento.");
        return;
      }

      setClientSecret(data.clientSecret);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoadingPI(false);
    }
  }, [slug]);

  useEffect(() => {
    if (selectedTier) createPI(selectedTier);
  }, [selectedTier, createPI]);

  // ── Sucesso ─────────────────────────────────────────────────────────────
  const handleSuccess = () => {
    setSuccess(true);
    // Notificar parent window (fecha o modal automaticamente)
    try {
      window.parent.postMessage({ type: "PB_CHECKOUT_SUCCESS", slug }, "*");
    } catch {}
  };

  // ── Loading inicial ─────────────────────────────────────────────────────
  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: "var(--surface-0)" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--brand)" }} />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center" style={{ background: "var(--surface-0)" }}>
        <AlertCircle size={32} style={{ color: "#f87171" }} className="mb-3" />
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Produto não encontrado</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  // ── Sucesso ─────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center" style={{ background: "var(--surface-0)" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(34,212,160,0.1)", border: "2px solid var(--brand)" }}>
            <CheckCircle2 size={36} style={{ color: "var(--brand)" }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Compra Concluída!
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            O seu acesso foi ativado. Verifique o email para os detalhes.
          </p>
        </motion.div>
      </div>
    );
  }

  const price = selectedTier?.price_monthly ?? selectedTier?.price_lifetime ?? 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--surface-0)" }}>
      {/* Header minimalista */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {product?.logo_url ? (
          <img src={product.logo_url} alt={product.name} className="h-7 object-contain" />
        ) : (
          <p className="text-sm font-bold truncate max-w-[200px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            {product?.name}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} style={{ color: "var(--brand)" }} />
          <span className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>
            Ambiente Seguro
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Tier selector (se houver múltiplos) */}
        {(product?.product_tiers?.length ?? 0) > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Escolha o plano
            </p>
            <div className="grid gap-2">
              {product?.product_tiers.map(t => {
                const isSelected = selectedTier?.id === t.id;
                const tierPrice  = t.price_monthly ?? t.price_lifetime ?? 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTier(t)}
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all"
                    style={{
                      background: isSelected ? "rgba(34,212,160,0.08)" : "var(--surface-2)",
                      border: `1px solid ${isSelected ? "rgba(34,212,160,0.3)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                        {t.tier_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: isSelected ? "var(--brand)" : "var(--text-secondary)", fontFamily: "var(--font-display)" }}>
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(tierPrice)}
                        {t.price_monthly ? <span className="text-xs font-normal opacity-60">/mês</span> : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Formulário de pagamento */}
        {loadingPI ? (
          <div className="flex items-center justify-center py-12 gap-3" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Preparando pagamento…</span>
          </div>
        ) : clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary:      "#22d4a0",
                  colorBackground:   "#141b22",
                  colorText:         "#f0f4f8",
                  colorDanger:       "#f87171",
                  fontFamily:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  borderRadius:      "12px",
                  spacingUnit:       "4px",
                },
              },
            }}
          >
            <EmbedPaymentForm
              clientSecret={clientSecret}
              productName={product?.name ?? ""}
              amountBRL={price}
              onSuccess={handleSuccess}
            />
          </Elements>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl p-4" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)" }}>
            <AlertCircle size={15} style={{ color: "#f87171" }} />
            <p className="text-xs" style={{ color: "#fca5a5" }}>{error}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function EmbedCheckoutPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--surface-0)" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    }>
      <EmbedCheckoutContent />
    </Suspense>
  );
}
