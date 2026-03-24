// lib/email.ts
// ✅ Envio de e-mails transacionais via Resend (sem dependências externas).
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { RESEND_API_KEY, RESEND_FROM_EMAIL } from "@/lib/env-server";
import { inngest } from "@/lib/inngest";
import { getErrorMessage } from "@/lib/errors";

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: { name: string; value: string }[];
};

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  if (!RESEND_API_KEY) return; // safety: env.ts garante, mas mantém defensivo
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      tags: args.tags,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `[email] Resend HTTP ${res.status}: ${body}`;
    console.error(msg);
    throw new Error(msg);
  }
}

/**
 * Envia email com fallback para fila (job_queue).
 * - Se o Resend falhar (rate limit, timeout etc), enfileira "email/send" para retry.
 * - Se RESEND_API_KEY não estiver configurada, apenas ignora (opcional).
 */
export async function sendEmailQueued(args: SendEmailArgs): Promise<void> {
  try {
    await sendEmail(args);
  } catch (e: unknown) {
    await inngest.send({
      name: "email/send",
      data: {
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text ?? null,
        tags: (args.tags ?? null) as Array<{ name: string; value: string }> | null,
        reason: getErrorMessage(e, "send_failed"),
      },
    });
  }
}

function layout(title: string, bodyHtml: string) {
  const app = NEXT_PUBLIC_APP_URL || "";
  return `
  <div style="background:#09090b;padding:32px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#e4e4e7">
    <div style="max-width:560px;margin:0 auto;border:1px solid #27272a;border-radius:16px;overflow:hidden;background:#0b0b0f">
      <div style="padding:20px 22px;border-bottom:1px solid #27272a;display:flex;align-items:center;gap:10px">
        <div style="width:10px;height:10px;border-radius:999px;background:#34d399"></div>
        <div style="font-weight:700;letter-spacing:-0.02em">Playbook<span style="color:#34d399">.</span></div>
      </div>
      <div style="padding:22px">
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:10px">${title}</div>
        ${bodyHtml}
        <div style="margin-top:18px;font-size:12px;color:#a1a1aa">
          Se você não reconhece esta ação, ignore este e-mail ou acesse ${app}.
        </div>
      </div>
    </div>
  </div>
  `;
}

