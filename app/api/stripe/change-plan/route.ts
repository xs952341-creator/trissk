// app/api/stripe/change-plan/route.ts
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

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// ── Schema ─────────────────────────────────────────────────────────────────────
const ChangePlanSchema = z.object({
  subscriptionId: z.string().uuid("subscriptionId deve ser UUID."),
  newPriceId: z.string().min(1, "newPriceId é obrigatório."),
  newProductTierId: z.string().uuid().optional(),
});

type ChangePlanPayload = z.infer<typeof ChangePlanSchema>;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return failure("UNAUTHORIZED", 401, "Token ausente.");

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return failure("UNAUTHORIZED", 401, "Token inválido.");

    const parsed = await parseRequestBody<ChangePlanPayload>(req, ChangePlanSchema);
    if (!parsed.success) return failure("INVALID_PAYLOAD", 400, parsed.message);

    const { subscriptionId, newPriceId, newProductTierId } = parsed.data;

    // Validate ownership
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, user_id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single();

    if (!sub) return failure("SUBSCRIPTION_NOT_FOUND", 404, "Assinatura não encontrada.");

    // Retrieve Stripe subscription to get current item ID
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const currentItemId = stripeSub.items.data[0]?.id;
    if (!currentItemId) return failure("NO_SUBSCRIPTION_ITEM", 400, "Nenhum item na assinatura.");

    // Update with proration
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: "create_prorations",
    });

    // Update our DB
    if (newProductTierId) {
      await supabase.from("subscriptions")
        .update({ product_tier_id: newProductTierId, updated_at: new Date().toISOString() })
        .eq("id", subscriptionId);
    }

    return success({ subscriptionId: updated.id });
  } catch (err: unknown) {
    console.error("[change-plan]:", getErrorMessage(err));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro interno."));
  }
}
