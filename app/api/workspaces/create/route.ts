import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";
const admin = createAdminClient();

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes?.user;
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
  
    const { data: ws, error } = await admin
      .from("workspaces")
      .insert({ owner_id: me.id, name })
      .select("id, name")
      .single();
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    await admin.from("workspace_members").insert({ workspace_id: ws.id, user_id: me.id, role: "owner", status: "active" }).then(undefined, ()=>{});
    await admin.from("audit_logs").insert({ actor_id: me.id, workspace_id: ws.id, action: "workspace.created", meta: { name } }).then(undefined, ()=>{});
  
    return NextResponse.json({ workspace: ws });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
