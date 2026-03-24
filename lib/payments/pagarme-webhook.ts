// lib/payments/pagarme-webhook.ts
// Validação de assinatura do postback/webhook do Pagar.me.
// Docs (v2/v3): X-Hub-Signature = HMAC-SHA1(rawBody, apiKey)

import crypto from "crypto";
import { PAGARME_API_KEY } from "@/lib/payments/env";

function safeEqualHex(a: string, b: string): boolean {
  // Compare as hex-decoded buffers for timing-safe equality
  // If lengths differ (different hex strings), return false immediately
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyPagarmePostbackSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
}): boolean {
  // Se não há api key configurada, falha fechado (segurança)
  if (!PAGARME_API_KEY) return false;

  const received = (opts.signatureHeader ?? "").trim();
  if (!received) return false;

  const expected = crypto
    .createHmac("sha1", PAGARME_API_KEY)
    .update(opts.rawBody, "utf8")
    .digest("hex");

  // Header costuma vir apenas com o hex. Mantemos comparação direta.
  return safeEqualHex(expected, received);
}
