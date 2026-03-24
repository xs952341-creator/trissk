// app/api/stripe/connect/account-session/route.ts
// Cria uma AccountSession do Stripe para o onboarding embarcado.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const admin = createAdminClient();
const appUrl = getPublicAppUrl();

// Local types
interface ProfileRow {
  stripe_connect_account_id?: string | null;
  email?: string;
  full_name?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("UNAUTHORIZED", 401, "Não autenticado");

  try {
    // Buscar ou criar conta Connect
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_connect_account_id, email, full_name")
      .eq("id", user.id)
      .single();

    let accountId = profile?.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "BR",
        email: profile?.email ?? user.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_type: "individual",
        metadata: { userId: user.id },
      });
      accountId = account.id;

      await admin.from("profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", user.id);
    }

    // Criar AccountSession para o componente embarcado
    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
        account_management: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
      },
    });

    return success({
      client_secret: accountSession.client_secret,
      account_id: accountId,
    });
  } catch (err: unknown) {
    console.error("[stripe/connect/account-session]:", getErrorMessage(err));
    return failure("STRIPE_ERROR", 500, getErrorMessage(err, "Erro interno."));
  }
}
