// app/api/payments/installments/route.ts
// Creates an installments checkout (Pagar.me payment link) without breaking the Stripe flow.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { pagarmeCreatePaymentLink } from "@/lib/payments/pagarme";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";
import { parseRequestBody } from "@/lib/api/parse";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Local types ────────────────────────────────────────────────────────────────
type InstallmentsTier = {
  id: string;
  tier_name: string;
  price_lifetime: number | null;
  saas_products: { id: string; name: string }[] | null;
};

// ── Schema ─────────────────────────────────────────────────────────────────────
const InstallmentsSchema = z.object({
  productTierId: z.string().uuid("productTierId deve ser um UUID válido."),
  billing:       z.enum(["monthly", "annual", "lifetime"]).optional(),
});

type InstallmentsPayload = z.infer<typeof InstallmentsSchema>;

const supabaseAdmin = createAdminClient();

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`installments:${getIP(req)}`, 10, 60_000);
  if (!rl.success) {
    return failure("RATE_LIMITED", 429, "Muitas tentativas. Aguarde um momento.");
  }

  const supa = createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return failure("UNAUTHORIZED", 401, "Não autenticado.");

  const parsed = await parseRequestBody<InstallmentsPayload>(req, InstallmentsSchema);
  if (!parsed.success) {
    return failure("INVALID_PAYLOAD", 400, parsed.message);
  }

  const { productTierId, billing } = parsed.data;
  const billingCycle = billing ?? "lifetime";

  if (billingCycle !== "lifetime") {
    return failure(
      "INVALID_BILLING",
      400,
      "Parcelamento está disponível apenas para pagamento único (vitalício)."
    );
  }

  try {
    const { data: rawTier } = await supabaseAdmin
      .from("product_tiers")
      .select("id, tier_name, price_lifetime, saas_products(id, name)")
      .eq("id", productTierId)
      .single();

    if (!rawTier) return failure("TIER_NOT_FOUND", 404, "Plano não encontrado.");

    const tier = rawTier as InstallmentsTier;
    const brl = Number(tier.price_lifetime ?? 0);

    if (!Number.isFinite(brl) || brl <= 0) {
      return failure("NO_LIFETIME_PRICE", 400, "Plano sem preço vitalício.");
    }

    const amountCents = Math.max(50, Math.round(brl * 100));
    const appUrl      = NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const productName = tier.saas_products?.[0]?.name ?? "Produto";
    const name        = `${productName} — ${tier.tier_name}`;

    const link = await pagarmeCreatePaymentLink({
      name,
      amountCents,
      successUrl:      `${appUrl}/checkout/success?provider=pagarme&tier=${tier.id}`,
      cancelUrl:       `${appUrl}/checkout/cancel?provider=pagarme&tier=${tier.id}`,
      maxInstallments: 12,
      postbackUrl:     `${appUrl}/api/webhooks/pagarme`,
      metadata: {
        provider:  "pagarme",
        userId:    user.id,
        tierId:    tier.id,
        productId: tier.saas_products?.[0]?.id ?? "",
      },
    });

    if (!link) {
      return failure(
        "PROVIDER_UNAVAILABLE",
        503,
        "Parcelamento indisponível (Pagar.me não configurado)."
      );
    }

    // Best-effort persistence
    try {
      await supabaseAdmin.from("alt_payments").insert({
        provider:     "pagarme",
        provider_ref: link.id,
        user_id:      user.id,
        tier_id:      tier.id,
        amount_cents: amountCents,
        currency:     "BRL",
        status:       "pending",
      });
    } catch {
      // optional table
    }

    return success({ url: link.url, providerRef: link.id });
  } catch (e: unknown) {
    console.error("[installments]", e);
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
