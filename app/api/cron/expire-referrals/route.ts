import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRON_SECRET } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

 export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ disabled: true, reason: "CRON_SECRET not set" }, { status: 200 });
  }

  const authHeader = req.headers.get("authorization");
  const xSecret    = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && xSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: rewards, error } = await supabase
    .from("vendor_referral_rewards")
    .select("id,referrer_id,previous_fee_pct,discount_until,active")
    .eq("active", true)
    .lte("discount_until", now);

  if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });

  let reverted = 0;
  for (const r of rewards ?? []) {
    try {
      await supabase.from("profiles").update({ custom_platform_fee_pct: r.previous_fee_pct }).eq("id", r.referrer_id);
      await supabase.from("vendor_referral_rewards").update({ active: false }).eq("id", r.id);
      reverted++;
    } catch {}
  }

  return NextResponse.json({ ok: true, expired: rewards?.length ?? 0, reverted });
}
