"use client";

/**
 * ProactiveInsights — Painel de insights acionáveis estilo Shopify.
 * Mostra alertas e oportunidades baseados em dados reais do vendedor.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingDown, TrendingUp, AlertTriangle, ShoppingCart,
  Users, Zap, ChevronRight, X, Lightbulb,
} from "lucide-react";

type InsightSeverity = "critical" | "warning" | "opportunity" | "success";

interface Insight {
  id: string;
  severity: InsightSeverity;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: string;
  ctaHref?: string;
}

interface ProactiveInsightsProps {
  insights: Insight[];
  onDismiss?: (id: string) => void;
}

const SEVERITY_STYLES: Record<InsightSeverity, { border: string; bg: string; icon: string; badge: string }> = {
  critical:    { border: "border-rose-500/30",   bg: "bg-rose-500/[0.04]",    icon: "text-rose-400",   badge: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  warning:     { border: "border-amber-500/30",  bg: "bg-amber-500/[0.04]",   icon: "text-amber-400",  badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  opportunity: { border: "border-sky-500/30",    bg: "bg-sky-500/[0.04]",     icon: "text-sky-400",    badge: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  success:     { border: "border-brand/30",      bg: "bg-brand/[0.04]",       icon: "text-brand",      badge: "bg-brand/10 text-brand border-brand/20" },
};

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  critical:    "Atenção",
  warning:     "Aviso",
  opportunity: "Oportunidade",
  success:     "Destaque",
};

function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss?: () => void }) {
  const s = SEVERITY_STYLES[insight.severity];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className={`relative rounded-2xl border p-4 flex items-start gap-3 ${s.border} ${s.bg}`}
    >
      {/* Severity icon */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${s.badge} border`}>
        <span className="text-sm">{insight.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[9px] font-black uppercase tracking-widest ${s.icon} border rounded-full px-2 py-0.5 ${s.badge}`}>
            {SEVERITY_LABELS[insight.severity]}
          </span>
        </div>
        <p className="text-sm font-semibold text-zinc-100 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
          {insight.title}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{insight.description}</p>

        {/* CTA */}
        {insight.cta && (
          <a
            href={insight.ctaHref ?? "#"}
            className={`inline-flex items-center gap-1 mt-2 text-xs font-semibold transition-colors hover:underline ${s.icon}`}
          >
            {insight.cta}
            <ChevronRight size={12} />
          </a>
        )}
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0 mt-0.5"
          aria-label="Dispensar insight"
        >
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}

export default function ProactiveInsights({ insights, onDismiss }: ProactiveInsightsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const visible = insights.filter(i => !dismissed.has(i.id));

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    onDismiss?.(id);
  };

  if (visible.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 mb-3 group"
      >
        <div className="w-6 h-6 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
          <Lightbulb size={12} className="text-brand" />
        </div>
        <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors" style={{fontFamily:"var(--font-display)"}}>
          Insights do sistema ({visible.length})
        </span>
        <ChevronRight
          size={13}
          className={`text-zinc-600 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {visible.map(insight => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onDismiss={() => handleDismiss(insight.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Factory de insights pré-definidos ─────────────────────────────────────────
export function buildInsights(data: {
  conversionDrop?: number;
  abandonedCarts?: number;
  churnRate?: number;
  mrr?: number;
  mrrGrowth?: number;
  pendingPayouts?: number;
}): Insight[] {
  const insights: Insight[] = [];

  if (data.conversionDrop && data.conversionDrop > 10) {
    insights.push({
      id: "conversion-drop",
      severity: "critical",
      icon: <TrendingDown size={14} />,
      title: `Taxa de conversão caiu ${data.conversionDrop}% nas últimas 24h`,
      description: "Verifique se há problemas no seu checkout, preço ou oferta. Isso pode estar custando vendas agora.",
      cta: "Ver dicas de otimização",
      ctaHref: "/vendor/analytics",
    });
  }

  if (data.abandonedCarts && data.abandonedCarts > 0) {
    insights.push({
      id: "abandoned-carts",
      severity: "opportunity",
      icon: <ShoppingCart size={14} />,
      title: `${data.abandonedCarts} carrinhos abandonados nos últimos 7 dias`,
      description: "Enviar um cupom de recuperação de 10% pode trazer de volta 20-30% desses compradores automaticamente.",
      cta: "Disparar cupom de recuperação",
      ctaHref: "/vendor/email-marketing",
    });
  }

  if (data.churnRate && data.churnRate > 5) {
    insights.push({
      id: "high-churn",
      severity: "warning",
      icon: <Users size={14} />,
      title: `Churn de ${data.churnRate}% está acima da média (3%)`,
      description: "Considere adicionar onboarding guiado, mais conteúdo ou melhorar o suporte para reduzir cancelamentos.",
      cta: "Analisar cohort de retenção",
      ctaHref: "/admin/cohort",
    });
  }

  if (data.mrrGrowth && data.mrrGrowth > 15) {
    insights.push({
      id: "mrr-growth",
      severity: "success",
      icon: <TrendingUp size={14} />,
      title: `MRR cresceu ${data.mrrGrowth}% este mês! 🎉`,
      description: "Excelente performance. Considere investir mais em aquisição enquanto o produto está com momentum.",
    });
  }

  if (data.pendingPayouts && data.pendingPayouts > 0) {
    insights.push({
      id: "pending-payouts",
      severity: "opportunity",
      icon: <Zap size={14} />,
      title: `R$ ${data.pendingPayouts.toLocaleString("pt-BR")} disponíveis para saque`,
      description: "Você tem saldo disponível para transferência. Saque já disponível.",
      cta: "Solicitar saque",
      ctaHref: "/vendor/payouts",
    });
  }

  return insights;
}
