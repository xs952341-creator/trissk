"use client";
// app/checkout/[slug]/page.tsx
// Checkout multi-step: Resumo → Cupom + Pontos → Pagamento (Stripe Elements inline)
// 100% no domínio — sem redirect para Stripe Hosted Page.

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { createClient } from "@/lib/supabase/client";
import { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY } from "@/lib/env";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, Tag, X,
  ShieldCheck, Zap, Lock, CreditCard, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { type Currency, CURRENCY_CONFIG, formatCurrency, getPriceForCurrency, isCurrencyAvailable, fetchExchangeRates, getDynamicPrice } from "@/lib/currency";
import B2BInvoiceForm from "@/components/checkout/B2BInvoiceForm";
import { getErrorMessage } from "@/lib/errors";

// Inicializado fora do componente para não recriar a cada render
const stripePromise = NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Tier {
  id: string; tier_name: string;
  price_monthly: number | null; price_annual: number | null; price_lifetime: number | null;
  stripe_monthly_price_id: string | null; stripe_annual_price_id: string | null; stripe_lifetime_price_id: string | null;
  // Multi-currency
  price_usd_monthly: number | null; price_usd_lifetime: number | null;
  price_eur_monthly: number | null; price_eur_lifetime: number | null;
  stripe_usd_monthly_price_id: string | null; stripe_usd_lifetime_price_id: string | null;
  stripe_eur_monthly_price_id: string | null; stripe_eur_lifetime_price_id: string | null;
  features: string[]; is_popular: boolean;
}

interface ProfileRow {
  id?: string;
  full_name: string;
  avatar_url?: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  description: string;
  logo_url?: string | null;
  profiles?: ProfileRow | ProfileRow[] | null;
  product_tiers?: Tier[] | null;
}

type BillingCycle = "monthly" | "annual" | "lifetime";
type Step = "summary" | "discount" | "payment";

const STEPS: Step[] = ["summary", "discount", "payment"];
const STEP_LABEL: Record<Step, string> = { summary: "Resumo", discount: "Desconto", payment: "Pagamento" };

