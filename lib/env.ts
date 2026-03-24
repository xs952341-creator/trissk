// lib/env.ts
// Variáveis públicas (NEXT_PUBLIC_*) — seguras para client + server.
// Validação ocorre em runtime, não no build time (evita falha de static collection).

function getPublicEnv(name: string, required = true): string {
  // Durante build estático (fase de coleta) não há env vars — retornar string vazia
  // A validação real acontece quando a rota é chamada em runtime
  const value = process.env[name];
  if (!value && required) {
    // Em build time (NODE_ENV=production sem vars) não lançar erro
    // Apenas em runtime quando a requisição chega
    if (typeof window === "undefined" && process.env.NEXT_PHASE === "phase-production-build") {
      return "";
    }
    if (process.env.NODE_ENV === "test") return "";
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PROD  = NODE_ENV === "production";

// ── Públicas (client + server) ────────────────────────────────────────────────

export const NEXT_PUBLIC_SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL       ?? "";
export const NEXT_PUBLIC_SUPABASE_ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  ?? "";
export const NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export const NEXT_PUBLIC_GA4_ID             = process.env.NEXT_PUBLIC_GA4_ID             ?? "";
export const NEXT_PUBLIC_APP_URL            = process.env.NEXT_PUBLIC_APP_URL            ?? "";
export const NEXT_PUBLIC_VAPID_PUBLIC_KEY   = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY   ?? "";
