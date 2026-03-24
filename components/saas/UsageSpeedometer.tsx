"use client";
/**
 * components/saas/UsageSpeedometer.tsx
 * Velocímetro de consumo para planos SaaS com cobrança por uso (Metered Billing).
 *
 * Usado em: app/(dashboards)/buyer/meus-acessos/page.tsx
 * para produtos com tipo "saas" que tenham limites de uso.
 *
 * Features:
 *  - Barra de progresso animada com cor semântica (verde → amarelo → vermelho)
 *  - Módulo de upsell contextual (botão "Aumentar limite" só aparece acima de 75%)
 *  - Tooltip com detalhes ao passar o rato sobre a barra
 *  - Reset automático no início do ciclo de faturação
 *  - Skeleton loading state
 *  - 100% acessível (ARIA progressbar)
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Zap, AlertTriangle, ArrowUpCircle,
  HelpCircle, TrendingUp, Clock,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface UsageSpeedometerProps {
  /** Título da métrica. Ex: "Créditos de IA", "Emails Enviados" */
  title:         string;
  /** Descrição curta opcional. Ex: "geração de conteúdo" */
  description?:  string;
  /** Uso atual no ciclo */
  currentUsage:  number;
  /** Limite máximo do plano */
  maxLimit:      number;
  /** Unidade de medida. Ex: "créditos", "emails", "requisições" */
  unitName:      string;
  /** Data de reset do ciclo (ISO string ou Date) */
  resetDate?:    string | Date | null;
  /** Chamado quando utilizador clica em "Aumentar Limite" */
  onUpgradePlan: () => void;
  /** Se true, mostra skeleton de loading */
  loading?:      boolean;
}

// ── Formatadores ───────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function fmtDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function SpeedometerSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="skeleton w-11 h-11 rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-36 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        </div>
        <div className="text-right space-y-2">
          <div className="skeleton h-7 w-20 rounded" />
          <div className="skeleton h-3 w-28 rounded" />
        </div>
      </div>
      <div className="skeleton h-3 w-full rounded-full mb-5" />
      <div className="flex justify-between items-center pt-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton h-8 w-32 rounded-xl" />
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function UsageSpeedometer({
  title,
  description,
  currentUsage,
  maxLimit,
  unitName,
  resetDate,
  onUpgradePlan,
  loading = false,
}: UsageSpeedometerProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (loading) return <SpeedometerSkeleton />;

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const safeCurrent = Math.max(0, currentUsage);
  const safeMax     = Math.max(1, maxLimit); // evita divisão por zero
  const percentage  = Math.min(100, (safeCurrent / safeMax) * 100);
  const remaining   = Math.max(0, safeMax - safeCurrent);

  // Semântica de cores
  const isCritical  = percentage >= 90;
  const isWarning   = percentage >= 75 && !isCritical;
  const isHealthy   = !isCritical && !isWarning;

  const barColor   = isCritical ? "#f87171" : isWarning ? "#fbbf24" : "var(--brand)";
  const textColor  = isCritical ? "#f87171" : isWarning ? "#fbbf24" : "var(--brand)";
  const bgGlow     = isCritical
    ? "rgba(248,113,113,0.08)"
    : isWarning
    ? "rgba(245,158,11,0.08)"
    : "rgba(34,212,160,0.05)";
  const borderColor = isCritical
    ? "rgba(248,113,113,0.2)"
    : isWarning
    ? "rgba(245,158,11,0.2)"
    : "var(--border-subtle)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6 relative overflow-hidden"
      style={{ borderColor }}
    >
      {/* Glow de fundo baseado no status */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top right, ${bgGlow} 0%, transparent 70%)` }}
        aria-hidden="true"
      />

      {/* Cabeçalho */}
      <div className="relative flex justify-between items-start mb-6">
        {/* Ícone + título */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: `${barColor}12`,
              border: `1px solid ${barColor}30`,
            }}
          >
            <Activity size={18} style={{ color: barColor }} />
          </div>
          <div>
            <p
              className="text-sm font-bold"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              {title}
            </p>
            {description && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Contador */}
        <div className="text-right">
          <p
            className="text-2xl font-black leading-none"
            style={{ fontFamily: "var(--font-display)", color: textColor }}
          >
            {fmtNum(safeCurrent)}
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
            de {fmtNum(safeMax)} {unitName}
          </p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="relative mb-2">
        <div
          className="w-full h-2.5 rounded-full overflow-hidden"
          style={{ background: "var(--surface-3)" }}
          role="progressbar"
          aria-valuenow={safeCurrent}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          aria-label={`${title}: ${fmtNum(safeCurrent)} de ${fmtNum(safeMax)} ${unitName}`}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background: isCritical
                ? "linear-gradient(90deg,#f87171,#fca5a5)"
                : isWarning
                ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                : "linear-gradient(90deg,var(--brand-dim),var(--brand))",
            }}
          />
        </div>

        {/* Tooltip */}
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
            >
              <div
                className="rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap"
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  boxShadow: "var(--shadow-elevated)",
                }}
              >
                {fmtNum(remaining)} {unitName} restantes ({(100 - percentage).toFixed(0)}%)
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Labels da barra */}
      <div className="flex justify-between mb-5">
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>0</span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {fmtNum(Math.round(safeMax / 2))}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {fmtNum(safeMax)}
        </span>
      </div>

      {/* Rodapé */}
      <div
        className="flex items-center justify-between pt-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {/* Aviso ou info de reset */}
        <div>
          {isCritical ? (
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={13} className="animate-pulse" style={{ color: "#f87171" }} />
              <p className="text-xs font-semibold" style={{ color: "#f87171" }}>
                Quase no limite — serviço pode ser pausado
              </p>
            </div>
          ) : isWarning ? (
            <div className="flex items-center gap-1.5">
              <TrendingUp size={13} style={{ color: "#fbbf24" }} />
              <p className="text-xs font-medium" style={{ color: "#fbbf24" }}>
                Uso elevado — considere ampliar o limite
              </p>
            </div>
          ) : resetDate ? (
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: "var(--text-faint)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Renova em <span className="font-semibold">{fmtDate(resetDate)}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: "var(--text-faint)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Renova no início do próximo ciclo
              </p>
            </div>
          )}
        </div>

        {/* Botão de upsell — só aparece acima de 75% */}
        <AnimatePresence>
          {(isWarning || isCritical) && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={onUpgradePlan}
              className="group flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all"
              style={{
                background: isCritical ? "rgba(248,113,113,0.1)" : "rgba(245,158,11,0.1)",
                border: `1px solid ${isCritical ? "rgba(248,113,113,0.3)" : "rgba(245,158,11,0.3)"}`,
                color: isCritical ? "#f87171" : "#fbbf24",
              }}
              aria-label="Aumentar limite de uso do plano"
            >
              <Zap
                size={12}
                className="group-hover:scale-110 transition-transform"
              />
              Aumentar Limite
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Versão compacta para dashboards ───────────────────────────────────────────
export function UsageMiniBar({
  label,
  current,
  max,
  unit,
}: {
  label:   string;
  current: number;
  max:     number;
  unit:    string;
}) {
  const pct      = Math.min(100, (Math.max(0, current) / Math.max(1, max)) * 100);
  const color    = pct >= 90 ? "#f87171" : pct >= 75 ? "#fbbf24" : "var(--brand)";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>
          {fmtNum(current)} / {fmtNum(max)} {unit}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--surface-3)" }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${current} de ${max} ${unit}`}
      >
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7 }}
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
