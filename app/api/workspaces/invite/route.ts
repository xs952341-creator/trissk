import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";
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
  
    const { workspaceId, email, role } = await req.json();
    if (!workspaceId || !email) return NextResponse.json({ error: "workspaceId e email obrigatórios" }, { status: 400 });
  
    // RBAC: only owner/admin can invite
    const { data: myMembership } = await admin
      .from("workspace_members")
      .select("role, status")
      .eq("workspace_id", workspaceId)
      .eq("user_id", me.id)
      .maybeSingle();
    const myRole = (myMembership as Record<string, unknown>)?.role;
    if (!myRole || (myRole !== "owner" && myRole !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
    // Seat enforcement
    const { data: wsEnt } = await admin
      .from("workspace_entitlements")
      .select("seats_limit")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const seatsLimit = Number((wsEnt as Record<string, unknown>)?.seats_limit ?? 0);
    if (seatsLimit > 0) {
      const { count } = await admin
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "active");
      if ((count ?? 0) >= seatsLimit) {
        return NextResponse.json({ error: "Limite de assentos atingido" }, { status: 402 });
      }
    }
  
    const token = crypto.randomBytes(24).toString("hex");
    const { data: inv, error } = await admin.from("workspace_invites").insert({
      workspace_id: workspaceId,
      email,
      role: role ?? "member",
      token,
      status: "pending",
    }).select("token").single();
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    await admin.from("audit_logs").insert({ actor_id: me.id, workspace_id: workspaceId, action: "workspace.invite", meta: { email, role: role ?? "member" } }).then(undefined, ()=>{});
  
    return NextResponse.json({ inviteToken: inv?.token });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
