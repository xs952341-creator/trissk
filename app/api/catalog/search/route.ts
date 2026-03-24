// app/api/catalog/search/route.ts
// Busca catálogo público com filtros e ranking.
// Preferência: RPC `catalog_search` (full-text + ranking por conversão).
// Fallback: busca simples (ilike) se RPC não existir.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q            = (searchParams.get("q")             ?? "").trim();
  const category     = (searchParams.get("category")      ?? "").trim();
  const deliveryType = (searchParams.get("delivery_type") ?? "").trim();
  const sort         = (searchParams.get("sort")          ?? "cvr").trim(); // cvr | newest | price_low | price_high

  // 1) Tenta RPC (full-text)
  try {
    const { data, error } = await supabase.rpc("catalog_search", {
      p_q:             q,
      p_category:      category      || null,
      p_delivery_type: deliveryType  || null,
      p_sort:          sort,
      p_limit:         48,
      p_offset:        0,
    } as unknown);
    if (!error) return NextResponse.json({ items: data ?? [] });
  } catch {
    // segue fallback
  }

  // 2) Fallback simples (ilike)
  let query = supabase
    .from("saas_products")
    .select("id, name, slug, short_description, logo_url, category_id, created_at, product_tiers(id, tier_name, price_monthly, price_annual, price_lifetime, is_popular)")
    .eq("approval_status", "APPROVED");

  if (q) {
    query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`);
  }
  if (category) {
    query = query.eq("category_id", category);
  }
  if (deliveryType) {
    query = query.eq("delivery_type", deliveryType);
  }

  const { data } = await query.order("created_at", { ascending: false }).limit(48);
  return NextResponse.json({ items: data ?? [], fallback: true });
}
