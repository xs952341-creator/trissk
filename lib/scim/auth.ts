import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireScimToken(req: NextRequest): Promise<{ workspaceId: string } | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("scim_tokens")
    .select("workspace_id")
    .eq("token", token)
    .eq("enabled", true)
    .maybeSingle();
  if (!data?.workspace_id) return null;
  return { workspaceId: data.workspace_id };
}
