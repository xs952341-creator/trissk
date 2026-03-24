// app/api/auth/sso-lookup/route.ts
// Retorna se um domínio possui SSO enterprise habilitado (workspace_sso_configs).
// GET /api/auth/sso-lookup?email=usuario@empresa.com

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
    const domain = email.includes("@") ? email.split("@")[1] : "";
    if (!domain) return NextResponse.json({ enabled: false, domain: null });
  
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_sso_configs")
      .select("domain, enabled")
      .eq("domain", domain)
      .eq("enabled", true)
      .limit(1);
  
    return NextResponse.json({ enabled: (data?.length ?? 0) > 0, domain });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
