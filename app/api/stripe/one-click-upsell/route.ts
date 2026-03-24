// app/api/stripe/one-click-upsell/route.ts
// Processa um upsell sem re-inserir dados de pagamento.
// Usa o PaymentMethod salvo (via setup_future_usage: "off_session" do checkout Elements).

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";
import { buildStripeSaleMetadata } from "@/lib/checkout/metadata";
import { parseRequestBody } from "@/lib/api/parse";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// ── Local types ────────────────────────────────────────────────────────────────
type UpsellTier = {
  id: string;
  tier_name: string;
  price_monthly: number | null;
  price_lifetime: number | null;
  saas_products: { id: string; vendor_id: string; name: string }[] | null;
};

// ── Schema ─────────────────────────────────────────────────────────────────────
const UpsellSchema = z.object({
  productTierId: z.string().uuid("productTierId deve ser UUID."),
  priceId: z.string().optional(),
});

type UpsellPayload = z.infer<typeof UpsellSchema>;

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`one-click-upsell:${getIP(req)}`, 5, 60_000);
  if (!rl.success) return failure("RATE_LIMITED", 429, "Muitas tentativas.");

  const clientSupa = createClient();
  const { data: { user: authUser } } = await clientSupa.auth.getUser();
  if (!authUser) return failure("UNAUTHORIZED", 401, "Não autenticado.");

  const parsed = await parseRequestBody<UpsellPayload>(req, UpsellSchema);
  if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

  const { productTierId, priceId } = parsed.data;
  const userId = authUser.id;

  try {
    // 1. Verificar acesso duplicado
    const { data: rawTier } = await supabase.from("product_tiers")
      .select("*, saas_products(id, vendor_id, name)")
      .eq("id", productTierId).single();
    if (!rawTier) return failure("TIER_NOT_FOUND", 404, "Plano não encontrado.");

    const tier = rawTier as UpsellTier;
    const productId = tier.saas_products?.[0]?.id;
    const { data: existing } = await supabase.from("entitlements")
      .select("id").eq("user_id", userId).eq("product_id", productId).eq("status", "active").maybeSingle();
    if (existing) return failure("ALREADY_HAS_ACCESS", 409, "Você já tem acesso a este produto.");

    // 2. Buscar stripe_customer_id
    const { data: sub } = await supabase.from("subscriptions")
      .select("stripe_customer_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!sub?.stripe_customer_id) {
      return failure("NO_PAYMENT_METHOD", 400, "Nenhum método de pagamento salvo. Complete a compra normalmente.");
    }

    // 3. Buscar default payment method do customer
    const customer = await stripe.customers.retrieve(sub.stripe_customer_id, {
      expand: ["invoice_settings.default_payment_method"],
    }) as Stripe.Customer;

    const paymentMethodId = typeof customer.invoice_settings?.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : (customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod)?.id;

    if (!paymentMethodId) {
      const pms = await stripe.paymentMethods.list({ customer: sub.stripe_customer_id, type: "card", limit: 1 });
      const pmFallback = pms.data[0]?.id;
      if (!pmFallback) {
        return failure("NO_PAYMENT_METHOD", 400, "Nenhum cartão salvo encontrado. Use o checkout normal.");
      }
    }

    const finalPaymentMethodId = paymentMethodId || (await stripe.paymentMethods.list({ customer: sub.stripe_customer_id, type: "card", limit: 1 })).data[0]?.id;
    if (!finalPaymentMethodId) {
      return failure("NO_PAYMENT_METHOD", 400, "Nenhum cartão salvo encontrado.");
    }

    const amountBRL = tier.price_monthly ?? tier.price_lifetime ?? 0;
    if (amountBRL <= 0) return failure("INVALID_PRICE", 400, "Preço inválido.");

    const metadata = buildStripeSaleMetadata({
      userId,
      vendorId: tier.saas_products?.[0]?.vendor_id ?? "",
      productId: productId ?? "",
      tierId: productTierId,
      playbookId: "",
      affiliateCode: "",
      type: tier.price_lifetime ? "lifetime" : "subscription",
      extras: { source: "one_click_upsell" },
    });

    // 4. Tipo de compra: subscription ou one-time
    if (tier.price_monthly && priceId) {
      const subscription = await stripe.subscriptions.create({
        customer: sub.stripe_customer_id,
        items: [{ price: priceId }],
        default_payment_method: finalPaymentMethodId,
        payment_settings: { save_default_payment_method: "on_subscription" },
        metadata,
        expand: ["latest_invoice.payment_intent"],
      });

      if (subscription.status === "active") {
        return success({ ok: true, subscriptionId: subscription.id });
      }

      const pi = (subscription.latest_invoice as Stripe.Invoice)?.payment_intent as Stripe.PaymentIntent;
      if (pi?.status === "requires_action") {
        return success({ requiresAction: true, clientSecret: pi.client_secret });
      }

      return success({ ok: true, subscriptionId: subscription.id });
    }

    // One-time / lifetime
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amountBRL * 100),
      currency: "brl",
      customer: sub.stripe_customer_id,
      payment_method: finalPaymentMethodId,
      confirm: true,
      off_session: true,
      metadata,
    });

    if (pi.status === "succeeded") {
      return success({ ok: true, paymentIntentId: pi.id });
    }

    if (pi.status === "requires_action") {
      return success({ requiresAction: true, clientSecret: pi.client_secret });
    }

    return success({ ok: true });

  } catch (err: unknown) {
    console.error("[one-click-upsell]", getErrorMessage(err));
    if ((err as { code?: string }).code === "authentication_required") {
      return failure("AUTHENTICATION_REQUIRED", 402, "Autenticação adicional necessária.");
    }
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro ao processar upsell."));
  }
}
