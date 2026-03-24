// app/api/affiliate/create-link/route.ts
// Rota de compatibilidade — cria link de afiliado após aprovação da candidatura.
// Chamada por: app/affiliate/solicitar/page.tsx
//
// POST /api/affiliate/create-link
// Body: { product_id?: string }
// Delega para a lógica centralizada em /api/affiliate/links (POST).

import { NextRequest, NextResponse } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomCode(len = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { session } } = await supa.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body       = await req.json().catch(() => ({})) as Record<string, unknown>;
    const product_id = (body?.product_id as string | undefined) ?? null;

    const admin = createAdminClient();

    // Verify affiliate profile approved
    const { data: profile } = await admin
      .from("affiliate_profiles")
      .select("id, status")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!profile || (profile as unknown as Record<string,unknown>).status !== "approved") {
      return NextResponse.json(
        { error: "Perfil de afiliado não aprovado." },
        { status: 403 }
      );
    }

    // Idempotent — return existing link if already created
    const { data: existing } = await admin
      .from("affiliate_links")
      .select("id, code")
      .eq("affiliate_id", session.user.id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ link: existing, already_exists: true });
    }

    // Create link
    const code = randomCode(10);
    const { data: link, error } = await admin
      .from("affiliate_links")
      .insert({ affiliate_id: session.user.id, product_id, code })
      .select("id, code")
      .single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ link, created: true });

  } catch (e: unknown) {
    const msg = getErrorMessage(e, "Internal Server Error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
