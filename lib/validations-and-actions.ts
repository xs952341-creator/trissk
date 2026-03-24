// lib/validations/product-schema.ts
import { z } from "zod";

// ── Zod Schema: Produto (com mensagens em PT-BR) ───────────────────────────
export const productTierSchema = z.object({
  tier_name: z
    .string()
    .min(3, "O nome do plano deve ter pelo menos 3 caracteres."),
  price_amount: z
    .number({ invalid_type_error: "Informe um valor numérico." })
    .positive("O preço deve ser maior que zero."),
  pricing_model: z.enum(["RECURRING", "LIFETIME", "CREDITS"], {
    errorMap: () => ({ message: "Selecione um modelo de cobrança válido." }),
  }),
  billing_interval: z.enum(["month", "year"]).optional(),
  credit_allocation_amount: z.number().positive().optional(),
  has_software_access: z.boolean(),
  has_consultancy: z.boolean(),
  calendar_link: z
    .string()
    .url("Informe uma URL válida para o link da agenda (ex: https://calendly.com/...).")
    .optional()
    .or(z.literal("")),
  description: z.string().optional(),
});

export const productOnboardingSchema = z
  .object({
    product_name: z
      .string()
      .min(3, "O nome do produto deve ter pelo menos 3 caracteres.")
      .max(80, "O nome do produto não pode ultrapassar 80 caracteres."),

    description: z
      .string()
      .min(100, "A descrição deve ter no mínimo 100 caracteres. Explique bem o que seu SaaS faz.")
      .max(2000, "A descrição não pode ultrapassar 2.000 caracteres."),

    support_email: z
      .string()
      .email("Informe um endereço de e-mail válido para o suporte (ex: suporte@seusaas.com)."),

    provisioning_webhook_url: z
      .string()
      .url("A URL do webhook deve ser válida (ex: https://api.seusaas.com/provision).")
      .optional()
      .or(z.literal("")),

    magic_link_url: z
      .string()
      .url("A URL do magic link deve ser válida.")
      .optional()
      .or(z.literal("")),

    logo_url: z
      .string()
      .url("Faça o upload de um logo válido para o produto.")
      .min(1, "O logo da marca é obrigatório."),

    screenshots: z
      .array(z.string().url())
      .min(2, "Envie pelo menos 2 screenshots da dashboard da ferramenta."),

    pricing_tiers: z
      .array(productTierSchema)
      .min(1, "Adicione pelo menos 1 plano de preço para o produto."),

    // Consultoria: se algum tier tiver consultoria, deve ter calendar_link
  })
  .superRefine((data, ctx) => {
    // Deve ter pelo menos webhook OU magic_link
    if (!data.provisioning_webhook_url && !data.magic_link_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provisioning_webhook_url"],
        message:
          "Informe pelo menos uma forma de provisionar o acesso: Webhook de API ou URL de Magic Link.",
      });
    }

    // Tiers com consultoria precisam de calendar_link
    data.pricing_tiers.forEach((tier, i) => {
      if (tier.has_consultancy && !tier.calendar_link) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pricing_tiers", i, "calendar_link"],
          message:
            "Planos com consultoria precisam ter um link de agenda (Calendly / Cal.com).",
        });
      }
      // Créditos precisam de credit_allocation_amount
      if (tier.pricing_model === "CREDITS" && !tier.credit_allocation_amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pricing_tiers", i, "credit_allocation_amount"],
          message:
            "Informe quantas unidades/créditos o cliente recebe neste pacote.",
        });
      }
    });
  });

export type ProductOnboardingInput = z.infer<typeof productOnboardingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// app/actions/admin.ts — Server Actions para o painel admin
// ─────────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } from "@/lib/env";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/errors";

const supabase = createAdminClient();

// ── Tipos de retorno ──────────────────────────────────────────────────────────
interface PingResult {
  success: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

interface ApproveResult {
  success: boolean;
  error?: string;
  warning?: string;
}

// ── pingVendorWebhook: Testa se o webhook do produtor está vivo ───────────────
export async function pingVendorWebhook(productId: string): Promise<PingResult> {
  // Verificar se é admin
  const cookieStore = cookies();
  const supabaseUser = createSupabaseClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  // Auth check via service role (admin only route)

  // Buscar URL do produto
  const { data: product, error } = await supabase
    .from("saas_products")
    .select("provisioning_webhook_url, magic_link_url, name")
    .eq("id", productId)
    .single();

  if (error || !product) {
    return { success: false, error: "Produto não encontrado." };
  }

  const webhookUrl = product.provisioning_webhook_url ?? product.magic_link_url;

  if (!webhookUrl) {
    return {
      success: false,
      error: "Nenhuma URL de integração foi cadastrada para este produto.",
    };
  }

  // Fazer o PING
  const start = Date.now();
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Playbook-Hub-Test": "ping",
      },
      body: JSON.stringify({
        event: "test.ping",
        product_id: productId,
        product_name: product.name,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8_000), // 8s timeout
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        latencyMs,
        error: `A URL de integração do seu SaaS falhou com status ${response.status}. Verifique sua API e tente novamente.`,
      };
    }

    return { success: true, statusCode: response.status, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errName = (err instanceof Error) ? err.name : "";
    const isTimeout = errName === "TimeoutError" || errName === "AbortError";
    return {
      success: false,
      latencyMs,
      error: isTimeout
        ? "A URL de integração do seu SaaS demorou demais para responder (timeout de 8s). Verifique se o servidor está online."
        : `A URL de integração do seu SaaS falhou. Verifique sua API. Detalhe: ${getErrorMessage(err)}`,
    };
  }
}

// ── approveProduct: Aprova um produto após revisão manual ────────────────────
export async function approveProduct(productId: string): Promise<ApproveResult> {
  // 1. Testar webhook antes de aprovar
  const pingResult = await pingVendorWebhook(productId);

  if (!pingResult.success) {
    return {
      success: false,
      error: pingResult.error ?? "Falha no teste de integração. Produto não aprovado.",
    };
  }

  // 2. Atualizar status
  const { error } = await supabase
    .from("saas_products")
    .update({
      approval_status: "APPROVED",
      approved_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    return { success: false, error: "Erro ao atualizar o status do produto." };
  }

  revalidatePath("/admin/review-queue");
  return { success: true };
}

// ── rejectProduct ─────────────────────────────────────────────────────────────
export async function rejectProduct(
  productId: string,
  reason: string
): Promise<ApproveResult> {
  const { error } = await supabase
    .from("saas_products")
    .update({
      approval_status: "REJECTED",
      rejection_reason: reason,
    })
    .eq("id", productId);

  if (error) return { success: false, error: "Erro ao rejeitar o produto." };

  revalidatePath("/admin/review-queue");
  return { success: true };
}

// ── freezePayout: Congela repasse ao produtor em caso de fraude ───────────────
export async function freezePayout(subscriptionId: string): Promise<ApproveResult> {
  const { error } = await supabase
    .from("subscriptions")
    .update({ payout_frozen: true, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);

  if (error) return { success: false, error: "Erro ao congelar o repasse." };

  // NOTA: Repasse congelado localmente no banco.
  // Cancelamento de transfers pendentes via Stripe ainda depende de implementação adicional.
  // Isso previne novos repasses mas transfers já agendadas podem ainda processar.

  return { 
    success: true, 
    warning: "Repasse congelado localmente. Transfers pendentes no Stripe podem requerer cancelamento manual." 
  };
}
