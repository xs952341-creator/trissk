"use client";
// app/checkout/success/page.tsx
// Página de sucesso com one-click upsell REAL (usa PaymentMethod salvo).

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CheckCircle2, X, ArrowRight, Zap, Loader2, ShieldCheck, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY } from "@/lib/env";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

declare global {
  interface Window { fbq?: (...args: unknown[]) => void; ttq?: { track: (...args: unknown[]) => void }; gtag?: (command: string, ...args: (string | Record<string, unknown>)[]) => void }
}

const stripePromise = NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null;

interface UpsellProduct {
  id: string; name: string; description: string; logo_url: string | null; slug: string;
  product_tiers: { id: string; tier_name: string; price_monthly: number; stripe_monthly_price_id: string }[];
}

// ─── Formulário 3DS (quando one-click precisa de autenticação) ───────────────
function Auth3DSForm({ clientSecret, onSuccess, onError }: {
  clientSecret: string; onSuccess: () => void; onError: (m: string) => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy,     setBusy]     = useState(false);
  const [retries,  setRetries]  = useState(0);
  const [errMsg,   setErrMsg]   = useState<string | null>(null);
  const MAX_RETRIES = 2;

  const confirm = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/checkout/success` },
        redirect: "if_required",
      });
      if (error) {
        const isRetriable = error.code === "authentication_required" ||
          error.decline_code === "authentication_required";
        if (isRetriable && retries < MAX_RETRIES) {
          setRetries(r => r + 1);
          setErrMsg("Autenticação necessária. Tente novamente.");
        } else {
          setErrMsg(getErrorMessage(error) ?? "Falha na autenticação");
          onError(getErrorMessage(error) ?? "Falha na autenticação");
        }
      } else if (paymentIntent?.status === "succeeded") {
        onSuccess();
      } else {
        // Pending state — webhook will provision
        onSuccess();
      }
    } catch (e: unknown) {
      setErrMsg(getErrorMessage(e) ?? "Erro inesperado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {retries > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 text-center">
          Tentativa {retries}/{MAX_RETRIES} — Verifique o app do banco para autenticar.
        </div>
      )}
      <PaymentElement options={{ layout: "tabs" }} />
      {errMsg && <p className="text-red-400 text-xs text-center">{errMsg}</p>}
      <button onClick={confirm} disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full py-3 font-semibold disabled:opacity-60 transition-colors">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <><CreditCard size={14} /> {retries > 0 ? "Tentar novamente" : "Confirmar pagamento"}</>}
      </button>
      <button
        onClick={() => onError("Cancelado pelo usuário")}
        className="w-full text-zinc-500 hover:text-zinc-300 text-xs transition"
      >
        Cancelar
      </button>
    </div>
  );
}

// ─── Banner de upsell ────────────────────────────────────────────────────────
function UpsellBanner({
  product, onAccept, onDecline, loading, auth3DSSecret,
}: {
  product: UpsellProduct; onAccept: () => void; onDecline: () => void;
  loading: boolean; auth3DSSecret: string | null;
}) {
  const tier = product.product_tiers?.[0];
  if (!tier) return null;

  const elementsOptions = auth3DSSecret ? {
    clientSecret: auth3DSSecret,
    appearance: { theme: "night" as const, variables: { colorPrimary: "#10b981" } },
  } : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.97 }} transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 22 }}
      className="mt-8 w-full max-w-sm mx-auto rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-4">

      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-semibold">Oferta especial</span>
          <h3 className="text-zinc-100 font-bold mt-0.5">Adicionar com 1 clique</h3>
        </div>
        <button onClick={onDecline} className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
          {product.logo_url
            ? <img src={product.logo_url} alt="" className="h-full w-full object-cover" />
            : <Zap className="m-auto mt-2.5 text-emerald-400" size={16} />}
        </div>
        <div>
          <p className="text-zinc-200 font-semibold text-sm">{product.name}</p>
          <p className="text-zinc-500 text-xs line-clamp-1">{product.description}</p>
        </div>
      </div>

      {/* 3DS flow */}
      {auth3DSSecret && stripePromise ? (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <Auth3DSForm
            clientSecret={auth3DSSecret}
            onSuccess={() => { toast.success("Upsell adicionado!"); onDecline(); }}
            onError={(m) => { toast.error(m); onDecline(); }}
          />
        </Elements>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-400 font-bold text-lg">
              R$ {tier.price_monthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              <span className="text-xs font-normal text-zinc-500">/mês</span>
            </p>
            <p className="text-xs text-zinc-600 flex items-center gap-1">
              <ShieldCheck size={10} className="text-emerald-600" /> Cancele quando quiser
            </p>
          </div>
          <button onClick={onAccept} disabled={loading}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60 transition-colors">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <>Adicionar <ArrowRight size={14} /></>}
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
function SuccessPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const sessionId    = searchParams.get("session_id");
  const [countdown,      setCountdown]      = useState(8);
  const [upsell,         setUpsell]         = useState<UpsellProduct | null>(null);
  const [upsellDone,     setUpsellDone]     = useState(false);
  const [upsellLoading,  setUpsellLoading]  = useState(false);
  const [auth3DSSecret,  setAuth3DSSecret]  = useState<string | null>(null);
  const [userId,         setUserId]         = useState<string | null>(null);

  const supabase = createClient();
  const skipAndRedirect = useCallback(() => router.push("/dashboard"), [router]);

  useEffect(() => {
    // Limpar cookie de afiliado
    document.cookie = "playbook_affiliate_id=; max-age=0; path=/";
    localStorage.removeItem("playbook_affiliate_id");

    // Pixels de conversão
    const amount = parseFloat(searchParams.get("amount") ?? "0");
    window.gtag?.("event", "purchase", { currency: "BRL", value: amount, transaction_id: sessionId ?? undefined });

    // A/B Test: rastrear conversão usando dados salvos no localStorage pelo checkout
    // BUGFIX: useEffect não suporta await direto — usar IIFE assíncrona
    (async () => {
      try {
        const abData = localStorage.getItem("ph_ab_pending");
        if (abData) {
          const { experimentId, variantId, userId: abUserId } = JSON.parse(abData);
          if (experimentId && variantId && abUserId) {
            const { createClient: createSupaClient } = await import("@/lib/supabase/client");
            const abSupa = createSupaClient();
            await abSupa.from("ab_test_events").insert({
              experiment_id: experimentId,
              variant_id:    variantId,
              user_id:       abUserId,
              event:         "conversion",
              metadata:      { session_id: sessionId },
            });
          }
          localStorage.removeItem("ph_ab_pending");
        }
      } catch { /* não crítico */ }
    })();

    // Auth + Upsell
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);

      try {
        const { data: featured } = await supabase.from("saas_products")
          .select(`id,name,description,logo_url,slug,
            product_tiers:product_tiers(id,tier_name,price_monthly,stripe_monthly_price_id)`)
          .eq("status", "active").eq("upsell_eligible", true).limit(5);

        if (featured && featured.length > 0) {
          const { data: owned } = await supabase.from("entitlements")
            .select("product_id").eq("user_id", session.user.id).eq("status", "active");
          const ownedIds = new Set((owned ?? []).map((e) => e.product_id as string));
          const eligible = featured.filter((p: unknown) => {
            const prod = p as UpsellProduct;
            return !ownedIds.has(prod.id) && prod.product_tiers?.length > 0;
          });
          if (eligible.length > 0) setUpsell(eligible[0] as UpsellProduct);
        }
      } catch {}
    })();

    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); skipAndRedirect(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleUpsellAccept = async () => {
    if (!upsell || !userId) return;
    const tier = upsell.product_tiers?.[0];
    if (!tier) return;

    setUpsellLoading(true);
    try {
      const res = await fetch("/api/stripe/one-click-upsell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productTierId: tier.id, priceId: tier.stripe_monthly_price_id }),
      });
      const data = await res.json();

      if (data.ok) {
        toast.success("🎉 Produto adicionado à sua conta!");
        setUpsellDone(true); setUpsell(null);
        return;
      }
      if (data.requiresAction && data.clientSecret) {
        // Mostra formulário 3DS inline
        setAuth3DSSecret(data.clientSecret);
        return;
      }
      if (data.code === "no_payment_method") {
        // Sem cartão salvo → checkout normal
        window.location.href = `/checkout/${upsell.slug}?tier=${tier.id}&billing=monthly`;
        return;
      }
      toast.error(data.error ?? "Não foi possível adicionar o produto.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setUpsellLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-emerald-500/[0.06] blur-3xl rounded-full" />
      </div>

      <div className="relative text-center max-w-md w-full">
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h1 className="text-2xl font-bold text-zinc-50 tracking-tight mb-2">Pagamento aprovado! 🎉</h1>
          <p className="text-zinc-500 text-sm mb-8">Preparando o seu acesso ao Playbook Hub...</p>

          <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mb-4">
            <motion.div className="h-full bg-emerald-500" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 8, ease: "linear" }} />
          </div>
          <p className="text-zinc-600 text-xs mb-6">Redirecionando para o Dashboard em {countdown}s...</p>
          <button onClick={skipAndRedirect} className="bg-white text-zinc-950 rounded-full px-6 py-3 text-sm font-semibold hover:bg-zinc-200 transition-colors">
            Ir para o Dashboard Agora →
          </button>
        </motion.div>

        <AnimatePresence>
          {upsell && !upsellDone && (
            <UpsellBanner
              product={upsell} loading={upsellLoading}
              auth3DSSecret={auth3DSSecret}
              onAccept={handleUpsellAccept}
              onDecline={() => { setUpsellDone(true); setUpsell(null); }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <SuccessPageInner />
    </Suspense>
  );
}
