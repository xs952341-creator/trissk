// app/api/stripe/portal/route.ts
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
const APP_URL = getPublicAppUrl();

export async function GET(req: NextRequest) {
  try {
    const appUrl = APP_URL || req.nextUrl.origin;
    const authHeader = req.headers.get("authorization");
    const token      = authHeader?.replace("Bearer ", "");
    
    // Allow cookie-based session too
    const { data: { user } } = token 
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser();

    if (!user) return NextResponse.redirect(`${appUrl}/login`);

    // Find stripe customer id
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return NextResponse.redirect(`${appUrl}/dashboard?error=no_subscription`);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${appUrl}/dashboard`,
    });

    return NextResponse.redirect(portalSession.url);
  } catch (err: unknown) {
    console.error("[stripe/portal]:", getErrorMessage(err));
    return NextResponse.redirect(`${APP_URL}/dashboard?error=portal_failed`);
  }
}
