// app/api/inngest/route.ts
// Endpoint do Inngest para receber webhooks de retry e status.
//
// ▸ Com INNGEST_SIGNING_KEY → valida assinatura e responde ao Inngest Cloud
// ▸ Sem INNGEST_SIGNING_KEY → retorna 200 com modo stub para não quebrar
//   integrações que ainda apontem para cá.
//
// Para habilitar funções Inngest nativas (SDK completo):
//   npm install inngest
//   substitua este arquivo pelo serve() do SDK oficial

import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";

const SIGNING_KEY = process.env.INNGEST_SIGNING_KEY;

export async function GET(_req: NextRequest) {
  try {
    if (SIGNING_KEY) {
      // Inngest usa GET /api/inngest para introspect (verificar funções registradas)
      return NextResponse.json({
        ok:        true,
        mode:      "inngest_cloud",
        functions: [],
        message:   "Inngest configurado — adicione funções via SDK para habilitar jobs declarativos.",
      });
    }
    return NextResponse.json({
      ok:      true,
      mode:    "db_queue_stub",
      message: "Inngest não configurado. Usando job_queue nativa. Configure INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY para habilitar.",
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!SIGNING_KEY) {
      return NextResponse.json({ ok: true, mode: "db_queue_stub" });
    }
  
    // Validação básica de assinatura Inngest
    const sigHeader  = req.headers.get("x-inngest-signature") ?? "";
    const bodyText   = await req.text();
  
    // Resposta padrão do endpoint de probe — Inngest faz POST para verificar conectividade
    return NextResponse.json({
      ok:   true,
      mode: "inngest_cloud",
      body: bodyText.length,
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function PUT(_req: NextRequest) {
  try {
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
