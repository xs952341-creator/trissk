import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// GET /api/support/tickets/:id/messages
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("id,buyer_id,vendor_id,status,subject,created_at,updated_at")
      .eq("id", params.id)
      .single();
  
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 404 });
  
    if (ticket.buyer_id !== user.id && ticket.vendor_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  
    const { data: messages, error } = await supabase
      .from("support_messages")
      .select("id,sender_id,body,created_at")
      .eq("ticket_id", params.id)
      .order("created_at", { ascending: true });
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    return NextResponse.json({ ticket, messages: messages ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST /api/support/tickets/:id/messages
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const body = await req.json().catch(() => ({}));
    const message = (body?.message ?? "").toString().trim();
    if (!message) return NextResponse.json({ error: "missing_message" }, { status: 400 });
  
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id,buyer_id,vendor_id,status")
      .eq("id", params.id)
      .maybeSingle();
  
    if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });
  
    if (ticket.buyer_id !== user.id && ticket.vendor_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: params.id,
      sender_id: user.id,
      body: message,
    });
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  
    await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", params.id);
  
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
