import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdminClient();

// Local types
interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string | null;
}

interface MembershipRow {
  workspace_id: string;
  role?: string | null;
  status: string;
  workspaces?: Workspace | Workspace[];
}

interface WorkspaceWithRole {
  id: string;
  name: string;
  owner_id: string;
  role: string | null | undefined;
  created_at: string | null | undefined;
}

export async function GET() {
  try {
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes?.user;
    if (!me) return failure("UNAUTHORIZED", 401, "Acesso negado.");

    const { data: memberships } = await admin
      .from("workspace_members")
      .select("workspace_id, role, status, workspaces:workspaces!workspace_id(id, name, owner_id, created_at)")
      .eq("user_id", me.id)
      .eq("status", "active");

    const typedMemberships: MembershipRow[] = memberships ?? [];
    const workspaces = typedMemberships
      .map((m) => {
        const ws = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
        return {
          id: ws?.id,
          name: ws?.name,
          owner_id: ws?.owner_id,
          role: m.role,
          created_at: ws?.created_at,
        } as WorkspaceWithRole;
      })
      .filter((w): w is WorkspaceWithRole => Boolean(w.id));

    return success({ workspaces });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
