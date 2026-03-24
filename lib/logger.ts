// lib/logger.ts
// Logger estruturado com integração Sentry/Datadog + fallback para DB (structured_logs).
//
// Uso:
//   import { log } from "@/lib/logger";
//   log.info("webhook", "invoice.paid", "Pagamento confirmado", { invoiceId, amount });
//   log.error("webhook", "ledger.insert_failed", "Falha ao inserir ledger", { error: getErrorMessage(e) });
//
// Prioridade de destino:
//   1. Sentry (se SENTRY_DSN configurado) — para errors/critical
//   2. Datadog (se DD_API_KEY configurado) — para todos os níveis
//   3. DB structured_logs (sempre) — via RPC, nunca quebra o fluxo
//   4. console.* (sempre) — para Cloud logging nativo (Vercel, Railway)

import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

// Structured metadata type — no `any`, deeply typed
export type LogMetaValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LogMetaValue[]
  | { [key: string]: LogMetaValue };

export interface LogMeta {
  [key: string]: LogMetaValue;
}

interface LogEntry {
  level: LogLevel;
  service: string;
  event: string;
  message?: string;
  metadata?: LogMeta;
  userId?: string;
  vendorId?: string;
  traceId?: string;
}

// ── Configuração de destinos ──────────────────────────────────────────────────
const SENTRY_DSN    = process.env.SENTRY_DSN;
const DD_API_KEY    = process.env.DD_API_KEY;
const DD_SITE       = process.env.DD_SITE || "datadoghq.com";
const LOG_LEVEL     = (process.env.LOG_LEVEL || "info") as LogLevel;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, critical: 4,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_LEVEL];
}

// ── Sentry ────────────────────────────────────────────────────────────────────
async function sendToSentry(entry: LogEntry): Promise<void> {
  if (!SENTRY_DSN) return;
  if (entry.level !== "error" && entry.level !== "critical") return;

  try {
    // Usa Sentry Store API (sem SDK para não adicionar dependência pesada)
    // Para usar o SDK: npm install @sentry/nextjs e configurar sentry.server.config.ts
    const envelope = [
      JSON.stringify({ event_id: crypto.randomUUID(), sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        level:     entry.level === "critical" ? "fatal" : "error",
        message:   entry.message || entry.event,
        tags:      { service: entry.service, event: entry.event },
        extra:     entry.metadata || {},
        user:      entry.userId ? { id: entry.userId } : undefined,
        timestamp: new Date().toISOString(),
      }),
    ].join("\n");

    const url = new URL(SENTRY_DSN);
    const sentryEndpoint = `${url.protocol}//${url.hostname}/api${url.pathname}/envelope/`;

    await fetch(sentryEndpoint, {
      method: "POST",
      headers: {
        "Content-Type":     "application/x-sentry-envelope",
        "X-Sentry-Auth":    `Sentry sentry_version=7, sentry_key=${url.username}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(3_000),
    });
  } catch { /* Sentry nunca quebra o fluxo */ }
}

// ── Datadog ───────────────────────────────────────────────────────────────────
async function sendToDatadog(entry: LogEntry): Promise<void> {
  if (!DD_API_KEY) return;

  try {
    await fetch(`https://http-intake.logs.${DD_SITE}/api/v2/logs`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "DD-API-KEY":    DD_API_KEY,
      },
      body: JSON.stringify([{
        ddsource:  "nextjs",
        ddtags:    `service:${entry.service},env:${process.env.NODE_ENV || "production"}`,
        hostname:  process.env.VERCEL_URL || "playbook-hub",
        level:     entry.level.toUpperCase(),
        message:   entry.message || entry.event,
        service:   entry.service,
        event:     entry.event,
        trace_id:  entry.traceId,
        usr:       entry.userId ? { id: entry.userId } : undefined,
        vendor_id: entry.vendorId,
        ...entry.metadata,
      }]),
      signal: AbortSignal.timeout(3_000),
    });
  } catch { /* Datadog nunca quebra o fluxo */ }
}

// ── Supabase structured_logs ──────────────────────────────────────────────────
async function sendToDatabase(entry: LogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.rpc("structured_log", {
      p_level:     entry.level,
      p_service:   entry.service,
      p_event:     entry.event,
      p_message:   entry.message ?? null,
      p_metadata:  entry.metadata ?? {},
      p_user_id:   entry.userId ?? null,
      p_vendor_id: entry.vendorId ?? null,
      p_trace_id:  entry.traceId ?? null,
    });
  } catch { /* DB log nunca quebra o fluxo */ }
}

// ── Console (Vercel / Railway / CloudWatch) ───────────────────────────────────
function logToConsole(entry: LogEntry): void {
  const payload = JSON.stringify({
    level:    entry.level,
    service:  entry.service,
    event:    entry.event,
    message:  entry.message,
    trace_id: entry.traceId,
    ...entry.metadata,
  });

  switch (entry.level) {
    case "debug": console.debug(payload); break;
    case "info":  console.log(payload);   break;
    case "warn":  console.warn(payload);  break;
    case "error":
    case "critical": console.error(payload); break;
  }
}

// ── Orquestrador principal ────────────────────────────────────────────────────
async function writeLog(entry: LogEntry): Promise<void> {
  if (!shouldLog(entry.level)) return;

  // Console sempre (síncrono)
  logToConsole(entry);

  // Destinos externos em paralelo (assíncrono, não bloqueia o fluxo)
  void Promise.allSettled([
    sendToSentry(entry),
    sendToDatadog(entry),
    sendToDatabase(entry),
  ]);
}

// ── API pública ───────────────────────────────────────────────────────────────
export const log = {
  debug: (service: string, event: string, message?: string, meta?: LogMeta, opts?: Partial<LogEntry>) =>
    writeLog({ level: "debug", service, event, message, metadata: meta, ...opts }),

  info: (service: string, event: string, message?: string, meta?: LogMeta, opts?: Partial<LogEntry>) =>
    writeLog({ level: "info", service, event, message, metadata: meta, ...opts }),

  warn: (service: string, event: string, message?: string, meta?: LogMeta, opts?: Partial<LogEntry>) =>
    writeLog({ level: "warn", service, event, message, metadata: meta, ...opts }),

  error: (service: string, event: string, message?: string, meta?: LogMeta, opts?: Partial<LogEntry>) =>
    writeLog({ level: "error", service, event, message, metadata: meta, ...opts }),

  critical: (service: string, event: string, message?: string, meta?: LogMeta, opts?: Partial<LogEntry>) =>
    writeLog({ level: "critical", service, event, message, metadata: meta, ...opts }),

  /** Cria um logger com trace_id pré-definido para rastrear uma request inteira */
  withTrace: (traceId: string) => ({
    debug: (service: string, event: string, message?: string, meta?: LogMeta) =>
      writeLog({ level: "debug", service, event, message, metadata: meta, traceId }),
    info: (service: string, event: string, message?: string, meta?: LogMeta) =>
      writeLog({ level: "info", service, event, message, metadata: meta, traceId }),
    warn: (service: string, event: string, message?: string, meta?: LogMeta) =>
      writeLog({ level: "warn", service, event, message, metadata: meta, traceId }),
    error: (service: string, event: string, message?: string, meta?: LogMeta) =>
      writeLog({ level: "error", service, event, message, metadata: meta, traceId }),
    critical: (service: string, event: string, message?: string, meta?: LogMeta) =>
      writeLog({ level: "critical", service, event, message, metadata: meta, traceId }),
  }),
};
