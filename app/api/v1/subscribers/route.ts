// app/api/v1/subscribers/route.ts
// API pública: lista assinantes do vendor autenticado via API Key.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey, hasScope } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const supabase = createAdminClient();

function apiError(msg: string, status = 400) {
  return NextResponse.json({ error: msg, docs: "https://docs.playbook.market/api" }, { status });
}

// Helpers para extrair dados de relacionamentos aninhados (podem ser arrays ou objetos)
function getFirst<T>(val: T | T[] | undefined): T | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

function getNestedProduct(s: SubscriptionRow) {
  const tier = getFirst(s.product_tiers);
  const products = tier?.saas_products;
  return getFirst(products);
}

function getNestedProfile(s: SubscriptionRow) {
  return getFirst(s.profiles);
}
interface SubscriptionRow {
  id: string;
  status: string;
  created_at: string;
  canceled_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  user_id?: string | null;
  product_tier_id?: string | null;
  product_tiers?: {
    id?: string;
    tier_name?: string;
    saas_products?: {
      id?: string;
      name?: string;
      vendor_id?: string;
    } | {
      id?: string;
      name?: string;
      vendor_id?: string;
    }[];
  } | {
    id?: string;
    tier_name?: string;
    saas_products?: {
      id?: string;
      name?: string;
      vendor_id?: string;
    } | {
      id?: string;
      name?: string;
      vendor_id?: string;
    }[];
  }[];
  profiles?: {
    id?: string;
    email?: string;
    full_name?: string;
  } | {
    id?: string;
    email?: string;
    full_name?: string;
  }[];
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await validateApiKey(req.headers.get("authorization"));
    if (!ctx) return apiError("API key inválida ou não autorizada", 401);
    if (!hasScope(ctx, "subscribers:read")) return apiError("Escopo insuficiente: requer subscribers:read", 403);
  
    const rl = await rateLimit(`api-v1:${ctx.keyId}`, ctx.rateLimit, 3600_000);
    if (!rl.success) return apiError("Rate limit excedido", 429);
  
    const page      = parseInt(req.nextUrl.searchParams.get("page")      ?? "1");
    const limit     = Math.min(parseInt(req.nextUrl.searchParams.get("limit")  ?? "50"), 200);
    const status    = req.nextUrl.searchParams.get("status");   // active | canceled | past_due
    const productId = req.nextUrl.searchParams.get("product_id");
    const since     = req.nextUrl.searchParams.get("since");    // ISO date
    const from      = (page - 1) * limit;
  
    // Buscar tiers do vendor para filtrar
    const { data: tierIds } = await supabase
      .from("product_tiers")
      .select("id")
      .in("product_id", await supabase
        .from("saas_products")
        .select("id")
        .eq("vendor_id", ctx.vendorId)
        .then((r) => (r.data?.map((p) => (p as { id: string }).id) ?? []) as string[])
      );
  
    // Subquery abordagem alternativa — buscar via join
    let query = supabase
      .from("subscriptions")
      .select(`
        id, status, created_at, canceled_at,
        stripe_customer_id, stripe_subscription_id,
        product_tiers!inner(
          id, tier_name, price_monthly, price_lifetime,
          saas_products!inner(id, name, vendor_id)
        ),
        profiles!user_id(id, email:raw_email, full_name)
      `, { count: "exact" })
      .eq("product_tiers.saas_products.vendor_id", ctx.vendorId)
      .range(from, from + limit - 1)
      .order("created_at", { ascending: false });
  
    if (status) query = query.eq("status", status);
    if (since)  query = query.gte("created_at", since);
  
    const { data: subs, count, error } = await query;
  
    if (error) {
      // Fallback: buscar via product_tiers ids
      const { data: tiers } = await supabase
        .from("product_tiers")
        .select("id, tier_name, saas_products!inner(id, name, vendor_id)")
        .eq("saas_products.vendor_id", ctx.vendorId);
  
      const vendorTierIds = (tiers ?? []).map((t) => t.id);
      if (!vendorTierIds.length) {
        return NextResponse.json({ data: [], pagination: { page, limit, total: 0, total_pages: 0 } });
      }
  
      let q2 = supabase
        .from("subscriptions")
        .select("id, status, created_at, canceled_at, stripe_customer_id, user_id, product_tier_id", { count: "exact" })
        .in("product_tier_id", vendorTierIds)
        .range(from, from + limit - 1)
        .order("created_at", { ascending: false });
  
      if (status) q2 = q2.eq("status", status);
      if (since)  q2 = q2.gte("created_at", since);
  
      const { data: subs2, count: count2 } = await q2;
  
      return NextResponse.json({
        data:       (subs2 ?? []).map((s) => ({
          id:          s.id,
          status:      s.status,
          created_at:  s.created_at,
          canceled_at: s.canceled_at,
          user_id:     s.user_id,
          tier_id:     s.product_tier_id,
        })),
        pagination: { page, limit, total: count2 ?? 0, total_pages: Math.ceil((count2 ?? 0) / limit) },
      });
    }
  
    // Formatar resposta (omitir dados sensíveis além do necessário)
    const formatted = (subs ?? [] as SubscriptionRow[]).map((s) => {
      const tier = getFirst(s.product_tiers);
      const product = getNestedProduct(s);
      const profile = getNestedProfile(s);
      return {
        id: s.id,
        status: s.status,
        created_at: s.created_at,
        canceled_at: s.canceled_at,
        plan: {
          id: tier?.id,
          name: tier?.tier_name,
        },
        product: {
          id: product?.id,
          name: product?.name,
        },
        subscriber: {
          id: profile?.id,
          email: profile?.email,
          name: profile?.full_name,
        },
      };
    });
  
    return NextResponse.json({
      data:       formatted,
      pagination: {
        page, limit,
        total:       count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
