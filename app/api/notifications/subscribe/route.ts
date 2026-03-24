// app/api/notifications/subscribe/route.ts
// Salva a PushSubscription do browser no banco de dados para envio de notificações push.
//
// POST → { endpoint, keys: { p256dh, auth } }
// DELETE → { endpoint } — remove subscription (usuário revogou permissão)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supa = createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { endpoint, keys } = await req.json();
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Subscription inválida." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Upsert por endpoint (um dispositivo pode atualizar sua subscription)
    await admin.from("push_subscriptions").upsert({
      user_id:  user.id,
      endpoint,
      p256dh:   keys.p256dh,
      auth:     keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[notifications/subscribe]", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supa = createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: "Endpoint obrigatório." }, { status: 400 });

    const admin = createAdminClient();
    await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
