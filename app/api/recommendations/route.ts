import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// "IA" leve e gratuita: recomendações heurísticas (sem depender de APIs externas)
// Sinal: categorias dos produtos do usuário + trending/cvr.

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id ?? null;

  const admin = createAdminClient();

  // categoria preferida: últimos entitlements
  let preferredCategoryId: string | null = null;
  if (uid) {
    const { data: ent } = await admin
      .from("entitlements")
      .select("product_id")
      .eq("user_id", uid)
      .limit(5);
    const ids = (ent ?? []).map((e: Record<string, unknown>) => e.product_id).filter(Boolean);
    if (ids.length) {
      const { data: prod } = await admin
        .from("saas_products")
        .select("category_id")
        .in("id", ids)
        .limit(5);
      preferredCategoryId = (prod ?? []).find((p: Record<string, unknown>) => p.category_id)?.category_id ?? null;
    }
  }

  // usar RPC catalog_search se existir; fallback ranking simples
  try {
    const { data: recs } = await admin.rpc("catalog_search", {
      p_q: "",
      p_category: preferredCategoryId,
      p_sort: "cvr",
      p_limit: 8,
      p_offset: 0,
    });
    return NextResponse.json({ recommended: recs ?? [], mode: "rpc" });
  } catch {
    const q = admin
      .from("saas_products")
      .select("id, name, slug, short_description, logo_url, created_at, category_id")
      .eq("approval_status", "APPROVED")
      .limit(8);
    if (preferredCategoryId) q.eq("category_id", preferredCategoryId);
    const { data: rows } = await q;
    return NextResponse.json({ recommended: rows ?? [], mode: "fallback" });
  }
}
