import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireScimToken } from "@/lib/scim/auth";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
const supabase = createAdminClient();

// SCIM Groups (minimal but functional): list/create groups inside a workspace.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  
    const { data: groups } = await supabase
      .from("workspace_groups")
      .select("id, display_name, created_at")
      .eq("workspace_id", auth.workspaceId);
  
    const Resources = (groups ?? []).map((g: Record<string, unknown>) => ({
      id: g.id,
      displayName: g.display_name,
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
    const displayName = body?.displayName;
    if (!displayName) return NextResponse.json({ detail: "displayName required" }, { status: 400 });
  
    const { data: created, error } = await supabase
      .from("workspace_groups")
      .insert({ workspace_id: auth.workspaceId, display_name: displayName })
      .select("id, display_name")
      .single();
  
    if (error) return NextResponse.json({ detail: "Failed to create group" }, { status: 500 });
  
    return NextResponse.json({ id: created!.id, displayName: created!.display_name }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
