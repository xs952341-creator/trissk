// lib/webhooks/services/provision-tier.ts
// Provisiona acesso a produto SaaS tier — webhook, notificações.

import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWebhookUrl } from "@/lib/security/url-validator";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { logDeliveryEvent } from "@/lib/webhooks/services/webhook-utils";
import type { ProductTierWithProduct } from "@/lib/types/database";

const supabase = createAdminClient();

export { provisionTier };

// Typed shape returned by the Supabase query — use intersection, not extends, to avoid conflict
type TierRow = ProductTierWithProduct & {
  has_consultancy?: boolean;
  calendar_link?: string | null;
  saas_products: (ProductTierWithProduct["saas_products"]) & {
    webhook_signing_secret?: string | null;
  };
};

async function provisionTier({ productTierId, userId, email, name, invoiceId }: {
  productTierId: string;
  userId: string;
  email: string;
  name: string;
  invoiceId?: string;
}) {
  const { data: tier } = await supabase
    .from("product_tiers")
    .select("*, saas_products(id, name, provisioning_webhook_url, magic_link_url, webhook_signing_secret)")
    .eq("id", productTierId)
    .single();

  if (!tier) return;

  const t = tier as TierRow;
  const productId = t.product_id ?? null;
  const url = t.saas_products?.provisioning_webhook_url ?? t.saas_products?.magic_link_url;

  // Criar instância pendente no banco antes de chamar o webhook
  if (productId) {
    await supabase.rpc("provision_saas_instance", {
      p_user_id:         userId,
      p_product_id:      productId,
      p_product_tier_id: productTierId,
      p_invoice_id:      invoiceId ?? null,
      p_external_id:     null,
      p_access_url:      t.saas_products?.magic_link_url ?? null,
    }).then(undefined, (e: unknown) => console.error("[wh] provision_saas_instance initial:", getErrorMessage(e))
    );
  }

  if (!url) return;

  const payloadObj = {
    event:           "user.provisioned",
    buyer:           { id: userId, email, name },
    tier:            { id: productTierId, name: t.tier_name },
    product_id:      productId,
    has_consultancy: t.has_consultancy,
    calendar_link:   t.calendar_link,
    invoice_id:      invoiceId ?? null,
    timestamp:       new Date().toISOString(),
  };

  const payloadStr = JSON.stringify(payloadObj);

  // Assinar payload se webhook_signing_secret configurado
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = t.saas_products?.webhook_signing_secret;
  if (secret) {
    const sig = createHmac("sha256", secret).update(payloadStr).digest("hex");
    headers["x-playbook-signature"] = `sha256=${sig}`;
    headers["x-playbook-event"]     = "user.provisioned";
  }

  // 🔐 SSRF: valida URL antes do fetch
  try {
    validateWebhookUrl(url, "provisionTier");
  } catch (ssrfErr: unknown) {
    console.error("[provisionTier] SSRF blocked:", getErrorMessage(ssrfErr, "SSRF error"));
    await logDeliveryEvent({
      user_id:          userId,
      product_id:       productId,
      vendor_id:        null,
      playbook_id:      null,
      stripe_invoice_id: invoiceId ?? null,
      url,
      status:           "failed",
      http_status:      null,
      error_message:    `SSRF: ${getErrorMessage(ssrfErr, "SSRF error")}`,
    });
    return;
  }

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers,
      body:    payloadStr,
      signal:  AbortSignal.timeout(10000),
    });

    // Tentar extrair external_id da resposta do SaaS
    let externalId: string | null = null;
    try {
      const respJson = await res.json() as { user_id?: string; external_id?: string; id?: string };
      externalId = respJson?.user_id ?? respJson?.external_id ?? respJson?.id ?? null;
    } catch { /* resposta não é JSON, tudo bem */ }

    // Atualizar instância com external_id se recebido
    if (productId && externalId) {
      await supabase.rpc("provision_saas_instance", {
        p_user_id:         userId,
        p_product_id:      productId,
        p_product_tier_id: productTierId,
        p_invoice_id:      invoiceId ?? null,
        p_external_id:     externalId,
        p_access_url:      t.saas_products?.magic_link_url ?? null,
      }).then(undefined, (e: unknown) => console.error("[wh] provision_saas_instance external_id:", getErrorMessage(e))
      );
    }

    await logDeliveryEvent({
      user_id:          userId,
      product_id:       productId,
      vendor_id:        null,
      playbook_id:      null,
      stripe_invoice_id: invoiceId ?? null,
      url,
      status:           res.ok ? "success" : "failed",
      http_status:      res.status,
      error_message:    res.ok ? null : `HTTP ${res.status}`,
    });
  } catch (e: unknown) {
    await logDeliveryEvent({
      user_id:          userId,
      product_id:       productId,
      vendor_id:        null,
      playbook_id:      null,
      stripe_invoice_id: invoiceId ?? null,
      url,
      status:           "failed",
      http_status:      null,
      error_message:    getErrorMessage(e, "fetch_failed"),
    });
  }
}
