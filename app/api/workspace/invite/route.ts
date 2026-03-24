// app/api/workspace/invite/route.ts
// Convida um membro ao workspace do comprador.

import { z } from "zod";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { success, failure } from "@/lib/api/responses";
import { parseRequestBody } from "@/lib/api/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdminClient();
const APP_URL = NEXT_PUBLIC_APP_URL || "";

// Local types
interface ProductTier {
  tier_name?: string;
  max_team_members?: number;
  saas_products?: {
    name?: string;
    provisioning_webhook_url?: string | null;
  };
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  status: string;
  product_tier_id: string;
  product_tiers?: ProductTier;
}

const InviteSchema = z.object({
  invited_email: z.string().email(),
  subscription_id: z.string().uuid(),
});

type InvitePayload = z.infer<typeof InviteSchema>;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return failure("UNAUTHORIZED", 401, "Acesso negado.");
  }

  const parsed = await parseRequestBody<InvitePayload>(req, InviteSchema);
  if (!parsed.success) {
    return failure("INVALID_PAYLOAD", 400, parsed.message);
  }

  const { invited_email, subscription_id } = parsed.data;

  // Verificar que a assinatura pertence ao usuário e está ativa
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, status, product_tier_id, product_tiers(tier_name, max_team_members, saas_products(name, provisioning_webhook_url))")
    .eq("id", subscription_id)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!sub) {
    return failure("NOT_FOUND", 404, "Assinatura não encontrada ou inativa");
  }

  const typedSub = sub as SubscriptionRow;
  const tier = typedSub.product_tiers;
  const maxMembers = tier?.max_team_members ?? 1;

  // Verificar limite de membros
  const { count: existingCount } = await admin
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscription_id)
    .not("status", "eq", "removed");

  if ((existingCount ?? 0) >= maxMembers) {
    return failure("LIMIT_EXCEEDED", 400, `Limite de ${maxMembers} membro(s) atingido para este plano. Faça upgrade para adicionar mais.`);
  }

  // Verificar se já foi convidado
  const { data: existing } = await admin
    .from("workspace_members")
    .select("id, status")
    .eq("subscription_id", subscription_id)
    .eq("invited_email", invited_email.toLowerCase().trim())
    .maybeSingle();

  if (existing && existing.status !== "removed") {
    return failure("ALREADY_INVITED", 400, "Este email já foi convidado");
  }

  // Gerar token de convite
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString(); // 7 dias

  const { data: member, error: insertErr } = await admin
    .from("workspace_members")
    .upsert({
      subscription_id,
      owner_id: auth.user.id,
      invited_email: invited_email.toLowerCase().trim(),
      invited_by: auth.user.id,
      invite_token: token,
      invite_expires_at: expiresAt,
      status: "pending",
    }, { onConflict: "subscription_id,invited_email" })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    return failure("INSERT_ERROR", 500, "Erro ao criar convite");
  }

  // Enviar email de convite
  const inviteUrl = `${APP_URL}/api/workspace/accept?token=${token}`;
  const ownerName = auth.user.user_metadata?.full_name ?? auth.user.email ?? "Alguém";
  const productName = tier?.saas_products?.name ?? "um produto";

  const emailHtml = `
    <div style="font-family:ui-sans-serif,system-ui;background:#09090b;padding:32px;color:#e4e4e7">
      <div style="max-width:520px;margin:0 auto;border:1px solid #27272a;border-radius:16px;overflow:hidden;background:#0b0b0f">
        <div style="padding:20px 22px;border-bottom:1px solid #27272a">
          <div style="font-weight:700;letter-spacing:-0.02em">Playbook<span style="color:#34d399">.</span></div>
        </div>
        <div style="padding:22px">
          <div style="font-size:18px;font-weight:700;margin-bottom:12px">Você foi convidado 🎉</div>
          <div style="font-size:14px;color:#a1a1aa;line-height:1.6;margin-bottom:20px">
            <b style="color:#e4e4e7">${ownerName}</b> convidou você para acessar <b style="color:#e4e4e7">${productName}</b>.
            Clique no botão abaixo para aceitar o convite e ganhar acesso.
          </div>
          <a href="${inviteUrl}" style="display:inline-block;background:#34d399;color:#052e1a;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px">
            Aceitar Convite
          </a>
          <div style="margin-top:16px;font-size:12px;color:#71717a">
            Este convite expira em 7 dias. Se você não esperava este convite, ignore este email.
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: invited_email,
      subject: `${ownerName} convidou você para ${productName}`,
      html: emailHtml,
    });
  } catch { /* email não é crítico */ }

  return success({ ok: true, member_id: member?.id, invite_sent: true });
}
