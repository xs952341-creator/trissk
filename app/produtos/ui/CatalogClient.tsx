"use client";
/**
 * CatalogClient v2 — Com skeleton loaders, estados vazios premium,
 * busca com debounce, filtros acessíveis e cards responsivos.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Search, SlidersHorizontal, X, TrendingUp, Clock, ArrowDownUp, Zap, ShieldCheck, Star, ArrowUpRight } from "lucide-react";
import { ProductCardSkeleton } from "@/components/ProductCard";

// ── Tipos ────────────────────────────────────────────────────────────────────
type Tier = {
  id: string;
  tier_name: string;
  price_monthly?: number | null;
  price_annual?: number | null;
  price_lifetime?: number | null;
  is_popular?: boolean | null;
};

type Item = {
  id: string;
  name: string;
  slug: string;
  delivery_type?: string | null;
  short_description?: string | null;
  description?: string | null;
  logo_url?: string | null;
  cvr?: number | null;
  views?: number | null;
  sales?: number | null;
  min_price?: number | null;
  is_staff_pick?: boolean | null;
  created_at?: string;
  product_tiers?: Tier[];
  profiles?: { is_verified_vendor?: boolean; full_name?: string };
};

type SortKey = "cvr" | "newest" | "price_low" | "price_high";

// ── Formatadores ─────────────────────────────────────────────────────────────
function formatBRL(v?: number | null): string {
  if (!v || v <= 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Debounce hook ────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Card individual ──────────────────────────────────────────────────────────
function CatalogCard({ item, index }: { item: Item; index: number }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  const tiers = item.product_tiers ?? [];
  const monthlyPrices = tiers.map(t => t.price_monthly ?? 0).filter(Boolean);
  const minMonthly = monthlyPrices.length ? Math.min(...monthlyPrices) : null;
  const desc = item.short_description ?? item.description ?? "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Link
        href={`/produtos/${item.slug}`}
        className="block group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        aria-label={`Ver produto ${item.name}`}
      >
        <article
          className="card card-lift p-5 flex flex-col gap-3 h-full"
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            {/* Logo */}
            <div
              className="w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 relative"
              style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)" }}
            >
              {item.logo_url && !imgErr ? (
                <>
                  {!imgLoaded && <div className="absolute inset-0 skeleton" />}
                  <img
                    src={item.logo_url}
                    alt={item.name}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                    onLoad={() => setImgLoaded(true)}
                    onError={() => setImgErr(true)}
                  />
                </>
              ) : (
                <span className="text-xs font-bold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
                  {item.name?.slice(0, 2).toUpperCase() ?? "?"}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
              >
                {item.name}
              </p>
              {item.profiles?.is_verified_vendor && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold mt-0.5" style={{ color: "var(--brand)" }}>
                  <ShieldCheck size={9} />Verificado
                </span>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-col gap-1 items-end shrink-0">
              {item.is_staff_pick && (
                <span className="badge-amber">
                  <Star size={8} className="fill-amber-400" />Pick
                </span>
              )}
            </div>
          </div>

          {/* Desc */}
          <p className="text-xs line-clamp-2 leading-relaxed flex-1" style={{ color: "var(--text-muted)" }}>
            {desc}
          </p>

          {/* Footer */}
          <div
            className="flex items-center justify-between pt-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <div>
              {minMonthly ? (
                <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                  {formatBRL(minMonthly)}
                  <span className="text-[10px] font-normal ml-0.5" style={{ color: "var(--text-muted)" }}>/mês</span>
                </span>
              ) : (
                <span className="text-sm font-bold" style={{ color: "var(--brand)" }}>Grátis</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {typeof item.cvr === "number" && item.cvr > 0 && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: "rgba(34,212,160,0.08)", color: "var(--brand)" }}
                >
                  CVR {(item.cvr * 100).toFixed(1)}%
                </span>
              )}
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                style={{ background: "rgba(34,212,160,0.08)", color: "var(--brand)" }}
              >
                <ArrowUpRight size={13} />
              </div>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}

// ── Estado Vazio ─────────────────────────────────────────────────────────────
function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
      >
        <Zap size={24} style={{ color: "var(--text-faint)" }} />
      </div>
      <h3
        className="text-base font-semibold mb-2"
        style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}
      >
        {hasQuery ? "Nenhum resultado encontrado" : "Catálogo vazio por enquanto"}
      </h3>
      <p className="text-sm max-w-xs" style={{ color: "var(--text-muted)" }}>
        {hasQuery
          ? "Tente buscar por termos diferentes ou remova os filtros."
          : "Novos produtos são aprovados diariamente. Volte em breve!"}
      </p>
    </motion.div>
  );
}

// ── Componente Principal ─────────────────────────────────────────────────────
const SORT_OPTIONS: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "cvr",        label: "Mais populares", icon: <TrendingUp size={13} /> },
  { value: "newest",     label: "Mais recentes",  icon: <Clock size={13} /> },
  { value: "price_low",  label: "Menor preço",    icon: <ArrowDownUp size={13} /> },
  { value: "price_high", label: "Maior preço",    icon: <ArrowDownUp size={13} className="rotate-180" /> },
];

export default function CatalogClient() {
  const [q, setQ] = useState("");
  const [deliveryTab, setDeliveryTab] = useState<"all" | "saas" | "file" | "community">("all");
  const [sort, setSort] = useState<SortKey>("cvr");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const debouncedQ = useDebounce(q, 350);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (deliveryTab !== "all") sp.set("delivery_type", deliveryTab);
    sp.set("sort", sort);
    return sp.toString();
  }, [debouncedQ, sort, deliveryTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/catalog/search?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Erro ao buscar");
        const json = await res.json();
        if (!cancelled) {
          setItems(json.items ?? []);
          setTotal(json.total ?? json.items?.length ?? 0);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  const clearSearch = useCallback(() => setQ(""), []);

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      <div className="max-w-6xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <span className="section-eyebrow mb-2 block">Marketplace</span>
          <h1
            className="text-3xl font-bold tracking-tight mb-2"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Catálogo de produtos
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loading ? "Carregando..." : `${total} produto${total !== 1 ? "s" : ""} disponíveis`}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Tabs de tipo de produto */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {([
            { key: "all",       label: "Todos" },
            { key: "saas",      label: "SaaS / Software" },
            { key: "file",      label: "E-books & Cursos" },
            { key: "community", label: "Comunidades" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setDeliveryTab(tab.key)}
              className="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all"
              style={deliveryTab === tab.key
                ? { background: "var(--brand)", color: "#041a12", borderColor: "transparent" }
                : { background: "var(--surface-2)", color: "var(--text-muted)", borderColor: "var(--border-subtle)" }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por nome ou descrição..."
              className="input-base pl-10 pr-10"
              aria-label="Buscar produtos"
            />
            {q && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors"
                style={{ color: "var(--text-muted)" }}
                aria-label="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="flex gap-1.5 flex-wrap">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all duration-200 ${
                  sort === opt.value
                    ? "text-surface-0 border-transparent"
                    : "border-transparent hover:border"
                }`}
                style={sort === opt.value
                  ? { background: "var(--brand)", color: "var(--surface-0)", fontFamily: "var(--font-display)" }
                  : { color: "var(--text-muted)", borderColor: "var(--border-subtle)" }
                }
                aria-pressed={sort === opt.value}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState hasQuery={!!q} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={params}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {items.map((item, i) => (
                <CatalogCard key={item.id} item={item} index={i} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
