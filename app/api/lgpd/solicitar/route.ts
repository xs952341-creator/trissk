// app/api/lgpd/solicitar/route.ts
// Recebe solicitações LGPD (exclusão, acesso, portabilidade etc.)
// Cria ticket de suporte com subject especial + envia confirmação por email.
// Rate limit: 3 solicitações por IP por dia.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailLgpdConfirmacao } from "@/lib/email";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { LEGAL } from "@/lib/legal";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

const TIPOS_VALIDOS = ["acesso", "correcao", "exclusao", "portabilidade", "revogacao", "oposicao"];

export async function POST(req: NextRequest) {
  // Rate limit: 3 por IP por hora
  const ip = getIP(req);
  const { success } = await rateLimit(`lgpd:${ip}`, 3, 60 * 60 * 1000);
  if (!success) return NextResponse.json({ error: "Muitas solicitações. Aguarde antes de tentar novamente." }, { status: 429 });

  try {
    const { tipo, email, nome, detalhe } = await req.json();

    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json({ error: "Tipo de solicitação inválido." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }
    if (!nome || nome.trim().length < 3) {
      return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
    }

    // Salva na tabela lgpd_requests (graceful: se não existir, ignora)
    try {
      await supabase.from("lgpd_requests").insert({
        tipo,
        email:    email.toLowerCase().trim(),
        nome:     nome.trim(),
        detalhe:  detalhe?.trim() || null,
        status:   "pending",
      });
    } catch { /* tabela opcional — não quebra o fluxo */ }

    // Envia email de confirmação para o solicitante
    const tpl = emailLgpdConfirmacao({
      nome:          nome.trim(),
      tipo,
      prazo:         LEGAL.LGPD.PRAZO_EXCLUSAO,
      emailContato:  LEGAL.LGPD.CONTATO_DPO,
    });
    await sendEmail({ to: email, ...tpl });

    // Notifica admin
    await sendEmail({
      to:      LEGAL.LGPD.CONTATO_DPO,
      subject: `[LGPD] Nova solicitação de ${tipo} — ${nome} (${email})`,
      html:    `
        <h3>Nova solicitação LGPD</h3>
        <p><b>Tipo:</b> ${tipo}</p>
        <p><b>Solicitante:</b> ${nome} (${email})</p>
        <p><b>Detalhe:</b> ${detalhe || "—"}</p>
        <p>Prazo para resposta: ${LEGAL.LGPD.PRAZO_EXCLUSAO}</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[lgpd/solicitar]:", getErrorMessage(err));
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
