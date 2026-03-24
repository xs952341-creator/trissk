// app/api/webhooks/zapier-callback/route.ts
// Recebe confirmação do Zapier/Make após o provisionamento do usuário.
// O Zapier chama este endpoint como último step do Zap para confirmar
// que o usuário foi criado no SaaS externo.
//
// Payload esperado:
// {
//   "token": "zapier_webhook_token_do_produto",   // webhook_signing_secret como auth
//   "product_id": "uuid",
//   "user_email": "buyer@email.com",
//   "external_id": "id-no-saas-externo",          // ID do usuário criado
//   "status": "success" | "failed",
//   "message": "Usuário criado com sucesso",       // opcional
//   "access_url": "https://app.saas.com/login"    // opcional: URL de acesso específica
// }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = 'force-dynamic';

export const runtime = "nodejs";

const supabase = createAdminClient();

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { token, product_id, user_email, external_id, status, message, access_url } = body as {
    token?: string;
    product_id?: string;
    user_email?: string;
    external_id?: string;
    status?: string;
    message?: string;
    access_url?: string;
  };

  // Validar campos obrigatórios
  if (!token || !product_id || !user_email) {
    return NextResponse.json({ error: "token, product_id e user_email são obrigatórios" }, { status: 400 });
  }

  // Validar token contra webhook_signing_secret OU zapier_webhook_url do produto
  const { data: product } = await supabase
    .from("saas_products")
    .select("id, vendor_id, name, webhook_signing_secret, zapier_webhook_url")
    .eq("id", product_id)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // Auth: token deve ser o webhook_signing_secret do produto
  if (!product.webhook_signing_secret || product.webhook_signing_secret !== token) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  // Encontrar usuário pelo email
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const buyer = users.find((u) => u.email?.toLowerCase() === user_email.toLowerCase());

  if (!buyer) {
    return NextResponse.json({ error: `Usuário não encontrado: ${user_email}` }, { status: 404 });
  }

  const userId = buyer.id;
  const isSuccess = status === "success" || !status; // default para success se não informado

  // Atualizar saas_instance com external_id (se fornecido)
  if (external_id) {
    const { data: instance } = await supabase
      .from("saas_instances")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", product_id)
      .eq("status", "active")
      .maybeSingle();

    if (instance) {
      await supabase
        .from("saas_instances")
        .update({
          external_id,
          provisioned_at: new Date().toISOString(),
          status: isSuccess ? "active" : "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", instance.id);

      // Atualizar saas_access com access_url específica (se fornecida)
      if (access_url) {
        await supabase
          .from("saas_access")
          .update({ access_url })
          .eq("instance_id", instance.id)
          .eq("user_id", userId);
      }
    }
  }

  // Atualizar delivery_events correspondente
  await supabase
    .from("delivery_events")
    .update({
      status: isSuccess ? "success" : "failed",
      error_message: isSuccess ? null : (message ?? "Zapier callback: failed"),
    })
    .eq("user_id", userId)
    .eq("product_id", product_id)
    .eq("status", "failed") // só atualiza eventos ainda pendentes/falhos
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Notificar comprador que o acesso foi provisionado
  if (isSuccess) {
    const accessUrlFinal = access_url ?? null;
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "access_ready",
      title: "✅ Acesso liberado!",
      body: `Seu acesso a ${product.name} está pronto.${accessUrlFinal ? " Clique para acessar." : ""}`,
      action_url: accessUrlFinal ?? "/buyer/meus-acessos",
    }).then(undefined, (e: Record<string, unknown>) => console.error("[webhooks/zapier-callback]", getErrorMessage(e)));
  } else {
    // Notificar vendor de falha no Zapier
    if (product.vendor_id) {
      await supabase.from("notifications").insert({
        user_id: product.vendor_id,
        type: "zapier_provision_failed",
        title: "⚠️ Falha no provisionamento Zapier",
        body: `${user_email} não foi provisionado em ${product.name}. Mensagem: ${message ?? "sem detalhes"}`,
        action_url: "/vendor",
      }).then(undefined, (e: Record<string, unknown>) => console.error("[webhooks/zapier-callback]", getErrorMessage(e)));
    }
  }

  // Log estruturado
  console.log(`[zapier-callback] product=${product_id} email=${user_email} status=${status} external_id=${external_id ?? "none"}`);

  return NextResponse.json({
    ok: true,
    processed: true,
    user_id: userId,
    product_name: product.name,
  });
}
