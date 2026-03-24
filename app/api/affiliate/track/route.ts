import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 30 track events per IP per minute (anti-inflation)
    const rl = await rateLimit(`aff-track:${getIP(req)}`, 30, 60_000);
    if (!rl.success) return NextResponse.json({ ok: false }, { status: 429 });
  
    const { code, product_id, playbook_id } = await req.json().catch(() => ({}));
  
    if (!code || typeof code !== "string" || code.length > 64) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  
    // Increment click_count (best-effort)
    const { data: link, error } = await supabase
      .from("affiliate_links")
      .select("id,click_count")
      .eq("code", code)
      .maybeSingle();
  
    if (error || !link) return NextResponse.json({ ok: false }, { status: 200 });
  
    await supabase
      .from("affiliate_links")
      .update({ click_count: (link.click_count ?? 0) + 1 })
      .eq("id", link.id);
  
    // Optional: store an event row (if you add table affiliate_clicks later)
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
