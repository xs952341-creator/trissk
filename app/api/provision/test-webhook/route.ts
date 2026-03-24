// app/api/provision/test-webhook/route.ts
// Permite que vendors testem seus webhooks de integração sem precisar fazer uma compra real.
// Envia um payload de teste e retorna o http_status da resposta.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac } from "crypto";
import { validateWebhookUrl } from "@/lib/security/url-validator";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { url, type, product_id, signing_secret } = body as {
    url: string;
    type: "provision" | "revoke";
    product_id: string;
    signing_secret?: string;
  };

  if (!url || !type || !product_id) {
    return NextResponse.json({ error: "url, type e product_id são obrigatórios" }, { status: 400 });
  }

  // 🔐 SSRF: bloqueia IPs internos/privados
  try {
    validateWebhookUrl(url, "provision/test-webhook");
  } catch (e: unknown) {
    return NextResponse.json({ error: `URL bloqueada por segurança: ${getErrorMessage(e)}` }, { status: 400 });
  }

  // Validar que o produto pertence ao vendor
  const { data: product } = await admin
    .from("saas_products")
    .select("id, vendor_id, name")
    .eq("id", product_id)
    .maybeSingle();

  if (!product || product.vendor_id !== auth.user.id) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // Montar payload de teste
  const payload =
    type === "provision"
      ? {
          event: "user.provisioned",
          is_test: true,
          buyer: {
            id: "test-user-00000000-0000-0000-0000-000000000000",
            email: auth.user.email ?? "test@example.com",
            name: "Comprador Teste",
          },
          tier: {
            id: "test-tier-00000000-0000-0000-0000-000000000000",
            name: "Plano Teste",
          },
          product_id,
          invoice_id: "in_test_xxxxxxxxxxxx",
          timestamp: new Date().toISOString(),
        }
      : {
          event: "user.revoked",
          is_test: true,
          reason: "subscription_canceled",
          buyer: {
            id: "test-user-00000000-0000-0000-0000-000000000000",
            email: auth.user.email ?? "test@example.com",
            name: "Comprador Teste",
          },
          timestamp: new Date().toISOString(),
        };

  const payloadStr = JSON.stringify(payload);

  // Montar headers com assinatura HMAC se signing_secret fornecido
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-playbook-event": type === "provision" ? "user.provisioned" : "user.revoked",
    "x-playbook-test": "1",
  };

  if (signing_secret) {
    const sig = createHmac("sha256", signing_secret).update(payloadStr).digest("hex");
    headers["x-playbook-signature"] = `sha256=${sig}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payloadStr,
      signal: AbortSignal.timeout(10_000),
    });

    return NextResponse.json({
      ok: res.ok,
      http_status: res.status,
      message: res.ok ? "Webhook respondeu com sucesso" : `Erro HTTP ${res.status}`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) ?? "Erro de conexão ao testar webhook" },
      { status: 200 } // 200 para o frontend tratar como "testado mas falhou"
    );
  }
}
