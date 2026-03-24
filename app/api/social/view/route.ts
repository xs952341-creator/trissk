import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { product_id, playbook_id } = body ?? {};
  if (!product_id && !playbook_id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // user pode ser anonimo — não bloqueia
  const { data: { user } } = await supabase.auth.getUser();

  try {
    await supabase.from("social_events").insert({
      type: "view",
      product_id: product_id ?? null,
      playbook_id: playbook_id ?? null,
      user_id: user?.id ?? null,
    });
  } catch {
    // tabela pode não existir — não quebra
  }

  return NextResponse.json({ ok: true });
}
