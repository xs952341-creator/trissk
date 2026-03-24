// app/api/vendor/test-webhook/route.ts
// Testa a URL de webhook configurada pelo vendor.
// Chamada por: vendor/page.tsx, admin/page.tsx
//
// POST /api/vendor/test-webhook
// Body: { webhookUrl?: string, productId?: string }
// Autenticação: Bearer token no header Authorization.
// SSRF: delegado completamente ao validateWebhookUrl (cobre IP privado, metadata cloud, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { validateWebhookUrl }        from "@/lib/security/url-validator";
import { rateLimit, getIP }          from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createAdminClient();

export async function POST(req: NextRequest) {
  // Rate limit: 10 tests/5min per IP
  const rl = await rateLimit(`test-wh:${getIP(req)}`, 10, 300_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit atingido." }, { status: 429 });
  }

  // Auth
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parse body
  let webhookUrl: string | undefined;
  let productId:  string | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    webhookUrl = body.webhookUrl as string | undefined;
    productId  = body.productId  as string | undefined;
  } catch { /* empty body */ }

  // Resolve URL from product if not provided directly
  let targetUrl = webhookUrl?.trim();
  if (!targetUrl && productId) {
    const { data: product } = await supabase
      .from("saas_products")
      .select("provisioning_webhook_url, zapier_webhook_url")
      .eq("id", productId)
      .eq("vendor_id", user.id)
      .single();
    targetUrl = (product as Record<string, string> | null)?.provisioning_webhook_url
              ?? (product as Record<string, string> | null)?.zapier_webhook_url;
  }

  if (!targetUrl) {
    return NextResponse.json(
      { success: false, error: "Nenhuma URL de webhook configurada." },
      { status: 400 }
    );
  }

  // SSRF protection — validateWebhookUrl already blocks:
  // private IPs (10.x, 192.168.x, 172.16-31.x, 127.x, ::1)
  // cloud metadata endpoints (169.254.169.254 etc.)
  // non-HTTPS in production
  try {
    validateWebhookUrl(targetUrl, "vendor/test-webhook");
  } catch (e: unknown) {
    const msg = getErrorMessage(e, "URL inválida");
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }

  const testPayload = {
    event:          "purchase.completed",
    test_mode:      true,
    customer_name:  "João Teste",
    customer_email: "teste@example.com",
    customer_id:    "test_user_000",
    product_name:   "Produto de Teste",
    tier_name:      "Plano Básico",
    invoice_id:     `test_inv_${Date.now()}`,
    timestamp:      new Date().toISOString(),
  };

  const startTime = Date.now();

  try {
    const res = await fetch(targetUrl, {
      method:  "POST",
      headers: {
        "Content-Type":     "application/json",
        "X-Playbook-Test":  "true",
        "User-Agent":       "PlaybookHub-Webhook/1.0",
      },
      body:   JSON.stringify(testPayload),
      signal: AbortSignal.timeout(8_000),
    });

    const latencyMs    = Date.now() - startTime;
    const responseText = (await res.text()).slice(0, 300);

    return NextResponse.json({
      success:    res.ok,
      statusCode: res.status,
      latencyMs,
      response:   responseText,
      webhookUrl: targetUrl,
    });
  } catch (e: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = getErrorMessage(e, "Timeout ou URL inacessível");
    return NextResponse.json({
      success:    false,
      statusCode: 0,
      latencyMs,
      error:      msg,
      webhookUrl: targetUrl,
    });
  }
}
