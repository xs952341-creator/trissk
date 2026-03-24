// app/api/vendor/webhooks/test/route.ts
// Envia um evento de teste para o endpoint de webhook do vendor.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signWebhookPayload, type WebhookEventType } from "@/lib/webhooks/outbound";
import crypto from "crypto";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { endpoint_id } = await req.json();
    if (!endpoint_id) return NextResponse.json({ error: "endpoint_id obrigatório" }, { status: 400 });

    const admin = createAdminClient();
    const { data: endpoint } = await admin
      .from("vendor_webhook_endpoints")
      .select("id, url, secret, is_active")
      .eq("id", endpoint_id)
      .eq("vendor_id", user.id)
      .single();

    if (!endpoint || !(endpoint as unknown as Record<string,unknown>).is_active) {
      return NextResponse.json({ error: "Endpoint não encontrado ou inativo" }, { status: 404 });
    }

    const testPayload = {
      id:          `evt_test_${crypto.randomBytes(8).toString("hex")}`,
      type:        "sale.created" as WebhookEventType,
      created_at:  new Date().toISOString(),
      api_version: "2024-01",
      data: {
        order_id:     "order_test_123",
        product_name: "Produto Teste",
        amount:       97.00,
        currency:     "BRL",
        buyer_email:  "comprador@teste.com",
        test_event:   true,
      },
    };

    const body      = JSON.stringify(testPayload);
    const signature = signWebhookPayload(body, (endpoint as unknown as Record<string,unknown>).secret as string);

    const start = Date.now();
    let responseStatus = 0;
    let responseBody   = "";

    try {
      const res = await fetch((endpoint as unknown as Record<string,unknown>).url as string, {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "X-Webhook-Signature": signature,
          "X-Playbook-Event":  testPayload.type,
          "User-Agent":        "PlaybookHub-Webhook/1.0",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = res.status;
      responseBody   = await res.text().catch(() => "");
    } catch (fetchErr: unknown) {
      return NextResponse.json({
        success:      false,
        error:        getErrorMessage(fetchErr),
        latency_ms:   Date.now() - start,
        endpoint_url: (endpoint as unknown as Record<string,unknown>).url as string,
      });
    }

    return NextResponse.json({
      success:        responseStatus >= 200 && responseStatus < 300,
      status_code:    responseStatus,
      response_body:  responseBody.slice(0, 500),
      latency_ms:     Date.now() - start,
      endpoint_url:   (endpoint as unknown as Record<string,unknown>).url as string,
      payload_sent:   testPayload,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? getErrorMessage(e) : "Internal Server Error" }, { status: 500 });
  }
}
