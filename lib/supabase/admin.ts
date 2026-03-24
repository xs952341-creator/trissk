// lib/supabase/admin.ts
// Cliente com service_role — NUNCA expor ao browser.
import { createClient } from "@supabase/supabase-js";

function getAdminCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Build-time: sem env vars disponíveis — retorna placeholder seguro
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { url: url || "https://placeholder.supabase.co", key: key || "placeholder-service-key" };
  }

  // Runtime: falha rápido com mensagem clara
  if (!url) throw new Error("❌ NEXT_PUBLIC_SUPABASE_URL não está configurada.");
  if (!key) throw new Error("❌ SUPABASE_SERVICE_ROLE_KEY não está configurada. Esta chave é obrigatória para operações de admin.");

  return { url, key };
}

export function createAdminClient() {
  const { url, key } = getAdminCredentials();

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
