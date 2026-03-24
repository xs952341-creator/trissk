import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const supabaseAdmin = createAdminClient();

// GET /api/reviews?productId=...
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  
    const { data, error } = await supabase
      .from("reviews")
      .select("id, rating, title, body, created_at, user_id, verified_purchase")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ reviews: data ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST { productId, rating, title?, body? }  (upsert por user)
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const body       = await req.json();
    const productId  = String(body.productId ?? "");
    const rating     = Number(body.rating);
    const title      = body.title ? String(body.title).slice(0, 80) : null;
    const text       = body.body  ? String(body.body).slice(0, 2000) : null;
  
    if (!productId || !Number.isFinite(rating)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    if (rating < 1 || rating > 5) return NextResponse.json({ error: "Rating must be 1..5" }, { status: 400 });
  
    // ── Verificação de compra ─────────────────────────────────────────────────
    // O comprador precisa ter um entitlement ativo para este produto.
    const { data: entitlement } = await supabaseAdmin
      .from("entitlements")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("product_id", productId)
      .eq("status", "active")
      .maybeSingle();
  
    const verifiedPurchase = !!entitlement;
  
    const { error } = await supabase
      .from("reviews")
      .upsert({
        product_id:        productId,
        user_id:           auth.user.id,
        rating,
        title,
        body:              text,
        verified_purchase: verifiedPurchase,
        updated_at:        new Date().toISOString(),
      }, { onConflict: "product_id,user_id" });
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true, verified_purchase: verifiedPurchase });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// DELETE /api/reviews?productId=...

export const dynamic = 'force-dynamic';
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  
    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", auth.user.id);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
