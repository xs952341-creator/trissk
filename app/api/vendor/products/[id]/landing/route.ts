import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("product_pages")
      .select("blocks")
      .eq("product_id", params.id)
      .maybeSingle();

    if (error) return NextResponse.json({ blocks: [] });
    return NextResponse.json({ blocks: data?.blocks || [] });
  } catch {
    return NextResponse.json({ blocks: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const blocks = body?.blocks;
  if (!Array.isArray(blocks)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const { error } = await supabase
      .from("product_pages")
      .upsert({ product_id: params.id, blocks, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ saved: false }, { status: 200 });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ saved: false }, { status: 200 });
  }
}
