// lib/supabase/client.ts
// Cliente para uso em Client Components ("use client")
import { createBrowserClient } from "@supabase/ssr";
import { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } from "@/lib/env";

export function createClient() {
  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
