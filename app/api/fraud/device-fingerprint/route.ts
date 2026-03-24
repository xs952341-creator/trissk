// app/api/fraud/device-fingerprint/route.ts
// Recebe e armazena o device fingerprint do FingerprintJS.
// Correlaciona dispositivos suspeitos: mesmo device em múltiplas contas = sinal de fraude.
// Chamado fire-and-forget no frontend — nunca bloqueia o checkout.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";
const supabase = createAdminClient();

export async function POST(req: NextRequest) {
  try {
    const { deviceId, userId, userAgent, language, timezone } = await req.json();

    if (!deviceId || !userId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const ip = getIP(req);

    // 1. Upsert no device_fingerprints
    await supabase.from("device_fingerprints").upsert({
      device_id:  deviceId,
      user_id:    userId,
      ip,
      user_agent: userAgent ?? null,
      language:   language  ?? null,
      timezone:   timezone  ?? null,
      last_seen:  new Date().toISOString(),
    }, { onConflict: "device_id,user_id" });

    // 2. Verificar se este device já foi usado por outros usuários
    const { data: otherUsers } = await supabase
      .from("device_fingerprints")
      .select("user_id")
      .eq("device_id", deviceId)
      .neq("user_id", userId)
      .limit(10);

    const otherCount = (otherUsers ?? []).length;

    if (otherCount >= 3) {
      // Device usado em 3+ contas = sinal crítico de fraude
      await supabase.from("fraud_signals").insert({
        user_id:     userId,
        signal_type: "device_reuse",
        severity:    "high",
        description: `Device ${deviceId.slice(0, 12)}... usado em ${otherCount} contas distintas`,
        metadata:    { deviceId, otherUserCount: otherCount, ip },
      }).then(undefined, (e: Record<string, unknown>) => console.error("[fraud/device-fingerprint]", getErrorMessage(e)));
    } else if (otherCount >= 1) {
      // Device visto em outra conta — nível médio (pode ser dispositivo compartilhado)
      await supabase.from("fraud_signals").insert({
        user_id:     userId,
        signal_type: "device_reuse",
        severity:    "medium",
        description: `Device ${deviceId.slice(0, 12)}... também usado em ${otherCount} outra(s) conta(s)`,
        metadata:    { deviceId, otherUserCount: otherCount, ip },
      }).then(undefined, (e: Record<string, unknown>) => console.error("[fraud/device-fingerprint]", getErrorMessage(e)));
    }

    return NextResponse.json({ ok: true, deviceId: deviceId.slice(0, 8) + "..." });
  } catch (e: unknown) {
    // Fire-and-forget — nunca retorna erro 5xx para não afetar checkout
    console.error("[device-fingerprint]", getErrorMessage(e));
    return NextResponse.json({ ok: false });
  }
}
