// lib/dunning.ts  
// Máquina de estados para recuperação de cobranças falhas — nível Stripe Billing.
// Fluxo: failed → dunning_step_1 (email 1h) → step_2 (email + SMS 24h) → step_3 (72h) → canceled
// Integra com: Stripe retry, SMS, email, push notification.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { sendEmailQueued } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { log } from "@/lib/logger";

export type DunningStep = 0 | 1 | 2 | 3;

export interface DunningState {
  subscriptionId:   string;
  userId:           string;
  vendorId?:        string;
  email:            string;
  phone?:           string;
  currentStep:      DunningStep;
  invoiceId?:       string;
  productName?:     string;
  amountBRL?:       number;
  portalUrl?:       string;
}

// Delays entre tentativas (em ms) — equivalente ao Stripe Smart Retries
const STEP_DELAYS_HOURS = [0, 1, 24, 72];

export async function initiateDunning(state: DunningState): Promise<void> {
  const admin = createAdminClient();

  // Upsert dunning state
  await admin.from("dunning_states").upsert({
    subscription_id:  state.subscriptionId,
    user_id:          state.userId,
    step:             0,
    last_invoice_id:  state.invoiceId ?? null,
    last_sent_at:     null,
    resolved:         false,
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  }, { onConflict: "subscription_id" });

  // Enfileirar step 1 para executar em 1h
  await admin.from("job_queue").insert({
    event_name: "dunning/step",
    payload: { ...state, step: 1 },
    run_after: new Date(Date.now() + STEP_DELAYS_HOURS[1] * 3_600_000).toISOString(),
    status: "pending",
    retry_count: 0,
    priority: 8,
  });

  void log.info("dunning", "initiated", `Subscription ${state.subscriptionId}`, { userId: state.userId });
}

