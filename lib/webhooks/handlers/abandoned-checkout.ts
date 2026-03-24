// lib/webhooks/handlers/abandoned-checkout.ts
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { sendEmailQueued, emailAbandonedCart } from "@/lib/email";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import type { Profile, ProductTierWithProduct } from "@/lib/types/database";

export { handleAbandonedCheckout };

void log;

const APP_URL = NEXT_PUBLIC_APP_URL || "";

async function handleAbandonedCheckout(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const meta   = (session.metadata ?? {}) as Record<string, string>;
  const userId = meta.userId;
  if (!userId) return;

  const { data: existing } = await supabase
    .from("abandoned_checkout_recovery")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) return;

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser.user?.email ?? "";
  const name  = authUser.user?.user_metadata?.full_name ?? "";
  if (!email) return;

  let productName = "";
  if (meta.productTierId) {
    const { data: tier } = await supabase
      .from("product_tiers")
      .select("tier_name, saas_products(name, slug)")
      .eq("id", meta.productTierId)
      .maybeSingle();
    productName = (tier as ProductTierWithProduct | null)?.saas_products?.name ?? (tier as Record<string, unknown> | null)?.tier_name as string ?? "";
  }

  const slug = meta.slug ?? "";
  const recoveryUrl = slug
    ? `${APP_URL}/checkout/${slug}?tier=${meta.productTierId ?? ""}&billing=${meta.type === "lifetime" ? "lifetime" : "monthly"}&recovery=1`
    : `${APP_URL}/explorar`;

  await supabase.from("abandoned_checkout_recovery").insert({
    stripe_session_id: session.id,
    user_id:    userId,
    email,
    product_name: productName,
    recovery_url: recoveryUrl,
    sent_at:    new Date().toISOString(),
  });

  const tpl = emailAbandonedCart({ name, productName, recoveryUrl });
  await sendEmailQueued({ to: email, subject: tpl.subject, html: tpl.html });

  try {
    const { data: prof } = await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle();
    if ((prof as Profile | null)?.phone) {
      await inngest.send({
        name: "checkout/abandoned",
        data: {
          userId, email, name, productName, recoveryUrl,
          phone: (prof as Profile).phone as string,
        },
      });
    }
  } catch { /* não crítico */ }
}
