/**
 * lib/types/json.ts
 * Tipos JSON canônicos — v45
 *
 * Uso:
 *   import type { JsonObject, JsonValue } from "@/lib/types/json";
 *
 * Reutilizado em:
 *   lib/inngest.ts       — data: JsonObject
 *   lib/queue/upstash.ts — redisDequeueBatch(): Promise<JsonValue[]>
 *   lib/actions/reseller.ts — ResellerActionResult.data?: JsonObject
 *   lib/logger.ts        — LogMeta (compatível com JsonObject)
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

/** Type guard: verifica se um valor desconhecido é um JsonObject */
export function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/** Type guard: verifica se um valor é JsonValue serializável */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (t === "object") return Object.values(value as Record<string, unknown>).every(isJsonValue);
  return false;
}
