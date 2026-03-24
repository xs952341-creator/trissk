// lib/supabase-client.ts
// DEPRECATED: use @/lib/supabase/client, @/lib/supabase/server ou @/lib/supabase/admin
// Este arquivo existe apenas para compatibilidade durante a migração

export { createClient }      from "@/lib/supabase/client";
export { createAdminClient } from "@/lib/supabase/admin";

// STORAGE_BUCKET agora centralizado em lib/config.ts
export { STORAGE_BUCKET } from "@/lib/config";

import { NEXT_PUBLIC_SUPABASE_URL } from "@/lib/env";
export const SUPABASE_URL     = NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PROJECT = NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] ?? "";
