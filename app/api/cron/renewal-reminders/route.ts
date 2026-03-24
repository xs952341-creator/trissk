// app/api/cron/renewal-reminders/route.ts
// Envia lembretes de renovação em 3 janelas: 7 dias, 3 dias e 1 dia antes.
// Usa email_logs para idempotência — cada janela só dispara uma vez por assinatura.
// Schedule: 10:00 UTC todo dia

import { NextRequest, NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRON_SECRET } from "@/lib/env-server";
import { sendEmail, emailRenewalSoon } from "@/lib/email";
import { getErrorMessage } from "@/lib/errors";
import type { SubscriptionWithTier } from "@/lib/types/database";

export const runtime = "nodejs";

const supabase = createAdminClient();

// Janelas de notificação em dias antes da renovação

export const dynamic = 'force-dynamic';
const REMINDER_WINDOWS = [
  { days: 7, type: "renewal_7d" },
  { days: 3, type: "renewal_3d" },
  { days: 1, type: "renewal_1d" },
];

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ disabled: true, reason: "CRON_SECRET not set" });
  }

  const authHeader = req.headers.get("authorization");
  const xSecret    = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && xSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appUrl = getPublicAppUrl();
  const now = new Date();
  let totalSent = 0;
  const results: Record<string, number> = {};

  for (const window of REMINDER_WINDOWS) {
    const target = new Date(now.getTime() + window.days * 86400_000);
    const windowStart = new Date(target.getTime() - 18 * 3600_000).toISOString();
    const windowEnd   = new Date(target.getTime() + 18 * 3600_000).toISOString();

    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, current_period_end, status, product_tier_id, cancel_at_period_end")
      .eq("status", "active")
      .gte("current_period_end", windowStart)
      .lte("current_period_end", windowEnd);

    if (error) {
      console.error(`[renewal-reminders] query error (${window.days}d):`, getErrorMessage(error));
      continue;
    }

    let windowSent = 0;

    for (const s of subs ?? []) {
      const sub = s as SubscriptionWithTier;
      if (sub.cancel_at_period_end) continue;

      try {
        const alreadySent = await checkEmailLog(s.user_id, window.type, s.id);
        if (alreadySent) continue;

        const { data: buyer } = await supabase.auth.admin.getUserById(s.user_id);
        const buyerEmail = buyer.user?.email ?? "";
        if (!buyerEmail) continue;

        let productName = "";
        if (sub.product_tier_id) {
          const { data: tier } = await supabase
            .from("product_tiers")
            .select("tier_name, saas_products(name)")
            .eq("id", sub.product_tier_id)
            .maybeSingle();
          const tierData = tier as { tier_name?: string; saas_products?: { name?: string }[] | { name?: string } } | null;
          const saasProd = tierData?.saas_products;
          const productNameFromTier = Array.isArray(saasProd) ? saasProd[0]?.name : saasProd?.name;
          productName = productNameFromTier ?? tierData?.tier_name ?? "";
        }

        const tpl = emailRenewalSoon({ days: window.days, accessUrl: `${appUrl}/buyer` });

        const subject = window.days === 1
          ? `\u26a0\ufe0f ${productName ? productName + " \u2014 " : ""}Renova\u00e7\u00e3o amanh\u00e3`
          : `\ud83d\udd14 ${productName ? productName + " \u2014 " : ""}Renova em ${window.days} dias`;

        await sendEmail({ to: buyerEmail, subject, html: tpl.html, tags: [{ name: "event", value: window.type }] });

        await recordEmailLog(s.user_id, window.type, s.id);
        windowSent++;
        totalSent++;

      } catch (e) {
        console.error(`[renewal-reminders] sub ${s.id}:`, getErrorMessage(e));
      }
    }

    results[`${window.days}d`] = windowSent;
  }

  return NextResponse.json({ ok: true, sent: totalSent, breakdown: results });
}

async function checkEmailLog(userId: string, type: string, refId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("email_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("type", type)
      .eq("ref_id", refId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

async function recordEmailLog(userId: string, type: string, refId: string): Promise<void> {
  try {
    await supabase.from("email_logs").insert({ user_id: userId, type, ref_id: refId });
  } catch {}
}
