// app/api/cron/onboarding-emails/route.ts
// Dispara série de e-mails de onboarding pós-compra: dia 1, 3 e 7.
// Usa tabela onboarding_sequences para controle de envio (idempotência).
// Cron: diário às 11h (vercel.json)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRON_SECRET } from "@/lib/env-server";
import { sendEmail, emailOnboardingDay1, emailOnboardingDay3, emailOnboardingDay7 } from "@/lib/email";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import type { OrderWithProduct } from "@/lib/types/database";

// Helper para extrair produto de order (saas_products pode ser objeto ou array)
function extractProduct(order: OrderWithProduct): { id: string; name: string; slug: string | null } | null {
  const sp = order.saas_products;
  if (!sp) return null;
  if (Array.isArray(sp)) return sp[0] ?? null;
  return sp;
}

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();
const APP_URL  = NEXT_PUBLIC_APP_URL || "";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sent = 0;

  try {
    const now    = new Date();
    const day1   = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // ~24h atrás
    const day3   = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const day7   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // janela de 2h para não perder nem disparar duplicatas
    const window2h = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // ── Dia 1 ──────────────────────────────────────────────────────────────
    const { data: d1Orders } = await supabase
      .from("orders")
      .select(`
        id, user_id, created_at,
        saas_products:product_id (id, name, slug, magic_link_url, support_email)
      `)
      .gte("created_at", new Date(new Date(String(day1 ?? "")).getTime() - 2 * 60 * 60 * 1000).toISOString())
      .lte("created_at", day1)
      .eq("status", "paid");

    for (const order of d1Orders ?? []) {
      const seqKey = `d1:${order.id}`;
      const { data: exists } = await supabase
        .from("onboarding_sequences")
        .select("id").eq("key", seqKey).maybeSingle();
      if (exists) continue;

      const { data: authUser } = await supabase.auth.admin.getUserById(order.user_id);
      const email = authUser.user?.email ?? "";
      const name  = authUser.user?.user_metadata?.full_name ?? "";
      if (!email) continue;

      const product = extractProduct(order as OrderWithProduct);
      const accessUrl = product?.slug ? `${APP_URL}/membro/${product.slug}` : `${APP_URL}/dashboard`;

      const tpl = emailOnboardingDay1({ name, productName: product?.name, accessUrl });
      await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

      await supabase.from("onboarding_sequences").insert({ key: seqKey, user_id: order.user_id, sent_at: now.toISOString() });
      sent++;
    }

    // ── Dia 3 ──────────────────────────────────────────────────────────────
    const { data: d3Orders } = await supabase
      .from("orders")
      .select("id, user_id, created_at, saas_products:product_id (id, name, slug)")
      .gte("created_at", new Date(new Date(String(day3 ?? "")).getTime() - 2 * 60 * 60 * 1000).toISOString())
      .lte("created_at", day3)
      .eq("status", "paid");

    for (const order of d3Orders ?? []) {
      const seqKey = `d3:${order.id}`;
      const { data: exists } = await supabase
        .from("onboarding_sequences")
        .select("id").eq("key", seqKey).maybeSingle();
      if (exists) continue;

      const { data: authUser } = await supabase.auth.admin.getUserById(order.user_id);
      const email = authUser.user?.email ?? "";
      const name  = authUser.user?.user_metadata?.full_name ?? "";
      if (!email) continue;

      const product = extractProduct(order as OrderWithProduct);
      const accessUrl = product?.slug ? `${APP_URL}/membro/${product.slug}` : `${APP_URL}/dashboard`;

      const tpl = emailOnboardingDay3({
        name,
        productName: product?.name,
        accessUrl,
        tipTitle: "Explore todas as integrações",
        tipBody:  "Muitos usuários não sabem que é possível conectar mais de 10 ferramentas. Confira as opções no painel.",
      });
      await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
      await supabase.from("onboarding_sequences").insert({ key: seqKey, user_id: order.user_id, sent_at: now.toISOString() });
      sent++;
    }

    // ── Dia 7 ──────────────────────────────────────────────────────────────
    const { data: d7Orders } = await supabase
      .from("orders")
      .select("id, user_id, created_at, saas_products:product_id (id, name, slug)")
      .gte("created_at", new Date(new Date(String(day7 ?? "")).getTime() - 2 * 60 * 60 * 1000).toISOString())
      .lte("created_at", day7)
      .eq("status", "paid");

    for (const order of d7Orders ?? []) {
      const seqKey = `d7:${order.id}`;
      const { data: exists } = await supabase
        .from("onboarding_sequences")
        .select("id").eq("key", seqKey).maybeSingle();
      if (exists) continue;

      const { data: authUser } = await supabase.auth.admin.getUserById(order.user_id);
      const email = authUser.user?.email ?? "";
      const name  = authUser.user?.user_metadata?.full_name ?? "";
      if (!email) continue;

      const product = extractProduct(order as OrderWithProduct);
      const accessUrl  = product?.slug ? `${APP_URL}/membro/${product.slug}` : `${APP_URL}/dashboard`;
      const reviewUrl  = product?.slug ? `${APP_URL}/produtos/${product.slug}#reviews` : undefined;

      const tpl = emailOnboardingDay7({ name, productName: product?.name, accessUrl, reviewUrl });
      await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
      await supabase.from("onboarding_sequences").insert({ key: seqKey, user_id: order.user_id, sent_at: now.toISOString() });
      sent++;
    }

    console.log(`[onboarding-cron] sent=${sent}`);
    return NextResponse.json({ sent });

  } catch (err: unknown) {
    console.error("[onboarding-cron] Fatal:", err);
    return NextResponse.json({ error: getErrorMessage(err, "Internal Server Error") }, { status: 500 });
  }
}
