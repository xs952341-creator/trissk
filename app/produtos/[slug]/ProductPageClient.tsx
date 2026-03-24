
"use client";
// app/produto/[id]/ProductPageClient.tsx
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Star, TrendingUp, MessageCircle, Users, Zap, Key, Webhook, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

import PricingTable from "@/components/ui/PricingTable";
import ProductComments from "@/components/ProductComments";
import { BlocksRenderer, type LandingBlock } from "@/components/landing/BlocksRenderer";
import { getErrorMessage } from "@/lib/errors";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type ProductReview = {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verified_purchase?: boolean | null;
  created_at?: string | null;
};


interface Tier {
  id: string; tier_name: string; price_monthly: number | null; price_annual: number | null; price_lifetime: number | null;
  stripe_monthly_price_id: string | null; stripe_annual_price_id: string | null; stripe_lifetime_price_id: string | null;
  features: string[]; is_popular: boolean; has_consultancy: boolean; calendar_link?: string;
  order_bump_active?: boolean; order_bump_title?: string; order_bump_price?: number; order_bump_stripe_price_id?: string;
}

export interface Product {
  id: string; name: string; description: string; logo_url?: string; category?: string;
  screenshots?: string[];
  trending_score: number; sales_count: number; is_staff_pick: boolean;
  delivery_method: string; support_email?: string; support_whatsapp?: string;
  order_bump_active?: boolean; order_bump_title?: string; order_bump_price?: number; order_bump_stripe_price_id?: string;
  profiles: { id: string; full_name: string; is_verified_vendor: boolean; avatar_url?: string };
  product_tiers: Tier[];
}

const DELIVERY_BADGES = {
  KEYS:           { label: "Acesso via Chave",    icon: <Key size={11} />,     color: "text-amber-400  border-amber-500/30  bg-amber-500/10" },
  NO_CODE_ZAPIER: { label: "Integração Zapier",   icon: <Zap size={11} />,     color: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  NATIVE_API:     { label: "Integração Nativa",   icon: <Webhook size={11} />, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
};

export default function ProductPageClient({
  product,
  reviews,
  reviewStats,
  landingBlocks,
}: {
  product: Product;
  reviews: ProductReview[];
  reviewStats: { avg: number; count: number };
  landingBlocks?: LandingBlock[] | null;
}) {
  const vendor    = product.profiles;
  const tiers     = product.product_tiers ?? [];
  const badge     = DELIVERY_BADGES[product.delivery_method as keyof typeof DELIVERY_BADGES] ?? DELIVERY_BADGES.NATIVE_API;
  const supportHref = product.support_whatsapp
    ? `https://wa.me/${product.support_whatsapp.replace(/\D/g, "")}?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20${encodeURIComponent(product.name)}`
    : product.support_email ? `mailto:${product.support_email}?subject=Dúvida: ${product.name}` : null;

  // Add order bump to popular tier if product has one
  const tiersWithBump: Tier[] = tiers.map((t) => ({
    ...t,
    order_bump_active:           t.is_popular ? product.order_bump_active : false,
    order_bump_title:            product.order_bump_title,
    order_bump_price:            product.order_bump_price,
    order_bump_stripe_price_id:  product.order_bump_stripe_price_id,
  }));

  const supabase = createClient();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const myReview = useMemo(() => reviews.find((r) => r.user_id === sessionUserId) ?? null, [reviews, sessionUserId]);

  // Social proof (polling leve)
  const [viewsToday, setViewsToday] = useState<number>(0);
  const [lastPurchaseMin, setLastPurchaseMin] = useState<number | null>(null);


  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      setSessionUserId(uid);
      if (!uid) return;

      // Só pode avaliar se tiver entitlement ativo
      const { data: ent } = await supabase
        .from("entitlements")
        .select("id")
        .eq("user_id", uid)
        .eq("product_id", product.id)
        .eq("status", "active")
        .maybeSingle();
      setCanReview(!!ent);

      if (myReview) {
        const review = myReview as ProductReview | null;
        setRating(review?.rating ?? 5);
        setTitle(review?.title ?? "");
        setBody(review?.body ?? "");
      }
    })();
    }, [product.id, supabase, myReview]);

  const submitReview = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, rating, title, body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Erro ao salvar avaliação");
      }
      toast.success("Avaliação salva! Atualize a página para ver publicada.");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  const deleteReview = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews?productId=${product.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Erro ao remover avaliação");
      }
      toast.success("Avaliação removida! Atualize a página.");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50">
      {/* Hero glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/[0.04] blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 pt-16 pb-24">
        {/* Product header */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row items-start gap-8 mb-14">
          {/* Logo */}
          <div className="w-24 h-24 shrink-0 rounded-3xl bg-zinc-800 border border-white/10 overflow-hidden flex items-center justify-center text-zinc-400 font-bold text-2xl">
            {product.logo_url ? <img src={product.logo_url} alt={product.name} className="w-full h-full object-cover" /> : product.name.slice(0, 2)}
          </div>

          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {product.is_staff_pick && (
                <span className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1">
                  <Star size={10} fill="currentColor" /> Staff Pick
                </span>
              )}
              {vendor.is_verified_vendor && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2.5 py-1">
                  <ShieldCheck size={10} /> Verificado
                </span>
              )}
              <span className={`flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 ${badge.color}`}>
                {badge.icon} {badge.label}
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ letterSpacing: "-0.02em" }}>
              {product.name}
            </h1>
            <p className="text-zinc-500 text-base leading-relaxed mb-4 max-w-2xl">{product.description}</p>


