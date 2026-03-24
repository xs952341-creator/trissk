"use client";

import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  message: string;
  retry?: () => void;
  className?: string;
}

export function ErrorState({ message, retry, className = "" }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center text-center py-16 px-4 ${className}`}>
      <div className="mb-4 flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20">
        <AlertCircle className="w-5 h-5 text-red-400" />
      </div>
      <p className="text-sm text-red-400 max-w-sm leading-relaxed mb-4">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
