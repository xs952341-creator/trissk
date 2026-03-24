/**
 * lib/stripe/enterprise-invoice.ts
 * Geração de Faturas Enterprise (Net 30/60) via Stripe Invoicing.
 *
 * Usado para contratos B2B de alto valor onde o cliente paga via
 * transferência bancária, boleto ou PIX corporativo — sem cartão.
 *
 * Segurança:
 *  - Valida CNPJ/NIF antes de criar qualquer objeto no Stripe.
 *  - Se Stripe falhar, NENHUM dado é persistido no banco.
 *  - Provisiona acesso ANTES do pagamento (confiança B2B) com flag enterprise.
 */

import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface EnterpriseInvoiceParams {
  customerId:    string;  // Stripe customer ID
  priceId:       string;  // Stripe price ID do plano
  quantity:      number;  // número de assentos
  companyName:   string;
  taxId:         string;  // CNPJ (formato: 00.000.000/0000-00 ou 00000000000000)
  daysUntilDue?: number;  // default 30
  metadata?:     Record<string, string>;
}

export interface EnterpriseInvoiceResult {
  success:        boolean;
  subscriptionId?: string;
  invoiceId?:      string | null;
  invoiceUrl?:     string | null;
  message:        string;
  error?:         string;
}

// ── Validação básica de CNPJ (estrutura, não dígito verificador) ──────────────
function normalizeCNPJ(cnpj: string): string | null {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  return digits;
}

// ── Criar Fatura Enterprise ────────────────────────────────────────────────────
export async function createEnterpriseNet30Invoice(
  params: EnterpriseInvoiceParams
): Promise<EnterpriseInvoiceResult> {
  const {
    customerId, priceId, quantity,
    companyName, taxId,
    daysUntilDue = 30,
    metadata     = {},
  } = params;

  // 1. Validar CNPJ
  const normalizedCNPJ = normalizeCNPJ(taxId);
  if (!normalizedCNPJ) {
    return { success: false, message: "CNPJ inválido.", error: "CNPJ deve ter 14 dígitos." };
  }

  // 2. Validar parâmetros obrigatórios
  if (!customerId || !priceId || quantity < 1 || !companyName.trim()) {
    return { success: false, message: "Parâmetros obrigatórios ausentes." };
  }

  try {
    // 3. Atualizar cliente Stripe com dados fiscais da empresa
    await stripe.customers.update(customerId, {
      name:        companyName.trim(),
      description: `Empresa B2B — CNPJ: ${normalizedCNPJ}`,
    });

    // 4. Adicionar Tax ID (CNPJ)
    // Verificar se já tem tax_id para não duplicar
    const existingTaxIds = await stripe.customers.listTaxIds(customerId, { limit: 5 });
    const alreadyHasCNPJ = existingTaxIds.data.some(
      t => t.type === "br_cnpj" && t.value === normalizedCNPJ
    );
    if (!alreadyHasCNPJ) {
      await stripe.customers.createTaxId(customerId, {
        type:  "br_cnpj",
        value: normalizedCNPJ,
      }).then(undefined, () => {}); // Non-fatal — alguns países/contas Stripe não suportam
    }

    // 5. Criar assinatura com cobrança via fatura (send_invoice)
    const subscription = await stripe.subscriptions.create({
      customer:           customerId,
      items:              [{ price: priceId, quantity }],
      collection_method:  "send_invoice",
      days_until_due:     daysUntilDue,
      payment_settings: {
        payment_method_types: ["boleto", "pix"] as ("boleto" | "card" | "us_bank_account")[],
        save_default_payment_method: "off",
      },
      metadata: {
        is_enterprise_net30: "true",
        company_name:        companyName.trim(),
        cnpj:                normalizedCNPJ,
        seats:               String(quantity),
        ...metadata,
      },
    });

    // 6. Finalizar a fatura pendente para que o cliente a receba por email
    const latestInvoiceId = subscription.latest_invoice as string | null;
    let invoiceUrl: string | null = null;

    if (latestInvoiceId) {
      try {
        const invoice = await stripe.invoices.finalizeInvoice(latestInvoiceId);
        invoiceUrl    = invoice.hosted_invoice_url ?? null;
      } catch {
        // Non-fatal — fatura pode já estar finalizada
      }
    }

    return {
      success:        true,
      subscriptionId: subscription.id,
      invoiceId:      latestInvoiceId,
      invoiceUrl,
      message:        `Fatura enterprise gerada! Acesso provisionado. Pagamento em ${daysUntilDue} dias.`,
    };

  } catch (err: unknown) {
    console.error("[EnterpriseInvoice] Falha:", getErrorMessage(err));
    const errCode = (err as { code?: string } | null)?.code;
    // Mensagens user-friendly para erros comuns do Stripe
    if (errCode === "resource_missing")  return { success: false, message: "Cliente não encontrado no Stripe.", error: getErrorMessage(err) };
    if (errCode === "invalid_request_error") return { success: false, message: "Plano inválido ou indisponível.", error: getErrorMessage(err) };

    return {
      success: false,
      message: "Não foi possível gerar a Fatura Empresarial. Verifique o CNPJ e tente novamente.",
      error:   getErrorMessage(err),
    };
  }
}
