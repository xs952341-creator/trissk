"use client";
import React from "react";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Star, Loader2, Zap, CalendarDays, Infinity } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { toast } from "sonner";

interface Tier {
  id: string;
  tier_name: string;
  price_monthly: number | null;
  price_annual: number | null;   // novo: assinatura anual (10x o mensal = 2 meses grátis)
  price_lifetime: number | null;
  stripe_monthly_price_id: string | null;
  stripe_annual_price_id: string | null;  // novo
  stripe_lifetime_price_id: string | null;
  features: string[];
  is_popular: boolean;
  order_bump_active?: boolean;
  order_bump_title?: string;
  order_bump_price?: number;
  order_bump_stripe_price_id?: string;
}

interface PricingTableProps {
  tiers: Tier[];
  vendorId: string;
  productId: string;
}

type BillingCycle = "monthly" | "annual" | "lifetime";

function getAffiliateCode() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/playbook_affiliate_id=([^;]+)/);
  return match ? match[1] : null;
}

export default function PricingTable({ tiers, vendorId, productId }: PricingTableProps) {
  const router   = useRouter();
  const supabase = createClient();

  const hasMonthly  = tiers.some(t => t.price_monthly  !== null);
  const hasAnnual   = tiers.some(t => t.price_annual   !== null || t.stripe_annual_price_id !== null);
  const hasLifetime = tiers.some(t => t.price_lifetime !== null);

  const [billingCycle,    setBillingCycle]    = useState<BillingCycle>(hasMonthly ? "monthly" : "lifetime");
  const [loadingTierId,   setLoadingTierId]   = useState<string | null>(null);
  const [includeOrderBump, setIncludeOrderBump] = useState(false);

  const handleCheckout = async (tier: Tier) => {
    try {
      setLoadingTierId(tier.id);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.info("Faça login para continuar com a compra");
        router.push(`/login?next=/produto/${productId}`);
        return;
      }

      // Redireciona para o checkout Elements (sem hosted page)
      const params = new URLSearchParams({
        tier:    tier.id,
        billing: billingCycle,
      });
      router.push(`/checkout/${productId}?${params.toString()}`);
    } catch (error) {
      console.error("Erro no checkout:", error);
      toast.error("Erro de conexão. Tente novamente.");
      setLoadingTierId(null);
    }
  };

  const BILLING_OPTIONS: { key: BillingCycle; label: string; icon: React.ComponentType<{ className?: string; size?: number | string }>; badge?: string }[] = [
    ...(hasMonthly  ? [{ key: "monthly"  as BillingCycle, label: "Mensal",  icon: CalendarDays }] : []),
    ...(hasAnnual   ? [{ key: "annual"   as BillingCycle, label: "Anual",   icon: Zap, badge: "2 meses grátis" }] : []),
    ...(hasLifetime ? [{ key: "lifetime" as BillingCycle, label: "Vitalício", icon: Infinity }] : []),
  ];

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Billing cycle toggle */}
      {BILLING_OPTIONS.length > 1 && (
        <div className="flex justify-center mb-10">
          <div className="bg-zinc-900 border border-white/10 rounded-full p-1 flex items-center gap-1">
            {BILLING_OPTIONS.map(({ key, label, icon: Icon, badge }) => (
              <button key={key}
                onClick={() => setBillingCycle(key)}
                className={`relative px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === key
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                <Icon size={13} />
                {label}
                {badge && (
                  <span className="absolute -top-2.5 -right-1 text-[9px] font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {tiers.map((tier) => {
          // Calcular preço para o ciclo selecionado
          let price: number | null = null;
          if (billingCycle === "monthly")  price = tier.price_monthly;
          if (billingCycle === "annual")   price = tier.price_annual ?? (tier.price_monthly ? tier.price_monthly * 10 : null);
          if (billingCycle === "lifetime") price = tier.price_lifetime;
          if (price === null) return null;

          // Preço original para exibir riscado no annual
          const monthlyRef = billingCycle === "annual" && tier.price_monthly
            ? tier.price_monthly * 12
            : null;

          return (
            <motion.div key={tier.id}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className={`relative rounded-3xl p-8 flex flex-col h-full bg-white/[0.02] border ${
                tier.is_popular ? "border-emerald-500/50 shadow-2xl" : "border-white/10"
              }`}
            >
              {tier.is_popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-bold uppercase py-1 px-4 rounded-full flex items-center gap-1">
                  <Star size={10} fill="currentColor" /> Popular
                </div>
              )}

              <h3 className="text-lg font-bold text-zinc-100 mb-2">{tier.tier_name}</h3>
              <div className="mb-6">
                {monthlyRef && (
                  <p className="text-zinc-600 text-sm line-through mb-0.5">
                    R$ {monthlyRef.toLocaleString("pt-BR")}/ano
                  </p>
                )}
                <span className="text-3xl font-bold text-zinc-50">
                  R$ {price.toLocaleString("pt-BR")}
                </span>
                <span className="text-zinc-600 text-xs ml-1">
                  {billingCycle === "monthly" ? "/mês" : billingCycle === "annual" ? "/ano" : " único"}
                </span>
                {billingCycle === "annual" && tier.price_monthly && (
                  <p className="text-emerald-400 text-xs mt-1 font-medium">
                    = R$ {(price / 12).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                  </p>
                )}
              </div>

              <button onClick={() => handleCheckout(tier)} disabled={!!loadingTierId}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 mb-6 ${
                  tier.is_popular ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-white text-zinc-950 hover:bg-zinc-200"
                }`}
              >
                {loadingTierId === tier.id
                  ? <Loader2 size={16} className="animate-spin" />
                  : billingCycle === "annual" ? "Assinar Anualmente →" : "Assinar Agora"}
              </button>

              {tier.order_bump_active && (
                <div onClick={() => setIncludeOrderBump(!includeOrderBump)}
                  className={`p-3 rounded-xl border mb-6 cursor-pointer transition-all ${
                    includeOrderBump ? "border-emerald-500/50 bg-emerald-500/5" : "border-white/5 bg-white/[0.01]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${includeOrderBump ? "bg-emerald-500 border-emerald-500" : "border-zinc-700"}`}>
                      {includeOrderBump && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Oferta Extra</span>
                  </div>
                  <p className="text-xs text-zinc-200 mt-1">{tier.order_bump_title}</p>
                  <p className="text-[10px] text-zinc-500">+ R$ {tier.order_bump_price?.toLocaleString("pt-BR")}</p>
                </div>
              )}

              <ul className="space-y-3 flex-1">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <Check size={14} className="text-emerald-500 shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