// ─── Indicador de Steps ─────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
            ${i < idx ? "bg-emerald-500 text-zinc-950" : i === idx ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-500"}`}>
            {i < idx ? <CheckCircle2 size={14} /> : i + 1}
          </div>
          <span className={`text-xs ${i === idx ? "text-zinc-100" : "text-zinc-600"}`}>{STEP_LABEL[s]}</span>
          {i < STEPS.length - 1 && <div className={`w-8 h-px ${i < idx ? "bg-emerald-500" : "bg-zinc-800"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── Componente Principal ───────────────────────────────────────────────────
export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    }>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const tierId = searchParams?.get("tier") ?? undefined;
  const affiliateCode = searchParams?.get("ref") ?? undefined;

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>("brl" as Currency);
  const [step, setStep] = useState<Step>("summary");
  const [couponCode, setCouponCode] = useState("");
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [userPoints, setUserPoints] = useState(0);
  const [discount, setDiscount] = useState({ type: "percentage" as const, value: 0 });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showB2BForm, setShowB2BForm] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  // ─── Carregar Produto ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("saas_products")
          .select("id,name,description,logo_url,profiles(full_name,avatar_url),product_tiers(*)")
          .eq("slug", slug)
          .single();

        if (error || !data) {
          toast.error("Produto não encontrado");
          return;
        }

        setProduct(data);

        // Selecionar tier se especificado
        if (tierId && data.product_tiers) {
          const tier = data.product_tiers.find((t: Tier) => t.id === tierId);
          if (tier) setSelectedTier(tier);
        } else if (data.product_tiers?.length) {
          setSelectedTier(data.product_tiers[0]);
        }

        // Carregar pontos do usuário
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: points } = await supabase
            .from("user_points")
            .select("points")
            .eq("user_id", user.id)
            .single();
          setUserPoints(points?.points ?? 0);
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, tierId, supabase]);

  // ─── Câmbio ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (currency as string === "brl") return;

    (async () => {
      try {
        const rates = await fetchExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        console.error("Erro ao buscar taxas de câmbio:", err);
        toast.error("Não foi possível carregar taxas de câmbio");
      }
    })();
  }, [currency]);

  // ─── Calcular Preço ─────────────────────────────────────────────────────────
  const calculatePrice = useCallback(() => {
    if (!selectedTier) return { base: 0, final: 0, currency: currency as string };

    let base = 0;
    switch (billing) {
      case "monthly":
        base = getDynamicPrice(selectedTier, (currency as string).toUpperCase() as Currency, "monthly", exchangeRates).price;
        break;
      case "annual":
        base = getDynamicPrice(selectedTier, (currency as string).toUpperCase() as Currency, "annual", exchangeRates).price;
        break;
      case "lifetime":
        base = getDynamicPrice(selectedTier, (currency as string).toUpperCase() as Currency, "lifetime", exchangeRates).price;
        break;
    }

    // Aplicar desconto
    let discountAmount = 0;
    if (discount.type === "percentage") {
      discountAmount = base * (discount.value / 100);
    } else {
      discountAmount = discount.value;
    }

    // Aplicar pontos (1 ponto = R$ 0,10)
    const pointsValue = Math.min(pointsToRedeem, userPoints) * 0.1;
    
    const final = Math.max(0, base - discountAmount - pointsValue);

    return { base, final, currency };
  }, [selectedTier, billing, currency, discount, pointsToRedeem, userPoints, exchangeRates]);

  const price = calculatePrice();

  // ─── Aplicar Cupom ─────────────────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Digite um código de cupom");
      return;
    }

    try {
      const response = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, tier_id: selectedTier?.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setDiscount({ type: data.type, value: data.value });
      toast.success(`Cupom aplicado: ${data.type === "percentage" ? `${data.value}%` : formatCurrency(data.value, currency)}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Cupom inválido"));
    }
  };

  // ─── Criar Payment Intent ───────────────────────────────────────────────────
  const createPaymentIntent = async () => {
    if (!selectedTier || price.final <= 0) return;

    setProcessing(true);
    try {
      const response = await fetch("/api/stripe/checkout-intl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTierId: selectedTier.id,
          currency: currency.toUpperCase(),
          billing,
          vendorId: product?.profiles && Array.isArray(product.profiles) ? (product.profiles[0] as ProfileRow)?.id : (product?.profiles as ProfileRow)?.id,
          affiliateCode,
          pointsRedeemed: Math.min(pointsToRedeem, userPoints),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setClientSecret(data.client_secret);
      setStep("payment");
    } catch (err) {
      toast.error(getErrorMessage(err, "Erro ao processar pagamento"));
    } finally {
      setProcessing(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (!product || !selectedTier) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Produto não encontrado</h1>
          <p className="text-zinc-400 mb-4">Verifique o URL e tente novamente.</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-emerald-500 text-zinc-950 rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors mb-4"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
          
          <div className="flex items-start gap-4">
            {product.logo_url && (
              <img src={product.logo_url} alt={product.name} className="w-16 h-16 rounded-xl object-cover" />
            )}
            <div>
              <h1 className="text-3xl font-bold text-zinc-100 mb-2">{product.name}</h1>
              <p className="text-zinc-400">{product.description}</p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator step={step} />

        {/* Content */}
        <AnimatePresence mode="wait">
          {step === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Plan Selection */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Escolha seu plano</h2>
                <div className="grid gap-4">
                  {product.product_tiers?.map((tier) => (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedTier(tier)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        selectedTier?.id === tier.id
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-zinc-100">{tier.tier_name}</h3>
                          {tier.is_popular && (
                            <span className="inline-block px-2 py-1 bg-emerald-500 text-zinc-950 text-xs font-semibold rounded-full mt-1">
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-zinc-100">
                            {formatCurrency(getDynamicPrice(tier, (currency as string).toUpperCase() as Currency, billing, exchangeRates).price, currency)}
                          </div>
                          {billing === "monthly" && (
                            <div className="text-sm text-zinc-400">/mês</div>
                          )}
                        </div>
                      </div>
                      <ul className="text-sm text-zinc-400 space-y-1">
                        {tier.features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>

              {/* Billing Cycle */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Ciclo de cobrança</h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { value: "monthly", label: "Mensal", discount: 0 },
                    { value: "annual", label: "Anual", discount: 20 },
                    { value: "lifetime", label: "Vitalício", discount: 40 },
                  ].map((cycle) => (
                    <button
                      key={cycle.value}
                      onClick={() => setBilling(cycle.value as BillingCycle)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        billing === cycle.value
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <div className="font-semibold text-zinc-100">{cycle.label}</div>
                      {cycle.discount > 0 && (
                        <div className="text-sm text-emerald-500">Economize {cycle.discount}%</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency Selection */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Moeda</h2>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(CURRENCY_CONFIG).map(([code, config]) => (
                    <button
                      key={code}
                      onClick={() => setCurrency(code as Currency)}
                      disabled={!selectedTier || !isCurrencyAvailable(selectedTier, code as Currency, billing)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        currency === code
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-800 hover:border-zinc-700"
                      } ${!selectedTier || !isCurrencyAvailable(selectedTier, code as Currency, billing) ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="font-semibold text-zinc-100">{code.toUpperCase()}</div>
                      <div className="text-sm text-zinc-400">{config.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Summary */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Resumo</h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-zinc-400">
                    <span>Plano {selectedTier.tier_name} ({billing})</span>
                    <span>{formatCurrency(price.base, currency)}</span>
                  </div>
                  {discount.value > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Desconto</span>
                      <span>
                        {discount.type === "percentage" ? `-${discount.value}%` : `-${formatCurrency(discount.value, currency as Currency)}`}
                      </span>
                    </div>
                  )}
                  {pointsToRedeem > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Pontos ({pointsToRedeem})</span>
                      <span>-{formatCurrency(Math.min(pointsToRedeem, userPoints) * 0.1, "BRL")}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-zinc-100 pt-2 border-t border-zinc-800">
                    <span>Total</span>
                    <span>{formatCurrency(price.final, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Continue Button */}
              <button
                onClick={() => setStep("discount")}
                className="w-full py-4 bg-emerald-500 text-zinc-950 rounded-xl font-semibold hover:bg-emerald-600 transition-colors"
              >
                Continuar
              </button>
            </motion.div>
          )}

          {step === "discount" && (
            <motion.div
              key="discount"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Coupon */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Cupom de desconto</h2>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Digite seu cupom"
                    className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={applyCoupon}
                    className="px-6 py-3 bg-emerald-500 text-zinc-950 rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              </div>

              {/* Points */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Usar pontos</h2>
                <div className="space-y-4">
                  <div className="flex justify-between text-zinc-400">
                    <span>Pontos disponíveis</span>
                    <span>{userPoints}</span>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Pontos a usar (1 ponto = R$ 0,10)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={userPoints}
                      value={pointsToRedeem}
                      onChange={(e) => setPointsToRedeem(Math.min(userPoints, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* B2B Option */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Precisa de nota fiscal?</h2>
                <button
                  onClick={() => setShowB2BForm(!showB2BForm)}
                  className="w-full py-4 bg-zinc-800 text-zinc-100 rounded-xl font-semibold hover:bg-zinc-700 transition-colors"
                >
                  {showB2BForm ? "Ocultar formulário" : "Preencher dados para NF"}
                </button>
                
                {showB2BForm && (
                  <div className="mt-4">
                    <B2BInvoiceForm
                      priceId={getDynamicPrice(selectedTier!, (currency as string).toUpperCase() as Currency, billing, exchangeRates).priceId || ""}
                      quantity={1}
                      totalAmountBRL={price.base}
                      onSuccess={(invoiceId, invoiceUrl) => {
                        toast.success("Fatura gerada com sucesso!");
                        setShowB2BForm(false);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Updated Price Summary */}
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Resumo final</h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-zinc-400">
                    <span>Plano {selectedTier.tier_name} ({billing})</span>
                    <span>{formatCurrency(price.base, currency)}</span>
                  </div>
                  {discount.value > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Desconto</span>
                      <span>
                        {discount.type === "percentage" ? `-${discount.value}%` : `-${formatCurrency(discount.value, currency as Currency)}`}
                      </span>
                    </div>
                  )}
                  {pointsToRedeem > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Pontos ({pointsToRedeem})</span>
                      <span>-{formatCurrency(Math.min(pointsToRedeem, userPoints) * 0.1, "BRL")}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-zinc-100 pt-2 border-t border-zinc-800">
                    <span>Total a pagar</span>
                    <span>{formatCurrency(price.final, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setStep("summary")}
                  className="py-4 bg-zinc-800 text-zinc-100 rounded-xl font-semibold hover:bg-zinc-700 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={createPaymentIntent}
                  disabled={processing || price.final <= 0}
                  className="py-4 bg-emerald-500 text-zinc-950 rounded-xl font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <Loader2 size={16} className="inline animate-spin mr-2" />
                      Processando...
                    </>
                  ) : (
                    "Ir para pagamento"
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === "payment" && clientSecret && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-zinc-900 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-zinc-100 mb-4">Informações de pagamento</h2>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <PaymentForm
                    price={price}
                    onSuccess={() => router.push(`/checkout/success?tier=${selectedTier.id}`)}
                    onCancel={() => setStep("summary")}
                  />
                </Elements>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Payment Form Component ───────────────────────────────────────────────────
function PaymentForm({ 
  price, 
  onSuccess, 
  onCancel 
}: { 
  price: { base: number; final: number; currency: string };
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success`,
        },
      });

      if (error) {
        toast.error(error.message || "Erro ao processar pagamento");
      } else {
        onSuccess();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Erro ao processar pagamento"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="flex justify-between text-zinc-400 mb-2">
          <span>Total a pagar</span>
          <span>{formatCurrency(price.final, price.currency as Currency)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Lock size={12} />
          <span>Pagamento seguro via Stripe</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="py-4 bg-zinc-800 text-zinc-100 rounded-xl font-semibold hover:bg-zinc-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={processing || !stripe}
          className="py-4 bg-emerald-500 text-zinc-950 rounded-xl font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <Loader2 size={16} className="inline animate-spin mr-2" />
              Processando...
            </>
          ) : (
            "Pagar agora"
          )}
        </button>
      </div>
    </form>
  );
}
