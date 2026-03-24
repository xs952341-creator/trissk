// app/api/refund/route.ts — v4 PREMIUM
// Reembolso com proteção contra corrida de concorrência (refund_pending lock),
// tipagem completa, schema Zod e respostas padronizadas.

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";
import { parseRequestBody } from "@/lib/api/parse";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

const REFUND_WINDOW_DAYS = 7;

// ── Schema ─────────────────────────────────────────────────────────────────────
const RefundSchema = z.object({
  subscriptionId: z.string().min(1, "subscriptionId é obrigatório."),
});

type RefundPayload = z.infer<typeof RefundSchema>;

// ── Local types ────────────────────────────────────────────────────────────────
type SubRow = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  playbook_id: string | null;
  product_tier_id: string | null;
};

type RevocationProduct = {
  revocation_webhook_url:   string | null;
  provisioning_webhook_url: string | null;
};

// Non-refundable statuses — any of these means the request should be rejected
const NON_REFUNDABLE = new Set(["refunded", "refund_pending", "canceling_refund"]);

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const token      = authHeader?.replace("Bearer ", "").trim();
  if (!token) return failure("UNAUTHORIZED", 401, "Token de autenticação ausente.");

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return failure("UNAUTHORIZED", 401, "Token inválido ou expirado.");

  // ── Parse & validate ───────────────────────────────────────────────────────
  const parsed = await parseRequestBody<RefundPayload>(req, RefundSchema);
  if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

  const { subscriptionId } = parsed.data;

  try {
    // ── Load subscription ──────────────────────────────────────────────────
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, user_id, status, created_at, stripe_subscription_id, stripe_customer_id, playbook_id, product_tier_id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single();

    if (subError || !sub) {
      return failure("NOT_FOUND", 404, "Assinatura não encontrada.");
    }

    const row = sub as SubRow;

    // ── Guard: non-refundable statuses ─────────────────────────────────────
    if (NON_REFUNDABLE.has(row.status)) {
      return failure(
        "ALREADY_REFUNDED",
        409,
        row.status === "refunded"
          ? "Este pedido já foi reembolsado."
          : "Este pedido já está em processo de reembolso."
      );
    }

    // ── Guard: 7-day window ────────────────────────────────────────────────
    const createdAt = new Date(row.created_at);
    const daysPast  = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
    if (daysPast > REFUND_WINDOW_DAYS) {
      return failure(
        "WINDOW_EXPIRED",
        400,
        `A janela de ${REFUND_WINDOW_DAYS} dias para reembolso expirou. Entre em contato com o suporte.`
      );
    }

    // ── Concurrency lock: mark refund_pending ──────────────────────────────
    // Uses optimistic lock: only update if status is still the original value.
    // If zero rows updated, another request already claimed the lock.
    const { data: lockedRows, error: lockError } = await supabase
      .from("subscriptions")
      .update({ status: "refund_pending" })
      .eq("id", subscriptionId)
      .eq("status", row.status)           // optimistic lock
      .select("id");

    if (lockError || !lockedRows || lockedRows.length === 0) {
      return failure(
        "REFUND_IN_PROGRESS",
        409,
        "Este pedido já está em processo de reembolso. Aguarde."
      );
    }

    // ── Stripe refund ──────────────────────────────────────────────────────
    let refundSuccess = false;

    if (row.stripe_subscription_id) {
      try {
        const invoices = await stripe.invoices.list({
          subscription: row.stripe_subscription_id,
          limit: 1,
        });
        const invoice = invoices.data[0];

        if (invoice?.payment_intent) {
          await stripe.refunds.create({
            payment_intent:         invoice.payment_intent as string,
            reason:                 "requested_by_customer",
            reverse_transfer:       true,
            refund_application_fee: true,
          });
          refundSuccess = true;
        }

        // Cancel Stripe subscription (best-effort)
        await stripe.subscriptions.cancel(row.stripe_subscription_id).catch(() => {});
      } catch (stripeErr: unknown) {
        // Revert lock on Stripe failure
        await supabase
          .from("subscriptions")
          .update({ status: row.status })
          .eq("id", subscriptionId);

        return failure(
          "STRIPE_ERROR",
          502,
          getErrorMessage(stripeErr, "Falha ao processar reembolso no Stripe.")
        );
      }
    }

    // ── Update DB to final refunded state ──────────────────────────────────
    await supabase
      .from("subscriptions")
      .update({ status: "refunded", canceled_at: new Date().toISOString() })
      .eq("id", subscriptionId);

    // Abort pending fiscal jobs (best-effort)
    if (row.stripe_subscription_id) {
      await supabase
        .from("fiscal_jobs")
        .update({ status: "ABORTED" })
        .eq("status", "PENDING")
        .filter("invoice_id", "like", `%${row.stripe_subscription_id}%`)
        .then(undefined, () => {});
    }

    // ── Revoke access via vendor webhooks ──────────────────────────────────
    await dispatchRevocation({
      userId:        user.id,
      playbookId:    row.playbook_id,
      productTierId: row.product_tier_id,
      reason:        "refund_requested",
    });

    return success({ refunded: refundSuccess });

  } catch (err: unknown) {
    console.error("[refund]", getErrorMessage(err));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro ao processar reembolso."));
  }
}

// ── Revocation dispatcher ──────────────────────────────────────────────────────
async function dispatchRevocation(opts: {
  userId:        string;
  playbookId:    string | null | undefined;
  productTierId: string | null | undefined;
  reason:        string;
}): Promise<void> {
  const { userId, playbookId, productTierId, reason } = opts;

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const buyerEmail = authUser.user?.email ?? "";
  const buyerName  = authUser.user?.user_metadata?.full_name ?? "";

  const payload = {
    event:     "user.revoked",
    reason,
    buyer:     { id: userId, email: buyerEmail, name: buyerName },
    timestamp: new Date().toISOString(),
  };

  const urls: string[] = [];

  if (playbookId) {
    const { data: items } = await supabase
      .from("playbook_items")
      .select("saas_products(revocation_webhook_url, provisioning_webhook_url)")
      .eq("playbook_id", playbookId);

    for (const item of (items ?? []) as Array<{ saas_products: RevocationProduct[] | null }>) {
      const product = item.saas_products?.[0];
      const url = pickRevocationUrl(product);
      if (url) urls.push(url);
    }
  } else if (productTierId) {
    const { data: tier } = await supabase
      .from("product_tiers")
      .select("saas_products(revocation_webhook_url, provisioning_webhook_url)")
      .eq("id", productTierId)
      .single();

    const product = (tier as { saas_products: RevocationProduct[] | null } | null)?.saas_products?.[0];
    const url = pickRevocationUrl(product);
    if (url) urls.push(url);
  }

  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(8_000),
      })
    )
  );
}

function pickRevocationUrl(product: RevocationProduct | null | undefined): string | null {
  return product?.revocation_webhook_url ?? product?.provisioning_webhook_url ?? null;
}
