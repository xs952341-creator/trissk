// app/api/cron/process-jobs/route.ts
// Processa a fila de jobs assíncronos (job_queue) — VERSÃO v17.
// Substitui Inngest como runtime de background jobs.
// Cron: a cada 30 minutos (configurado em vercel.json).
//
// Eventos processados:
//   checkout/abandoned      → SMS de recuperação (30min após abandono)
//   subscription/canceled   → SMS/WhatsApp ao vendor
//   payment/confirmed       → inserir ledger + enfileirar NF-e
//   fiscal/emit             → emitir NF-e via eNotas
//   refund/issued           → inserir entrada de reembolso no ledger
//   affiliate/commission    → notificar afiliado por email
//   reconcile/run           → ciclo de reconciliação financeira
//   vendor/new-sale         → notificação push/email ao vendor

import { NextRequest, NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms, smsTemplates } from "@/lib/sms";
import { sendEmail, emailAffiliateNewCommission } from "@/lib/email";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { log } from "@/lib/logger";
import {
  ENOTAS_API_KEY_PLATFORM,
  ENOTAS_COMPANY_ID_PLATFORM,
  STRIPE_SECRET_KEY,
} from "@/lib/env-server";
import { ENOTAS_BASE_URL, ENOTAS_CODIGO_SERVICO, ENOTAS_DESCRICAO_SERVICO } from "@/lib/config";
import { redisDequeueBatch } from "@/lib/queue/upstash";
import Stripe from "stripe";
import { getErrorMessage } from "@/lib/errors";
import type { JobQueue, FiscalJob, DunningState, SaasInstance } from "@/lib/types/database";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export const runtime = "nodejs";

const supabase = createAdminClient();
const APP_URL = getPublicAppUrl();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const traceId = crypto.randomUUID();

  void log.info("cron/process-jobs", "run.started", "Iniciando processamento da fila", { traceId });

  // ── Opcional: drenar Redis (Upstash) para DB queue ───────────────────────
  // Mantém o runtime único (processJob) e não quebra se Redis não estiver configurado.
  try {
    const redisJobs = await redisDequeueBatch(50);
    if (redisJobs.length) {
      await supabase.from("job_queue").insert(
        redisJobs.map((j: unknown) => {
          const jj = j as Record<string, unknown>;
          return {
            event_name: String(jj.event_name ?? ""),
            payload: jj.payload ?? {},
            status: String(jj.status ?? "pending"),
            run_after: String(jj.run_after ?? now),
            priority: Number(jj.priority ?? 0),
            trace_id: String(jj.trace_id ?? traceId),
          };
        })
      ).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));
    }
  } catch {
    // noop
  }

  // Buscar jobs pendentes — ordenar por priority DESC, criação ASC
  const { data: jobs, error } = await supabase
    .from("job_queue")
    .select("id, event_name, payload, retry_count, max_retries, created_at, priority, trace_id")
    .eq("status", "pending")
    .lte("run_after", now)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    void log.error("cron/process-jobs", "run.db_error", getErrorMessage(error), { traceId });
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0, succeeded = 0, failed = 0;

  for (const job of jobs as JobQueue[]) {
    processed++;
    const jobTraceId = job.trace_id || traceId;
    const maxRetries = job.max_retries ?? 3;

    // Marcar como em execução (started_at)
    await supabase.from("job_queue")
      .update({ started_at: new Date().toISOString() })
      .eq("id", job.id);

    try {
      await processJob(job, jobTraceId);
      await supabase.from("job_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      succeeded++;
      void log.info("cron/process-jobs", "job.completed", `Job ${job.event_name} concluído`, { jobId: job.id, traceId: jobTraceId });
    } catch (e: unknown) {
      const retryCount = (job.retry_count ?? 0) + 1;
      const exhausted = retryCount >= maxRetries;
      // Backoff exponencial: 30min, 2h, 8h
      const backoffMs  = exhausted ? 0 : Math.min(30 * 60_000 * Math.pow(4, retryCount - 1), 8 * 60 * 60_000);
      const nextRetry  = exhausted ? null : new Date(Date.now() + backoffMs).toISOString();

      await supabase.from("job_queue")
        .update({
          status:      exhausted ? "failed" : "pending",
          retry_count: retryCount,
          run_after:   nextRetry,
          error:       getErrorMessage(e)?.slice(0, 500),
        })
        .eq("id", job.id);

      void log.error("cron/process-jobs", "job.failed", `Job ${job.event_name} falhou (tentativa ${retryCount}/${maxRetries})`, {
        jobId: job.id, error: getErrorMessage(e), exhausted, traceId: jobTraceId,
      });
      failed++;
    }
  }

  void log.info("cron/process-jobs", "run.finished", "Processamento concluído", { processed, succeeded, failed, traceId });
  return NextResponse.json({ processed, succeeded, failed });
}

