// app/api/kyc/session/route.ts
// Cria uma AccountSession do Stripe Connect para uso com @stripe/connect-js (embedded).
// O componente <ConnectAccountOnboarding> no frontend usa este token para renderizar
// o KYC diretamente na página, sem redirecionar para stripe.com.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const adminSb  = createAdminClient();

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Buscar ou criar conta Connect
    const { data: profile } = await adminSb
      .from("profiles")
      .select("stripe_connect_account_id, email, full_name")
      .eq("id", user.id)
      .single();

    let accountId = profile?.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type:    "express",
        country: "BR",
        email:   profile?.email ?? user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers:     { requested: true },
        },
        business_type: "individual",
        metadata: { userId: user.id },
      });
      accountId = account.id;

      await adminSb.from("profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", user.id);
    }

    // Criar AccountSession com componente de onboarding embedded
    const accountSession = await stripe.accountSessions.create({
      account:    accountId,
      components: {
        account_onboarding: { enabled: true },
      },
    });

    // Também checar status atual e atualizar cache
    try {
      const account = await stripe.accounts.retrieve(accountId);
      await adminSb.from("profiles").update({
        stripe_connect_onboarded: !!account.details_submitted,
        stripe_kyc_enabled:      account.charges_enabled ?? false,
        stripe_payouts_enabled:  account.payouts_enabled ?? false,
      }).eq("id", user.id);
    } catch {}

    return NextResponse.json({
      client_secret: accountSession.client_secret,
      account_id:    accountId,
    });
  } catch (err: unknown) {
    console.error("[kyc/session]:", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await adminSb
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarded, stripe_kyc_enabled, stripe_payouts_enabled")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_connect_account_id) {
      return NextResponse.json({ status: "not_started" });
    }

    // Refresh from Stripe
    try {
      const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id);
      const updated = {
        stripe_connect_onboarded: !!account.details_submitted,
        stripe_kyc_enabled:      account.charges_enabled ?? false,
        stripe_payouts_enabled:  account.payouts_enabled ?? false,
      };
      await adminSb.from("profiles").update(updated).eq("id", user.id);

      return NextResponse.json({
        status:           account.charges_enabled ? "verified" : account.details_submitted ? "pending_review" : "incomplete",
        details_submitted: account.details_submitted,
        charges_enabled:   account.charges_enabled,
        payouts_enabled:   account.payouts_enabled,
        account_id:        profile.stripe_connect_account_id,
      });
    } catch {
      return NextResponse.json({
        status:           profile.stripe_kyc_enabled ? "verified" : "incomplete",
        charges_enabled:  profile.stripe_kyc_enabled ?? false,
        payouts_enabled:  profile.stripe_payouts_enabled ?? false,
      });
    }
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
