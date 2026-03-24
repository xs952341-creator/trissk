import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

function randomCode(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const { data, error } = await supabase
      .from("affiliate_links")
      .select("id,code,product_id,playbook_id,click_count,conversion_count,created_at,saas_products(name,logo_url),playbooks(title)")
      .eq("affiliate_id", session.user.id)
      .order("created_at", { ascending: false });
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ links: data ?? [] });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const { product_id, playbook_id } = await req.json();
    if (!product_id && !playbook_id) {
      return NextResponse.json({ error: "product_id ou playbook_id é obrigatório" }, { status: 400 });
    }
  
    const code = randomCode(10);
  
    const { data, error } = await supabase
      .from("affiliate_links")
      .insert({
        affiliate_id: session.user.id,
        product_id:   product_id ?? null,
        playbook_id:  playbook_id ?? null,
        code,
      })
      .select("id, code")
      .single();
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ link: data });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  
    const { error } = await supabase
      .from("affiliate_links")
      .delete()
      .eq("id", id)
      .eq("affiliate_id", session.user.id);
  
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
