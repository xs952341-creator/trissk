import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireScimToken } from "@/lib/scim/auth";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
const supabase = createAdminClient();

// Minimal SCIM-like endpoint (optional). Works even without Supabase enterprise.
// Auth via scim_tokens table.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  
    const { data } = await supabase
      .from("workspace_members")
      .select("user_id, role, status, profiles:profiles!user_id(email, full_name)")
      .eq("workspace_id", auth.workspaceId);
  
    const Resources = (data ?? []).map((m: Record<string, unknown>) => ({
      id: m.user_id,
      userName: (m.profiles as {full_name?: string; email?: string} | null)?.email,
      name: { formatted: (m.profiles as {full_name?: string; email?: string} | null)?.full_name ?? "" },
      active: m.status === "active",
      roles: [{ value: m.role }],
    }));
  
    return NextResponse.json({ Resources, totalResults: Resources.length, itemsPerPage: Resources.length, startIndex: 1 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  
    const body = await req.json();
    const email = body?.userName;
    if (!email) return NextResponse.json({ detail: "userName required" }, { status: 400 });
  
    // Best-effort: se usuário já existe (profiles.email), adiciona como membro.
    const { data: prof } = await supabase.from("profiles").select("id, email").eq("email", email).maybeSingle();
    if (!prof?.id) {
      // Sem criar usuário (depende de Supabase Admin Auth). Mantemos somente convite.
      const { data: inv } = await supabase.from("workspace_invites").insert({
        workspace_id: auth.workspaceId,
        email,
        role: "member",
        token: `scim_${Math.random().toString(36).slice(2)}`,
        status: "pending",
      }).select("token").single();
      return NextResponse.json({ id: null, userName: email, active: false, meta: { inviteToken: inv?.token } }, { status: 201 });
    }
  
    await supabase.from("workspace_members").upsert({
      workspace_id: auth.workspaceId,
      user_id: prof.id,
      role: "member",
      status: "active",
    }, { onConflict: "workspace_id,user_id" });
  
    return NextResponse.json({ id: prof.id, userName: email, active: true }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
