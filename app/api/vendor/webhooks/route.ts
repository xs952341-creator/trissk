// app/api/vendor/webhooks/route.ts
// CRUD de endpoints de webhook outbound para vendors.
// Permite registrar URLs para receber eventos: venda, cancelamento, chargeback, etc.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// GET — listar webhooks do vendor
export async function GET() {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("vendor_webhook_endpoints")
      .select("id, url, events, is_active, description, created_at")
      .eq("vendor_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ endpoints: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// POST — criar novo endpoint
export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { url, events, description } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url é obrigatória" }, { status: 400 });
    }

    // Validar URL
    try { new URL(url); } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    // Gerar secret HMAC para o endpoint
    const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("vendor_webhook_endpoints")
      .insert({
        vendor_id:   user.id,
        url:         url.trim(),
        secret,
        events:      Array.isArray(events) ? events : ["sale.created", "subscription.canceled"],
        description: description ?? null,
        is_active:   true,
      })
      .select("id, url, events, is_active, description, created_at, secret")
      .single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ endpoint: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// PATCH — atualizar endpoint
export async function PATCH(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, url, events, is_active, description } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const admin = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (url !== undefined)         updates.url         = url;
    if (events !== undefined)      updates.events      = events;
    if (is_active !== undefined)   updates.is_active   = is_active;
    if (description !== undefined) updates.description = description;

    const { data, error } = await admin
      .from("vendor_webhook_endpoints")
      .update(updates)
      .eq("id", id)
      .eq("vendor_id", user.id)
      .select("id, url, events, is_active, description")
      .single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ endpoint: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// DELETE — remover endpoint
export async function DELETE(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("vendor_webhook_endpoints")
      .delete()
      .eq("id", id)
      .eq("vendor_id", user.id);

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
