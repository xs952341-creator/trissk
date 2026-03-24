"use client";
/**
 * ProductCard v2 — Padrão Apple/Stripe
 * Skeleton integrado, image loading state, hover premium, acessibilidade.
 */

import Link from "next/link";
import { useState } from "react";
import { Star, TrendingUp, Zap, ShieldCheck, ArrowUpRight } from "lucide-react";

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    description?: string;
    short_description?: string;
    logo_url?: string | null;
    price_monthly?: number | null;
    price_lifetime?: number | null;
    original_price?: number | null;
    trending_score?: number;
    sales_count?: number;
    is_staff_pick?: boolean;
    slug?: string;
    profiles?: { is_verified_vendor?: boolean; full_name?: string };
  };
  large?: boolean;
}

function formatBRL(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProductCard({ product, large = false }: ProductCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const price = product.price_monthly ?? product.price_lifetime;
  const isMonthly = !!product.price_monthly;
  const href = `/produtos/${product.slug ?? product.id}`;
  const desc = product.short_description ?? product.description ?? "";
  const initials = product.name?.slice(0, 2).toUpperCase() ?? "PH";

  return (
    <Link
      href={href}
      className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded-2xl"
      aria-label={`Ver produto: ${product.name}`}
    >
      <article
        className={`card card-lift flex flex-col h-full p-5 ${large ? "min-h-[240px]" : ""}`}
        style={{ transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.18s ease" }}
      >
        {/* Header: Logo + badge */}
        <div className="flex items-start justify-between mb-4">
          {/* Logo */}
          <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-surface-2 border flex items-center justify-center shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            {product.logo_url && !imgError ? (
              <>
                {/* Skeleton enquanto carrega */}
                {!imgLoaded && (
                  <div className="absolute inset-0 skeleton" />
                )}
                <img
                  src={product.logo_url}
                  alt={product.name}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgError(true)}
                />
              </>
            ) : (
              <span className="text-sm font-bold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
                {initials}
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-col items-end gap-1.5">
            {product.is_staff_pick && (
              <span className="badge-amber flex items-center gap-1">
                <Star size={9} className="fill-amber-400" />Curadoria
              </span>
            )}
            {product.profiles?.is_verified_vendor && (
              <span className="badge-brand flex items-center gap-1">
                <ShieldCheck size={9} />Verificado
              </span>
            )}
          </div>
        </div>

        {/* Nome */}
        <h3
          className="text-sm font-semibold mb-1.5 line-clamp-1 transition-colors duration-200"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          {product.name}
        </h3>

        {/* Descrição */}
        <p
          className="text-xs line-clamp-2 mb-4 flex-1 leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {desc}
        </p>

        {/* Footer */}
        <div
          className="mt-auto pt-4 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {/* Preço */}
          <div className="flex flex-col">
            {product.original_price && (
              <span className="text-[10px] line-through" style={{ color: "var(--text-faint)" }}>
                {formatBRL(product.original_price)}
              </span>
            )}
            {price != null && price > 0 ? (
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {formatBRL(price)}
                <span className="text-xs font-normal ml-0.5" style={{ color: "var(--text-muted)" }}>
                  {isMonthly ? "/mês" : " único"}
                </span>
              </span>
            ) : (
              <span className="text-sm font-bold" style={{ color: "var(--brand)" }}>Grátis</span>
            )}
          </div>

          {/* Trending + arrow */}
          <div className="flex items-center gap-2">
            {(product.trending_score ?? 0) > 0 && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold"
                style={{
                  background: "rgba(34,212,160,0.08)",
                  color: "var(--brand)",
                }}
              >
                <TrendingUp size={11} />
                {product.trending_score}
              </div>
            )}
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110"
              style={{
                background: "rgba(34,212,160,0.08)",
                color: "var(--brand)",
              }}
            >
              <ArrowUpRight size={13} />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// ── Skeleton variant exportada ───────────────────────────────────────────────
export function ProductCardSkeleton() {
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-3 animate-pulse"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
    >
      <div className="flex items-center gap-3">
        <div className="skeleton w-12 h-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-3/5 rounded" />
          <div className="skeleton h-2.5 w-2/5 rounded" />
        </div>
      </div>
      <div className="skeleton h-2 w-full rounded" />
      <div className="skeleton h-2 w-4/5 rounded" />
      <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="skeleton h-4 w-16 rounded" />
        <div className="skeleton h-6 w-12 rounded-lg" />
      </div>
    </div>
  );
}
