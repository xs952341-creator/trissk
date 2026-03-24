"use client";

import React from "react";

function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="card p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center gap-3">
        <Sk className="w-12 h-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Sk className="h-3.5 w-3/5 rounded" />
          <Sk className="h-2.5 w-2/5 rounded" />
        </div>
      </div>
      <Sk className="h-2 w-full rounded" />
      <Sk className="h-2 w-4/5 rounded" />
      <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <Sk className="h-4 w-16 rounded" />
        <Sk className="h-7 w-12 rounded-lg" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card p-5 flex flex-col gap-2 animate-pulse">
      <div className="flex items-center justify-between">
        <Sk className="h-3 w-24 rounded" />
        <Sk className="h-8 w-8 rounded-xl" />
      </div>
      <Sk className="h-8 w-32 rounded mt-1" />
      <Sk className="h-2.5 w-20 rounded" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Sk className={`h-3 rounded ${i === 0 ? "w-32" : i === cols - 1 ? "w-16" : "w-24"}`} />
        </td>
      ))}
    </tr>
  );
}

export function VendorDashboardSkeleton() {
  return (
    <div className="p-6 space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Sk className="h-7 w-48 rounded-lg" />
          <Sk className="h-3.5 w-32 rounded" />
        </div>
        <Sk className="h-10 w-36 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <StatCardSkeleton key={i} />)}
      </div>
      <div className="card p-5 space-y-4">
        <Sk className="h-4 w-40 rounded" />
        <Sk className="h-48 w-full rounded-xl" />
      </div>
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Sk className="h-4 w-28 rounded" />
        </div>
        <table className="w-full">
          <tbody>
            {[1,2,3,4,5].map(i => <TableRowSkeleton key={i} cols={5} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8 animate-pulse">
      <div className="flex items-start gap-5">
        <Sk className="w-16 h-16 rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Sk className="h-6 w-56 rounded-lg" />
          <Sk className="h-4 w-32 rounded" />
          <Sk className="h-3 w-full rounded mt-2" />
          <Sk className="h-3 w-4/5 rounded" />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[1,2,3].map(i => (
          <div key={i} className="card p-5 space-y-3">
            <Sk className="h-4 w-24 rounded" />
            <Sk className="h-8 w-20 rounded-lg" />
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {[1,2,3].map(j => <Sk key={j} className="h-2.5 w-full rounded" />)}
            </div>
            <Sk className="h-10 w-full rounded-xl mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CatalogSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return <div className="w-full rounded-xl skeleton" style={{ height }} aria-hidden="true" />;
}

export function BuyerDashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="space-y-2">
        <Sk className="h-7 w-52 rounded-lg" />
        <Sk className="h-3.5 w-36 rounded" />
      </div>
      <div className="flex gap-2">
        {[1,2,3].map(i => <Sk key={i} className="h-9 w-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => <ProductCardSkeleton key={i} />)}
      </div>
    </div>
  );
}
