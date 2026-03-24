// lib/supabase/server.ts
// Cliente para uso em Server Components, Route Handlers e Server Actions
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Durante build estático (sem env vars), retorna placeholder para não quebrar
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { url: url || "https://placeholder.supabase.co", key: key || "placeholder-anon-key" };
  }

  // Em runtime: falha rápido com mensagem clara
  if (!url) throw new Error("❌ NEXT_PUBLIC_SUPABASE_URL não está configurada. Adicione ao .env.local ou nas variáveis da Vercel.");
  if (!key) throw new Error("❌ NEXT_PUBLIC_SUPABASE_ANON_KEY não está configurada. Adicione ao .env.local ou nas variáveis da Vercel.");

  return { url, key };
}

export function createClient() {
  const cookieStore = cookies();
  const { url, key } = getSupabaseCredentials();

  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try { cookieStore.set({ name, value, ...options }); } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try { cookieStore.set({ name, value: "", ...options }); } catch {}
      },
    },
  });
}
