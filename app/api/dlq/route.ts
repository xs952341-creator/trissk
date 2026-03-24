// app/api/dlq/route.ts
// Dead-Letter Queue (DLQ) — gerencia deliveries permanentemente falhos.
// GET  ?page=0&limit=20        → lista itens na DLQ
// POST { action:"replay", id } → re-enfileira um item para retry
// POST { action:"dismiss", id }→ descarta permanentemente
// DELETE { ids: [...] }        → batch dismiss

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

async function assertAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (p?.role !== "admin") return null;
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await assertAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const admin = createAdminClient();
    const page  = parseInt(req.nextUrl.searchParams.get("page") ?? "0");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");
  
    const { data, count, error } = await admin
      .from("delivery_events")
      .select(`
        id, user_id, product_id, vendor_id, url, status,
        retry_count, error_message, created_at, last_retried_at,
        profiles!user_id (full_name, email)
      `, { count: "exact" })
      .eq("status", "permanently_failed")
      .order("last_retried_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, limit });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await assertAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const body = await req.json();
    const admin = createAdminClient();
  
    if (body.action === "replay") {
      // Re-enfileira: volta para "failed" com retry_count zerado para que o cron pегue
      const { error } = await admin
        .from("delivery_events")
        .update({
          status:        "failed",
          retry_count:   0,
          next_retry_at: new Date().toISOString(), // imediato
          error_message: `[DLQ replay by admin] ${new Date().toISOString()}`,
        })
        .eq("id", body.id);
  
      if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Re-enfileirado para próximo ciclo de retry." });
    }
  
    if (body.action === "replay_all") {
      // Re-enfileira todos permanentemente falhos
      const { error } = await admin
        .from("delivery_events")
        .update({
          status:        "failed",
          retry_count:   0,
          next_retry_at: new Date().toISOString(),
          error_message: `[DLQ bulk replay by admin] ${new Date().toISOString()}`,
        })
        .eq("status", "permanently_failed");
  
      if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
  
    if (body.action === "dismiss") {
      const { error } = await admin
        .from("delivery_events")
        .update({ status: "dismissed" })
        .eq("id", body.id);
  
      if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
  
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await assertAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const body = await req.json();
    const admin = createAdminClient();
  
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }
  
    const { error } = await admin
      .from("delivery_events")
      .update({ status: "dismissed" })
      .in("id", body.ids);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ ok: true, dismissed: body.ids.length });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
