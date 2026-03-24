import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clicksignCreateEnvelope, clicksignUploadDocument } from "@/lib/signatures/clicksign";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const supabaseAdmin = createAdminClient();

// Starts a Clicksign envelope by uploading a PDF (base64).
// Optional: if Clicksign isn't configured, returns 503.

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const supa = createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { title, pdfBase64, orderId } = await req.json();
    if (!title || !pdfBase64) {
      return NextResponse.json({ error: "title e pdfBase64 são obrigatórios." }, { status: 400 });
    }

    const env = await clicksignCreateEnvelope({ name: title });
    if (!env) return NextResponse.json({ error: "Clicksign não configurado." }, { status: 503 });

    const doc = await clicksignUploadDocument({
      envelopeId: env.envelopeId,
      filename: `${title}.pdf`,
      base64: pdfBase64,
    });
    if (!doc) return NextResponse.json({ error: "Falha ao enviar documento para Clicksign." }, { status: 502 });

    // Best-effort persistence
    try {
      await supabaseAdmin.from("signature_requests").insert({
        provider: "clicksign",
        provider_ref: env.envelopeId,
        user_id: user.id,
        order_id: orderId ?? null,
        status: "created",
        meta: { title, documentId: doc.documentId },
      } as unknown);
    } catch {
      // optional
    }

    return NextResponse.json({ envelopeId: env.envelopeId, documentId: doc.documentId });
  } catch (e: unknown) {
    console.error("[clicksign start]", e);
    return NextResponse.json({ error: getErrorMessage(e) ?? "Erro interno" }, { status: 500 });
  }
}
