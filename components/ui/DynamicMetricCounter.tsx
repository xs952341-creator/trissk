"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DynamicMetricCounterProps {
  initialValue: number;
  label?: string;
  prefix?: string;
  suffix?: string;
  incrementMin?: number;
  incrementMax?: number;
  intervalMin?: number;
  intervalMax?: number;
}

// ── Single digit with slide animation ────────────────────────────────────────
function AnimatedDigit({ digit }: { digit: string }) {
  const isNumber = /\d/.test(digit);
  if (!isNumber) {
    return (
      <span className="text-zinc-600 font-mono text-3xl md:text-4xl font-bold leading-none">
        {digit}
      </span>
    );
  }
  return (
    <span className="relative inline-block overflow-hidden h-[1.2em] w-[0.65em]">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={digit}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%",   opacity: 1 }}
          exit={{    y: "-100%", opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0, 0.67, 0] }}
          className="absolute inset-0 flex items-center justify-center font-mono text-3xl md:text-4xl font-bold leading-none text-emerald-400"
          style={{ textShadow: "0 0 20px rgba(16,185,129,0.5)" }}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

export default function DynamicMetricCounter({
  initialValue  = 50120,
  label         = "automações processadas pela nossa IA hoje",
  prefix        = "⚡",
  suffix        = "",
  incrementMin  = 1,
  incrementMax  = 3,
  intervalMin   = 4000,
  intervalMax   = 8000,
}: DynamicMetricCounterProps) {
  const [count,    setCount]    = useState(initialValue);
  const [glowing,  setGlowing]  = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const tick = () => {
      const increment = Math.floor(Math.random() * (incrementMax - incrementMin + 1)) + incrementMin;
      const delay     = Math.floor(Math.random() * (intervalMax - intervalMin)) + intervalMin;

      setCount((prev) => prev + increment);
      setGlowing(true);
      setTimeout(() => setGlowing(false), 600);

      timeoutRef.current = setTimeout(tick, delay);
    };

    timeoutRef.current = setTimeout(tick, intervalMin);
    return () => clearTimeout(timeoutRef.current);
  }, [incrementMin, incrementMax, intervalMin, intervalMax]);

  const digits = formatNumber(count).split("");

  return (
    <div className="inline-flex items-center gap-3 group">
      {/* Icon */}
      {prefix && (
        <span className="text-xl select-none">{prefix}</span>
      )}

      {/* Number */}
      <div
        className={`
          flex items-center rounded-xl px-3 py-1.5 transition-all duration-300
          bg-emerald-500/5 border border-emerald-500/10
          ${glowing ? "border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : ""}
        `}
      >
        {digits.map((d, i) => (
          <AnimatedDigit key={`${i}-${digits.length}`} digit={d} />
        ))}
        {suffix && (
          <span className="text-zinc-500 font-mono text-2xl ml-1">{suffix}</span>
        )}
      </div>

      {/* Label */}
      <span className="text-zinc-500 text-sm leading-tight max-w-[160px]">
        {label}
      </span>
    </div>
  );
}
