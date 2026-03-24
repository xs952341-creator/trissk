// lib/webhooks/outbound.ts
// Entrega confiável de webhooks outbound para endpoints dos vendors.
// Padrão: HMAC-SHA256 no header X-Webhook-Signature
// Retry: 3x com backoff exponencial (5min, 1h, 24h)
// Compatível com: Stripe webhook style, LemonSqueezy, Gumroad

import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

// ─── Tipos de evento ──────────────────────────────────────────────────────────

export type WebhookEventType =
  | "sale.created"
  | "sale.refunded"
  | "subscription.created"
  | "subscription.canceled"
  | "subscription.payment_failed"
  | "subscription.renewed"
  | "chargeback.opened"
  | "chargeback.resolved"
  | "license.created"
  | "license.revoked"
  | "instance.provisioned"
  | "instance.suspended"
  | "instance.resumed";

export interface WebhookPayload {
  id:           string;     // event UUID (para idempotência)
  type:         WebhookEventType;
  created_at:   string;     // ISO timestamp
  api_version:  string;     // "2024-01"
  data:         Record<string, unknown>;
  [key: string]: unknown;    // permite compatibilidade com Record<string, unknown>
}

// ─── Assinatura ───────────────────────────────────────────────────────────────

export function signWebhookPayload(body: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const toSign = `${ts}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(toSign).digest("hex");
  return `t=${ts},v1=${sig}`;
}

export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
  toleranceSeconds = 300 // 5 minutos
): boolean {
  const parts = Object.fromEntries(signature.split(",").map(p => p.split("=")));
  const ts = Number(parts["t"]);
  const sig = parts["v1"];

  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

  const toSign = `${ts}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(toSign).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}

// ─── Entrega HTTP ─────────────────────────────────────────────────────────────

interface DeliveryResult {
  success:    boolean;
  httpStatus: number | null;
  body:       string;
  durationMs: number;
}

async function deliverWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const signature = signWebhookPayload(body, secret);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "X-Webhook-Signature":  signature,
        "X-Webhook-Id":         payload.id,
        "X-Webhook-Event":      payload.type,
        "User-Agent":           "PlaybookHub-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(15_000), // 15s timeout
    });

    const text = await res.text().catch(() => "");
    return {
      success:    res.status >= 200 && res.status < 300,
      httpStatus: res.status,
      body:       text.slice(0, 500),
      durationMs: Date.now() - start,
    };
  } catch (e: unknown) {
    return {
      success:    false,
      httpStatus: null,
      body:       getErrorMessage(e, "network error"),
      durationMs: Date.now() - start,
    };
  }
}

// ─── Enviar evento para TODOS os endpoints do vendor ──────────────────────────

export async function dispatchVendorWebhook(
  vendorId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();

  // Buscar endpoints ativos que assinam este evento
  const { data: endpoints } = await admin
    .from("vendor_webhook_endpoints")
    .select("id, url, secret, events")
    .eq("vendor_id", vendorId)
    .eq("is_active", true);

  if (!endpoints?.length) return;

  const payload: WebhookPayload = {
    id:          crypto.randomUUID(),
    type:        eventType,
    created_at:  new Date().toISOString(),
    api_version: "2024-01",
    data,
  };

  // Entregar para cada endpoint que assina este evento
  const eligible = endpoints.filter(
    ep => !ep.events.length || ep.events.includes(eventType) || ep.events.includes("*")
  );

  await Promise.allSettled(
    eligible.map(ep => deliverAndLog(ep.id, ep.url, ep.secret, payload))
  );
}

// ─── Entrega com logging ──────────────────────────────────────────────────────

async function deliverAndLog(
  endpointId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  attemptNumber = 1
): Promise<void> {
  const admin = createAdminClient();
  const result = await deliverWebhook(url, payload, secret);

  await admin.from("webhook_delivery_attempts").insert({
    endpoint_id:    endpointId,
    event_type:     payload.type,
    payload:        payload as Record<string, unknown>,
    attempt_number: attemptNumber,
    http_status:    result.httpStatus,
    response_body:  result.body,
    duration_ms:    result.durationMs,
    success:        result.success,
    next_retry_at:  result.success ? null : getNextRetry(attemptNumber),
  });
}

function getNextRetry(attempt: number): string | null {
  // 3 tentativas: 5min, 1h, 24h
  const delays = [5 * 60_000, 60 * 60_000, 24 * 60 * 60_000];
  if (attempt > delays.length) return null;
  return new Date(Date.now() + delays[attempt - 1]).toISOString();
}

// ─── Retry de falhas (chamado pelo cron) ──────────────────────────────────────

export async function retryFailedWebhooks(): Promise<{ retried: number; succeeded: number }> {
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("webhook_delivery_attempts")
    .select("id, endpoint_id, event_type, payload, attempt_number")
    .eq("success", false)
    .lte("next_retry_at", new Date().toISOString())
    .not("next_retry_at", "is", null)
    .limit(50);

  if (!pending?.length) return { retried: 0, succeeded: 0 };

  let succeeded = 0;

  for (const attempt of pending) {
    const { data: ep } = await admin
      .from("vendor_webhook_endpoints")
      .select("url, secret, is_active")
      .eq("id", attempt.endpoint_id)
      .maybeSingle();

    if (!ep?.is_active) {
      // Marcar como sem próximo retry
      await admin
        .from("webhook_delivery_attempts")
        .update({ next_retry_at: null })
        .eq("id", attempt.id);
      continue;
    }

    const payload = attempt.payload as WebhookPayload;
    const result = await deliverWebhook(ep.url, payload, ep.secret);

    await admin.from("webhook_delivery_attempts").insert({
      endpoint_id:    attempt.endpoint_id,
      event_type:     attempt.event_type,
      payload:        payload as Record<string, unknown>,
      attempt_number: attempt.attempt_number + 1,
      http_status:    result.httpStatus,
      response_body:  result.body,
      duration_ms:    result.durationMs,
      success:        result.success,
      next_retry_at:  result.success ? null : getNextRetry(attempt.attempt_number + 1),
    });

    // Marcar tentativa anterior como sem retry pendente
    await admin
      .from("webhook_delivery_attempts")
      .update({ next_retry_at: null })
      .eq("id", attempt.id);

    if (result.success) succeeded++;
  }

  return { retried: pending.length, succeeded };
}

// ─── Também suportar webhook direto por produto (legado) ─────────────────────

export async function dispatchProductWebhook(
  productId: string,
  vendorId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();

  // Verificar se o produto tem webhook outbound configurado
  const { data: product } = await admin
    .from("saas_products")
    .select("outbound_webhook_url, outbound_webhook_secret, outbound_webhook_events")
    .eq("id", productId)
    .maybeSingle();

  const tasks: Promise<void>[] = [];

  // Webhook por produto (novo)
  if (product?.outbound_webhook_url && product.outbound_webhook_secret) {
    const events = (product.outbound_webhook_events as string[]) ?? [];
    if (!events.length || events.includes(eventType) || events.includes("*")) {
      const payload: WebhookPayload = {
        id:          crypto.randomUUID(),
        type:        eventType,
        created_at:  new Date().toISOString(),
        api_version: "2024-01",
        data,
      };

      // Log inline sem endpoint_id (usar tabela provisioning_events)
      tasks.push(
        deliverWebhook(product.outbound_webhook_url, payload, product.outbound_webhook_secret)
          .then(() => {})
          .then(undefined, () => {})
      );
    }
  }

  // Webhooks do vendor (tabela vendor_webhook_endpoints)
  tasks.push(dispatchVendorWebhook(vendorId, eventType, data));

  await Promise.allSettled(tasks);
}
