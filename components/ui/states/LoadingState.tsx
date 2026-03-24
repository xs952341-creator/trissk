"use client";

interface LoadingStateProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingState({
  label = "Carregando...",
  size = "md",
  className = "",
}: LoadingStateProps) {
  const spinnerSize = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" }[size];
  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];
  const padding = { sm: "py-8", md: "py-16", lg: "py-24" }[size];

  return (
    <div className={`flex flex-col items-center justify-center ${padding} text-zinc-400 ${className}`}>
      <div
        className={`animate-spin ${spinnerSize} border-2 border-zinc-600 border-t-emerald-400 rounded-full mb-3`}
        aria-hidden="true"
      />
      <p className={`${textSize} text-zinc-500`}>{label}</p>
    </div>
  );
}

/** Inline spinner para botões e cards */
export function InlineSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block h-4 w-4 animate-spin border-2 border-zinc-500 border-t-emerald-400 rounded-full ${className}`}
      aria-hidden="true"
    />
  );
}
