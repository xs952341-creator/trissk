import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// Vendor CRUD do storefront (blocks + theme)
export async function GET() {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const admin = createAdminClient();
    const { data: sf, error } = await admin
      .from("vendor_storefronts")
      .select("*")
      .eq("vendor_id", uid)
      .maybeSingle();
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ storefront: sf ?? null });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const body = await req.json().catch(() => ({}));
    const blocks = Array.isArray(body.blocks) ? body.blocks : [];
    const theme = body.theme && typeof body.theme === "object" ? body.theme : {};
    const custom_domain = typeof body.custom_domain === "string" ? body.custom_domain.trim() : null;
  
    const admin = createAdminClient();
    const { data: up, error } = await admin
      .from("vendor_storefronts")
      .upsert({ vendor_id: uid, blocks, theme, custom_domain }, { onConflict: "vendor_id" })
      .select("*")
      .single();
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ storefront: up });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
