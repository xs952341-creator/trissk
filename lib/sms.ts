// lib/sms.ts
// Utilitário para envio de SMS e WhatsApp via Twilio.
// Silenciosamente desabilitado se as variáveis de ambiente não estiverem configuradas.
// NÃO importe em "use client".

import { getErrorMessage } from "@/lib/errors";
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  TWILIO_WHATSAPP_FROM,
} from "@/lib/env-server";

export type SmsChannel = "sms" | "whatsapp";

interface SendSmsOptions {
  to: string;         // Número com código de país: +5511999999999
  body: string;
  channel?: SmsChannel; // padrão: "sms"
}

/**
 * Envia SMS ou WhatsApp via Twilio.
 * Retorna { sent: true } em sucesso ou { sent: false, reason } se desabilitado/erro.
 */
export async function sendSms({ to, body, channel = "sms" }: SendSmsOptions): Promise<
  { sent: true; sid: string } | { sent: false; reason: string }
> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log("[sms] Twilio não configurado — SMS desabilitado.");
    return { sent: false, reason: "twilio_not_configured" };
  }

  // Normalizar número
  let toNumber = to.replace(/\s/g, "");
  if (!toNumber.startsWith("+")) toNumber = `+55${toNumber}`;

  const fromNumber = channel === "whatsapp"
    ? (TWILIO_WHATSAPP_FROM ?? `whatsapp:${TWILIO_FROM_NUMBER}`)
    : TWILIO_FROM_NUMBER;

  if (!fromNumber) {
    return { sent: false, reason: "from_number_not_configured" };
  }

  const toFormatted = channel === "whatsapp"
    ? (toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`)
    : toNumber;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          From: fromNumber,
          To:   toFormatted,
          Body: body,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error(`[sms] Twilio error ${res.status}:`, data);
      return { sent: false, reason: data.message ?? `HTTP ${res.status}` };
    }

    console.log(`[sms] Enviado para ${toFormatted}. SID: ${data.sid}`);
    return { sent: true, sid: data.sid };
  } catch (e: unknown) {
    console.error("[sms] fetch error:", getErrorMessage(e));
    return { sent: false, reason: getErrorMessage(e) };
  }
}

/**
 * Templates de SMS prontos para uso.
 */
export const smsTemplates = {
  /** Recuperação de checkout abandonado */
  abandonedCart: (opts: { name: string; productName: string; recoveryUrl: string }) =>
    `Olá ${opts.name}! Você deixou "${opts.productName}" no carrinho. Complete sua compra: ${opts.recoveryUrl}`,

  /** Confirmação de assinatura cancelada + oferta de retenção */
  cancelOffer: (opts: { name: string; promoCode: string; productName: string; portalUrl: string }) =>
    `Olá ${opts.name}! Sentimos sua falta. Use o código ${opts.promoCode} para reativar "${opts.productName}" com 1 mês grátis: ${opts.portalUrl}`,

  /** Notificação de cancelamento (vendor) */
  vendorCancellation: (opts: { vendorName: string; buyerEmail: string; productName: string }) =>
    `Alerta Playbook: ${opts.buyerEmail} cancelou a assinatura de "${opts.productName}". Acesse o painel para ver detalhes.`,

  /** Nova venda (vendor) */
  vendorNewSale: (opts: { vendorName: string; buyerEmail: string; amount: string }) =>
    `💰 Nova venda! ${opts.buyerEmail} comprou por ${opts.amount}. Acesse o painel para detalhes.`,

  /** Confirmação de compra (buyer) */
  purchaseConfirmation: (opts: { name: string; productName: string; accessUrl: string }) =>
    `✅ Compra confirmada! Acesse "${opts.productName}" agora: ${opts.accessUrl}`,
};
