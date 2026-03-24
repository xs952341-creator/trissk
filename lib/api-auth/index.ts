// lib/api-auth/index.ts
// Autenticação via API Key para a API pública de vendors.
// Header: Authorization: Bearer pk_live_...
// Cada vendor pode ter múltiplas API keys com escopos diferentes.

import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

const supabase = createAdminClient();

export interface ApiKeyContext {
  vendorId:    string;
  keyId:       string;
  scopes:      string[];  // ex: ["products:read", "subscribers:read", "products:write"]
  rateLimit:   number;    // requests/hour
  name:        string;
}

/** Valida a API Key e retorna o contexto ou null se inválida */
export async function validateApiKey(authHeader: string | null): Promise<ApiKeyContext | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const rawKey = authHeader.replace("Bearer ", "").trim();

  if (!rawKey.startsWith("pk_")) return null;

  // Hash da key para armazenar no DB (nunca armazenar a key em texto claro)
  const encoder = new TextEncoder();
  const data     = encoder.encode(rawKey);
  const hashBuf  = await crypto.subtle.digest("SHA-256", data);
  const hashHex  = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: apiKey } = await supabase
    .from("vendor_api_keys")
    .select("id, vendor_id, scopes, rate_limit_per_hour, name, revoked_at, last_used_at")
    .eq("key_hash", hashHex)
    .is("revoked_at", null)
    .maybeSingle();

  if (!apiKey) return null;

  // Atualizar last_used (fire and forget)
  supabase.from("vendor_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(undefined, (e: unknown) => console.error("[api-auth/index]", getErrorMessage(e)));

  return {
    vendorId:  apiKey.vendor_id,
    keyId:     apiKey.id,
    scopes:    apiKey.scopes ?? [],
    rateLimit: apiKey.rate_limit_per_hour ?? 1000,
    name:      apiKey.name ?? "API Key",
  };
}

/** Verifica se o contexto tem um escopo específico */
export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope) || ctx.scopes.includes("*");
}

/** Gera uma nova API Key e retorna a key em texto claro (só mostrar 1 vez) */
export async function generateApiKey(
  vendorId: string,
  name: string,
  scopes: string[],
  rateLimitPerHour = 1000
): Promise<{ key: string; keyId: string } | null> {
  // Gerar key aleatória
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const randomHex   = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const rawKey      = `pk_live_${randomHex}`;

  // Hash para armazenar
  const encoder = new TextEncoder();
  const hashBuf  = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
  const hashHex  = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data, error } = await supabase.from("vendor_api_keys").insert({
    vendor_id:           vendorId,
    name,
    scopes,
    key_hash:            hashHex,
    key_prefix:          rawKey.slice(0, 14), // pk_live_XXXXXXXX (para exibir parcialmente depois)
    rate_limit_per_hour: rateLimitPerHour,
  }).select("id").single();

  if (error || !data) return null;
  return { key: rawKey, keyId: data.id };
}