<div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-6">
  <div className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1">
    <span className="text-zinc-200">{viewsToday}</span> pessoas viram isso hoje
  </div>
  <div className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1">
    {lastPurchaseMin === null ? (
      <span>Sem compras registradas hoje</span>
    ) : (
      <span>Última compra há <span className="text-zinc-200">{lastPurchaseMin}</span> min</span>
    )}
  </div>
</div>


            {/* Stats row */}
            <div className="flex flex-wrap gap-5 text-sm">
              <div className="flex items-center gap-1.5 text-zinc-600">
                <Users size={13} /> <span>{product.sales_count.toLocaleString("pt-BR")} clientes</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-600">
                <TrendingUp size={13} /> <span>Score {product.trending_score}</span>
              </div>
              {product.category && (
                <span className="text-zinc-700 text-xs border border-white/10 rounded-full px-2.5 py-1">{product.category}</span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Optional: vendor landing builder (public render) */}
        {landingBlocks && landingBlocks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mb-12"
          >
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <BlocksRenderer blocks={landingBlocks} />
            </div>
          </motion.div>
        )}

        {/* Pricing table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-zinc-50 font-semibold text-lg mb-6 text-center">Escolha seu plano</h2>
          {tiers.length > 0 ? (
            <PricingTable
              tiers={tiersWithBump}
              vendorId={vendor.id}
              productId={product.id}
            />
          ) : (
            <div className="text-center text-zinc-600 py-12">Planos em configuração. Em breve!</div>
          )}
        </motion.div>

        {/* Guarantee */}
        <div className="mt-10 text-center">
          <p className="text-zinc-600 text-xs flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-500/60" />
            Garantia incondicional de 7 dias — sem perguntas, sem burocracia.
          </p>
        </div>

        {/* Support */}
        {supportHref && (
          <div className="mt-6 text-center">
            <a href={supportHref} className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 text-xs transition-colors">
              <MessageCircle size={11} /> Dúvidas sobre este produto? Fale com o produtor →
            </a>
          </div>
        )}

        {/* Vendor signature */}
        <div className="mt-12 border-t border-white/10 pt-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden flex items-center justify-center text-zinc-500 text-sm font-bold shrink-0">
            {vendor.avatar_url ? <img src={vendor.avatar_url} alt={vendor.full_name} className="w-full h-full object-cover" /> : vendor.full_name?.[0]}
          </div>
          <div>
            <p className="text-zinc-300 text-sm font-medium">{vendor.full_name}</p>
            <p className="text-zinc-600 text-xs">Produtor</p>
          </div>
          {vendor.is_verified_vendor && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
              <ShieldCheck size={11} /> Produtor Verificado
            </span>
          )}
        </div>

        {/* Screenshots Gallery */}
        {product.screenshots && product.screenshots.length > 0 && (
          <div className="mt-10 border-t border-white/10 pt-10">
            <h3 className="text-zinc-50 font-semibold text-lg mb-4">Screenshots</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {product.screenshots.map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noopener" className="block rounded-2xl overflow-hidden border border-white/10 hover:border-zinc-600 transition">
                  <img
                    src={url}
                    alt={`Screenshot ${idx + 1} — ${product.name}`}
                    className="w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        <div className="mt-14 border-t border-white/10 pt-10">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h3 className="text-zinc-50 font-semibold text-lg">Avaliações</h3>
              <div className="flex items-center gap-2 mt-1 text-sm text-zinc-500">
                <div className="flex items-center gap-1 text-amber-400">
                  <Star size={14} fill="currentColor" />
                  <span className="text-zinc-300 font-medium">{reviewStats.avg.toFixed(1)}</span>
                </div>
                <span>·</span>
                <span>{reviewStats.count} review(s)</span>
              </div>
            </div>
            {sessionUserId && canReview && (
              <div className="text-xs text-zinc-600">Só compradores podem avaliar.</div>
            )}
          </div>

          {/* Review form */}
          {sessionUserId ? (
            canReview ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-8">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-sm text-zinc-300 font-medium">Sua avaliação</div>
                  {myReview && (
                    <button onClick={deleteReview} disabled={saving} className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1">
                      <Trash2 size={12} /> Remover
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-4">
                  {[1,2,3,4,5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} className="text-amber-400">
                      <Star size={18} fill={n <= rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                  <span className="text-xs text-zinc-600 ml-2">{rating}/5</span>
                </div>

                <div className="grid gap-3">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)"
                    className="w-full rounded-xl bg-zinc-950 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-white/20" />
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Conte como foi sua experiência (opcional)"
                    className="w-full min-h-[110px] rounded-xl bg-zinc-950 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/20" />
                  <button onClick={submitReview} disabled={saving}
                    className="ml-auto rounded-full bg-white text-zinc-950 font-semibold text-sm px-5 py-2.5 inline-flex items-center gap-2 hover:bg-zinc-100">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : "Publicar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-8 text-sm text-zinc-600">
                Para avaliar, você precisa comprar este produto.
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-8 text-sm text-zinc-600">
              Faça login para ver e publicar avaliações.
            </div>
          )}

          {/* Reviews list */}
          <div className="grid gap-4">
            {(reviews ?? []).length === 0 ? (
              <div className="text-sm text-zinc-600">Ainda não há avaliações. Seja o primeiro a avaliar!</div>
            ) : (
              (reviews ?? []).map((r: ProductReview) => (
                <div key={String(r.id)} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-400">
                      {[1,2,3,4,5].map((n) => (
                        <Star key={n} size={14} fill={n <= Number(r.rating ?? 0) ? "currentColor" : "none"} />
                      ))}
                      <span className="text-xs text-zinc-600 ml-2">{new Date(String(r.created_at ?? "")).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  {String(r.title ?? "") && <div className="mt-2 text-zinc-200 text-sm font-medium">{r.title}</div>}
                  {String(r.body ?? "") && <div className="mt-2 text-zinc-500 text-sm leading-relaxed">{r.body}</div>}
                  {r.verified_purchase && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-500">
                      <CheckCircle2 size={11} /> Compra verificada
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Comentários */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <ProductComments productId={product.id} />
        </div>
      </div>
    </div>
  );
}
