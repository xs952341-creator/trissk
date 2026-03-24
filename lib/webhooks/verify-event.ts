// lib/webhooks/verify-event.ts
// Verifica a assinatura do evento Stripe e retorna o evento tipado.
// Isolado aqui para facilitar testes unitários sem precisar de HTTP.

import Stripe from "stripe";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "@/lib/env-server";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export { verifyStripeEvent };

async function verifyStripeEvent(req: Request): Promise<Stripe.Event | null> {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature");

  if (!sig) return null;

  try {
    return stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
}
