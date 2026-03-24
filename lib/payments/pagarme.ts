// lib/payments/pagarme.ts
// Pagar.me Payment Link integration (installments).
// This is OPTIONAL: if PAGARME_API_KEY is missing, callers should treat it as unavailable.

import { PAGARME_API_KEY } from "@/lib/payments/env";

type PagarmeEnv = "test" | "prod";

function inferEnvFromKey(key: string): PagarmeEnv {
  // Docs indicate test accounts use the SDX base URL.
  // We'll infer by common prefix.
  return key.startsWith("sk_test") ? "test" : "prod";
}

function baseUrl(key: string): string {
  const env = inferEnvFromKey(key);
  return env === "test" ? "https://sdx-api.pagar.me" : "https://api.pagar.me";
}

function basicAuthHeader(key: string) {
  // Basic auth: base64("api_key:")
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

export async function pagarmeCreatePaymentLink(opts: {
  name: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  maxInstallments?: number;
  metadata?: Record<string, string>;
  postbackUrl?: string;
}): Promise<{ id: string; url: string } | null> {
  const key = PAGARME_API_KEY;
  if (!key) return null;

  const max = Math.min(12, Math.max(1, opts.maxInstallments ?? 12));
  const installments = Array.from({ length: max }, (_, i) => ({
    number: i + 1,
    total: opts.amountCents,
  }));

  const body: Record<string, unknown> = {
    is_building: false,
    name: opts.name,
    type: "order",
    payment_settings: {
      accepted_payment_methods: ["credit_card"],
      credit_card_settings: {
        operation_type: "auth_and_capture",
        installments_setup: { interest_type: "simple" },
        installments,
      },
    },
    cart_settings: {
      items: [
        {
          amount: opts.amountCents,
          name: opts.name,
          default_quantity: 1,
        },
      ],
    },
    layout_settings: {
      // Keep default Pagar.me layout
    },
    redirect_url: {
      success: opts.successUrl,
      failure: opts.cancelUrl,
    },
    ...(opts.postbackUrl ? { postback_url: opts.postbackUrl } : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };

  const res = await fetch(`${baseUrl(key)}/core/v5/paymentlinks`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(key),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[pagarme] create paymentlink failed", res.status, json);
    return null;
  }

  // Response commonly returns id + url.
  const id = json.id ?? json.payment_link?.id ?? null;
  const url = json.url ?? json.payment_link?.url ?? json.checkout_url ?? null;
  if (!id || !url) return null;
  return { id, url };
}
