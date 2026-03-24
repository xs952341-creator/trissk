// app/api/workspace/accept/route.ts
// Aceita um convite de workspace e provisiona acesso ao produto.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdminClient();
const APP_URL = NEXT_PUBLIC_APP_URL || "";

// Local types
interface WorkspaceMember {
  id: string;
  subscription_id: string;
  owner_id: string;
  invited_email: string;
  invite_expires_at?: string | null;
  status: string;
  subscriptions?: {
    user_id: string;
    product_tier_id: string;
    status: string;
    product_tiers?: {
      product_id: string;
      tier_name?: string;
      saas_products?: {
        name?: string;
        provisioning_webhook_url?: string | null;
        magic_link_url?: string | null;
      };
    };
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(`${APP_URL}/login?error=invite_invalid`);
    }

    // Buscar convite
    const { data: memberRaw } = await admin
      .from("workspace_members")
      .select("id, subscription_id, owner_id, invited_email, invite_expires_at, status, subscriptions(user_id, product_tier_id, status, product_tiers(product_id, tier_name, saas_products(name, provisioning_webhook_url, magic_link_url)))")
      .eq("invite_token", token)
      .maybeSingle();

    const member = memberRaw as WorkspaceMember | null;

    if (!member) {
      return NextResponse.redirect(`${APP_URL}/login?error=invite_not_found`);
    }

    if (member.status === "active") {
      return NextResponse.redirect(`${APP_URL}/buyer?invite=already_accepted`);
    }

    if (member.invite_expires_at && new Date(member.invite_expires_at) < new Date()) {
      return NextResponse.redirect(`${APP_URL}/login?error=invite_expired`);
    }

    const sub = member.subscriptions;
    if (!sub || sub.status !== "active") {
      return NextResponse.redirect(`${APP_URL}/login?error=invite_subscription_inactive`);
    }

    const tier = sub.product_tiers;
    const productId = tier?.product_id ?? null;

    // Buscar ou criar usuário pelo email
    const { data: { users } } = await admin.auth.admin.listUsers();
    const existingUser = users.find((u) => u.email === member.invited_email);
    let memberId: string | null = existingUser?.id ?? null;

    // Se usuário não existe, criar conta (sem senha — precisará definir via magic link)
    if (!memberId) {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: member.invited_email,
        email_confirm: true,
        user_metadata: { workspace_invite: true, invited_by: member.owner_id },
      });
      if (createErr || !newUser?.user) {
        return NextResponse.redirect(`${APP_URL}/login?error=invite_create_user_failed`);
      }
      memberId = newUser.user.id;
    }

    // Marcar membro como ativo
    await admin
      .from("workspace_members")
      .update({
        status: "active",
        member_user_id: memberId,
        accepted_at: new Date().toISOString(),
        invite_token: null,
      })
      .eq("id", member.id);

    // Criar entitlement para o membro
    if (productId && sub.product_tier_id) {
      await admin.from("entitlements").upsert({
        user_id: memberId,
        product_id: productId,
        product_tier_id: sub.product_tier_id,
        status: "active",
        source_type: "workspace_invite",
        workspace_owner_id: member.owner_id,
      }, { onConflict: "user_id,product_id,product_tier_id,playbook_id" });
    }

    // Provisionar acesso via webhook (best-effort)
    const webhookUrl = tier?.saas_products?.provisioning_webhook_url;
    if (webhookUrl && memberId) {
      const { data: memberUser } = await admin.auth.admin.getUserById(memberId);
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "user.provisioned",
          is_team_member: true,
          buyer: {
            id: memberId,
            email: member.invited_email,
            name: (memberUser.user?.user_metadata as { full_name?: string })?.full_name ?? "",
          },
          workspace_owner_id: member.owner_id,
          tier: { id: sub.product_tier_id, name: tier?.tier_name ?? "" },
          product_id: productId,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8_000),
      }).then(undefined, (e: unknown) => console.error("[workspace/accept]", getErrorMessage(e)));
    }

    // Notificar owner do workspace
    await admin.from("notifications").insert({
      user_id: member.owner_id,
      type: "team_member_joined",
      title: "👥 Membro entrou no time!",
      body: `${member.invited_email} aceitou o convite e tem acesso ao produto.`,
      action_url: "/buyer",
    }).then(undefined, (e: unknown) => console.error("[workspace/accept]", getErrorMessage(e)));

    // Se usuário já existe, redireciona para buyer; senão, para configurar senha
    const redirectUrl = existingUser
      ? `${APP_URL}/buyer?invite=accepted`
      : `${APP_URL}/recuperar-senha?email=${encodeURIComponent(member.invited_email)}&invite=1`;

    return NextResponse.redirect(redirectUrl);
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
