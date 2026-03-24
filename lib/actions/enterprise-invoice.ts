"use server";
/**
 * lib/actions/enterprise-invoice.ts
 * Server Action para emissão de Faturas Enterprise (Net 30).
 *
 * Correcções v33:
 *  - stripe_customer_id lido de subscriptions (não profiles — coluna inexistente)
 *  - Fallback: cria customer Stripe se não houver subscrição activa
 *  - Registo em enterprise_invoices após criação bem-sucedida
 */

import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import {
  createEnterpriseNet30Invoice,
  type EnterpriseInvoiceResult,
} from "@/lib/stripe/enterprise-invoice";

export interface CreateEnterpriseInvoiceActionParams {
  priceId:       string;
  quantity:      number;
  companyName:   string;
  taxId:         string;   // CNPJ (14 dígitos)
  daysUntilDue?: number;
}

export async function createEnterpriseInvoiceAction(
  params: CreateEnterpriseInvoiceActionParams
): Promise<EnterpriseInvoiceResult> {
  // ── 1. Autenticação ────────────────────────────────────────────────────────
  const supabaseUser = createClient();
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return { success: false, message: "Não autorizado. Faça login novamente." };
  }

  // ── 2. Validar parâmetros ──────────────────────────────────────────────────
  if (!params.priceId?.trim())
    return { success: false, message: "Plano inválido." };
  if (!params.companyName?.trim())
    return { success: false, message: "Razão social é obrigatória." };
  if (!params.taxId || params.taxId.replace(/\D/g, "").length !== 14)
    return { success: false, message: "CNPJ inválido (deve ter 14 dígitos)." };
  if ((params.quantity ?? 0) < 1 || (params.quantity ?? 0) > 10_000)
    return { success: false, message: "Quantidade de licenças inválida (1–10.000)." };

  const supabaseAdmin = createAdminClient();

  // ── 3. Obter stripe_customer_id da assinatura mais recente ─────────────────
  // O customer_id vive em `subscriptions.stripe_customer_id`, não em profiles.
  let customerId: string | null = null;

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  customerId = sub?.stripe_customer_id ?? null;

  // ── 4. Se não há assinatura, criar customer Stripe ─────────────────────────
  if (!customerId) {
    try {
      const Stripe      = (await import("stripe")).default;
      const { STRIPE_SECRET_KEY } = await import("@/lib/env-server");
      const stripe      = new Stripe(STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
      const customer    = await stripe.customers.create({
        email:    user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    } catch (e: unknown) {
      return { success: false, message: "Erro ao criar cliente Stripe.", error: getErrorMessage(e) };
    }
  }

  // ── 5. Chamar motor de faturas ─────────────────────────────────────────────
  const result = await createEnterpriseNet30Invoice({
    customerId,
    priceId:      params.priceId,
    quantity:     params.quantity,
    companyName:  params.companyName.trim(),
    taxId:        params.taxId,
    daysUntilDue: params.daysUntilDue ?? 30,
    metadata: {
      supabase_user_id: user.id,
      created_via:      "b2b_invoice_form",
    },
  });

  if (!result.success) return result;

  // ── 6. Registar para auditoria (best-effort) ────────────────────────────────
  await supabaseAdmin
    .from("enterprise_invoices")
    .insert({
      user_id:            user.id,
      stripe_customer_id: customerId,
      subscription_id:    result.subscriptionId ?? null,
      invoice_id:         result.invoiceId       ?? null,
      invoice_url:        result.invoiceUrl      ?? null,
      company_name:       params.companyName.trim(),
      cnpj:               params.taxId.replace(/\D/g, ""),
      quantity:           params.quantity,
      days_until_due:     params.daysUntilDue ?? 30,
      status:             "pending_payment",
      created_at:         new Date().toISOString(),
    })
    .then(undefined, () => {}); // tabela pode ainda não existir — non-fatal

  return result;
}
