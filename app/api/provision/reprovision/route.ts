// app/api/provision/reprovision/route.ts
// Re-provisiona um acesso manualmente: útil quando o webhook falhou ou o comprador
// solicitar acesso novamente. Verifica entitlement antes de disparar.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface ProfileRow {
  is_admin?: boolean;
}

interface EntitlementRow {
  id: string;
  status: string;
  product_tier_id: string;
}

interface TierRow {
  id: string;
  tier_name?: string;
  product_id?: string;
  saas_products?: {
    name?: string;
    provisioning_webhook_url?: string | null;
    magic_link_url?: string | null;
  } | {
    name?: string;
    provisioning_webhook_url?: string | null;
    magic_link_url?: string | null;
  }[];
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    user_id?: string;
    product_tier_id: string;
    invoice_id?: string;
  };
  const { user_id, product_tier_id, invoice_id } = body;

  if (!product_tier_id) {
    return failure("MISSING_TIER", 400, "product_tier_id é obrigatório");
  }

  // Determinar quem está re-provisionando
  const { data: callerProfileRaw } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.user.id)
    .maybeSingle();

  const callerProfile = callerProfileRaw as unknown as ProfileRow | null;
  const isAdmin = callerProfile?.is_admin === true;
  const targetUserId = isAdmin && user_id ? user_id : auth.user.id;

  // Verificar se o usuário tem entitlement ativo para este tier
  const { data: entitlementRaw } = await admin
    .from("entitlements")
    .select("id, status, product_tier_id")
    .eq("user_id", targetUserId)
    .eq("product_tier_id", product_tier_id)
    .eq("status", "active")
    .maybeSingle();

  const entitlement = entitlementRaw as unknown as EntitlementRow | null;

  if (!entitlement) {
    return failure("NO_ENTITLEMENT", 403, "Usuário não possui acesso ativo para este produto");
  }

  // Buscar dados do produto e do usuário
  const [tierRes, authUserRes] = await Promise.all([
    admin
      .from("product_tiers")
      .select("id, tier_name, product_id, saas_products(name, provisioning_webhook_url, magic_link_url)")
      .eq("id", product_tier_id)
      .maybeSingle(),
    admin.auth.admin.getUserById(targetUserId),
  ]);

  const tier = tierRes.data as unknown as TierRow | null;
  const targetUser = authUserRes.data.user;

  if (!tier) {
    return failure("NOT_FOUND", 404, "Tier não encontrado");
  }

  const saasProduct = Array.isArray(tier.saas_products) ? tier.saas_products[0] : tier.saas_products;
  const webhookUrl = saasProduct?.provisioning_webhook_url;
  if (!webhookUrl) {
    return failure("NO_WEBHOOK", 400, "Este produto não tem webhook configurado. Configure em Vendor > Produtos > Integração.");
  }

  const email = targetUser?.email ?? "";
  const name = (targetUser?.user_metadata as { full_name?: string })?.full_name ?? "";

  const payloadObj = {
    event: "user.provisioned",
    is_reprovision: true,
    buyer: { id: targetUserId, email, name },
    tier: { id: product_tier_id, name: tier.tier_name },
    product_id: tier.product_id,
    invoice_id: invoice_id ?? null,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadObj),
      signal: AbortSignal.timeout(10_000),
    });

    // Logar no delivery_events
    await admin.from("delivery_events").insert({
      user_id: targetUserId,
      product_id: tier.product_id ?? null,
      vendor_id: null,
      playbook_id: null,
      stripe_invoice_id: invoice_id ?? null,
      url: webhookUrl,
      status: res.ok ? "success" : "failed",
      http_status: res.status,
      error_message: res.ok ? null : `HTTP ${res.status} (re-provision manual)`,
    });

    if (res.ok) {
      return success({
        ok: true,
        message: "Acesso re-provisionado com sucesso",
        http_status: res.status,
        magic_link: saasProduct?.magic_link_url ?? null,
      });
    } else {
      return failure("WEBHOOK_ERROR", 502, `Webhook retornou HTTP ${res.status}`);
    }
  } catch (e: unknown) {
    await admin.from("delivery_events").insert({
      user_id: targetUserId,
      product_id: tier.product_id ?? null,
      vendor_id: null,
      playbook_id: null,
      stripe_invoice_id: invoice_id ?? null,
      url: webhookUrl,
      status: "failed",
      http_status: null,
      error_message: getErrorMessage(e, "fetch_failed (re-provision manual)"),
    });

    return failure("FETCH_ERROR", 500, getErrorMessage(e) ?? "Erro ao chamar webhook");
  }
}
