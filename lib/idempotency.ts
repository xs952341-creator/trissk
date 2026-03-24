// lib/idempotency.ts
// Prevenção de processamento duplicado para webhooks e jobs críticos.
// Padrão: registrar event_id antes de processar, verificar antes de cada operação.

import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export type IdempotencyScope = "stripe_event" | "pagarme_event" | "job" | "commission" | "ledger";

export interface IdempotencyRecord {
  key:       string;
  scope:     IdempotencyScope;
  result?:   Record<string, unknown>;
  createdAt: string;
}

/**
 * Verifica se uma operação já foi processada.
 * Retorna null se é nova, ou o resultado anterior se já foi processada.
 */
export async function checkIdempotency(
  key: string,
  scope: IdempotencyScope
): Promise<IdempotencyRecord | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("idempotency_keys")
    .select("key, scope, result, created_at")
    .eq("key", key)
    .eq("scope", scope)
    .maybeSingle();

  if (!data) return null;
  return { key: data.key, scope: data.scope as IdempotencyScope, result: data.result, createdAt: data.created_at };
}

/**
 * Marca uma operação como processada, armazenando o resultado opcional.
 */
export async function markIdempotent(
  key: string,
  scope: IdempotencyScope,
  result?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("idempotency_keys").upsert({
    key,
    scope,
    result: result ?? {},
    created_at: new Date().toISOString(),
  }, { onConflict: "key,scope" }).then(undefined, (e: unknown) => console.error("[idempotency]", getErrorMessage(e)));
}

/**
 * Executa uma função somente se não foi processada antes.
 * Retorna { alreadyProcessed: true } se duplicata.
 */
export async function withIdempotency<T>(
  key: string,
  scope: IdempotencyScope,
  fn: () => Promise<T>
): Promise<{ alreadyProcessed: boolean; result?: T }> {
  const existing = await checkIdempotency(key, scope);
  if (existing) return { alreadyProcessed: true, result: existing.result as T };

  const result = await fn();
  await markIdempotent(key, scope, result as Record<string, unknown>);
  return { alreadyProcessed: false, result };
}
