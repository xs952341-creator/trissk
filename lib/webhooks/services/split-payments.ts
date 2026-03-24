// lib/webhooks/services/split-payments.ts
// Calcula e distribui comissões entre plataforma, vendor e afiliados (playbooks).

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getEffectivePlatformFeePct } from "@/lib/payments/platform-fee";
import { DEFAULT_PLATFORM_FEE_PCT } from "@/lib/config";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { getChargeId } from "@/lib/webhooks/services/webhook-utils";
import type { AffiliateLinkWithProfile } from "@/lib/types/database";

const supabase = createAdminClient();
const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export { splitPayments };

async function hasProcessedPayout(key: string): Promise<boolean> {
  const { data } = await supabase
    .from("payout_events")
    .select("id")
    .eq("event_key", key)
    .maybeSingle();
  return !!data;
}

async function recordPayout(event: {
  event_key: string;
  stripe_invoice_id?: string | null;
  payment_intent_id: string;
  vendor_id?: string | null;
  product_tier_id?: string | null;
  playbook_id?: string | null;
  destination_account_id?: string | null;
  amount_cents: number;
  status: "processed" | "failed" | "skipped";
  reason?: string | null;
}): Promise<void> {
  await supabase.from("payout_events").upsert({
    event_key: event.event_key,
    stripe_invoice_id: event.stripe_invoice_id ?? null,
    payment_intent_id: event.payment_intent_id,
    vendor_id: event.vendor_id ?? null,
    product_tier_id: event.product_tier_id ?? null,
    playbook_id: event.playbook_id ?? null,
    destination_account_id: event.destination_account_id ?? null,
    amount_cents: event.amount_cents,
    status: event.status,
    reason: event.reason ?? null,
    processed_at: new Date().toISOString(),
  }, { onConflict: "event_key" }).then(undefined, () => {});
}

async function recordPayoutFailure(event: {
  vendorId?: string | null;
  paymentIntentId: string;
  destinationAccountId?: string | null;
  amountCents: number;
  reason: string;
  playbookId?: string | null;
  productTierId?: string | null;
}): Promise<void> {
  await supabase.from("payout_failures").insert({
    vendor_id: event.vendorId ?? null,
    payment_intent_id: event.paymentIntentId,
    destination_account_id: event.destinationAccountId ?? null,
    amount_cents: event.amountCents,
    playbook_id: event.playbookId ?? null,
    product_tier_id: event.productTierId ?? null,
    reason: event.reason,
    created_at: new Date().toISOString(),
  }).then(undefined, () => {});
}

