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
  
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "token obrigatório" }, { status: 400 });
  
    const { data: invite } = await admin
      .from("workspace_invites")
      .select("id, workspace_id, email, role, status")
      .eq("token", token)
      .maybeSingle();
    if (!invite || invite.status !== "pending") return NextResponse.json({ error: "Convite inválido" }, { status: 404 });
  
    await admin.from("workspace_members").upsert({
      workspace_id: (invite as unknown as Record<string,unknown>).workspace_id,
      user_id: me.id,
      role: (invite as unknown as Record<string,unknown>).role ?? "member",
      status: "active",
    }, { onConflict: "workspace_id,user_id" }).then(undefined, ()=>{});
  
    await admin.from("workspace_invites").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", (invite as unknown as Record<string,unknown>).id).then(undefined, ()=>{});
    await admin.from("audit_logs").insert({ actor_id: me.id, workspace_id: (invite as unknown as Record<string,unknown>).workspace_id, action: "workspace.invite.accepted", meta: { invite_id: (invite as unknown as Record<string,unknown>).id } }).then(undefined, ()=>{});
  
    return NextResponse.json({ ok: true, workspaceId: (invite as unknown as Record<string,unknown>).workspace_id });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
