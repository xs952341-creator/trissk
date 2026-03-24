import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRON_SECRET } from "@/lib/env-server";
import { sendEmailQueued } from "@/lib/email";
import { getErrorMessage } from "@/lib/errors";
import type { Cart, MarketingEvent } from "@/lib/types/database";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const admin = createAdminClient();

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) return NextResponse.json({ disabled: true, reason: "CRON_SECRET not set" });
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) return unauthorized();

  // Config default (se não tiver tabela populada, roda com defaults seguros)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const results: Record<string, unknown>[] = [];

  // 1) Abandoned cart: carrinhos "open" que não converteram em 1h
  const { data: carts, error: cartsErr } = await admin
    .from("carts")
    .select("id, email, user_id, product_id, tier_id, metadata, created_at")
    .eq("status", "open")
    .lte("created_at", oneHourAgo)
    .limit(50);

  if (cartsErr) {
    return NextResponse.json({ error: cartsErr.message }, { status: 500 });
  }

  for (const c of carts ?? []) {
    const cart = c as Cart;
    const email = cart.email;
    if (!email) continue;

    // Evita spam: só 1 email por cart (marca no metadata)
    const meta = cart.metadata ?? {};
    if (meta.abandoned_sent_at) continue;

    try {
      await sendEmailQueued({
        to: email,
        subject: "Você deixou um checkout aberto",
        html: `<div style="font-family:ui-sans-serif;line-height:1.5">
          <h2>Seu checkout ainda está aberto</h2>
          <p>Se quiser concluir a compra, volte para a plataforma. Se precisar de ajuda, responda este email.</p>
        </div>`,
      });

      await admin
        .from("carts")
        .update({ metadata: { ...meta, abandoned_sent_at: new Date().toISOString() } })
        .eq("id", cart.id);

      results.push({ cartId: cart.id, kind: "abandoned_cart", ok: true });
    } catch (e: unknown) {
      results.push({ cartId: cart.id, kind: "abandoned_cart", ok: false, error: getErrorMessage(e) });
    }
  }

  // 2) Upsell: quem comprou há 3 dias (evento purchase) e ainda não recebeu upsell
  const { data: purchases } = await admin
    .from("marketing_events")
    .select("id, email, user_id, created_at, payload")
    .eq("kind", "purchase")
    .lte("created_at", threeDaysAgo)
    .limit(50);

  for (const p of purchases ?? []) {
    const event = p as MarketingEvent;
    const email = event.email;
    if (!email) continue;

    // dedupe: verifica se já enviou upsell
    const { data: already } = await admin
      .from("marketing_events")
      .select("id")
      .eq("kind", "upsell_sent")
      .eq("ref_id", event.id)
      .maybeSingle();

    if (already) continue;

    try {
      await sendEmailQueued({
        to: email,
        subject: "Dica rápida para tirar mais resultado",
        html: `<div style="font-family:ui-sans-serif;line-height:1.5">
          <h2>Quer acelerar seus resultados?</h2>
          <p>Veja outros SaaS e add-ons que combinam com o que você comprou na aba Explorar.</p>
        </div>`,
      });
      await admin.from("marketing_events").insert({
        user_id: event.user_id,
        email,
        kind: "upsell_sent",
        ref_id: event.id,
        payload: { source: "cron", from_purchase: event.id },
      });
      results.push({ purchaseEventId: event.id, kind: "upsell", ok: true });
    } catch (e: unknown) {
      results.push({ purchaseEventId: event.id, kind: "upsell", ok: false, error: getErrorMessage(e) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
