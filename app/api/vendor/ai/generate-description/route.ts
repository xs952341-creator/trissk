import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateProductCopy } from "@/lib/ai/light";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface ProductRow {
  id: string;
  vendor_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "");
    const apply = Boolean(body?.apply ?? false);
  
    if (!productId) return NextResponse.json({ error: "missing productId" }, { status: 400 });
  
    const admin = createAdminClient();
  
    const { data: productRaw, error } = await admin
      .from("saas_products")
      .select("id,vendor_id,name,description,category")
      .eq("id", productId)
      .maybeSingle();
  
    if (error || !productRaw) return failure("NOT_FOUND", 404, "Produto não encontrado");

    const product = productRaw as unknown as ProductRow;
    if (product.vendor_id !== auth.user.id) return failure("FORBIDDEN", 403, "Acesso negado");
  
    // Heurísticas: usa descrição atual como "features" se existir
    const copy = generateProductCopy({
      name: product.name,
      category: product.category ?? null,
      features: product.description ?? null,
      outcome: body?.outcome ?? null,
      audience: body?.audience ?? null,
    });
  
    if (apply) {
      // grava sugestões no produto sem quebrar se colunas não existirem
      await admin
        .from("saas_products")
        .update({
          description: copy.short,
          ai_long_description: copy.long,
          ai_tags: copy.tags,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId)
        .then(undefined, (e: unknown) => console.error("[vendor/ai/generate-description]", getErrorMessage(e)));
    }
  
    return success({ copy });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
