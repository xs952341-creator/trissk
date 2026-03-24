// app/api/stripe/onboarding/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();
const appUrl = getPublicAppUrl();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token      = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get or create Connect account
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, email, full_name")
      .eq("id", user.id)
      .single();

    let accountId = profile?.stripe_connect_account_id;

    if (!accountId) {
      // Create new Connect account
      const account = await stripe.accounts.create({
        type:    "express",
        country: "BR",
        email:   profile?.email ?? user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers:     { requested: true },
        },
        business_type: "individual",
        metadata: { userId: user.id },
      });
      accountId = account.id;

      // Save to profile
      await supabase.from("profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", user.id);
    } else {
      // Check KYC status and update profile
      const account = await stripe.accounts.retrieve(accountId);
      try {
        await supabase.from("profiles").update({
          stripe_connect_onboarded: !!account.details_submitted,
          stripe_kyc_enabled:    account.charges_enabled ?? false,
          stripe_payouts_enabled: account.payouts_enabled ?? false,
        }).eq("id", user.id);
      } catch {}
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${appUrl}/vendor?kyc=refresh`,
      return_url:  `${appUrl}/vendor?kyc=complete`,
      type:        "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err: unknown) {
    console.error("[stripe/onboarding]:", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
