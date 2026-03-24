"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center py-16 px-4 ${className}`}>
      {icon && (
        <div className="mb-4 text-zinc-600 flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
