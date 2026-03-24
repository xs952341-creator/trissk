// lib/webhooks/handlers/account-updated.ts
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import type { Profile } from "@/lib/types/database";

export { handleAccountUpdated };

void log;

async function handleAccountUpdated(account: Stripe.Account) {
  const supabase = createAdminClient();
  const accountId = account.id;

  const userIdFromMeta = (account.metadata?.userId ?? account.metadata?.userid ?? null) as string | null;
  let userId: string | null = userIdFromMeta;

  if (!userId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_connect_account_id", accountId)
      .maybeSingle();
    userId = (prof as Profile | null)?.id ?? null;
  }

  if (!userId) return;

  const payload = {
    stripe_connect_onboarded: !!account.details_submitted,
    stripe_kyc_enabled:       !!account.charges_enabled,
    stripe_payouts_enabled:   !!account.payouts_enabled,
  };

  try {
    await supabase.from("profiles").update(payload).eq("id", userId);
  } catch (e) {
    console.warn("[wh] account.updated profile update failed:", getErrorMessage(e));
  }
}
