// app/api/stripe/cancel-subscription/route.ts
// Cancelamento de assinatura integrado no dashboard — sem redirecionar para o portal Stripe.
// Suporta:
//   - cancel_at_period_end=true  → cancela no fim do período (padrão: preserva acesso)
//   - cancel_at_period_end=false → cancelamento imediato (revoga acesso na hora)
// Não quebra se o vendor não tiver webhook configurado.

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { sendEmail, emailSubscriptionCanceled } from "@/lib/email";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { parseRequestBody } from "@/lib/api/parse";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const admin = createAdminClient();
const APP_URL = NEXT_PUBLIC_APP_URL || "";

// ── Schema ─────────────────────────────────────────────────────────────────────
const CancelSubscriptionSchema = z.object({
  subscription_id: z.string().uuid("subscription_id deve ser UUID."),
  cancel_at_period_end: z.boolean().optional().default(true),
  reason: z.string().optional(),
});

type CancelSubscriptionPayload = z.infer<typeof CancelSubscriptionSchema>;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return failure("UNAUTHORIZED", 401, "Não autenticado.");

  const parsed = await parseRequestBody(req, CancelSubscriptionSchema);
  if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

  const { subscription_id, cancel_at_period_end, reason } = parsed.data;

  // Buscar assinatura no banco — garante que pertence ao usuário
  const { data: dbSub, error: subErr } = await admin
    .from("subscriptions")
    .select("id, user_id, status, stripe_subscription_id, product_tier_id, playbook_id, current_period_end")
    .eq("id", subscription_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (subErr || !dbSub) return failure("SUBSCRIPTION_NOT_FOUND", 404, "Assinatura não encontrada.");
  if (dbSub.status === "canceled") return failure("ALREADY_CANCELED", 400, "Esta assinatura já está cancelada.");

  if (!dbSub.stripe_subscription_id) {
    // Assinatura sem stripe_sub_id (ex: Pagarme / manual) — cancelar só no banco
    await admin
      .from("subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: reason ?? null, updated_at: new Date().toISOString() })
      .eq("id", subscription_id);

    if (!cancel_at_period_end) {
      await revokeEntitlements(auth.user.id, dbSub.product_tier_id, dbSub.playbook_id, reason ?? "user_canceled");
    }

    return success({ canceled: true, immediate: !cancel_at_period_end });
  }

  try {
    if (cancel_at_period_end) {
      // Cancelamento ao fim do período — acesso permanece até lá
      await stripe.subscriptions.update(dbSub.stripe_subscription_id, {
        cancel_at_period_end: true,
        metadata: { cancel_reason: reason ?? "user_requested" },
      });

      await admin
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          cancel_reason: reason ?? "user_requested",
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription_id);

      // Registrar intenção de cancelamento
      await admin.from("cancellation_requests").insert({
        user_id: auth.user.id,
        subscription_id: subscription_id,
        stripe_subscription_id: dbSub.stripe_subscription_id,
        reason: reason ?? null,
        cancel_at_period_end: true,
        scheduled_for: dbSub.current_period_end,
      }).then(undefined, (e: Record<string, unknown>) => console.error("[stripe/cancel-subscription]", getErrorMessage(e)));

      return success({
        canceled: false,
        cancel_at_period_end: true,
        access_until: dbSub.current_period_end,
        message: "Cancelamento agendado para o fim do período. Acesso mantido até lá.",
      });
    } else {
      // Cancelamento imediato
      await stripe.subscriptions.cancel(dbSub.stripe_subscription_id, {
        cancellation_details: { comment: reason ?? "user_requested_immediate" },
      });

      await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          cancel_reason: reason ?? "user_requested_immediate",
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription_id);

      // Revogar entitlements + saas_access imediatamente
      await revokeEntitlements(auth.user.id, dbSub.product_tier_id, dbSub.playbook_id, reason ?? "user_canceled_immediate");

      // Email de cancelamento
      try {
        const buyerEmail = auth.user.email ?? "";
        if (buyerEmail) {
          const tpl = emailSubscriptionCanceled({ accessUrl: `${APP_URL}/explorar` });
          await sendEmail({ to: buyerEmail, subject: tpl.subject, html: tpl.html });
        }
      } catch { /* não crítico */ }

      return success({
        canceled: true,
        cancel_at_period_end: false,
        message: "Assinatura cancelada imediatamente.",
      });
    }
  } catch (e: unknown) {
    console.error("[cancel-subscription] stripe error:", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro ao cancelar assinatura."));
  }
}

async function revokeEntitlements(
  userId: string,
  productTierId: string | null,
  playbookId: string | null,
  reason: string
) {
  const now = new Date().toISOString();

  if (productTierId) {
    await admin.from("entitlements")
      .update({ status: "revoked", revoked_at: now, revoke_reason: reason })
      .eq("user_id", userId)
      .eq("product_tier_id", productTierId);

    // Revogar saas_instance
    const { data: tier } = await admin.from("product_tiers").select("product_id").eq("id", productTierId).maybeSingle();
    if ((tier as Record<string, unknown>)?.product_id) {
      await admin.rpc("revoke_saas_instance", {
        p_user_id: userId,
        p_product_id: (tier as unknown as Record<string,unknown>).product_id,
        p_reason: reason,
      }).then(undefined, (e: Record<string, unknown>) => console.error("[stripe/cancel-subscription]", getErrorMessage(e)));
    }
  }

  if (playbookId) {
    await admin.from("entitlements")
      .update({ status: "revoked", revoked_at: now, revoke_reason: reason })
      .eq("user_id", userId)
      .eq("playbook_id", playbookId);
  }

  // Notificar buyer
  await admin.from("notifications").insert({
    user_id: userId,
    type: "subscription_canceled",
    title: "Assinatura cancelada",
    body: "Sua assinatura foi cancelada e o acesso foi revogado.",
    action_url: "/buyer",
  }).then(undefined, (e: Record<string, unknown>) => console.error("[stripe/cancel-subscription]", getErrorMessage(e)));
}
