"use client";
// components/GA4.tsx
// useSearchParams requer Suspense no Next.js 14 — componente interno isolado.

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NEXT_PUBLIC_GA4_ID } from "@/lib/runtime-config";

declare global {
  interface Window { gtag?: (command: string, ...args: (string | Record<string, unknown>)[]) => void; }
}

const GA4_ID = NEXT_PUBLIC_GA4_ID;

function GA4Inner() {
  const pathname   = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA4_ID) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    window.gtag?.("event", "page_view", { page_path: url });
  }, [pathname, searchParams]);

  return null;
}

export default function GA4() {
  return (
    <Suspense fallback={null}>
      <GA4Inner />
    </Suspense>
  );
}
