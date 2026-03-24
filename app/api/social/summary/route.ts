import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("product_id");
  const playbookId = req.nextUrl.searchParams.get("playbook_id");
  if (!productId && !playbookId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);

  try {
    let q = supabase.from("social_events").select("type,created_at");
    if (productId) q = q.eq("product_id", productId);
    if (playbookId) q = q.eq("playbook_id", playbookId);

    const { data, error } = await q.gte("created_at", startOfDay.toISOString());
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });

    const views = (data ?? []).filter((e: Record<string, unknown>) => e.type === "view").length;
    const purchases = (data ?? []).filter((e: Record<string, unknown>) => e.type === "purchase").map((e: Record<string, unknown>) => new Date(String(e.created_at ?? "")).getTime());
    const lastPurchase = purchases.length ? Math.max(...purchases) : null;
    const minutesAgo = lastPurchase ? Math.floor((Date.now() - lastPurchase) / 60000) : null;

    return NextResponse.json({ views_today: views, last_purchase_minutes_ago: minutesAgo });
  } catch {
    return NextResponse.json({ views_today: 0, last_purchase_minutes_ago: null });
  }
}
