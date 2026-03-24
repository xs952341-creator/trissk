// lib/webhooks/services/provision-playbook.ts
// Provisiona acesso a playbook após pagamento — webhook, notificações.

import { createAdminClient } from "@/lib/supabase/admin";
import { validateWebhookUrl } from "@/lib/security/url-validator";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { logDeliveryEvent } from "@/lib/webhooks/services/webhook-utils";

const supabase = createAdminClient();

export { provisionPlaybook };

async function provisionPlaybook({ playbookId, userId, email, name, invoiceId }: {
  playbookId: string;
  userId: string;
  email: string;
  name: string;
  invoiceId: string;
}) {
  const { data: items } = await supabase
    .from("playbook_items")
    .select("product_id, saas_products(name, provisioning_webhook_url, magic_link_url)")
    .eq("playbook_id", playbookId);

  if (!items) return;

  type PlaybookItem = {
    product_id: string | null;
    saas_products?: {
      name?: string | null;
      provisioning_webhook_url?: string | null;
      magic_link_url?: string | null;
    } | null;
  };

  await Promise.allSettled((items as PlaybookItem[]).map(async (item) => {
    const url = item.saas_products?.provisioning_webhook_url ?? item.saas_products?.magic_link_url;
    if (!url) return;

    try {
      // 🔐 SSRF: bloqueia IPs internos que vendors possam ter configurado
      try {
        validateWebhookUrl(url, "provisionPlaybook");
      } catch (ssrfErr: unknown) {
        console.error("[provisionPlaybook] SSRF blocked:", getErrorMessage(ssrfErr, "SSRF error"));
        await logDeliveryEvent({
          user_id: userId,
          product_id: item.product_id ?? null,
          vendor_id: null,
          playbook_id: playbookId,
          stripe_invoice_id: invoiceId,
          url,
          status: "failed",
          http_status: null,
          error_message: `SSRF: ${getErrorMessage(ssrfErr, "SSRF error")}`,
        });
        return;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event:       "user.provisioned",
          buyer:       { id: userId, email, name },
          product:     { id: item.product_id, name: item.saas_products?.name },
          playbook_id: playbookId,
          invoice_id:  invoiceId,
          timestamp:   new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });

      await logDeliveryEvent({
        user_id:          userId,
        product_id:       item.product_id ?? null,
        vendor_id:        null,
        playbook_id:      playbookId,
        stripe_invoice_id: invoiceId,
        url,
        status:           res.ok ? "success" : "failed",
        http_status:      res.status,
        error_message:    res.ok ? null : `HTTP ${res.status}`,
      });
    } catch (e: unknown) {
      await logDeliveryEvent({
        user_id:          userId,
        product_id:       item.product_id ?? null,
        vendor_id:        null,
        playbook_id:      playbookId,
        stripe_invoice_id: invoiceId,
        url,
        status:           "failed",
        http_status:      null,
        error_message:    getErrorMessage(e, "fetch_failed"),
      });
    }
  }));
}
