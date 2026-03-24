// lib/stripe-client.ts
// ✅ Centraliza a inicialização do Stripe no client-side.
// Importe `getStripe()` sempre que precisar de loadStripe no browser.

import { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY } from "@/lib/env";
import type { Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    // Se você não usa Stripe no browser (ex.: checkout hosted), não quebra o app.
    if (!key) {
      stripePromise = Promise.resolve(null);
      return stripePromise;
    }

    // Lazy-load para não aumentar o bundle em páginas que não usam Stripe
    stripePromise = import("@stripe/stripe-js").then(({ loadStripe }) => loadStripe(key));
  }
  return stripePromise;
}
