"use client";
/**
 * BuyerDashboard v2 — Padrão Apple
 * Skeleton loaders, estado vazio com onboarding, cards de acesso premium,
 * animações fluidas, acessibilidade completa.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, ExternalLink, Zap, CheckCircle2, Clock, AlertTriangle,
  Calendar, ChevronRight, Package, Award, ShoppingBag,
  ArrowRight, Star, Sparkles, Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import type { ComponentType } from "react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Subscription {
  id: string;
  status: string;
  created_at: string;
  product_tiers: {
    id: string;
    tier_name: string;
    price_monthly: number | null;
    price_lifetime: number | null;
    has_consultancy: boolean;
    calendar_link: string | null;
    saas_products: {
      id: string;
      name: string;
      delivery_method: string;
      magic_link_url: string | null;
      provisioning_webhook_url: string | null;
      slug?: string;
      logo_url?: string;
    };
  } | null;
  subscription_keys: { key_value: string } | null;
}

const STATUS_CFG: Record<string, { label: string; cls: string; dotCls: string }> = {
  active:   { label: "Ativo",     cls: "badge-emerald", dotCls: "bg-emerald-400" },
  trialing: { label: "Trial",     cls: "badge-violet",  dotCls: "bg-violet-400" },
  past_due: { label: "Vencido",   cls: "badge-amber",   dotCls: "bg-amber-400" },
  canceled: { label: "Cancelado", cls: "badge",         dotCls: "bg-zinc-600" },
  lifetime: { label: "Vitalício", cls: "badge-amber",   dotCls: "bg-amber-400" },
};

// ── Copy Button ───────────────────────────────────────────────────────────────
function CopyBtn({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado para a área de transferência!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs font-medium transition-colors duration-200"
      style={{ color: copied ? "var(--brand)" : "var(--text-muted)" }}
      aria-label={copied ? "Copiado!" : label}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span key="done" initial={{ scale: 0.7 }} animate={{ scale: 1 }}>
            <CheckCircle2 size={12} />
          </motion.span>
        ) : (
          <motion.span key="copy" initial={{ scale: 0.7 }} animate={{ scale: 1 }}>
            <Copy size={12} />
          </motion.span>
        )}
      </AnimatePresence>
      {copied ? "Copiado!" : label}
    </button>
  );
}

// ── Subscription Card ─────────────────────────────────────────────────────────
function SubCard({ sub, index }: { sub: Subscription; index: number }) {
  const prod = sub.product_tiers?.saas_products;
  const tier = sub.product_tiers;
  const key  = sub.subscription_keys?.key_value;
  const isLife = !tier?.price_monthly && !!tier?.price_lifetime;
  const statusKey = isLife ? "lifetime" : sub.status;
  const cfg = STATUS_CFG[statusKey] ?? STATUS_CFG.active;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErr, setImgErr]= useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.06, 0.4) }}
      whileHover={{ y: -2 }}
      className="card card-lift p-5 flex flex-col gap-4"
      aria-label={`Produto: ${prod?.name ?? "Desconhecido"}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div
          className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 relative"
          style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)" }}
        >
          {prod?.logo_url && !imgErr ? (
            <>
              {!imgLoaded && <div className="absolute inset-0 skeleton" />}
              <img
                src={prod.logo_url}
                alt={prod?.name}
                className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgErr(true)}
              />
            </>
          ) : (
            <span className="text-sm font-bold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              {prod?.name?.slice(0, 2).toUpperCase() ?? "?"}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            {prod?.name ?? "Produto"}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {tier?.tier_name ?? "Plano"}
          </p>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
          <span className={`${cfg.cls}`}>{cfg.label}</span>
        </div>
      </div>

      {/* License Key */}
      {key && (
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
        >
          <p
            className="text-[9px] uppercase tracking-widest font-semibold mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            License Key
          </p>
          <div className="flex items-center justify-between gap-2">
            <code
              className="text-xs font-mono truncate flex-1"
              style={{ color: "var(--brand)" }}
            >
              {key}
            </code>
            <CopyBtn value={key} label="Copiar" />
          </div>
        </div>
      )}

      {/* Past due warning */}
      {sub.status === "past_due" && (
        <div
          className="rounded-xl p-3 flex items-start gap-2"
          style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            Pagamento com problema. Atualize seu método de pagamento para manter o acesso.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap mt-auto">
        {prod?.slug && (
          <Link
            href={`/produtos/${prod.slug ?? prod.id}`}
            className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
          >
            <ExternalLink size={11} />
            Ver produto
          </Link>
        )}
        {tier?.calendar_link && tier.has_consultancy && (
          <a
            href={tier.calendar_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            style={{ color: "#a78bfa", borderColor: "rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.06)" }}
          >
            <Calendar size={11} />
            Agendar consultoria
          </a>
        )}
      </div>
    </motion.article>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SubCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="card p-5 space-y-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="skeleton w-12 h-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-3/5 rounded" />
              <div className="skeleton h-2.5 w-2/5 rounded" />
            </div>
            <div className="skeleton h-5 w-14 rounded-full" />
          </div>
          <div className="skeleton h-12 w-full rounded-xl" />
          <div className="flex gap-2">
            <div className="skeleton h-8 w-24 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  const steps = [
    { icon: ShoppingBag, label: "Explore o catálogo", href: "/explorar", desc: "Descubra SaaS e ferramentas de IA" },
    { icon: Zap,         label: "Compre um produto",  href: "/explorar", desc: "Checkout seguro com PIX ou cartão" },
    { icon: Award,       label: "Acesse imediatamente",href: "/explorar", desc: "Licença liberada em segundos" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-12"
    >
      {/* Glow decoration */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 relative"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="absolute inset-0 rounded-3xl animate-pulse-glow"
          style={{ background: "radial-gradient(circle, rgba(34,212,160,0.12) 0%, transparent 70%)" }}
        />
        <Package size={28} style={{ color: "var(--text-muted)" }} />
      </div>

      <h3
        className="text-lg font-bold mb-2"
        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
      >
        Nenhum produto adquirido ainda
      </h3>
      <p className="text-sm mb-10 max-w-sm mx-auto" style={{ color: "var(--text-muted)" }}>
        Explore o catálogo e encontre a ferramenta de IA perfeita para o seu negócio.
      </p>

      {/* Onboarding steps */}
      <div className="max-w-sm mx-auto space-y-3 mb-8 text-left">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="card p-4 flex items-center gap-4"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(34,212,160,0.1)", border: "1px solid rgba(34,212,160,0.2)" }}
              >
                <Icon size={15} style={{ color: "var(--brand)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                  {i + 1}. {s.label}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
              </div>
              <ChevronRight size={13} style={{ color: "var(--text-faint)" }} />
            </motion.div>
          );
        })}
      </div>

      <Link href="/explorar" className="btn-primary px-6 py-3 text-sm inline-flex">
        <Sparkles size={14} />
        Explorar o catálogo
        <ArrowRight size={14} />
      </Link>
    </motion.div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────
export default function BuyerDashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Buscar nome e assinaturas em paralelo
        const [profileRes, subsRes] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", session.user.id).single(),
          supabase
            .from("subscriptions")
            .select(`
              id, status, created_at,
              product_tiers(
                id, tier_name, price_monthly, price_lifetime,
                has_consultancy, calendar_link,
                saas_products(id, name, delivery_method, magic_link_url, provisioning_webhook_url, slug, logo_url)
              ),
              subscription_keys(key_value)
            `)
            .eq("user_id", session.user.id)
            .neq("status", "canceled")
            .order("created_at", { ascending: false }),
        ]);

        setUserName(profileRes.data?.full_name ?? "");
        setSubs((subsRes.data ?? []) as unknown as Subscription[]);
      } catch {
        toast.error("Erro ao carregar seus produtos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const firstName = userName.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1
          className="text-2xl font-bold tracking-tight mb-1"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          {firstName ? `${greeting}, ${firstName}! 👋` : "Minhas compras"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {loading
            ? "Carregando seus acessos..."
            : subs.length === 0
              ? "Explore o catálogo e encontre sua próxima ferramenta."
              : `${subs.length} produto${subs.length !== 1 ? "s" : ""} no seu plano`}
        </p>
      </motion.div>

      {/* Quick links */}
      <div className="flex gap-2 flex-wrap mb-8">
        {[
          { label: "Pedidos",      href: "/buyer/pedidos",    icon: ShoppingBag },
          { label: "Certificados", href: "/buyer/certificados", icon: Award },
          { label: "Explorar",     href: "/explorar",          icon: Zap },
        ].map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="btn-secondary text-xs px-4 py-2 gap-1.5"
          >
            <Icon size={12} />
            {label}
          </Link>
        ))}
      </div>

      {/* Conteúdo principal */}
      <AnimatePresence mode="wait">
        {loading ? (
          <SubCardSkeleton count={6} />
        ) : subs.length === 0 ? (
          <EmptyState />
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {subs.map((sub, i) => (
              <SubCard key={sub.id} sub={sub} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
