import type { JsonObject } from "@/lib/types/json";
// lib/inngest.ts
// Cliente Inngest com fallback para fila DB nativa (job_queue).
//
// ▸ Com INNGEST_EVENT_KEY configurado → envia eventos para Inngest Cloud
//   (retry exponencial, DLQ, observabilidade visual no dashboard Inngest)
// ▸ Sem INNGEST_EVENT_KEY → enfileira na tabela `job_queue` do Supabase
//   (processado por /api/cron/process-jobs a cada 30 min)
//
// Nunca importar diretamente em "use client".

import { createAdminClient } from "@/lib/supabase/admin";
import { redisEnqueue } from "@/lib/queue/upstash";
import { getErrorMessage } from "@/lib/errors";

export type InngestEventName =
  | "webhook/delivery"
  | "email/send"
  | "checkout/abandoned"
  | "subscription/canceled"
  // Novos eventos críticos v17
  | "payment/confirmed"        // pagamento confirmado → ledger + NF-e
  | "refund/issued"            // reembolso emitido → ledger reversal
  | "affiliate/commission"     // comissão calculada → notificar afiliado
  | "fiscal/emit"              // emitir NF-e via eNotas
  | "reconcile/run"            // disparar ciclo de reconciliação
  | "vendor/new-sale"          // nova venda para vendor (notificação)
  | "dispute/opened";          // chargeback aberto

// ── Detectar se Inngest real está configurado ─────────────────────────────────
const INNGEST_EVENT_KEY   = process.env.INNGEST_EVENT_KEY;
const INNGEST_SIGNING_KEY = process.env.INNGEST_SIGNING_KEY;
const isInngestConfigured = !!(INNGEST_EVENT_KEY && INNGEST_SIGNING_KEY);

// ── Envio via Inngest Cloud ───────────────────────────────────────────────────
async function sendToInngest(
  name: InngestEventName,
  data: JsonObject
): Promise<void> {
  // Usa a API REST do Inngest (sem SDK) para não adicionar dependência
  // O SDK oficial pode ser adicionado via: npm install inngest
  // e substituindo este fetch por: new Inngest({ id: "playbook-hub" }).send(...)
  const res = await fetch("https://inn.gs/e", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${INNGEST_EVENT_KEY}`,
    },
    body: JSON.stringify([{ name, data, ts: Date.now() }]),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Inngest HTTP ${res.status}: ${text}`);
  }
}

// ── Fallback: fila DB nativa ──────────────────────────────────────────────────
async function sendToDBQueue(
  name: InngestEventName,
  data: JsonObject
): Promise<void> {
  // Prefer Redis (Upstash REST) quando disponível. Mantém o projeto removível:
  // se remover as envs, volta a usar somente Supabase.
  const pushed = await redisEnqueue({
    event_name: name,
    payload: data,
    status: "pending",
    run_after: new Date().toISOString(),
    queued_at: new Date().toISOString(),
  });
  if (pushed) return;

  const admin = createAdminClient();
  const { error } = await admin.from("job_queue").insert({
    event_name: name,
    payload:    data,
    status:     "pending",
    run_after:  new Date().toISOString(),
  });
  if (error) throw error;
}

// ── API pública ───────────────────────────────────────────────────────────────
export const inngest = {
  /**
   * Envia um evento.
   * Roteamento automático: Inngest Cloud → DB queue (fallback).
   */
  async send({ name, data }: { name: InngestEventName; data: JsonObject }): Promise<void> {
    if (isInngestConfigured) {
      try {
        await sendToInngest(name, data);
        console.log(`[inngest] Evento enviado ao Inngest Cloud: ${name}`);
        return;
      } catch (e: unknown) {
        // Se o Inngest Cloud falhar, faz fallback para DB queue
        console.error(`[inngest] Falha ao enviar para Inngest Cloud (${name}): ${getErrorMessage(e)}. Fallback: DB queue.`);
      }
    }

    // DB queue (modo stub ou fallback)
    try {
      await sendToDBQueue(name, data);
      if (!isInngestConfigured) {
        console.log(`[inngest-stub] Evento enfileirado no DB: ${name}`);
      } else {
        console.log(`[inngest-fallback] Evento salvo na DB queue após falha do Inngest: ${name}`);
      }
    } catch (e: unknown) {
      console.error(`[inngest] Erro crítico ao enfileirar ${name}:`, getErrorMessage(e));
      // Não re-lança — logs são suficientes para diagnóstico
    }
  },

  /** Verifica se Inngest Cloud está ativo */
  get isCloud(): boolean {
    return isInngestConfigured;
  },
};