async function processJob(job: JobQueue, traceId: string) {
  const { event_name, payload } = job;

  switch (event_name) {
    case "checkout/abandoned":
      await handleAbandonedCheckoutSms(payload as Parameters<typeof handleAbandonedCheckoutSms>[0], String(job.created_at ?? ""), traceId);
      break;
    case "subscription/canceled":
      await handleSubscriptionCanceledSms(payload as Parameters<typeof handleSubscriptionCanceledSms>[0], traceId);
      break;
    case "email/send":
      await handleEmailSend(payload as Parameters<typeof handleEmailSend>[0], traceId);
      break;
    case "dunning/step":
      await handleDunningStep(payload as Parameters<typeof handleDunningStep>[0], traceId);
      break;

    case "lgpd/revoke_instances":
      await handleLgpdRevokeInstances(payload as Parameters<typeof handleLgpdRevokeInstances>[0], traceId);
      break;

    case "payment/confirmed":
      await handlePaymentLedger(payload as Parameters<typeof handlePaymentLedger>[0], traceId);
      break;
    case "fiscal/emit":
      await handleFiscalEmit(payload as Parameters<typeof handleFiscalEmit>[0], traceId);
      break;
    case "refund/issued":
      await handleRefundLedger(payload as Parameters<typeof handleRefundLedger>[0], traceId);
      break;
    case "affiliate/commission":
      await handleAffiliateCommissionEmail(payload as Parameters<typeof handleAffiliateCommissionEmail>[0], traceId);
      break;
    case "reconcile/run":
      await handleReconcileRun(traceId);
      break;
    case "vendor/new-sale":
      await handleVendorNewSale(payload as Parameters<typeof handleVendorNewSale>[0], traceId);
      break;
    case "dispute/opened":
      // Já tratado no webhook sincronamente — log apenas
      void log.info("cron/process-jobs", "dispute.logged", "Disputa registrada", { ...(payload as Record<string,unknown>), traceId });
      break;
    default:
      void log.warn("cron/process-jobs", "job.unknown", `Evento desconhecido: ${event_name}`, { traceId });
  }
}

// ── email/send → retry real (Resend) ───────────────────────────────────────
async function handleEmailSend(payload: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: { name: string; value: string }[];
  reason?: string;
}, traceId: string) {
  if (!payload?.to || !payload?.subject || !payload?.html) {
    void log.warn("cron/process-jobs", "email.invalid_payload", "Payload inválido", { traceId, payload });
    return;
  }

  // sendEmail lança erro em falha → o loop principal do cron fará retry
  await sendEmail({
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    tags: payload.tags,
  });

  void log.info("cron/process-jobs", "email.sent", "Email enviado via fila", {
    traceId,
    to: payload.to,
    subject: payload.subject,
  });
}

