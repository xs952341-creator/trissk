// app/api/enotas/config/route.ts
// Vendor salva sua chave eNotas + escolhe modo fiscal (self | platform | none)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const body = await req.json().catch(() => ({}));
    const { fiscal_mode, enotas_api_key, enotas_company_id, cnpj, razao_social, inscricao_municipal } = body;
  
    if (!["self", "platform", "none"].includes(fiscal_mode)) {
      return NextResponse.json({ error: "fiscal_mode inválido" }, { status: 400 });
    }
  
    // Se modo "self", precisa de chave + company id
    if (fiscal_mode === "self" && (!enotas_api_key || !enotas_company_id)) {
      return NextResponse.json({ error: "Chave de API e ID da empresa são obrigatórios para emissão própria." }, { status: 400 });
    }
  
    // Se modo "platform", precisa de CNPJ + razão social
    if (fiscal_mode === "platform" && (!cnpj || !razao_social)) {
      return NextResponse.json({ error: "CNPJ e razão social são obrigatórios para emissão pela plataforma." }, { status: 400 });
    }
  
    const update: Record<string, string | null> = {
      fiscal_mode,
      fiscal_terms_accepted_at: new Date().toISOString(),
    };
  
    if (fiscal_mode === "self") {
      update.enotas_api_key    = enotas_api_key.trim();
      update.enotas_company_id = enotas_company_id.trim();
      update.cnpj              = (cnpj ?? "").replace(/\D/g, "");
    } else if (fiscal_mode === "platform") {
      update.cnpj              = cnpj.replace(/\D/g, "");
      update.razao_social      = razao_social.trim();
      update.inscricao_municipal = inscricao_municipal?.trim() ?? null;
      // Remove chaves próprias se existiam
      update.enotas_api_key    = null;
      update.enotas_company_id = null;
    } else {
      // none: limpa tudo
      update.enotas_api_key    = null;
      update.enotas_company_id = null;
    }
  
    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    await auditLog({ actorId: user.id, action: "fiscal.config_saved", entityType: "profile", entityId: user.id, metadata: { fiscal_mode } });
  
    return NextResponse.json({ ok: true, fiscal_mode });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const { data, error } = await supabase
      .from("profiles")
      .select("fiscal_mode, enotas_api_key, enotas_company_id, cnpj, razao_social, inscricao_municipal, fiscal_terms_accepted_at")
      .eq("id", user.id)
      .single();
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    // Mascara a chave para não expor no frontend
    const masked = data?.enotas_api_key
      ? data.enotas_api_key.slice(0, 4) + "…" + data.enotas_api_key.slice(-4)
      : null;
  
    return NextResponse.json({ ...data, enotas_api_key: masked });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
