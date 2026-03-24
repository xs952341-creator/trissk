"use client";

import type { ReactNode } from "react";

interface SkeletonProps {
  className?: string;
}

/** Skeleton loader base — animate-pulse shimmer */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-zinc-800/80 ${className}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton para uma linha de texto */
export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Skeleton para card de métrica */
export function SkeletonMetricCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Skeleton para linha de tabela */
export function SkeletonTableRow({
  cols = 4,
  className = "",
}: {
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-4 px-4 py-3 border-b border-zinc-800 ${className}`}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 flex-1 ${i === 0 ? "max-w-[120px]" : ""}`}
        />
      ))}
    </div>
  );
}

/** Skeleton para um card de produto */
export function SkeletonProductCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-7 flex-1 rounded-lg" />
        <Skeleton className="h-7 w-16 rounded-lg" />
      </div>
    </div>
  );
}

/** Layout de skeleton para um dashboard inteiro */
export function SkeletonDashboard({ className = "" }: SkeletonProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>
      {/* Table */}
      <div className="rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonTableRow key={i} cols={4} />
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