// ── payment/confirmed → Ledger ────────────────────────────────────────────────
async function handlePaymentLedger(payload: {
  stripeInvoiceId?: string;
  stripeEventId?: string;
  stripePaymentIntentId?: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  affiliateId?: string;
  productId?: string;
  grossAmount: number;
  platformFee: number;
  vendorPayout: number;
  affiliateCommission: number;
  currency?: string;
  holdUntil?: string;
}, traceId: string) {
  void log.info("cron/process-jobs", "ledger.insert_start", "Inserindo entradas no ledger", {
    stripeInvoiceId: payload.stripeInvoiceId, traceId,
  });

  const { error } = await supabase.rpc("insert_ledger_entries", {
    p_stripe_invoice_id:  payload.stripeInvoiceId ?? null,
    p_stripe_event_id:    payload.stripeEventId ?? null,
    p_stripe_pi_id:       payload.stripePaymentIntentId ?? null,
    p_order_id:           payload.orderId ?? null,
    p_user_id:            payload.userId ?? null,
    p_vendor_id:          payload.vendorId ?? null,
    p_affiliate_id:       payload.affiliateId ?? null,
    p_product_id:         payload.productId ?? null,
    p_gross_amount:       payload.grossAmount,
    p_platform_fee:       payload.platformFee,
    p_vendor_payout:      payload.vendorPayout,
    p_affiliate_commission: payload.affiliateCommission,
    p_currency:           payload.currency ?? "BRL",
  });

  if (error) {
    void log.error("cron/process-jobs", "ledger.insert_failed", getErrorMessage(error), {
      stripeInvoiceId: payload.stripeInvoiceId, traceId,
    });
    throw new Error(`Ledger insert failed: ${getErrorMessage(error)}`);
  }

  // Atualizar hold_until na entrada vendor_payout do ledger
  if (payload.holdUntil && payload.stripeInvoiceId && payload.vendorId) {
    await supabase
      .from("financial_ledger")
      .update({ hold_until: payload.holdUntil })
      .eq("stripe_invoice_id", payload.stripeInvoiceId)
      .eq("entry_type", "vendor_payout")
      .eq("vendor_id", payload.vendorId);
  }

  // Recalcular saldo do vendor
  if (payload.vendorId) {
    await supabase.rpc("recalculate_vendor_balance", { p_vendor_id: payload.vendorId });
  }

  void log.info("cron/process-jobs", "ledger.insert_ok", "Entradas do ledger inseridas com sucesso", {
    stripeInvoiceId: payload.stripeInvoiceId, holdUntil: payload.holdUntil, traceId,
  });
}

// ── refund/issued → Ledger ────────────────────────────────────────────────────
async function handleRefundLedger(payload: {
  stripeInvoiceId?: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  productId?: string;
  amount: number;
  reason?: string;
}, traceId: string) {
  if (!payload.amount || payload.amount <= 0) return;

  await supabase.from("financial_ledger").insert({
    stripe_invoice_id: payload.stripeInvoiceId ?? null,
    order_id:          payload.orderId ?? null,
    user_id:           payload.userId ?? null,
    vendor_id:         payload.vendorId ?? null,
    product_id:        payload.productId ?? null,
    entry_type:        "refund",
    amount:            payload.amount,
    currency:          "BRL",
    direction:         "debit",
    description:       `Reembolso${payload.reason ? `: ${payload.reason}` : ""}`,
  });

  void log.info("cron/process-jobs", "refund.ledger_ok", "Reembolso registrado no ledger", {
    orderId: payload.orderId, amount: payload.amount, traceId,
  });
}

