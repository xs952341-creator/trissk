import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireScimToken } from "@/lib/scim/auth";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
const supabase = createAdminClient();

function parseId(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/");
  return parts[parts.length - 1];
}

// GET single group, PATCH members, DELETE group

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    const id = parseId(req);
  
    const { data: g } = await supabase
      .from("workspace_groups")
      .select("id, display_name")
      .eq("workspace_id", auth.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (!g) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  
    const { data: mem } = await supabase
      .from("workspace_group_members")
      .select("user_id")
      .eq("group_id", id);
  
    return NextResponse.json({
      id: g.id,
      displayName: g.display_name,
      members: (mem ?? []).map((m: Record<string, unknown>) => ({ value: m.user_id })),
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    const id = parseId(req);
  
    await supabase.from("workspace_groups").delete().eq("workspace_id", auth.workspaceId).eq("id", id);
    return NextResponse.json({}, { status: 204 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    const id = parseId(req);
  
    const body = await req.json();
    const ops = body?.Operations ?? body?.operations ?? [];
    for (const op of ops) {
      const path = (op.path ?? "").toLowerCase();
      const value = op.value;
  
      if (path.includes("members") && value) {
        // Add/remove members
        const add = (op.op ?? op.operation ?? "").toLowerCase() !== "remove";
        const members = Array.isArray(value) ? value : value.members ?? [];
        for (const m of members) {
          const userId = m.value ?? m;
          if (!userId) continue;
          if (add) {
            await supabase.from("workspace_group_members").upsert({ group_id: id, user_id: userId }, { onConflict: "group_id,user_id" });
          } else {
            await supabase.from("workspace_group_members").delete().eq("group_id", id).eq("user_id", userId);
          }
        }
      } else if (path.includes("displayname") && typeof value === "string") {
        await supabase.from("workspace_groups").update({ display_name: value }).eq("workspace_id", auth.workspaceId).eq("id", id);
      }
    }
  
    const { data: g } = await supabase.from("workspace_groups").select("id, display_name").eq("workspace_id", auth.workspaceId).eq("id", id).maybeSingle();
    if (!g) return NextResponse.json({ detail: "Not found" }, { status: 404 });
    return NextResponse.json({ id: g.id, displayName: g.display_name });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