async function splitPayments({ playbookId, paymentIntentId, totalCents, affiliateCode, billingReason, vendorId, currency }: {
  playbookId: string;
  paymentIntentId: string;
  totalCents: number;
  affiliateCode?: string;
  billingReason?: string;
  vendorId?: string;
  currency: string;
}): Promise<number> {
  const isFirst = !billingReason || billingReason === "subscription_create" || billingReason === "manual";

  const chargeId = await getChargeId(paymentIntentId);

  // Resolve fee pct: custom vendor override or default
  let feePct = DEFAULT_PLATFORM_FEE_PCT;
  if (vendorId) {
    feePct = await getEffectivePlatformFeePct({ vendorId, defaultFeePct: DEFAULT_PLATFORM_FEE_PCT });
  }
  const platformFeeCents = Math.round(totalCents * (feePct / 100));

  type PlaybookItemRow = {
    vendor_split_pct: number;
    saas_products?: {
      id?: string | null;
      vendor_id?: string | null;
      profiles?: {
        stripe_connect_account_id?: string | null;
        allows_affiliates?: boolean | null;
        affiliate_commission_type?: string | null;
        affiliate_first_month_pct?: number | null;
        affiliate_recurring_pct?: number | null;
      } | null;
    } | null;
  };

  const { data: items } = await supabase
    .from("playbook_items")
    .select("vendor_split_pct, saas_products(id, vendor_id, profiles!vendor_id(stripe_connect_account_id, allows_affiliates, affiliate_commission_type, affiliate_first_month_pct, affiliate_recurring_pct))")
    .eq("playbook_id", playbookId);

  if (items) {
    await Promise.allSettled(
      (items as PlaybookItemRow[]).map(async (item) => {
        const connectId = item.saas_products?.profiles?.stripe_connect_account_id;
        if (!connectId) return;
        const cents = Math.floor(totalCents * (item.vendor_split_pct / 100));
        if (cents <= 0) return;

        const payoutKey = `playbook:${playbookId}:vendor:${connectId}:pi:${paymentIntentId}:currency:${currency}:amount:${cents}`;
        if (await hasProcessedPayout(payoutKey)) return;

        const transferParams: Stripe.TransferCreateParams = {
          amount:      cents,
          currency,
          destination: connectId,
          metadata:    { playbookId, paymentIntentId },
        };
        if (chargeId) {
          (transferParams as Stripe.TransferCreateParams & { source_transaction?: string }).source_transaction = chargeId;
        }
        try {
          await stripe.transfers.create(transferParams);
          await recordPayout({
            event_key: payoutKey,
            payment_intent_id: paymentIntentId,
            playbook_id: playbookId,
            destination_account_id: connectId,
            amount_cents: cents,
            status: "processed",
          });
        } catch (err) {
          const reason = getErrorMessage(err, "Transfer failed");
          await recordPayoutFailure({
            vendorId: item.saas_products?.vendor_id ?? null,
            paymentIntentId,
            destinationAccountId: connectId,
            amountCents: cents,
            reason,
            playbookId,
          });
          await recordPayout({
            event_key: payoutKey,
            payment_intent_id: paymentIntentId,
            playbook_id: playbookId,
            destination_account_id: connectId,
            amount_cents: cents,
            status: "failed",
            reason,
          });
          void log.warn("split-payments", "transfer_failed", "Falha no repasse Stripe Connect", {
            playbookId,
            paymentIntentId,
            destination: connectId,
            reason,
          });
        }
      })
    );
  }

  // Affiliate commission
  if (affiliateCode && items?.[0]) {
    const productProfile = (items[0] as PlaybookItemRow).saas_products?.profiles;
    const commType: string = productProfile?.affiliate_commission_type ?? "ONE_TIME";
    let commPct = 0;
    if (isFirst) commPct = Number(productProfile?.affiliate_first_month_pct ?? 0);
    else if (commType === "RECURRING") commPct = Number(productProfile?.affiliate_recurring_pct ?? 0);

    if (commPct > 0) {
      const { data: aff } = await supabase
        .from("affiliate_links")
        .select("profiles!affiliate_id(stripe_connect_account_id)")
        .eq("code", affiliateCode)
        .single();

      const affConnectId = (aff as AffiliateLinkWithProfile | null)?.profiles?.stripe_connect_account_id;
      if (affConnectId) {
        const affCents = Math.round(totalCents * (commPct / 100));
        if (affCents > 0) {
          const payoutKey = `playbook:${playbookId}:affiliate:${affiliateCode}:pi:${paymentIntentId}:currency:${currency}:amount:${affCents}`;
          if (await hasProcessedPayout(payoutKey)) return platformFeeCents;

          try {
            await stripe.transfers.create({
              amount:             affCents,
              currency,
              destination:        affConnectId,
              source_transaction: chargeId ?? undefined,
              metadata:           { affiliateCode, billingReason: billingReason ?? "first" },
            });
            await supabase.rpc("increment_affiliate_sales", { p_code: affiliateCode });
            await recordPayout({
              event_key: payoutKey,
              payment_intent_id: paymentIntentId,
              playbook_id: playbookId,
              destination_account_id: affConnectId,
              amount_cents: affCents,
              status: "processed",
            });
          } catch (err) {
            const reason = getErrorMessage(err, "Affiliate transfer failed");
            await recordPayoutFailure({
              paymentIntentId,
              destinationAccountId: affConnectId,
              amountCents: affCents,
              reason,
              playbookId,
            });
            await recordPayout({
              event_key: payoutKey,
              payment_intent_id: paymentIntentId,
              playbook_id: playbookId,
              destination_account_id: affConnectId,
              amount_cents: affCents,
              status: "failed",
              reason,
            });
            void log.warn("split-payments", "affiliate_transfer_failed", "Falha no repasse do afiliado", {
              playbookId,
              affiliateCode,
              paymentIntentId,
              reason,
            });
          }
        }
      }
    }
  }

  return platformFeeCents;
}
