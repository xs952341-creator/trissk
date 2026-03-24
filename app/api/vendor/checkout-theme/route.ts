// app/api/vendor/checkout-theme/route.ts
// CRUD do tema de checkout por produto (checkout builder)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const productId = req.nextUrl.searchParams.get("product_id");
    if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

    const admin = createAdminClient();
    // Verify ownership
    const { data: product } = await admin.from("saas_products").select("id").eq("id", productId).eq("vendor_id", user.id).maybeSingle();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: theme } = await admin.from("checkout_themes").select("*").eq("product_id", productId).maybeSingle();
    return NextResponse.json({ theme: theme ?? null });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { product_id, ...themeData } = body;
    if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: product } = await admin.from("saas_products").select("id").eq("id", product_id).eq("vendor_id", user.id).maybeSingle();
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data, error } = await admin.from("checkout_themes").upsert({
      product_id,
      vendor_id: user.id,
      ...themeData,
      updated_at: new Date().toISOString(),
    }, { onConflict: "product_id" }).select().single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ theme: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
