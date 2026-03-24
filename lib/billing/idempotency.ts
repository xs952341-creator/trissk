/**
 * lib/billing/idempotency.ts
 * Utilitário de idempotência para webhooks de pagamento.
 * 
 * Padrão "Optimistic Lock with Rollback":
 * 1. Insere o event.id antes de processar (bloqueia duplicatas concorrentes)
 * 2. Se o processamento falhar, DELETA o event.id (permite retentativa do Stripe)
 * 3. Se o processamento tiver sucesso, o event.id permanece (idempotência garantida)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

type ProcessFn = () => Promise<void>;

/**
 * Executa uma função de processamento de webhook com idempotência garantida.
 * 
 * @param eventId - ID único do evento (ex: Stripe event.id)
 * @param eventType - Tipo do evento para logging
 * @param processFn - Função async que realiza o processamento real
 * @returns { alreadyProcessed: true } se evento foi duplicado, ou chama processFn
 */
export async function withIdempotency(
  eventId: string,
  eventType: string,
  processFn: ProcessFn
): Promise<{ alreadyProcessed: boolean }> {
  const supabase = createAdminClient();

  // Tenta reservar o processamento deste evento
  const { error: insertErr } = await supabase.from("webhook_events").insert({
    id: eventId,
    event_type: eventType,
    processed_at: new Date().toISOString(),
  });

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      // UNIQUE violation — evento já foi (ou está sendo) processado
      console.log(`[idempotency] duplicate event skipped: ${eventId}`);
      return { alreadyProcessed: true };
    }
    // Outro erro de DB: loga mas continua (não bloqueia processamento por erro de log)
    console.warn(`[idempotency] insert warn for ${eventId}:`, insertErr.message);
  }

  try {
    await processFn();
    return { alreadyProcessed: false };
  } catch (err: unknown) {
    // Processamento falhou — remove o registro para permitir retentativa
    console.error(`[idempotency] processing failed for ${eventType} (${eventId}), rolling back:`, getErrorMessage(err));
    
    try {
      await supabase.from("webhook_events").delete().eq("id", eventId);
    } catch (rollbackErr: unknown) {
      console.error(`[idempotency] CRITICAL: rollback failed for ${eventId}:`, getErrorMessage(rollbackErr));
      // Mesmo com falha no rollback, relança o erro original
    }
    
    throw err; // Relança para o chamador devolver 500 ao Stripe
  }
}
