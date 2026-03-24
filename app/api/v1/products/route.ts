// app/api/v1/products/route.ts
// API pública: lista e gerencia produtos do vendor autenticado via API Key.
// Scope: products:read (GET), products:write (POST/PATCH)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey, hasScope } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";
const supabase = createAdminClient();

function apiError(msg: string, status = 400) {
  return NextResponse.json({ error: msg, docs: "https://docs.playbook.market/api" }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await validateApiKey(req.headers.get("authorization"));
    if (!ctx) return apiError("API key inválida ou não autorizada", 401);
    if (!hasScope(ctx, "products:read")) return apiError("Escopo insuficiente: requer products:read", 403);
  
    // Rate limit por keyId
    const rl = await rateLimit(`api-v1:${ctx.keyId}`, ctx.rateLimit, 3600_000);
    if (!rl.success) return apiError("Rate limit excedido", 429);
  
    const page  = parseInt(req.nextUrl.searchParams.get("page")  ?? "1");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 100);
    const from  = (page - 1) * limit;
  
    const { data: products, count } = await supabase
      .from("saas_products")
      .select(`
        id, name, slug, description, status, category, delivery_method,
        price_monthly, price_lifetime, sales_count, trending_score,
        created_at, updated_at,
        product_tiers(id, tier_name, price_monthly, price_lifetime, is_popular)
      `, { count: "exact" })
      .eq("vendor_id", ctx.vendorId)
      .range(from, from + limit - 1)
      .order("created_at", { ascending: false });
  
    return NextResponse.json({
      data:       products ?? [],
      pagination: {
        page,
        limit,
        total:       count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
      vendor_id: ctx.vendorId,
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await validateApiKey(req.headers.get("authorization"));
    if (!ctx) return apiError("API key inválida ou não autorizada", 401);
    if (!hasScope(ctx, "products:write")) return apiError("Escopo insuficiente: requer products:write", 403);
  
    const rl = await rateLimit(`api-v1:${ctx.keyId}`, ctx.rateLimit, 3600_000);
    if (!rl.success) return apiError("Rate limit excedido", 429);
  
    const body = await req.json().catch(() => null);
    if (!body) return apiError("Body inválido");
  
    const { name, slug, description, category, delivery_method } = body;
    if (!name || !slug) return apiError("name e slug são obrigatórios");
  
    // Verificar slug único
    const { data: existing } = await supabase
      .from("saas_products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
  
    if (existing) return apiError("Slug já em uso", 409);
  
    const { data: product, error } = await supabase
      .from("saas_products")
      .insert({
        vendor_id:       ctx.vendorId,
        name,
        slug,
        description:     description ?? null,
        category:        category ?? null,
        delivery_method: delivery_method ?? "NATIVE_API",
        status:          "draft",
        approval_status: "PENDING_REVIEW",
      })
      .select()
      .single();
  
    if (error) return apiError(getErrorMessage(error), 500);
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
