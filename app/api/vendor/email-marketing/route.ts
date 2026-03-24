// app/api/vendor/email-marketing/route.ts
// CRUD de sequências de email marketing para vendors.
// Suporta: welcome, upsell, abandoned_cart, renewal_reminder, broadcast, custom.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// GET — listar sequências do vendor
export async function GET(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const productId = req.nextUrl.searchParams.get("product_id");

    let query = admin
      .from("email_sequences")
      .select(`
        id, name, type, product_id, is_active, created_at, updated_at,
        email_sequence_steps(id, subject, delay_days, position)
      `)
      .eq("vendor_id", user.id)
      .order("created_at", { ascending: false });

    if (productId) query = query.eq("product_id", productId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ sequences: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST — criar sequência
export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, type, product_id, steps } = await req.json();
    if (!name || !type) return NextResponse.json({ error: "name e type obrigatórios" }, { status: 400 });

    const admin = createAdminClient();

    const { data: seq, error } = await admin
      .from("email_sequences")
      .insert({ vendor_id: user.id, name, type, product_id: product_id ?? null, is_active: false })
      .select("id, name, type, is_active, created_at")
      .single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });

    // Criar steps se fornecidos
    if (Array.isArray(steps) && steps.length > 0) {
      await admin.from("email_sequence_steps").insert(
        steps.map((s: unknown, i: number) => ({
          sequence_id: (seq as unknown as Record<string,unknown>).id,
          subject:     (s as unknown as Record<string,unknown>).subject ?? `Email ${i + 1}`,
          body_html:   (s as unknown as Record<string,unknown>).body_html ?? "",
          delay_days:  (s as unknown as Record<string,unknown>).delay_days ?? i,
          position:    i,
        }))
      ).then(undefined, (e: Record<string, unknown>) => console.error("[vendor/email-marketing]", getErrorMessage(e)));
    }

    return NextResponse.json({ sequence: seq });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// PATCH — atualizar sequência (ativar/desativar, renomear)
export async function PATCH(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, name, is_active } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const admin = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined)      updates.name      = name;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await admin
      .from("email_sequences")
      .update(updates)
      .eq("id", id)
      .eq("vendor_id", user.id)
      .select("id, name, type, is_active")
      .single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ sequence: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// DELETE — remover sequência
export async function DELETE(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("email_sequences")
      .delete()
      .eq("id", id)
      .eq("vendor_id", user.id);

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
