// app/api/vendor/api-keys/route.ts
// CRUD de API Keys para o vendor.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/api-auth";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const VALID_SCOPES = [
  "products:read", "products:write",
  "subscribers:read",
  "*",
];

// GET: listar API keys do vendor (sem mostrar a key em texto claro)
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const adminSupabase = createAdminClient();
    const { data: keys } = await adminSupabase
      .from("vendor_api_keys")
      .select("id, name, key_prefix, scopes, rate_limit_per_hour, last_used_at, created_at, revoked_at")
      .eq("vendor_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
  
    return NextResponse.json({ keys: keys ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST: criar nova API Key
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const { name, scopes, rateLimitPerHour } = await req.json();
  
    if (!name || typeof name !== "string" || name.length > 100) {
      return NextResponse.json({ error: "name é obrigatório (máx 100 chars)" }, { status: 400 });
    }
  
    const validatedScopes = (scopes ?? ["products:read", "subscribers:read"])
      .filter((s: string) => VALID_SCOPES.includes(s));
  
    if (!validatedScopes.length) {
      return NextResponse.json({ error: "Nenhum scope válido fornecido" }, { status: 400 });
    }
  
    // Limite: 10 keys ativas por vendor
    const adminSupabase = createAdminClient();
    const { count } = await adminSupabase
      .from("vendor_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", user.id)
      .is("revoked_at", null);
  
    if ((count ?? 0) >= 10) {
      return NextResponse.json({ error: "Limite de 10 API keys ativas por vendor" }, { status: 400 });
    }
  
    const result = await generateApiKey(
      user.id,
      name,
      validatedScopes,
      rateLimitPerHour ?? 1000
    );
  
    if (!result) {
      return NextResponse.json({ error: "Erro ao gerar API key" }, { status: 500 });
    }
  
    // Retorna a key em texto claro UMA única vez
    return NextResponse.json({
      key:    result.key,   // pk_live_... — mostrar ao usuário agora, não ficará disponível depois
      keyId:  result.keyId,
      scopes: validatedScopes,
      warning: "Copie esta chave agora. Ela não será exibida novamente.",
    }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// DELETE: revogar API Key
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  
    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
      .from("vendor_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("vendor_id", user.id);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ revoked: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
