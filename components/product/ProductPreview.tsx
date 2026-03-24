"use client";

import { Shield, Zap, Star } from "lucide-react";

interface ProductPreviewProps {
  name: string;
  description?: string | null;
  price?: number | null;
  priceBilling?: "monthly" | "annual" | "lifetime";
  logoUrl?: string | null;
  vendorName?: string | null;
  isVerified?: boolean;
  features?: string[];
  currency?: string;
  className?: string;
}

/** Checkout preview card — shown in product pages and vendor dashboard */
export function ProductPreview({
  name,
  description,
  price,
  priceBilling = "monthly",
  logoUrl,
  vendorName,
  isVerified = false,
  features = [],
  currency = "BRL",
  className = "",
}: ProductPreviewProps) {
  const billingLabel = {
    monthly: "/mês",
    annual: "/ano",
    lifetime: " vitalício",
  }[priceBilling];

  const formattedPrice =
    price != null
      ? currency === "BRL"
        ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : price.toLocaleString("en-US", { style: "currency", currency })
      : null;

  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-white/[0.05]">
        <div className="flex items-center gap-3 mb-4">
          {logoUrl ? (
            <img src={logoUrl} alt={name} className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{name}</h3>
            {vendorName && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-500">{vendorName}</span>
                {isVerified && <Shield className="w-3 h-3 text-emerald-400" />}
              </div>
            )}
          </div>
        </div>

        {description && (
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3">{description}</p>
        )}
      </div>

      {/* Pricing */}
      {formattedPrice && (
        <div className="px-6 py-4 border-b border-white/[0.05]">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-zinc-100">{formattedPrice}</span>
            <span className="text-xs text-zinc-500">{billingLabel}</span>
          </div>
        </div>
      )}

      {/* Features */}
      {features.length > 0 && (
        <div className="px-6 py-4 space-y-2">
          {features.slice(0, 5).map((feat, i) => (
            <div key={i} className="flex items-center gap-2">
              <Star className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-xs text-zinc-400">{feat}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="px-6 pb-6">
        <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center font-medium">
          Preview do Checkout
        </div>
      </div>
    </div>
  );
}
