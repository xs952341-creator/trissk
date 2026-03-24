// app/api/admin/comments/route.ts
// Admin: lista e modera comentários pendentes.
// GET  /api/admin/comments?status=pending
// POST /api/admin/comments  { commentId, action: "approve"|"reject" }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabaseAdmin = createAdminClient();

async function assertAdmin(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await assertAdmin(req);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
    const status = req.nextUrl.searchParams.get("status") ?? "pending";
    const { data, error } = await supabaseAdmin
      .from("product_comments")
      .select(`id, body, created_at, status,
        profiles!user_id(full_name, email),
        saas_products:product_id(name)`)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(50);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ comments: data ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await assertAdmin(req);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
    const { commentId, action } = await req.json();
    if (!commentId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  
    const newStatus = action === "approve" ? "approved" : "rejected";
    const { error } = await supabaseAdmin
      .from("product_comments")
      .update({ status: newStatus, moderated_by: user.id, moderated_at: new Date().toISOString() })
      .eq("id", commentId);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
