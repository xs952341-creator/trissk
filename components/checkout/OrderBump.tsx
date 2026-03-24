"use client";

/**
 * OrderBump — Componente de oferta de 1 clique no checkout.
 * Padrão Apple: animação fluida, acessibilidade completa, sem dependências externas além de framer-motion.
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2, Circle, Clock, Shield, Zap } from "lucide-react";

// ── Tipagem Estrita ────────────────────────────────────────────────────────
interface OrderBumpFeature {
  label: string;
  icon?: React.ReactNode;
}

interface OrderBumpProps {
  /** Título da oferta adicional */
  title: string;
  /** Descrição persuasiva */
  description: string;
  /** Preço em BRL (número puro, ex: 150) */
  priceBRL: number;
  /** Preço original riscado (para mostrar desconto, opcional) */
  originalPriceBRL?: number;
  /** Features rápidas opcionais */
  features?: OrderBumpFeature[];
  /** Label do badge (padrão "Oferta Especial") */
  badgeLabel?: string;
  /** Callback ao alternar seleção */
  onToggle: (isSelected: boolean) => void;
  /** Estado inicial selecionado */
  defaultSelected?: boolean;
}

// ── Formatador de moeda seguro ─────────────────────────────────────────────
function formatBRL(value: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
}

export default function OrderBump({
  title,
  description,
  priceBRL,
  originalPriceBRL,
  features = [],
  badgeLabel = "Oferta Especial",
  onToggle,
  defaultSelected = false,
}: OrderBumpProps) {
  const [isSelected, setIsSelected] = useState(defaultSelected);

  const handleToggle = useCallback(() => {
    const next = !isSelected;
    setIsSelected(next);
    onToggle(next);
  }, [isSelected, onToggle]);

  const discount =
    originalPriceBRL && originalPriceBRL > priceBRL
      ? Math.round(((originalPriceBRL - priceBRL) / originalPriceBRL) * 100)
      : null;

  return (
    <motion.div
      initial={false}
      animate={{
        borderColor: isSelected
          ? "rgba(34, 212, 160, 0.6)"
          : "rgba(255,255,255,0.09)",
        backgroundColor: isSelected
          ? "rgba(34, 212, 160, 0.04)"
          : "rgba(13,17,23,0.6)",
      }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      onClick={handleToggle}
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`Adicionar ${title} por ${formatBRL(priceBRL)}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle();
        }
      }}
      className="relative mt-5 mb-2 cursor-pointer rounded-2xl border-2 border-dashed p-5 select-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:outline-none transition-shadow duration-200"
      style={{
        boxShadow: isSelected
          ? "0 0 0 1px rgba(34,212,160,0.3), 0 4px 24px rgba(34,212,160,0.08)"
          : "none",
      }}
    >
      {/* Badge flutuante */}
      <div className="absolute -top-3.5 left-4 flex items-center gap-1.5 bg-gradient-to-r from-brand to-brand-light px-3 py-1 rounded-full shadow-brand">
        <Sparkles className="h-3 w-3 text-black/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-black/70">
          {badgeLabel}
        </span>
        {discount && (
          <span className="ml-1 text-[10px] font-black text-black/80">
            -{discount}%
          </span>
        )}
      </div>

      <div className="flex items-start gap-4 pt-2">
        {/* Checkbox animado */}
        <div className="mt-0.5 flex-shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {isSelected ? (
              <motion.div
                key="checked"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.15, type: "spring", stiffness: 400, damping: 20 }}
              >
                <CheckCircle2 className="h-6 w-6 fill-brand text-surface-0" />
              </motion.div>
            ) : (
              <motion.div
                key="unchecked"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Circle className="h-6 w-6 text-zinc-600" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-zinc-100 leading-snug mb-1" style={{ fontFamily: "var(--font-display)" }}>
            Sim! Adicionar: {title}
          </h4>
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">{description}</p>

          {/* Features rápidas */}
          {features.length > 0 && (
            <ul className="flex flex-col gap-1 mb-3">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="text-brand">{f.icon ?? <Shield size={10} />}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          )}

          {/* Preço */}
          <div className="flex items-baseline gap-2">
            {originalPriceBRL && (
              <span className="text-xs text-zinc-600 line-through">{formatBRL(originalPriceBRL)}</span>
            )}
            <span className="text-sm font-bold text-zinc-100">
              + {formatBRL(priceBRL)}
            </span>
            <span className="text-[10px] text-zinc-600">adicionais</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
