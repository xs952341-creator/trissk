// app/api/vendor/export/route.ts
// Exporta vendas e assinantes do vendor como CSV
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";
import { failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface ProductInfo {
  name: string;
  slug?: string;
  logo_url?: string;
}

interface ProfileInfo {
  full_name?: string;
  email?: string;
}

interface OrderRow {
  id: string;
  created_at: string;
  amount_gross?: number;
  currency?: string;
  status: string;
  buyer_id?: string;
  profiles?: ProfileInfo | ProfileInfo[] | null;
  saas_products?: ProductInfo | ProductInfo[] | null;
}

interface EntitlementRow {
  created_at: string;
  status: string;
  expires_at?: string | null;
  user_id?: string;
  profiles?: ProfileInfo | ProfileInfo[] | null;
  saas_products?: ProductInfo | ProductInfo[] | null;
}

// Helper to get first element if array
function getFirst<T>(val: T | T[] | null | undefined): T | null | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

    const type = req.nextUrl.searchParams.get("type") ?? "sales"; // "sales" | "subscribers"

    let rows: (string | number)[][] = [];
    let headers: string[] = [];

    if (type === "sales") {
      const { data } = await supabase
        .from("orders")
        .select("id, created_at, amount_gross, currency, status, buyer_id, profiles!buyer_id(email, full_name), saas_products(name)")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5000);

      headers = ["Data", "Produto", "Comprador Email", "Comprador Nome", "Valor", "Moeda", "Status"];
      rows = (data ?? [] as OrderRow[]).map((o) => {
        const product = getFirst(o.saas_products);
        const profile = getFirst(o.profiles);
        return [
          new Date(o.created_at ?? "").toLocaleDateString("pt-BR"),
          product?.name ?? "—",
          profile?.email ?? "—",
          profile?.full_name ?? "—",
          (o.amount_gross ?? 0).toFixed(2),
          (o.currency ?? "brl").toUpperCase(),
          o.status ?? "—",
        ];
      });
    } else if (type === "subscribers") {
      const { data } = await supabase
        .from("entitlements")
        .select("created_at, status, expires_at, user_id, profiles!user_id(email, full_name), saas_products(name)")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5000);

      headers = ["Data Início", "Produto", "Assinante Email", "Assinante Nome", "Status", "Expira em"];
      rows = (data ?? [] as EntitlementRow[]).map((e) => {
        const product = getFirst(e.saas_products);
        const profile = getFirst(e.profiles);
        return [
          new Date(e.created_at ?? "").toLocaleDateString("pt-BR"),
          product?.name ?? "—",
          profile?.email ?? "—",
          profile?.full_name ?? "—",
          e.status ?? "—",
          e.expires_at ? new Date(e.expires_at).toLocaleDateString("pt-BR") : "Vitalício",
        ];
      });
    }

    // Build CSV
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csvLines = [
      headers.map(escape).join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ];
    const csv = csvLines.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vendor_${type}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
