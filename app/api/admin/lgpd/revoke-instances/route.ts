// app/api/admin/lgpd/revoke-instances/route.ts
// Admin: revoga instâncias SaaS externas (best-effort) via job_queue.
// POST { user_id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const admin = createAdminClient();
  
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if ((prof as Record<string, unknown>)?.role !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id ?? "");
    if (!userId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
  
    await admin.from("job_queue").insert({
      event_name: "lgpd/revoke_instances",
      payload: { user_id: userId },
      status: "pending",
      run_after: new Date().toISOString(),
      priority: 90,
      trace_id: `${userId}:lgpd_revoke`,
    });
  
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