// ── fiscal/emit → eNotas ──────────────────────────────────────────────────────
async function handleFiscalEmit(payload: {
  fiscalJobId: string;
  buyerEmail: string;
  amount: number;
  description?: string;
  vendorId?: string;
}, traceId: string) {
  if (!ENOTAS_API_KEY_PLATFORM || !ENOTAS_COMPANY_ID_PLATFORM) {
    void log.warn("cron/process-jobs", "fiscal.skip", "eNotas não configurado — NF-e ignorada", { traceId });
    return;
  }

  void log.info("cron/process-jobs", "fiscal.emit_start", "Emitindo NF-e via eNotas", {
    fiscalJobId: payload.fiscalJobId, traceId,
  });

  // Buscar dados do fiscal_job e vendor
  const { data: fj } = await supabase
    .from("fiscal_jobs")
    .select("id, buyer_email, amount_gross, platform_fee, vendor_id, profiles!vendor_id(enotas_api_key, enotas_company_id, cnpj, razao_social)")
    .eq("id", payload.fiscalJobId)
    .maybeSingle();

  if (!fj || (fj as FiscalJob).status === "EMITTED") {
    void log.info("cron/process-jobs", "fiscal.skip", "Job fiscal já emitido ou não encontrado", { fiscalJobId: payload.fiscalJobId, traceId });
    return;
  }

  const vendor = (fj as FiscalJob).profiles;
  // Usar chaves do vendor se disponíveis, senão usar da plataforma
  const apiKey     = vendor?.enotas_api_key || ENOTAS_API_KEY_PLATFORM;
  const companyId  = vendor?.enotas_company_id || ENOTAS_COMPANY_ID_PLATFORM;

  try {
    const nfBody = {
      ambienteEmissao: "Producao",
      enviarEmail: true,
      consumidor: { email: (fj as FiscalJob).buyer_email || payload.buyerEmail },
      servicos: [{
        codigo:             ENOTAS_CODIGO_SERVICO,
        discriminacao:      ENOTAS_DESCRICAO_SERVICO,
        valor:              Number((fj as FiscalJob).amount_gross) - Number((fj as FiscalJob).platform_fee || 0),
        issRetidoFonte:     false,
      }],
    };

    const res = await fetch(`${ENOTAS_BASE_URL}/v2/empresas/${companyId}/nfes`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
      body: JSON.stringify(nfBody),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`eNotas ${res.status}: ${err}`);
    }

    // Marcar job como emitido
    await supabase.from("fiscal_jobs").update({ status: "EMITTED", updated_at: new Date().toISOString() }).eq("id", payload.fiscalJobId);
    void log.info("cron/process-jobs", "fiscal.emit_ok", "NF-e emitida com sucesso", { fiscalJobId: payload.fiscalJobId, traceId });
  } catch (e: unknown) {
    void log.error("cron/process-jobs", "fiscal.emit_failed", getErrorMessage(e), { fiscalJobId: payload.fiscalJobId, traceId });
    throw e;
  }
}

// ── affiliate/commission → Email ──────────────────────────────────────────────
async function handleAffiliateCommissionEmail(payload: {
  affiliateId: string;
  affiliateName?: string;
  affiliateEmail?: string;
  commissionBRL: string;
  productName?: string;
}, traceId: string) {
  if (!payload.affiliateEmail) return;
  try {
    const tpl = emailAffiliateNewCommission({
      affiliateName: payload.affiliateName,
      commissionBRL: payload.commissionBRL,
      dashUrl:       `${APP_URL}/affiliate/extrato`,
    });
    await sendEmail({ to: payload.affiliateEmail, subject: tpl.subject, html: tpl.html });
    void log.info("cron/process-jobs", "affiliate.email_sent", "Email de comissão enviado", { affiliateId: payload.affiliateId, traceId });
  } catch (e: unknown) {
    void log.warn("cron/process-jobs", "affiliate.email_failed", getErrorMessage(e), { affiliateId: payload.affiliateId, traceId });
    // Não lança — email é best-effort
  }
}

// ── reconcile/run → Reconciliação ────────────────────────────────────────────
async function handleReconcileRun(traceId: string) {
  void log.info("cron/process-jobs", "reconcile.start", "Iniciando reconciliação financeira", { traceId });
  const { data, error } = await supabase.rpc("reconcile_orders", {
    p_since: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
  });
  if (error) {
    void log.error("cron/process-jobs", "reconcile.failed", getErrorMessage(error), { traceId });
    throw new Error(getErrorMessage(error));
  }
  void log.info("cron/process-jobs", "reconcile.completed", "Reconciliação concluída", { ...data, traceId });
}

