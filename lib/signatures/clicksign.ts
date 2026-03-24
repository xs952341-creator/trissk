// lib/signatures/clicksign.ts
// Clicksign API v3 (Envelope) - optional integration.
// If CLICKSIGN_ACCESS_TOKEN is missing, functions return null.

import { CLICKSIGN_ACCESS_TOKEN, CLICKSIGN_BASE_URL } from "@/lib/signatures/env";

function headers() {
  return {
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
    Authorization: `Bearer ${CLICKSIGN_ACCESS_TOKEN}`,
  };
}

export async function clicksignCreateEnvelope(opts: { name: string; }): Promise<{ envelopeId: string } | null> {
  if (!CLICKSIGN_ACCESS_TOKEN) return null;
  const res = await fetch(`${CLICKSIGN_BASE_URL}/api/v3/envelopes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "envelopes",
        attributes: {
          name: opts.name,
          locale: "pt-BR",
        },
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[clicksign] create envelope failed", res.status, json);
    return null;
  }
  const envelopeId = json?.data?.id ?? null;
  if (!envelopeId) return null;
  return { envelopeId };
}

export async function clicksignUploadDocument(opts: {
  envelopeId: string;
  filename: string;
  base64: string;
}): Promise<{ documentId: string } | null> {
  if (!CLICKSIGN_ACCESS_TOKEN) return null;
  const res = await fetch(`${CLICKSIGN_BASE_URL}/api/v3/envelopes/${opts.envelopeId}/documents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "documents",
        attributes: {
          filename: opts.filename,
          content_base64: opts.base64,
        },
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[clicksign] upload document failed", res.status, json);
    return null;
  }
  const documentId = json?.data?.id ?? null;
  if (!documentId) return null;
  return { documentId };
}