export function emailWelcome(name?: string) {
  const t = "Bem-vindo 👋";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      ${name ? `Olá, <b>${name}</b>!` : "Olá!"} Sua conta foi criada com sucesso.<br/>
      Você já pode explorar produtos, assinar planos e acompanhar sua biblioteca.
    </div>
    <div style="margin-top:16px">
      <a href="${NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Abrir meu painel</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailPurchaseReceipt(args: { name?: string; amountBRL: string; productName?: string; accessUrl: string }) {
  const t = "Compra confirmada ✅";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      ${args.name ? `Obrigado, <b>${args.name}</b>!` : "Obrigado!"} Seu pagamento foi confirmado.<br/>
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #27272a;border-radius:14px;background:#09090b">
        <div><b>Valor:</b> ${args.amountBRL}</div>
        ${args.productName ? `<div><b>Produto:</b> ${args.productName}</div>` : ""}
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.accessUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Acessar agora</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailSubscriptionCanceled(args: { accessUrl: string }) {
  const t = "Assinatura cancelada";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      Sua assinatura foi cancelada e o acesso foi revogado.<br/>
      Se isso foi um engano, você pode reativar a qualquer momento.
    </div>
    <div style="margin-top:16px">
      <a href="${args.accessUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Gerenciar assinatura</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailRenewalSoon(args: { days: number; accessUrl: string }) {
  const t = "Renovação próxima";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      Sua assinatura renova em <b>${args.days} dias</b>.<br/>
      Garanta que seu cartão esteja atualizado para não perder o acesso.
    </div>
    <div style="margin-top:16px">
      <a href="${args.accessUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Atualizar pagamento</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailDisputeOpened(args: { accessUrl: string }) {
  const t = "Disputa/chargeback detectado ⚠️";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      Detectamos uma disputa (chargeback) ligada a uma cobrança.<br/>
      Por segurança, a assinatura foi cancelada e o acesso revogado.
    </div>
    <div style="margin-top:16px">
      <a href="${args.accessUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Abrir suporte</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ──────────────────────────────────────────────────────────────────────────────
// VENDOR TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

export function emailVendorNewSale(args: {
  vendorName?: string;
  buyerEmail: string;
  productName?: string;
  amountBRL: string;
  dashUrl: string;
}) {
  const t = "💰 Nova venda!";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      ${args.vendorName ? `Olá, <b>${args.vendorName}</b>!<br/>` : ""}
      Você recebeu um novo pagamento.
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #27272a;border-radius:14px;background:#09090b">
        <div><b>Comprador:</b> ${args.buyerEmail}</div>
        ${args.productName ? `<div><b>Produto:</b> ${args.productName}</div>` : ""}
        <div><b>Valor líquido:</b> ${args.amountBRL}</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.dashUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Ver vendas</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailVendorDisputeOpened(args: {
  vendorName?: string;
  buyerEmail: string;
  amountBRL: string;
  dashUrl: string;
}) {
  const t = "⚠️ Disputa aberta no seu produto";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      ${args.vendorName ? `Olá, <b>${args.vendorName}</b>.<br/>` : ""}
      Uma disputa (chargeback) foi aberta por um comprador no seu produto.<br/>
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #3f1212;border-radius:14px;background:#1a0a0a">
        <div><b>Comprador:</b> ${args.buyerEmail}</div>
        <div><b>Valor contestado:</b> ${args.amountBRL}</div>
      </div>
      <div style="margin-top:8px;color:#a1a1aa">
        O acesso do comprador foi revogado automaticamente. Acesse o painel para mais detalhes.
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.dashUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Ver disputa</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailVendorNewAffiliate(args: {
  vendorName?: string;
  affiliateEmail: string;
  productName?: string;
  dashUrl: string;
}) {
  const t = "🔗 Novo afiliado no seu produto";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      ${args.vendorName ? `Olá, <b>${args.vendorName}</b>!<br/>` : ""}
      Um novo afiliado está promovendo seu produto.
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #27272a;border-radius:14px;background:#09090b">
        <div><b>Afiliado:</b> ${args.affiliateEmail}</div>
        ${args.productName ? `<div><b>Produto:</b> ${args.productName}</div>` : ""}
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.dashUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Ver afiliados</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ──────────────────────────────────────────────────────────────────────────────
// AFFILIATE TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

export function emailAffiliateNewCommission(args: {
  affiliateName?: string;
  productName?: string;
  commissionBRL: string;
  dashUrl: string;
}) {
  const t = "💸 Nova comissão creditada!";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      ${args.affiliateName ? `Olá, <b>${args.affiliateName}</b>!<br/>` : ""}
      Uma nova comissão foi creditada na sua conta.
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #27272a;border-radius:14px;background:#09090b">
        ${args.productName ? `<div><b>Produto:</b> ${args.productName}</div>` : ""}
        <div><b>Comissão:</b> ${args.commissionBRL}</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.dashUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Ver extrato</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

export function emailAdminProductPending(args: {
  productName: string;
  vendorEmail: string;
  reviewUrl: string;
}) {
  const t = "🆕 Produto aguardando revisão";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      Um novo produto foi submetido e aguarda aprovação.
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #27272a;border-radius:14px;background:#09090b">
        <div><b>Produto:</b> ${args.productName}</div>
        <div><b>Vendor:</b> ${args.vendorEmail}</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.reviewUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Revisar produto</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailAdminDisputeEscalated(args: {
  buyerEmail: string;
  vendorEmail: string;
  amountBRL: string;
  disputeUrl: string;
}) {
  const t = "🚨 Disputa escalada para revisão";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.6">
      Uma disputa exige atenção manual da equipe.
      <div style="margin-top:10px;padding:12px 14px;border:1px solid #3f1212;border-radius:14px;background:#1a0a0a">
        <div><b>Comprador:</b> ${args.buyerEmail}</div>
        <div><b>Vendor:</b> ${args.vendorEmail}</div>
        <div><b>Valor:</b> ${args.amountBRL}</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.disputeUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700">Ver disputa</a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ── LGPD: Confirmação de solicitação ─────────────────────────────────────────
export function emailLgpdConfirmacao(args: {
  nome:         string;
  tipo:         string;
  prazo:        string;
  emailContato: string;
}) {
  const tipoLabels: Record<string, string> = {
    acesso:        "Acesso aos dados",
    correcao:      "Correção de dados",
    exclusao:      "Exclusão de dados",
    portabilidade: "Portabilidade de dados",
    revogacao:     "Revogação de consentimento",
    oposicao:      "Oposição ao tratamento",
  };
  const t = `Solicitação LGPD recebida — ${tipoLabels[args.tipo] ?? args.tipo}`;
  const body = `
    <p>Olá, <b>${args.nome}</b>!</p>
    <p>Recebemos sua solicitação de <b>${tipoLabels[args.tipo] ?? args.tipo}</b>.</p>
    <div style="background:#18181b;border-radius:12px;padding:16px;margin:16px 0">
      <div style="font-size:13px;color:#a1a1aa">Prazo de atendimento</div>
      <div style="font-size:16px;font-weight:700;color:#10b981">${args.prazo}</div>
    </div>
    <p style="font-size:13px;color:#71717a">
      Em caso de dúvidas, responda este e-mail ou entre em contato:
      <a href="mailto:${args.emailContato}" style="color:#10b981">${args.emailContato}</a>
    </p>
  `;
  return { subject: t, html: layout(t, body) };
}

// ──────────────────────────────────────────────────────────────────────────────
// CARRINHO ABANDONADO
// ──────────────────────────────────────────────────────────────────────────────

export function emailAbandonedCart(args: {
  name?: string;
  productName?: string;
  recoveryUrl: string;
}) {
  const t = "Você esqueceu algo 👀";
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.7">
      ${args.name ? `Olá, <b>${args.name}</b>!<br/>` : "Olá!<br/>"}
      Percebemos que você iniciou o checkout${args.productName ? ` de <b>${args.productName}</b>` : ""} mas não concluiu.<br/><br/>
      Seu acesso está esperando por você. O processo leva menos de 2 minutos.
    </div>
    <div style="margin-top:20px">
      <a href="${args.recoveryUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">
        Retomar meu checkout →
      </a>
    </div>
    <div style="margin-top:16px;font-size:12px;color:#71717a">
      Este link é exclusivo para você. Dúvidas? Responda este e-mail.
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ──────────────────────────────────────────────────────────────────────────────
// SÉRIE DE ONBOARDING PÓS-COMPRA
// ──────────────────────────────────────────────────────────────────────────────

export function emailOnboardingDay1(args: {
  name?: string;
  productName?: string;
  accessUrl: string;
  supportUrl?: string;
}) {
  const t = `🚀 Seu acesso ao ${args.productName ?? "produto"} está pronto`;
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.7">
      ${args.name ? `Olá, <b>${args.name}</b>!<br/>` : ""}
      Seu acesso${args.productName ? ` ao <b>${args.productName}</b>` : ""} foi ativado com sucesso.<br/><br/>
      Para aproveitar ao máximo, recomendamos começar por:<br/>
      <ul style="margin:10px 0;padding-left:20px;color:#a1a1aa">
        <li>Configure sua conta e preferências</li>
        <li>Explore os recursos disponíveis no seu plano</li>
        <li>Salve seus dados de acesso em local seguro</li>
      </ul>
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <a href="${args.accessUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:700">
        Acessar agora
      </a>
      ${args.supportUrl ? `<a href="${args.supportUrl}" style="display:inline-block;border:1px solid #3f3f46;color:#a1a1aa;padding:10px 16px;border-radius:12px;text-decoration:none">Preciso de ajuda</a>` : ""}
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailOnboardingDay3(args: {
  name?: string;
  productName?: string;
  accessUrl: string;
  tipTitle?: string;
  tipBody?: string;
}) {
  const t = `💡 Dica para aproveitar melhor ${args.productName ?? "seu produto"}`;
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.7">
      ${args.name ? `Olá, <b>${args.name}</b>!<br/>` : ""}
      Já faz 3 dias desde que você acessou${args.productName ? ` <b>${args.productName}</b>` : ""}. Como está indo?<br/><br/>
      ${args.tipTitle ? `<div style="padding:14px;border-left:3px solid #34d399;background:#052e1a22;border-radius:0 12px 12px 0;margin:12px 0">
        <div style="font-weight:700;color:#34d399">${args.tipTitle}</div>
        ${args.tipBody ? `<div style="color:#a1a1aa;margin-top:6px;font-size:13px">${args.tipBody}</div>` : ""}
      </div>` : ""}
      Precisando de suporte ou com alguma dúvida? Nossa equipe está disponível.
    </div>
    <div style="margin-top:16px">
      <a href="${args.accessUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:700">
        Continuar usando
      </a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

export function emailOnboardingDay7(args: {
  name?: string;
  productName?: string;
  accessUrl: string;
  reviewUrl?: string;
}) {
  const t = `⭐ Como está sendo sua experiência com ${args.productName ?? "o produto"}?`;
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.7">
      ${args.name ? `Olá, <b>${args.name}</b>!<br/>` : ""}
      Uma semana com${args.productName ? ` <b>${args.productName}</b>` : " o produto"}!<br/><br/>
      Sua opinião importa muito para nós. Deixar uma avaliação leva menos de 1 minuto e ajuda outros usuários a descobrirem este produto.
    </div>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      ${args.reviewUrl ? `<a href="${args.reviewUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:700">⭐ Avaliar produto</a>` : ""}
      <a href="${args.accessUrl}" style="display:inline-block;border:1px solid #3f3f46;color:#a1a1aa;padding:10px 16px;border-radius:12px;text-decoration:none">
        Abrir painel
      </a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ── Produto aprovado → email ao vendor ───────────────────────────────────────
export function emailProductApproved(args: {
  vendorName?: string;
  productName: string;
  feedback?: string;
  dashUrl: string;
}) {
  const t = `✅ Produto aprovado: ${args.productName}`;
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.7">
      ${args.vendorName ? `Olá, <b>${args.vendorName}</b>!<br/>` : ""}
      Ótima notícia: seu produto <b>${args.productName}</b> foi <span style="color:#34d399;font-weight:700">aprovado</span> e já está visível no marketplace!
      ${args.feedback ? `<div style="margin-top:12px;padding:12px 14px;border-left:3px solid #34d399;background:#052e1a22;border-radius:0 12px 12px 0">
        <div style="font-weight:700;color:#a1a1aa;font-size:12px;margin-bottom:4px">FEEDBACK DA REVISÃO</div>
        <div style="color:#d4d4d8">${args.feedback}</div>
      </div>` : ""}
    </div>
    <div style="margin-top:16px">
      <a href="${args.dashUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:700">
        Ver meu produto no marketplace
      </a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}

// ── Produto rejeitado → email ao vendor ───────────────────────────────────────
export function emailProductRejected(args: {
  vendorName?: string;
  productName: string;
  reason?: string;
  feedback?: string;
  editUrl: string;
}) {
  const t = `❌ Produto requer ajustes: ${args.productName}`;
  const body = `
    <div style="font-size:14px;color:#d4d4d8;line-height:1.7">
      ${args.vendorName ? `Olá, <b>${args.vendorName}</b>!<br/>` : ""}
      Seu produto <b>${args.productName}</b> precisa de alguns ajustes antes de ser publicado no marketplace.
      ${args.reason ? `<div style="margin-top:12px;padding:12px 14px;border-left:3px solid #ef4444;background:#1a0a0a;border-radius:0 12px 12px 0">
        <div style="font-weight:700;color:#f87171;font-size:12px;margin-bottom:4px">MOTIVO DA REJEIÇÃO</div>
        <div style="color:#d4d4d8">${args.reason}</div>
      </div>` : ""}
      ${args.feedback ? `<div style="margin-top:8px;padding:12px 14px;border-left:3px solid #fbbf24;background:#1a1500;border-radius:0 12px 12px 0">
        <div style="font-weight:700;color:#fbbf24;font-size:12px;margin-bottom:4px">COMO CORRIGIR</div>
        <div style="color:#d4d4d8">${args.feedback}</div>
      </div>` : ""}
      <div style="margin-top:12px;color:#a1a1aa">
        Após corrigir, reenvie seu produto para revisão. Nossa equipe analisará novamente em até 2 dias úteis.
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="${args.editUrl}" style="display:inline-block;background:#fbbf24;color:#1a1500;padding:10px 16px;border-radius:12px;text-decoration:none;font-weight:700">
        Corrigir e reenviar
      </a>
    </div>
  `;
  return { subject: t, html: layout(t, body) };
}
