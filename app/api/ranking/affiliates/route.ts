import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";
const supabase = createAdminClient();

export async function GET() {
  try {
    const { data, error } = await supabase.rpc("get_top_affiliates_30d", { p_limit: 50 });
    if (error) return NextResponse.json({ error: getErrorMessage(error), rows: [] }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
