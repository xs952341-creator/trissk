import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

/**
 * Sincroniza o status do Stripe Connect (KYC/payouts) com o profile.
 * - Não muda arquitetura
 * - Não quebra se colunas ainda não existirem
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", user.id)
      .maybeSingle();

    const accountId = (profile as Record<string, unknown>)?.stripe_connect_account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json({ ok: true, connected: false });
    }

    const account = await stripe.accounts.retrieve(accountId);

    const payload: Record<string, unknown> = {
      stripe_connect_onboarded: !!account.details_submitted,
      stripe_kyc_enabled:       !!account.charges_enabled,
      stripe_payouts_enabled:   !!account.payouts_enabled,
    };

    try {
      await supabase.from("profiles").update(payload).eq("id", user.id);
    } catch (e) {
      // Ambientes sem colunas novas não devem quebrar a navegação.
      console.warn("[connect/sync] profile update failed:", getErrorMessage(e));
    }

    return NextResponse.json({ ok: true, connected: true, ...payload });
  } catch (err: unknown) {
    console.error("[connect/sync]:", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