export async function executeDunningStep(state: DunningState & { step: DunningStep }): Promise<void> {
  const admin = createAdminClient();

  // Verificar se assinatura já foi recuperada
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("stripe_subscription_id", state.subscriptionId)
    .maybeSingle();

  if (!sub || (sub as Record<string, unknown>).status === "active") {
    // Recuperada! Marcar dunning como resolvida
    await admin.from("dunning_states")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("subscription_id", state.subscriptionId);
    void log.info("dunning", "resolved", `Sub recovered at step ${state.step}`, {});
    return;
  }

  const { step } = state;
  const productName = state.productName ?? "seu produto";
  const updateUrl = state.portalUrl ?? `${getPublicAppUrl()}/carteira`;

  // ── Step 1: Email urgente (1h após falha) ──────────────────────────────────
  if (step === 1) {
    await sendEmailQueued({
      to: state.email,
      subject: "⚠️ Pagamento não processado — ação necessária",
      html: buildDunningEmail(1, productName, updateUrl, state.amountBRL),
    });

    await admin.from("dunning_states").update({
      step: 1,
      last_sent_at: new Date().toISOString(),
      last_invoice_id: state.invoiceId ?? null,
      updated_at: new Date().toISOString(),
    }).eq("subscription_id", state.subscriptionId);

    // Enfileirar step 2 para 24h
    await admin.from("job_queue").insert({
      event_name: "dunning/step",
      payload: { ...state, step: 2 },
      run_after: new Date(Date.now() + (STEP_DELAYS_HOURS[2] - STEP_DELAYS_HOURS[1]) * 3_600_000).toISOString(),
      status: "pending", retry_count: 0, priority: 8,
    });
  }

  // ── Step 2: Email + SMS (24h após falha) ──────────────────────────────────
  else if (step === 2) {
    await sendEmailQueued({
      to: state.email,
      subject: "🔴 Último aviso — acesso será suspenso em 48h",
      html: buildDunningEmail(2, productName, updateUrl, state.amountBRL),
    });

    if (state.phone) {
      await sendSms({
        to: state.phone,
        body: `[PlaybookHub] Seu acesso a "${productName}" será suspenso em 48h por falha no pagamento. Atualize agora: ${updateUrl}`,
      }).then(undefined, () => {});
    }

    await admin.from("dunning_states").update({
      step: 2,
      last_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("subscription_id", state.subscriptionId);

    // Enfileirar step 3 para 72h
    await admin.from("job_queue").insert({
      event_name: "dunning/step",
      payload: { ...state, step: 3 },
      run_after: new Date(Date.now() + (STEP_DELAYS_HOURS[3] - STEP_DELAYS_HOURS[2]) * 3_600_000).toISOString(),
      status: "pending", retry_count: 0, priority: 8,
    });
  }

  // ── Step 3: Cancelamento e notificação final (72h) ────────────────────────
  else if (step === 3) {
    // Suspender acesso
    await admin.from("subscriptions")
      .update({ status: "past_due" })
      .eq("stripe_subscription_id", state.subscriptionId);

    await admin.from("saas_instances")
      .update({ status: "suspended" })
      .eq("stripe_subscription_id", state.subscriptionId);

    await sendEmailQueued({
      to: state.email,
      subject: "❌ Acesso suspenso — reative sua assinatura",
      html: buildDunningEmail(3, productName, updateUrl, state.amountBRL),
    });

    await admin.from("dunning_states").update({
      step: 3,
      last_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("subscription_id", state.subscriptionId);

    void log.info("dunning", "step3.suspended", `Sub ${state.subscriptionId} suspended`, {});
  }
}

export async function resolveDunning(subscriptionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("dunning_states")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("subscription_id", subscriptionId)
    .eq("resolved", false);

  // Reativar instâncias suspensas
  await admin.from("saas_instances")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("status", "suspended");
}

// ─── Email templates de dunning ───────────────────────────────────────────────

function buildDunningEmail(step: 1 | 2 | 3, product: string, url: string, amount?: number): string {
  const amtStr = amount ? `R$ ${Number(amount).toFixed(2)}` : "valor da assinatura";

  const messages = {
    1: {
      headline: "Houve um problema com seu pagamento",
      body: `Não conseguimos processar o pagamento de <strong>${amtStr}</strong> para <strong>${product}</strong>. Seu acesso continua ativo por enquanto — por favor, atualize seu método de pagamento.`,
      cta: "Atualizar Pagamento",
      urgency: "Você tem até 48 horas antes de qualquer interrupção.",
    },
    2: {
      headline: "⚠️ Acesso será suspenso em 48 horas",
      body: `Ainda não conseguimos cobrar <strong>${amtStr}</strong> referente ao <strong>${product}</strong>. Se não atualizarmos seu pagamento em <strong>48 horas</strong>, seu acesso será suspenso automaticamente.`,
      cta: "Salvar Meu Acesso Agora",
      urgency: "Esta é sua segunda notificação.",
    },
    3: {
      headline: "❌ Seu acesso foi suspenso",
      body: `Após múltiplas tentativas, não conseguimos processar o pagamento de <strong>${amtStr}</strong> para <strong>${product}</strong>. Seu acesso foi temporariamente suspenso. Reative agora para recuperar o acesso imediatamente.`,
      cta: "Reativar Assinatura",
      urgency: "Reativar leva menos de 1 minuto.",
    },
  };

  const m = messages[step];

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #f4f4f5; margin: 0; padding: 24px; }
  .card { background: white; border-radius: 12px; padding: 32px; max-width: 520px; margin: 0 auto; }
  .logo { font-size: 22px; font-weight: 700; color: #18181b; margin-bottom: 24px; }
  .logo span { color: #10b981; }
  h2 { color: #18181b; font-size: 18px; margin: 0 0 12px; }
  p { color: #52525b; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
  .cta { display: inline-block; background: #10b981; color: white; font-weight: 700;
         padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; }
  .urgency { font-size: 13px; color: #a1a1aa; margin-top: 20px; }
</style></head>
<body><div class="card">
  <div class="logo">Playbook<span>.</span></div>
  <h2>${m.headline}</h2>
  <p>${m.body}</p>
  <a href="${url}" class="cta">${m.cta}</a>
  <p class="urgency">${m.urgency}</p>
  <hr style="border:none;border-top:1px solid #f4f4f5;margin:24px 0">
  <p style="font-size:12px;color:#a1a1aa">
    Se você já atualizou seu pagamento, ignore este email. 
    Dúvidas? Responda a este email.
  </p>
</div></body></html>`;
}
