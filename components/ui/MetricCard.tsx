"use client";

import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  /** Percentage change vs previous period (e.g. +12.5 or -3.2) */
  change?: number;
  /** Optional icon to display alongside the label */
  icon?: ReactNode;
  /** Optional prefix for the value (e.g. "R$") */
  prefix?: string;
  /** Optional suffix for the value (e.g. "%") */
  suffix?: string;
  /** Optional click handler */
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  label,
  value,
  change,
  icon,
  prefix,
  suffix,
  onClick,
  className = "",
}: MetricCardProps) {
  const changeColor =
    change === undefined ? "" :
    change > 0 ? "text-emerald-400" :
    change < 0 ? "text-red-400" :
    "text-zinc-500";

  const ChangeIcon =
    change === undefined ? null :
    change > 0 ? TrendingUp :
    change < 0 ? TrendingDown :
    Minus;

  return (
    <div
      className={`rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 flex flex-col gap-1 ${onClick ? "cursor-pointer hover:bg-white/[0.05] transition-colors" : ""} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-medium">{label}</p>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>

      <p className="text-xl font-semibold text-zinc-100 tabular-nums">
        {prefix && <span className="text-zinc-400 text-sm mr-1">{prefix}</span>}
        {value}
        {suffix && <span className="text-zinc-400 text-sm ml-1">{suffix}</span>}
      </p>

      {change !== undefined && ChangeIcon && (
        <div className={`flex items-center gap-1 ${changeColor}`}>
          <ChangeIcon className="w-3 h-3" />
          <span className="text-xs tabular-nums">
            {change > 0 ? "+" : ""}{change.toFixed(1)}%
          </span>
          <span className="text-xs text-zinc-600">vs período anterior</span>
        </div>
      )}
    </div>
  );
}

/** Grid wrapper para múltiplos MetricCards */
export function MetricGrid({
  children,
  cols = 4,
  className = "",
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const gridCols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" }[cols];
  return (
    <div className={`grid ${gridCols} gap-3 ${className}`}>
      {children}
    </div>
  );
}
