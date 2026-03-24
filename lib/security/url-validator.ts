/**
 * lib/security/url-validator.ts
 * Proteção contra SSRF (Server-Side Request Forgery).
 *
 * Impede que vendors configurem URLs internas (localhost, redes privadas,
 * endpoints de metadata de cloud AWS/GCP/Azure).
 */

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

const PRIVATE_IP_REGEX = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1|fc00:|fd)/i;
const METADATA_ENDPOINTS = [
  "169.254.169.254",       // AWS/GCP/Azure instance metadata
  "metadata.google.internal",
  "metadata.internal",
];

/**
 * Valida se uma URL é segura para requests de servidor.
 * Lança SSRFError se a URL for suspeita.
 */
export function validateWebhookUrl(rawUrl: string, context = "webhook"): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SSRFError(`[${context}] URL inválida: ${rawUrl}`);
  }

  // Apenas HTTPS em produção
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new SSRFError(`[${context}] Apenas HTTPS é permitido em produção. Recebido: ${parsed.protocol}`);
  }

  // Bloquear schemas não-HTTP
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new SSRFError(`[${context}] Schema não permitido: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();

  // Bloquear IPs privados e loopback
  if (PRIVATE_IP_REGEX.test(host)) {
    throw new SSRFError(`[${context}] IP privado/interno não permitido: ${host}`);
  }

  // Bloquear endpoints de metadata de cloud
  if (METADATA_ENDPOINTS.some((m) => host === m || host.endsWith(`.${m}`))) {
    throw new SSRFError(`[${context}] Metadata endpoint de cloud não permitido: ${host}`);
  }

  return parsed;
}

export function isWebhookUrlSafe(rawUrl: string, context = "webhook"): boolean {
  try {
    validateWebhookUrl(rawUrl, context);
    return true;
  } catch {
    return false;
  }
}
