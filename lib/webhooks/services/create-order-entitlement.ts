// lib/webhooks/services/create-order-entitlement.ts
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import { FISCAL_EMIT_DELAY_DAYS } from "@/lib/config";
import { ensureDefaultWorkspace, maybeIssueLicenseKey } from "@/lib/webhooks/services/webhook-utils";
import type { ProductTierWithProduct } from "@/lib/types/database";

export { logOrderAndEntitlement };

void inngest; void log; void FISCAL_EMIT_DELAY_DAYS;

async function logOrderAndEntitlement({ invoice, userId, vendorId, playbookId, productTierId }: {
  invoice: Stripe.Invoice;
  userId: string;
  vendorId: string | null;
  playbookId: string | null;
  productTierId: string | null;
}) {
  const supabase = createAdminClient();

  let productId: string | null = null;
  if (productTierId) {
    const { data: tier } = await supabase
      .from("product_tiers")
      .select("product_id")
      .eq("id", productTierId)
      .maybeSingle();
    productId = (tier as ProductTierWithProduct | null)?.product_id ?? null;
  }

  await supabase.from("orders").upsert({
    user_id: userId,
    vendor_id: vendorId,
    product_id: productId,
    product_tier_id: productTierId,
    playbook_id: playbookId,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: (invoice.payment_intent as string) ?? null,
    amount_gross: (invoice.amount_paid ?? 0) / 100,
    currency: invoice.currency ?? "brl",
    status: "paid",
  }, { onConflict: "stripe_invoice_id" });

  if (playbookId) {
    const { data: items } = await supabase
      .from("playbook_items")
      .select("product_id")
      .eq("playbook_id", playbookId);

    await Promise.allSettled((items ?? []).map((i: { product_id: string }) =>
      supabase.from("entitlements").upsert({
        user_id: userId,
        product_id: i.product_id,
        playbook_id: playbookId,
        source_invoice_id: invoice.id,
        source_subscription_id: (invoice.subscription as string) ?? null,
        status: "active",
      }, { onConflict: "user_id,product_id,product_tier_id,playbook_id" })
    ));
  }

  if (productId || productTierId) {
    let limits: Record<string, unknown> = {};
    try {
      if (productTierId) {
        const { data: t } = await supabase.from("product_tiers").select("limits").eq("id", productTierId).maybeSingle();
        limits = (t as { limits?: Record<string, unknown> } | null)?.limits ?? {};
      }
    } catch { limits = {}; }

    const { data: ent } = await supabase.from("entitlements").upsert({
      user_id: userId,
      product_id: productId,
      product_tier_id: productTierId,
      source_invoice_id: invoice.id,
      source_subscription_id: (invoice.subscription as string) ?? null,
      status: "active",
      metadata: { limits },
    }, { onConflict: "user_id,product_id" }).select("id").single();

    try {
      const seats = Number(limits?.seats ?? 0);
      const wsId = await ensureDefaultWorkspace(userId);
      await supabase.from("workspace_entitlements").upsert({
        workspace_id: wsId,
        entitlement_id: ent?.id,
        seats_limit: seats > 0 ? seats : null,
      }, { onConflict: "workspace_id" });
    } catch { /* best-effort */ }

    if (productId) {
      await maybeIssueLicenseKey(userId, productId, invoice.id);
    }
  }
}