// ── vendor/new-sale → Notificação ────────────────────────────────────────────
async function handleVendorNewSale(payload: {
  vendorId: string;
  amount: number;
  productName?: string;
  buyerEmail?: string;
}, traceId: string) {
  // Push notification (já existe via notificações DB — aqui seria WebPush)
  const { error } = await supabase.from("notifications").insert({
    user_id:    payload.vendorId,
    type:       "new_sale",
    title:      "💰 Nova Venda!",
    body:       `Você recebeu R$ ${Number(payload.amount).toFixed(2)} pela venda de "${payload.productName ?? "produto"}".`,
    action_url: "/vendor/relatorios",
  });
  if (error) void log.warn("cron/process-jobs", "vendor.notify_failed", getErrorMessage(error), { vendorId: payload.vendorId, traceId });
}

// ── Checkout abandonado → SMS ─────────────────────────────────────────────────
async function handleAbandonedCheckoutSms(
  payload: { userId: string; email: string; name: string; productName: string; recoveryUrl: string; phone?: string },
  jobCreatedAt: string,
  traceId: string
) {
  const minutesPassed = (Date.now() - new Date(String(jobCreatedAt ?? "")).getTime()) / 60_000;
  if (minutesPassed < 28) throw new Error("RESCHEDULE: não passaram 30min ainda");

  if (payload.userId) {
    const { data: recentOrder } = await supabase
      .from("orders").select("id").eq("user_id", payload.userId)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString()).maybeSingle();
    if (recentOrder) { void log.info("cron/process-jobs", "sms.skip_converted", "Usuário já converteu", { userId: payload.userId, traceId }); return; }
  }
  if (!payload.phone) return;

  await sendSms({
    to:   payload.phone,
    body: smsTemplates.abandonedCart({ name: payload.name || "Cliente", productName: payload.productName, recoveryUrl: payload.recoveryUrl }),
  });
}

// ── Cancelamento → SMS vendor ─────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
async function handleSubscriptionCanceledSms(
  payload: { userId: string; email: string; name: string; phone?: string; productName: string; subscriptionId: string; vendorId?: string },
  traceId: string
) {
  if (payload.phone) {
    await sendSms({ to: payload.phone, body: `Olá ${payload.name || ""}! Sua assinatura de "${payload.productName}" foi cancelada. Reative em: ${APP_URL}/dashboard/billing` });
  }
  if (payload.vendorId) {
    const { data: vp } = await supabase.from("profiles").select("phone, full_name").eq("id", payload.vendorId).maybeSingle();
    if ((vp as { phone?: string | null })?.phone) {
      const body = smsTemplates.vendorCancellation({ vendorName: (vp as { full_name?: string | null }).full_name ?? "", buyerEmail: payload.email, productName: payload.productName });
      const r = await sendSms({ to: (vp as { phone?: string | null }).phone as string, body, channel: "whatsapp" });
      if (!r.sent) await sendSms({ to: (vp as { phone?: string | null }).phone as string, body, channel: "sms" });
    }
  }
}


