// app/api/comments/route.ts
// Comentários por produto com moderação.
// GET  → lista comentários aprovados
// POST → cria comentário (pending, aguarda aprovação)
// DELETE → remove o próprio comentário

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const admin = createAdminClient();

// GET /api/comments?productId=...&limit=20&cursor=...
export async function GET(req: NextRequest) {
  try {
    const supabase    = createClient();
    const { searchParams } = new URL(req.url);
    const productId   = searchParams.get("productId");
    const limit       = Math.min(Number(searchParams.get("limit") ?? 20), 50);
    const cursor      = searchParams.get("cursor"); // created_at ISO string for pagination
  
    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  
    let query = supabase
      .from("product_comments")
      .select("id, body, created_at, user_id, parent_id, profiles!user_id(full_name, avatar_url)")
      .eq("product_id", productId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(limit);
  
    if (cursor) query = query.lt("created_at", cursor);
  
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    const comments  = data ?? [];
    const nextCursor = comments.length === limit ? comments[comments.length - 1]?.created_at : null;
  
    return NextResponse.json({ comments, nextCursor });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST /api/comments
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const body      = await req.json();
    const productId = String(body.productId ?? "").trim();
    const text      = String(body.body ?? "").trim().slice(0, 1000);
    const parentId  = body.parentId ? String(body.parentId) : null;
  
    if (!productId || !text) return NextResponse.json({ error: "productId e body são obrigatórios" }, { status: 400 });
    if (text.length < 5) return NextResponse.json({ error: "Comentário muito curto (mín 5 chars)" }, { status: 400 });
  
    // Rate limit: max 5 comentários por usuário por hora (simples check no DB)
    const since1h = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await admin
      .from("product_comments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since1h);
  
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: "Limite de comentários atingido. Aguarde um momento." }, { status: 429 });
    }
  
    // Checar se o produto existe e está ativo
    const { data: product } = await admin
      .from("saas_products")
      .select("id, vendor_id")
      .eq("id", productId)
      .eq("status", "active")
      .maybeSingle();
  
    if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  
    // Detectar auto-aprovação: compradores verificados podem ter aprovação automática
    const { data: entitlement } = await admin
      .from("entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .eq("status", "active")
      .maybeSingle();
  
    const isVerifiedBuyer = !!entitlement;
    const status = isVerifiedBuyer ? "approved" : "pending";
  
    const { data: comment, error } = await admin
      .from("product_comments")
      .insert({
        product_id: productId,
        user_id:    user.id,
        body:       text,
        parent_id:  parentId,
        status,
      })
      .select("id, body, created_at, status")
      .single();
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  
    return NextResponse.json({
      comment,
      message: status === "approved"
        ? "Comentário publicado!"
        : "Comentário enviado para moderação. Será publicado em breve.",
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// DELETE /api/comments?commentId=...

export const dynamic = 'force-dynamic';
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
  
    // Só o próprio usuário pode deletar (admins via tabela diretamente)
    const { error } = await admin
      .from("product_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
