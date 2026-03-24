// app/api/scim/v2/Users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireScimToken } from "@/lib/scim/auth";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const supabase = createAdminClient();

// Local types
interface ProfileInfo {
  email?: string;
  full_name?: string;
}

interface MembershipRow {
  user_id: string;
  role?: string | null;
  status: string;
  profiles?: ProfileInfo | ProfileInfo[] | null;
}

function parseId(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/");
  return parts[parts.length - 1];
}

// Helper to get first element if array
function getFirst<T>(val: T | T[] | null | undefined): T | null | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return failure("UNAUTHORIZED", 401, "Unauthorized");

    const id = parseId(req);
    const { data: mRaw } = await supabase
      .from("workspace_members")
      .select("user_id, role, status, profiles:profiles!user_id(email, full_name)")
      .eq("workspace_id", auth.workspaceId)
      .eq("user_id", id)
      .maybeSingle();

    if (!mRaw) return failure("NOT_FOUND", 404, "Not found");

    const m = mRaw as unknown as MembershipRow;
    const profile = getFirst(m.profiles);

    return success({
      id: m.user_id,
      userName: profile?.email ?? "",
      name: { formatted: profile?.full_name ?? "" },
      active: m.status === "active",
      roles: [{ value: m.role }],
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return failure("UNAUTHORIZED", 401, "Unauthorized");

    const id = parseId(req);
    await supabase
      .from("workspace_members")
      .update({ status: "suspended" })
      .eq("workspace_id", auth.workspaceId)
      .eq("user_id", id);

    return new NextResponse(null, { status: 204 });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireScimToken(req);
    if (!auth) return failure("UNAUTHORIZED", 401, "Unauthorized");

    const id = parseId(req);
    const body = await req.json() as {
      Operations?: Array<{ path?: string; value?: unknown }>;
      operations?: Array<{ path?: string; value?: unknown }>;
    };
    const ops = body?.Operations ?? body?.operations ?? [];
    let newRole: string | null = null;
    let active: boolean | null = null;

    for (const op of ops) {
      const path = (op.path ?? "").toLowerCase();
      const value = op.value;

      if (path.includes("active")) {
        active = !!value;
      }
      if (path.includes("roles") && value) {
        const v = Array.isArray(value) ? value[0] : value;
        newRole = (v as { value?: string })?.value ?? (v as string);
      }
    }

    const patch: Record<string, string> = {};
    if (newRole) patch.role = newRole;
    if (active !== null) patch.status = active ? "active" : "suspended";

    if (Object.keys(patch).length) {
      await supabase.from("workspace_members").update(patch).eq("workspace_id", auth.workspaceId).eq("user_id", id);
    }

    return GET(req);
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