async function handleDunningStep(payload: Record<string, unknown>, traceId: string) {
  const supabase = createAdminClient();
  const subId = String(payload?.stripe_subscription_id ?? "");
  const step = Number(payload?.step ?? 0);
  const invoiceId = payload?.invoice_id ? String(payload.invoice_id) : null;
  if (!subId || !step) return;

  const { data: state } = await supabase
    .from("dunning_states")
    .select("resolved, step, buyer_id, vendor_id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();

  if (state?.resolved) return;

  // Se já enviou step >= este, não reenviar
  if (Number((state as Record<string, unknown>)?.step ?? 0) >= step) return;

  const email = payload?.customer_email ? String(payload.customer_email) : null;

  // mensagem
  const subject = step === 1
    ? "Pagamento pendente — precisamos de você"
    : step === 2
      ? "Pagamento ainda pendente — evite interrupção"
      : "Último aviso — assinatura será cancelada";

  const body = step === 1
    ? "Detectamos uma falha no pagamento. Atualize seu método de pagamento para manter seu acesso ativo."
    : step === 2
      ? "Seu pagamento ainda não foi confirmado. Atualize seu cartão para evitar suspensão do acesso."
      : "Se o pagamento não for regularizado, sua assinatura poderá ser cancelada automaticamente.";

  // Link do portal do Stripe (se possível)
  let portalUrl: string | null = null;
  try {
    if (email) {
      // buscar customer pelo email (best-effort)
      const customers = await stripe.customers.list({ email, limit: 1 });
      const customerId = customers.data?.[0]?.id;
      if (customerId) {
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: getPublicAppUrl(),
        });
        portalUrl = session.url;
      }
    }
  } catch {}

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>${subject}</h2>
      <p>${body}</p>
      ${portalUrl ? `<p><a href="${portalUrl}">Atualizar pagamento</a></p>` : ""}
      <p style="color:#666;font-size:12px">Ref: ${invoiceId ?? subId}</p>
    </div>
  `;

  if (email) {
    await sendEmail({ to: email, subject, html }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));
  }

  // SMS opcional (se você tiver provider configurado)
  const phone = payload?.customer_phone ? String(payload.customer_phone) : null;
  if (phone) {
    await sendSms({ to: phone, body: `${subject} ${portalUrl ? portalUrl : ""}`.trim() }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));
  }

  // atualizar state
  await supabase.from("dunning_states").update({
    step,
    last_invoice_id: invoiceId,
    last_sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subId).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));

  // step 3: cancelar no Stripe (best-effort) se ainda pendente
  if (step >= 3) {
    try {
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    } catch {}
  }

  await supabase.from("structured_logs").insert({
    source: "cron/process-jobs",
    level: "info",
    message: "dunning.step_sent",
    trace_id: traceId,
    meta: { stripe_subscription_id: subId, step },
  }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));
}

async function handleLgpdRevokeInstances(payload: Record<string, unknown>, traceId: string) {
  const supabase = createAdminClient();
  const userId = String(payload?.user_id ?? "");
  if (!userId) return;

  // marcar instâncias como revoked e enfileirar webhook de revogação (best-effort)
  const { data: instances } = await supabase
    .from("saas_instances")
    .select("id, product_id, external_id, status")
    .eq("user_id", userId)
    .in("status", ["active", "suspended", "pending"]);

  for (const inst of instances ?? []) {
    const instTyped = inst as SaasInstance;
    await supabase.from("saas_instances").update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoke_reason: "lgpd",
      lgpd_revoked: true,
    }).eq("id", instTyped.id);

    // dispara webhook de revogação se provider estiver configurado
    const { data: prov } = await supabase
      .from("saas_providers")
      .select("webhook_url, webhook_signing_secret")
      .eq("product_id", instTyped.product_id)
      .maybeSingle();

    if (prov?.webhook_url) {
      await supabase.from("job_queue").insert({
        event_name: "webhook/deliver",
        payload: {
          url: prov.webhook_url,
          secret: prov.webhook_signing_secret,
          kind: "saas.revoke",
          data: {
            instance_id: instTyped.id,
            external_id: instTyped.external_id,
            reason: "lgpd",
          },
        },
        status: "pending",
        run_after: new Date().toISOString(),
        priority: 80,
        trace_id: `${instTyped.id}:lgpd_revoke`,
      }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));
    }
  }

  await supabase.from("structured_logs").insert({
    source: "cron/process-jobs",
    level: "info",
    message: "lgpd.revoke_instances",
    trace_id: traceId,
    meta: { user_id: userId, instances: (instances ?? []).length },
  }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/process-jobs]", getErrorMessage(e)));
}
