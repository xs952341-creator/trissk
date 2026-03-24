import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "@/lib/env-server";
import { handlePayoutEvent }          from "@/lib/webhooks/handlers/payout";
import { handleDispute }              from "@/lib/webhooks/handlers/dispute";
import { handleSubChange }            from "@/lib/webhooks/handlers/subscription";
import { handleInvoicePaymentFailed } from "@/lib/webhooks/handlers/invoice-payment-failed";
import { handleAbandonedCheckout }    from "@/lib/webhooks/handlers/abandoned-checkout";
import { handleAccountUpdated }       from "@/lib/webhooks/handlers/account-updated";
import { handlePaymentIntentSucceeded } from "@/lib/webhooks/handlers/payment-intent-succeeded";
import { handleInvoicePaid }          from "@/lib/webhooks/handlers/invoice-paid";
import { isDuplicateKey }             from "@/lib/webhooks/types";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature")!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ✅ IDEMPOTÊNCIA GLOBAL: cada event.id processado exatamente uma vez
  // Se falhar no insert (conflict), o evento já foi processado — retorna 200
  const { error: idempErr } = await supabase.from("webhook_events").insert({
    id:          event.id,
    event_type:  event.type,
    processed_at: new Date().toISOString(),
    payload:     JSON.parse(JSON.stringify(event)),
  });
  if (idempErr) {
    // UNIQUE constraint violation = já processado
    if (isDuplicateKey(idempErr)) {
      console.log(`[wh] duplicate event skipped: ${event.id}`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Outro erro: log mas continua (não bloqueia processamento)
    console.warn(`[wh] webhook_events insert warn: ${idempErr.message}`);
  }

  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubChange(event.data.object as Stripe.Subscription);
        break;
      case "charge.dispute.created":
        await handleDispute(event.data.object as Stripe.Dispute);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "checkout.session.expired":
        await handleAbandonedCheckout(event.data.object as Stripe.Checkout.Session);
        break;
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled":
        await handlePayoutEvent(event.data.object as Stripe.Payout, event.account ?? null);
        break;
    }
  } catch (err: unknown) {
    const errMsg = getErrorMessage(err, "Webhook handler error");
    console.error(`[wh] ${event.type}:`, errMsg);
    // 🔄 ROLLBACK DE IDEMPOTÊNCIA: remove o event.id para permitir retentativa do Stripe
    // Sem isso: se o processamento falhar, o Stripe reenvia, mas o sistema ignora por achar
    // que já foi processado — e o cliente paga sem receber o produto.
    try {
      await supabase.from("webhook_events").delete().eq("id", event.id);
    } catch (rollbackErr: unknown) {
      const rbMsg = getErrorMessage(rollbackErr, "unknown");
      console.error(`[wh] idempotency rollback failed for ${event.id}:`, rbMsg);
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
