/**
 * lib/inngest-functions/health-recovery.ts
 * Automação de recuperação de clientes com Health Score crítico.
 *
 * Funciona em DOIS modos:
 *  1. Inngest Cloud (se configurado) — via inngest.send("saas/health.critical")
 *  2. Cron DB-queue — processado por /api/cron/churn-recovery (se Inngest não configurado)
 *
 * Fluxo:
 *  - Recebe subscriptionId + score + reasons
 *  - Busca email e nome do titular da assinatura
 *  - Gera email de reengajamento personalizado (sem IA externa — heurística local)
 *  - Envia via Resend (sendEmailQueued com fallback automático para fila)
 *  - Marca churn_recovery_sent_at para não enviar duplicatas
 *
 * Segurança:
 *  - Verifica se já foi enviado email nos últimos 14 dias (anti-spam)
 *  - Cada step é isolado: falha num não cancela os outros
 *  - Não quebra se tabela subscription_health_scores não existir
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { sendEmailQueued } from "@/lib/email";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface ChurnRecoveryPayload {
  subscriptionId: string;  // stripe_subscription_id
  score:          number;
  status:         "churning" | "at_risk";
  reasons:        string[];
  productId?:     string | null;
  userId?:        string;
}

export interface ChurnRecoveryResult {
  success:    boolean;
  skipped?:   boolean;
  skipReason?: string;
  email?:     string;
  message:    string;
}

// ── Gerador de email de reengajamento (heurístico, sem IA externa) ─────────────
function buildRecoveryEmail(args: {
  userName:    string;
  productName: string;
  score:       number;
  reasons:     string[];
  supportUrl:  string;
}): { subject: string; html: string } {
  const { userName, productName, score, reasons, supportUrl } = args;

  const firstName = userName.split(" ")[0] || "Cliente";

  // Escolhe o tom conforme o score
  const isCritical = score < 25;

  const subject = isCritical
    ? `${firstName}, podemos ajudar? — ${productName}`
    : `Como está sendo sua experiência com ${productName}?`;

  // Reasons traduzidas para linguagem amigável
  const reasonMap: Record<string, string> = {
    "status=canceled":                      "sua assinatura foi cancelada",
    "pagamento vencido":                    "há uma pendência no pagamento",
    "uso de assentos muito baixo":          "poucos membros da equipa estão usando",
    "uso de assentos médio":                "a adoção pela equipa ainda está crescendo",
    "sem login há":                         "a conta ficou inativa por alguns dias",
    "nunca fez login após compra":          "o acesso ainda não foi configurado",
    "sem eventos de uso nos últimos 14 dias": "o produto não foi utilizado recentemente",
  };

  const friendlyReasons = reasons
    .map(r => {
      const match = Object.keys(reasonMap).find(k => r.includes(k));
      return match ? reasonMap[match] : null;
    })
    .filter(Boolean)
    .slice(0, 2);

  const reasonText = friendlyReasons.length
    ? `Notamos que ${friendlyReasons.join(" e ")}.`
    : "Notamos que a plataforma não tem sido usada como esperado.";

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:32px auto;padding:0 16px;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#141b22 0%,#1c2633 100%);border:1px solid rgba(255,255,255,0.07);border-radius:20px;overflow:hidden;margin-bottom:8px;">
          <div style="padding:28px 32px 24px;">
            <div style="display:inline-block;background:rgba(34,212,160,0.1);border:1px solid rgba(34,212,160,0.2);border-radius:100px;padding:4px 14px;margin-bottom:16px;">
              <span style="color:#22d4a0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                Equipa de Sucesso do Cliente
              </span>
            </div>
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f4f8;line-height:1.3;letter-spacing:-0.02em;">
              Olá, ${firstName} 👋
            </h1>
            <p style="margin:0;font-size:15px;color:#8fa3b8;line-height:1.6;">
              ${reasonText} Gostaríamos de garantir que está a tirar o máximo do <strong style="color:#f0f4f8;">${productName}</strong>.
            </p>
          </div>

          <!-- Body -->
          <div style="padding:0 32px 28px;">
            <p style="margin:0 0 20px;font-size:14px;color:#8fa3b8;line-height:1.7;">
              Muitas vezes, pequenas dúvidas de configuração ou de uso são o que está entre uma equipa e resultados extraordinários. É por isso que queremos oferecer-lhe uma <strong style="color:#f0f4f8;">chamada de 15 minutos</strong>, completamente gratuita, com um especialista que pode ajudá-lo diretamente.
            </p>

            <!-- CTA -->
            <a href="${supportUrl}" style="display:inline-block;background:#22d4a0;color:#041a12;padding:13px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:-0.01em;margin-bottom:20px;">
              Falar com um especialista →
            </a>

            <p style="margin:0;font-size:13px;color:#4e6275;line-height:1.6;">
              Sem compromisso. A chamada é gratuita e leva apenas 15 minutos.<br>
              Se preferir, pode também <a href="${supportUrl}" style="color:#22d4a0;text-decoration:none;">abrir um ticket de suporte</a> com a sua dúvida.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:16px 8px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#2d3f4f;line-height:1.6;">
            Recebeu este email porque é cliente de ${productName}.<br>
            <a href="${supportUrl}" style="color:#4e6275;text-decoration:none;">Gerir preferências de email</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

// ── Processador principal ──────────────────────────────────────────────────────
export async function processChurnRecovery(
  payload: ChurnRecoveryPayload
): Promise<ChurnRecoveryResult> {
  const supabase = createAdminClient();
  const APP_URL = getPublicAppUrl();

  try {
    // 1. Buscar dados da assinatura
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id, user_id, product_id, churn_recovery_sent_at, stripe_subscription_id")
      .eq("stripe_subscription_id", payload.subscriptionId)
      .single();

    if (subErr || !sub) {
      return { success: false, message: `Assinatura não encontrada: ${payload.subscriptionId}` };
    }

    // 2. Anti-spam: verificar se já enviou nos últimos 14 dias
    if (sub.churn_recovery_sent_at) {
      const sentAt  = new Date(sub.churn_recovery_sent_at);
      const daysSince = (Date.now() - sentAt.getTime()) / 86_400_000;
      if (daysSince < 14) {
        return {
          success: true,
          skipped: true,
          skipReason: `Email de recuperação já enviado há ${Math.round(daysSince)} dias`,
          message: "Pulado — anti-spam ativo",
        };
      }
    }

    // 3. Buscar email do utilizador
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(sub.user_id);
    if (userErr || !userData?.user?.email) {
      return { success: false, message: "Email do utilizador não encontrado" };
    }

    const email    = userData.user.email;
    const userName = userData.user.user_metadata?.full_name
      || userData.user.user_metadata?.name
      || email.split("@")[0];

    // 4. Buscar nome do produto
    const productId = payload.productId || sub.product_id;
    let productName = "a plataforma";

    if (productId) {
      const { data: product } = await supabase
        .from("saas_products")
        .select("name")
        .eq("id", productId)
        .single();
      if (product?.name) productName = product.name;
    }

    // 5. Construir email
    const supportUrl = `${APP_URL}/support/novo`;
    const { subject, html } = buildRecoveryEmail({
      userName,
      productName,
      score:      payload.score,
      reasons:    payload.reasons,
      supportUrl,
    });

    // 6. Enviar (com fallback para job_queue se Resend falhar)
    await sendEmailQueued({ to: email, subject, html });

    // 7. Marcar como enviado (best-effort — não quebra se coluna não existir)
    await supabase
      .from("subscriptions")
      .update({ churn_recovery_sent_at: new Date().toISOString() })
      .eq("stripe_subscription_id", payload.subscriptionId)
      .then(undefined, () => {});

    // 8. Atualizar health score para indicar que ação foi tomada (best-effort)
    await supabase
      .from("subscription_health_scores")
      .update({ recovery_email_sent_at: new Date().toISOString() })
      .eq("stripe_subscription_id", payload.subscriptionId)
      .then(undefined, () => {});

    return {
      success: true,
      email,
      message: `Email de recuperação enviado para ${email}`,
    };

  } catch (err: unknown) {
    console.error("[ChurnRecovery] Erro:", getErrorMessage(err));
    return { success: false, message: `Erro interno: ${getErrorMessage(err)}` };
  }
}
