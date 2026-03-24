// app/api/discovery/route.ts
// Endpoint de descoberta de produtos.
// Suporta: full-text search (pg_trgm via RPC), filtros por categoria/preço/avaliação,
// ordenação múltipla, e programa de afiliados.

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase = createAdminClient();

type SortOption = "trending" | "sales" | "rating" | "price_asc" | "price_desc" | "newest";

// Local types
interface ProductTier {
  price_monthly?: number | null;
  price_lifetime?: number | null;
}

interface ProductRow {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  category?: string | null;
  vendor_id?: string | null;
  approval_status: string;
  allows_affiliates?: boolean;
  created_at?: string | null;
  product_tiers?: ProductTier[] | null;
}

interface EnrichedProduct extends Omit<ProductRow, "product_tiers"> {
  min_price: number | null;
  avg_rating: null;
  units_30d: null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "7") || 7, 1), 90);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "24") || 24, 1), 48);
  const category = searchParams.get("category") ?? null;
  const q = (searchParams.get("q") ?? "").trim();
  const minPrice = searchParams.get("min_price") ? Number(searchParams.get("min_price")) : null;
  const maxPrice = searchParams.get("max_price") ? Number(searchParams.get("max_price")) : null;
  const sort = (searchParams.get("sort") ?? "trending") as SortOption;
  const affiliates = searchParams.get("affiliates") === "true";

  try {
    // Tentar RPCs com pg_trgm (full-text search real)
    const rpcParams = {
      p_days: days,
      p_limit: limit,
      p_category: category,
      p_query: q.length ? q : null,
      p_min_price: minPrice,
      p_max_price: maxPrice,
      p_sort: sort,
      p_affiliates: affiliates || null,
    };

    const [trendingResult, bestResult] = await Promise.all([
      supabase.rpc("get_trending_products", rpcParams),
      supabase.rpc("get_best_sellers_products", { ...rpcParams, p_days: undefined }),
    ]);

    if (!trendingResult.error && !bestResult.error) {
      return success({
        days, limit, category, q, sort,
        trending: trendingResult.data ?? [],
        best_sellers: bestResult.data ?? [],
      });
    }

    // Fallback: query direta (sem pg_trgm)
    let query = supabase
      .from("saas_products")
      .select(`
        id, name, description, logo_url, category, vendor_id,
        approval_status, allows_affiliates, created_at,
        product_tiers(price_monthly, price_lifetime)
      `)
      .eq("approval_status", "APPROVED");

    if (category) query = query.eq("category", category);
    if (q.length) query = query.ilike("name", `%${q}%`);
    if (affiliates) query = query.eq("allows_affiliates", true);

    // Ordenação fallback
    if (sort === "price_asc" || sort === "price_desc") {
      query = query.order("created_at", { ascending: sort === "price_asc" });
    } else if (sort === "newest") {
      query = query.order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    query = query.limit(limit);
    const { data: products, error } = await query;

    if (error) return failure("QUERY_ERROR", 500, getErrorMessage(error));

    // Calcular min_price a partir dos tiers
    const enriched = (products ?? [] as ProductRow[]).map((p): EnrichedProduct => {
      const tiers = p.product_tiers ?? [];
      const prices: number[] = tiers
        .flatMap((t) => [t.price_monthly, t.price_lifetime].filter((v): v is number => v !== null && v !== undefined));
      const { product_tiers: _, ...rest } = p;
      return {
        ...rest,
        min_price: prices.length > 0 ? Math.min(...prices) : null,
        avg_rating: null,
        units_30d: null,
      };
    });

    // Filtro de preço client-side no fallback
    const priceFiltered = enriched.filter((p) => {
      if (minPrice !== null && (p.min_price ?? 0) < minPrice) return false;
      if (maxPrice !== null && (p.min_price ?? 0) > maxPrice) return false;
      return true;
    });

    return success({
      days, limit, category, q, sort,
      trending: priceFiltered,
      best_sellers: priceFiltered,
      note: "RPCs não instaladas — usando fallback sem full-text search. Execute MIGRATION_V15.sql.",
    });

  } catch (e: unknown) {
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
