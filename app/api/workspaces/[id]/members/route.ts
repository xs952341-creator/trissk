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

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes?.user;
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const workspaceId = wsId(req);
  
    // must be member
    const { data: my } = await admin.from("workspace_members").select("role,status").eq("workspace_id", workspaceId).eq("user_id", me.id).maybeSingle();
    if (!my || (my as unknown as Record<string,unknown>).status !== "active") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
    const { data } = await admin
      .from("workspace_members")
      .select("user_id, role, status, created_at, profiles:profiles!user_id(email, full_name)")
      .eq("workspace_id", workspaceId);
  
    return NextResponse.json({ members: data ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
