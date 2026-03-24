import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";
const admin = createAdminClient();

function wsId(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/");
  return parts[parts.indexOf("workspaces") + 1];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes?.user;
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const workspaceId = wsId(req);
    const { userId, role } = await req.json();
    if (!userId || !role) return NextResponse.json({ error: "userId e role obrigatórios" }, { status: 400 });
  
    const { data: my } = await admin.from("workspace_members").select("role,status").eq("workspace_id", workspaceId).eq("user_id", me.id).maybeSingle();
    const myRole = (my as Record<string, unknown>)?.role;
    if (!myRole || (myRole !== "owner" && myRole !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
    await admin.from("workspace_members").update({ role }).eq("workspace_id", workspaceId).eq("user_id", userId);
    await admin.from("audit_logs").insert({ actor_id: me.id, workspace_id: workspaceId, action: "workspace.member.role_updated", meta: { user_id: userId, role } }).then(undefined, ()=>{});
  
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
