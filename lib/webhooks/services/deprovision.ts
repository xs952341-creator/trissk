// lib/webhooks/services/deprovision.ts
// Remove acesso após cancelamento, chargeback ou falha de pagamento.

import { createAdminClient } from "@/lib/supabase/admin";
import { validateWebhookUrl } from "@/lib/security/url-validator";
import { getErrorMessage } from "@/lib/errors";
import { logDeliveryEvent } from "@/lib/webhooks/services/webhook-utils";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import type { ProductTierWithProduct } from "@/lib/types/database";

const supabase = createAdminClient();

export { deprovision };

async function deprovision({ userId, playbookId, productTierId, reason }: {
  userId: string;
  playbookId?: string | null;
  productTierId?: string | null;
  reason: string;
}) {
  const { data: buyer } = await supabase.auth.admin.getUserById(userId);
  const payload = {
    event: "user.revoked",
    reason,
    buyer: {
      id:    userId,
      email: buyer.user?.email ?? "",
      name:  buyer.user?.user_metadata?.full_name ?? "",
    },
    timestamp: new Date().toISOString(),
  };
  const urls: string[] = [];

  if (playbookId) {
    const { data: items } = await supabase
      .from("playbook_items")
      .select("saas_products(revocation_webhook_url, provisioning_webhook_url)")
      .eq("playbook_id", playbookId);

    type PlaybookItemRow = { saas_products?: { revocation_webhook_url?: string; provisioning_webhook_url?: string } | null };
    for (const i of (items ?? []) as PlaybookItemRow[]) {
      const u = i.saas_products?.revocation_webhook_url ?? i.saas_products?.provisioning_webhook_url;
      if (u) urls.push(u);
    }
  } else if (productTierId) {
    const { data: tier } = await supabase
      .from("product_tiers")
      .select("saas_products(revocation_webhook_url, provisioning_webhook_url)")
      .eq("id", productTierId)
      .single();

    const t = tier as ProductTierWithProduct | null;
    const u = t?.saas_products?.revocation_webhook_url ?? t?.saas_products?.provisioning_webhook_url;
    if (u) urls.push(u);
  }

  // ✅ Revoga acessos na biblioteca
  try {
    if (playbookId) {
      await supabase
        .from("entitlements")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: reason })
        .eq("user_id", userId)
        .eq("playbook_id", playbookId);
    }
    if (productTierId) {
      await supabase
        .from("entitlements")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: reason })
        .eq("user_id", userId)
        .eq("product_tier_id", productTierId);
    }
  } catch (e) {
    console.error("[entitlements] revoke failed", e);
  }

  // ✅ Revoga saas_instances e saas_access
  try {
    let productIdToRevoke: string | null = null;
    if (productTierId) {
      const { data: tierRow } = await supabase
        .from("product_tiers")
        .select("product_id")
        .eq("id", productTierId)
        .maybeSingle();
      productIdToRevoke = (tierRow as { product_id?: string } | null)?.product_id ?? null;
    }
    if (productIdToRevoke) {
      await supabase.rpc("revoke_saas_instance", {
        p_user_id:    userId,
        p_product_id: productIdToRevoke,
        p_reason:     reason,
      });
    }
  } catch (e) {
    console.error("[saas_instances] revoke failed", e);
  }

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        validateWebhookUrl(url, "deprovision");
        const res = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(8000),
        });

        await logDeliveryEvent({
          user_id: userId,
          product_id: null,
          vendor_id: null,
          playbook_id: playbookId ?? null,
          stripe_invoice_id: null,
          url,
          status: res.ok ? "success" : "failed",
          http_status: res.status,
          error_message: res.ok ? null : `HTTP ${res.status}`,
        });
      } catch (err) {
        const errMsg = getErrorMessage(err, "Revoke webhook failed");
        console.error("[deprovision][revoke-webhook]", errMsg);
        await logDeliveryEvent({
          user_id: userId,
          product_id: null,
          vendor_id: null,
          playbook_id: playbookId ?? null,
          stripe_invoice_id: null,
          url,
          status: "failed",
          http_status: null,
          error_message: errMsg,
        }).catch(() => {});
      }
    })
  );
}
