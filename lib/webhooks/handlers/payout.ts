// lib/webhooks/handlers/payout.ts
// Handler para eventos de Payout do Stripe Connect.
// Eventos: payout.paid, payout.failed, payout.canceled

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { sendEmailQueued } from "@/lib/email";
import { getErrorMessage } from "@/lib/errors";
import { sendPushToUser } from "@/lib/webhooks/services/webhook-utils";

export { handlePayoutEvent };

void sendEmailQueued; // available for future use

const APP_URL = NEXT_PUBLIC_APP_URL || "";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

async function handlePayoutEvent(payout: Stripe.Payout, connectAccountId: string | null) {
  const supabase = createAdminClient();

  if (!connectAccountId) {
    // Payout da conta plataforma (não de vendor) — apenas log
    console.log("[payout] platform payout:", payout.id, payout.status);
    return;
  }

  // 1. Encontrar vendor pelo stripe_connect_account_id
  const { data: vendorProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_connect_account_id", connectAccountId)
    .maybeSingle();

  if (!vendorProfile) {
    console.warn("[payout] vendor not found for connectAccount:", connectAccountId);
    return;
  }

  const vendorId = vendorProfile.id;
  const amount   = payout.amount / 100;
  const currency = payout.currency.toUpperCase();

  // 2. Atualizar/inserir no vendor_payouts_history
  const { data: existing } = await supabase
    .from("vendor_payouts_history")
    .select("id")
    .eq("stripe_payout_id", payout.id)
    .maybeSingle();

  type PayoutWithMsg = Stripe.Payout & { failure_message?: string };
  const failMsg = (payout as PayoutWithMsg).failure_message ?? null;

  if (existing) {
    await supabase
      .from("vendor_payouts_history")
      .update({
        status:         payout.status,
        paid_at:        payout.status === "paid" ? new Date(payout.arrival_date * 1000).toISOString() : null,
        failure_reason: failMsg,
      })
      .eq("stripe_payout_id", payout.id);
  } else {
    await supabase.from("vendor_payouts_history").insert({
      vendor_id:        vendorId,
      amount,
      currency,
      stripe_payout_id: payout.id,
      status:           payout.status,
      paid_at:          payout.status === "paid" ? new Date(payout.arrival_date * 1000).toISOString() : null,
      failure_reason:   failMsg,
      metadata: {
        description:         payout.description,
        method:              payout.method,
        type:                payout.type,
        balance_transaction: payout.balance_transaction,
      },
    });
  }

  // 3. Se payout.paid: marcar ledger entries como released (hold liberado)
  if (payout.status === "paid") {
    try {
      const balanceTxns = await stripe.balanceTransactions.list(
        { payout: payout.id, limit: 100 },
        { stripeAccount: connectAccountId }
      );

      const transferIds = balanceTxns.data
        .filter((t) => t.type === "transfer")
        .map((t) => t.source)
        .filter(Boolean) as string[];

      if (transferIds.length > 0) {
        await supabase
          .from("financial_ledger")
          .update({
            released_at: new Date().toISOString(),
            hold_until:  null,
          })
          .in("stripe_transfer_id", transferIds)
          .eq("vendor_id", vendorId)
          .is("released_at", null);

        console.log(`[payout] released ${transferIds.length} ledger holds for vendor ${vendorId}`);
      }
    } catch (e: unknown) {
      console.warn("[payout] balance transactions fetch failed:", getErrorMessage(e));
    }

    // 4. Recalcular saldo do vendor
    try {
      await supabase.rpc("recalculate_vendor_balance", { p_vendor_id: vendorId });
    } catch (e: unknown) {
      console.error("[payout] recalculate_vendor_balance failed:", getErrorMessage(e));
    }

    // 5. Notificar vendor
    try {
      await sendPushToUser(vendorId, {
        title: "💸 Repasse recebido!",
        body:  `${currency} ${amount.toFixed(2)} depositado em sua conta bancária.`,
        url:   `${APP_URL}/vendor/payouts`,
      });
    } catch { /* não crítico */ }
  }

  if (payout.status === "failed") {
    try {
      await sendPushToUser(vendorId, {
        title: "⚠️ Falha no repasse",
        body:  `Repasse de ${currency} ${amount.toFixed(2)} falhou: ${failMsg ?? "erro desconhecido"}.`,
        url:   `${APP_URL}/vendor/payouts`,
      });
    } catch { /* não crítico */ }
  }
}
