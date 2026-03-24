// app/api/notifications/send/route.ts
// Endpoint interno para enviar notificações push + in-app.
// Protegido por CRON_SECRET para ser usado pelo webhook e crons.
// Também pode ser usado por admins via dashboard.
//
// POST → { userId, title, body, url?, type?, internal? }
// Se internal: false (default) → só push. Se internal: true → também grava em `notifications`.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRON_SECRET, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Autenticação: CRON_SECRET no header Authorization
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const {
      userId,
      title,
      body,
      url = "/dashboard",
      type = "info",
      saveInApp = true, // Se true, grava na tabela `notifications` (aparece no sino)
    }: {
      userId: string;
      title: string;
      body: string;
      url?: string;
      type?: string;
      saveInApp?: boolean;
    } = await req.json();

    if (!userId || !title) {
      return NextResponse.json({ error: "userId e title são obrigatórios." }, { status: 400 });
    }

    const results = { push: 0, pushFailed: 0, inApp: false };

    // 1. Salvar notificação in-app (tabela notifications)
    if (saveInApp) {
      await supabase.from("notifications").insert({
        user_id:    userId,
        type,
        title,
        body,
        action_url: url,
        is_read:    false,
      });
      results.inApp = true;
    }

    // 2. Enviar push notification para todos os dispositivos do usuário
    if (VAPID_PRIVATE_KEY && VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      const webPush = await import("web-push");
      webPush.default.setVapidDetails(
        VAPID_SUBJECT,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
      );

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", userId);

      if (subs?.length) {
        const payloadStr = JSON.stringify({ title, body, url });
        const sends = await Promise.allSettled(
          subs.map(async (s: Record<string, unknown>) => {
            try {
              await webPush.default.sendNotification(
                { endpoint: String(s.endpoint ?? ""), keys: { p256dh: String(s.p256dh ?? ""), auth: String(s.auth ?? "") } },
                payloadStr
              );
              return { ok: true, endpoint: s.endpoint };
            } catch (pushErr: unknown) {
              // Subscription expirada → remove do banco
              if ((pushErr as unknown as Record<string,unknown>).statusCode === 410 || (pushErr as unknown as Record<string,unknown>).statusCode === 404) {
                await supabase.from("push_subscriptions").delete().eq("id", s.id);
              }
              throw pushErr;
            }
          })
        );

        sends.forEach((r) => {
          if (r.status === "fulfilled") results.push++;
          else results.pushFailed++;
        });
      }
    }

    return NextResponse.json({ ok: true, results });

  } catch (err: unknown) {
    console.error("[notifications/send]", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
