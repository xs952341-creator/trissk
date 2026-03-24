import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// Self-serve: trials/upgrade/downgrade/proration/addons via Stripe Customer Portal

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    const { userId, returnUrl } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: "Cliente Stripe não encontrado" }, { status: 404 });
    }
  
    const appUrl = NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl || `${appUrl}/buyer/meus-acessos`,
    });
  
    return NextResponse.json({ url: portal.url });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
