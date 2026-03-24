import { PAYMENTS_PROVIDER, PAGARME_API_KEY, EFI_CLIENT_ID, EFI_CLIENT_SECRET } from "@/lib/payments/env";
import type { InstallmentsRequest, CreateInstallmentPaymentResult } from "@/lib/payments/types";

/**
 * Parcelamento no Brasil não existe nativamente na Stripe.
 * Implementamos um provider switch com fallback seguro: sem keys, nada quebra.
 */
export async function createInstallmentPayment(
  payload: InstallmentsRequest & { installments: number }
): Promise<CreateInstallmentPaymentResult> {
  if (payload.installments <= 1) {
    return { kind: "error", message: "Use o checkout normal para pagamento à vista." };
  }

  if (PAYMENTS_PROVIDER === "pagarme") {
    if (!PAGARME_API_KEY) {
      return { kind: "error", message: "Parcelamento Pagar.me não habilitado (PAGARME_API_KEY ausente)." };
    }
    // Placeholder funcional (não quebra): retorna uma rota interna explicando que precisa ativar tokenização/checkout do provider.
    return { kind: "redirect", url: "/checkout/parcelado/indisponivel" };
  }

  if (PAYMENTS_PROVIDER === "efi") {
    if (!EFI_CLIENT_ID || !EFI_CLIENT_SECRET) {
      return { kind: "error", message: "Parcelamento Efi não habilitado (EFI_CLIENT_ID/SECRET ausentes)." };
    }
    return { kind: "redirect", url: "/checkout/parcelado/indisponivel" };
  }

  return { kind: "error", message: "Parcelamento não habilitado." };
}
