import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// POST /api/vendor/referrals/create
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = genCode();

  try {
    const { data, error } = await supabase
      .from("vendor_referral_codes")
      .insert({ referrer_id: user.id, code, active: true })
      .select("code")
      .single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ code: data.code });
  } catch {
    return NextResponse.json({ error: "table_missing" }, { status: 500 });
  }
}
