import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// GET /api/support/tickets?scope=buyer|vendor
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const scope = req.nextUrl.searchParams.get("scope") ?? "buyer";
  
    let q = supabase
      .from("support_tickets")
      .select("id,status,subject,created_at,updated_at,product_id,vendor_id,buyer_id");
  
    if (scope === "vendor") q = q.eq("vendor_id", user.id);
    else q = q.eq("buyer_id", user.id);
  
    const { data, error } = await q.order("updated_at", { ascending: false });
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ tickets: data ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST /api/support/tickets
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 new tickets per user per hour
    const rl = await rateLimit(`tickets:${getIP(req)}`, 5, 60 * 60_000);
    if (!rl.success) return NextResponse.json({ error: "Limite de tickets atingido. Tente em 1 hora." }, { status: 429 });
  
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const body = await req.json().catch(() => ({}));
    const { vendor_id, product_id, subject, message } = body ?? {};
  
    if (!vendor_id || !subject || !message) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
  
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .insert({
        buyer_id: user.id,
        vendor_id,
        product_id: product_id ?? null,
        subject,
        status: "open",
      })
      .select("id")
      .single();
  
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  
    const { error: mErr } = await supabase.from("support_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      body: message,
    });
  
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  
    return NextResponse.json({ ok: true, ticket_id: ticket.id });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
