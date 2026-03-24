// lib/provisioning.ts
// Provisionamento automático de instâncias SaaS com retry e status tracking.
// Suporta: webhook externo, API REST direta, magic link.
// Registra todos os eventos em provisioning_events para auditoria.

import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchProductWebhook } from "@/lib/webhooks/outbound";
import { validateWebhookUrl, SSRFError } from "@/lib/security/url-validator";
import { getErrorMessage } from "@/lib/errors";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ProvisionMethod = "webhook" | "api" | "manual" | "magic_link";

export interface ProvisionRequest {
  instanceId:    string;
  orderId:       string;
  userId:        string;
  productId:     string;
  vendorId:      string;
  buyerEmail:    string;
  buyerName?:    string;
  tierName:      string;
  licenseKey?:   string;
  metadata?:     Record<string, unknown>;
}

export interface ProvisionResult {
  success:    boolean;
  method:     ProvisionMethod;
  externalId?: string;
  accessUrl?:  string;
  error?:      string;
}

// ─── Principal: provisionamento automático ────────────────────────────────────

export async function provisionInstance(req: ProvisionRequest): Promise<ProvisionResult> {
  const admin = createAdminClient();

  // Buscar configuração do produto
  const { data: product } = await admin
    .from("saas_products")
    .select(
      "id, name, vendor_id, provisioning_webhook_url, magic_link_url, auto_provision, provision_api_url, provision_api_key_header, webhook_signing_secret"
    )
    .eq("id", req.productId)
    .maybeSingle();

  if (!product) {
    return logAndReturn(req, null, "api", false, undefined, undefined, "Produto não encontrado");
  }

  // 1. Auto-provision via API REST direta (mais confiável)
  if (product.auto_provision && product.provision_api_url) {
    return await provisionViaApi(req, product);
  }

  // 2. Webhook externo (Zapier/Make/N8N ou endpoint próprio)
  if (product.provisioning_webhook_url) {
    return await provisionViaWebhook(req, product);
  }

  // 3. Magic link (acesso direto, sem provisionamento ativo)
  if (product.magic_link_url) {
    await updateInstanceStatus(req.instanceId, "active", undefined);
    return {
      success:   true,
      method:    "magic_link",
      accessUrl: product.magic_link_url,
    };
  }

  // 4. Manual: notificar vendor
  await admin.from("notifications").insert({
    user_id:    product.vendor_id,
    type:       "provisioning_required",
    title:      "Provisionamento manual necessário",
    body:       `Novo acesso de ${req.buyerEmail} para ${product.name}. Configure o acesso manualmente.`,
    action_url: `/vendor/instances`,
  }).then(undefined, (e: unknown) => console.error("[provisioning]", getErrorMessage(e)));

  await updateInstanceStatus(req.instanceId, "pending_manual", undefined);
  return logAndReturn(req, product.vendor_id, "manual", true);
}

// ─── Via API REST ─────────────────────────────────────────────────────────────

interface ProductRecord {
  vendor_id: string;
  provision_api_url: string;
  provision_api_key_header?: string;
  provisioning_webhook_url: string;
  webhook_signing_secret?: string;
  revocation_webhook_url?: string;
  auto_provision?: boolean;
}

async function provisionViaApi(
  req: ProvisionRequest,
  product: ProductRecord
): Promise<ProvisionResult> {
  const payload = buildProvisionPayload(req);
  const start = Date.now();

  try {
    // 🔐 Proteção SSRF: bloqueia URLs internas configuradas por vendors
    try {
      validateWebhookUrl(product.provision_api_url, "provision_api");
    } catch (e: unknown) {
      console.error("[provisioning] SSRF blocked for provision_api_url:", getErrorMessage(e));
      return logAndReturn(req, null, "api", false, undefined, undefined, `URL bloqueada por segurança: ${e instanceof Error ? getErrorMessage(e) : String(e)}`);
    }

    const res = await fetch(product.provision_api_url, {
      method: "POST",
      headers: {
        "Content-Type":                                "application/json",
        [product.provision_api_key_header ?? "Authorization"]: product.webhook_signing_secret ?? "",
        "X-Provision-Source": "PlaybookHub",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch {}

    const success = res.status >= 200 && res.status < 300;
    const externalId = (json.external_id ?? json.user_id ?? json.id ?? undefined) as string | undefined;
    const accessUrl  = (json.access_url ?? json.login_url ?? undefined) as string | undefined;

    await logProvisioningEvent({
      instanceId:    req.instanceId,
      orderId:       req.orderId,
      userId:        req.userId,
      productId:     req.productId,
      eventType:     "provision",
      method:        "api",
      webhookUrl:    product.provision_api_url,
      httpStatus:    res.status,
      responseBody:  text.slice(0, 500),
      success,
      externalId,
      errorMessage:  success ? undefined : (String(json.error ?? `HTTP ${res.status}`)),
      nextRetryAt:   success ? null : getNextRetry(1),
    });

    if (success) {
      await updateInstanceStatus(req.instanceId, "active", externalId);
      await dispatchProductWebhook(req.productId, product.vendor_id, "instance.provisioned", {
        instance_id: req.instanceId,
        user_email:  req.buyerEmail,
        external_id: externalId,
      });
    }

    return {
      success,
      method:     "api",
      externalId,
      accessUrl,
      error:      success ? undefined : `HTTP ${res.status}`,
    };
  } catch (e: unknown) {
    await logProvisioningEvent({
      instanceId:   req.instanceId,
      orderId:      req.orderId,
      userId:       req.userId,
      productId:    req.productId,
      eventType:    "provision",
      method:       "api",
      webhookUrl:   product.provision_api_url,
      success:      false,
      errorMessage: getErrorMessage(e),
      nextRetryAt:  getNextRetry(1),
    });
    return { success: false, method: "api", error: e instanceof Error ? getErrorMessage(e) : String(e) };
  }
}

// ─── Via Webhook ──────────────────────────────────────────────────────────────

async function provisionViaWebhook(
  req: ProvisionRequest,
  product: ProductRecord
): Promise<ProvisionResult> {
  const payload = buildProvisionPayload(req);
  const secret = product.webhook_signing_secret ?? "";
  const body = JSON.stringify(payload);
  const signature = buildWebhookSignature(body, secret);

  try {
    // 🔐 Proteção SSRF: bloqueia URLs internas
    try {
      validateWebhookUrl(product.provisioning_webhook_url, "provision_webhook");
    } catch (e: unknown) {
      console.error("[provisioning] SSRF blocked for provisioning_webhook_url:", getErrorMessage(e));
      return logAndReturn(req, null, "webhook", false, undefined, undefined, `URL bloqueada por segurança: ${e instanceof Error ? getErrorMessage(e) : String(e)}`);
    }

    const res = await fetch(product.provisioning_webhook_url, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Hub-Signature":   signature,
        "X-Playbookhub-Sig": signature,
        "User-Agent":        "PlaybookHub/1.0",
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });

    const text = await res.text().catch(() => "");
    const success = res.status >= 200 && res.status < 300;

    await logProvisioningEvent({
      instanceId:   req.instanceId,
      orderId:      req.orderId,
      userId:       req.userId,
      productId:    req.productId,
      eventType:    "provision",
      method:       "webhook",
      webhookUrl:   product.provisioning_webhook_url,
      httpStatus:   res.status,
      responseBody: text.slice(0, 500),
      success,
      nextRetryAt:  success ? null : getNextRetry(1),
    });

    if (success) {
      await updateInstanceStatus(req.instanceId, "provisioning", undefined);
    }

    return { success, method: "webhook", error: success ? undefined : `HTTP ${res.status}` };
  } catch (e: unknown) {
    await logProvisioningEvent({
      instanceId:   req.instanceId,
      orderId:      req.orderId,
      userId:       req.userId,
      productId:    req.productId,
      eventType:    "provision",
      method:       "webhook",
      webhookUrl:   product.provisioning_webhook_url,
      success:      false,
      errorMessage: getErrorMessage(e),
      nextRetryAt:  getNextRetry(1),
    });
    return { success: false, method: "webhook", error: e instanceof Error ? getErrorMessage(e) : String(e) };
  }
}

// ─── Desprovisionamento ───────────────────────────────────────────────────────

export async function deprovisionInstance(
  instanceId: string,
  userId: string,
  productId: string,
  reason: "refund" | "chargeback" | "cancel" | "manual"
): Promise<ProvisionResult> {
  const admin = createAdminClient();

  const { data: product } = await admin
    .from("saas_products")
    .select("vendor_id, revocation_webhook_url, provisioning_webhook_url, webhook_signing_secret")
    .eq("id", productId)
    .maybeSingle();

  const revokeUrl =
    (product as ProductRecord | null)?.revocation_webhook_url ??
    (product as ProductRecord | null)?.provisioning_webhook_url;

  if (!revokeUrl) {
    await updateInstanceStatus(instanceId, "suspended", undefined);
    await logProvisioningEvent({
      instanceId, orderId: "", userId, productId,
      eventType: "deprovision", method: "manual", success: true,
    });
    return { success: true, method: "manual" };
  }

  const payload = {
    event:       "deprovision",
    instance_id: instanceId,
    user_id:     userId,
    product_id:  productId,
    reason,
    timestamp:   new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const sig = buildWebhookSignature(body, product?.webhook_signing_secret ?? "");

  try {
    const res = await fetch(revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Hub-Signature": sig,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const success = res.status >= 200 && res.status < 300;
    await updateInstanceStatus(instanceId, "suspended", undefined);

    if (product?.vendor_id) {
      await dispatchProductWebhook(productId, product.vendor_id, "instance.suspended", {
        instance_id: instanceId,
        reason,
      });
    }

    await logProvisioningEvent({
      instanceId, orderId: "", userId, productId,
      eventType: "deprovision", method: "webhook",
      webhookUrl: revokeUrl, httpStatus: res.status, success,
    });

    return { success, method: "webhook" };
  } catch (e: unknown) {
    await updateInstanceStatus(instanceId, "suspended", undefined);
    return { success: false, method: "webhook", error: e instanceof Error ? getErrorMessage(e) : String(e) };
  }
}

// ─── Retry de provisionamentos falhos (chamado pelo cron) ─────────────────────

export async function retryFailedProvisionings(): Promise<{ retried: number; succeeded: number }> {
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("provisioning_events")
    .select("instance_id, user_id, product_id, order_id, attempt_number")
    .eq("success", false)
    .eq("event_type", "provision")
    .lte("next_retry_at", new Date().toISOString())
    .not("next_retry_at", "is", null)
    .limit(20);

  if (!pending?.length) return { retried: 0, succeeded: 0 };

  let succeeded = 0;

  for (const event of pending) {
    const { data: instance } = await admin
      .from("saas_instances")
      .select("id, user_id, product_tier_id, product_tiers(product_id, tier_name, saas_products(vendor_id))")
      .eq("id", event.instance_id)
      .maybeSingle();

    if (!instance) continue;

    const { data: user } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", event.user_id)
      .maybeSingle();

    type TierData = { tier_name?: string; saas_products?: { vendor_id?: string } | null } | null;
    const tier = instance.product_tiers as unknown as TierData;
    const req: ProvisionRequest = {
      instanceId: instance.id,
      orderId:    event.order_id ?? "",
      userId:     event.user_id,
      productId:  event.product_id,
      vendorId:   tier?.saas_products?.vendor_id ?? "",
      buyerEmail: user?.email ?? "",
      buyerName:  user?.full_name ?? undefined,
      tierName:   tier?.tier_name ?? "",
    };

    const result = await provisionInstance(req);
    if (result.success) succeeded++;
  }

  return { retried: pending.length, succeeded };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProvisionPayload(req: ProvisionRequest) {
  return {
    event:        "provision",
    instance_id:  req.instanceId,
    order_id:     req.orderId,
    user_id:      req.userId,
    product_id:   req.productId,
    vendor_id:    req.vendorId,
    buyer_email:  req.buyerEmail,
    buyer_name:   req.buyerName ?? "",
    tier_name:    req.tierName,
    license_key:  req.licenseKey ?? null,
    metadata:     req.metadata ?? {},
    timestamp:    new Date().toISOString(),
  };
}

function buildWebhookSignature(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret || "no-secret").update(body).digest("hex");
}

function getNextRetry(attempt: number): string | null {
  const delays = [5 * 60_000, 30 * 60_000, 4 * 60 * 60_000]; // 5min, 30min, 4h
  if (attempt > delays.length) return null;
  return new Date(Date.now() + delays[attempt - 1]).toISOString();
}

async function updateInstanceStatus(
  instanceId: string,
  status: string,
  externalId: string | undefined
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("saas_instances")
    .update({
      status,
      ...(externalId ? { external_id: externalId } : {}),
    })
    .eq("id", instanceId);
}

async function logProvisioningEvent(opts: {
  instanceId:    string;
  orderId:       string;
  userId:        string;
  productId:     string;
  eventType:     string;
  method:        string;
  webhookUrl?:   string;
  httpStatus?:   number;
  responseBody?: string;
  success:       boolean;
  externalId?:   string;
  errorMessage?: string;
  nextRetryAt?:  string | null;
  attemptNumber?: number;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("provisioning_events").insert({
    instance_id:    opts.instanceId || null,
    order_id:       opts.orderId || null,
    user_id:        opts.userId,
    product_id:     opts.productId,
    event_type:     opts.eventType,
    method:         opts.method,
    webhook_url:    opts.webhookUrl ?? null,
    attempt_number: opts.attemptNumber ?? 1,
    http_status:    opts.httpStatus ?? null,
    response_body:  opts.responseBody ?? null,
    success:        opts.success,
    external_id:    opts.externalId ?? null,
    error_message:  opts.errorMessage ?? null,
    next_retry_at:  opts.nextRetryAt ?? null,
  }).then(undefined, (e: unknown) => console.error("[provisioning] log error:", getErrorMessage(e)));
}

async function logAndReturn(
  req: ProvisionRequest,
  _vendorId: string | null,
  method: ProvisionMethod,
  success: boolean,
  externalId?: string,
  accessUrl?: string,
  error?: string
): Promise<ProvisionResult> {
  await logProvisioningEvent({
    instanceId:   req.instanceId,
    orderId:      req.orderId,
    userId:       req.userId,
    productId:    req.productId,
    eventType:    "provision",
    method,
    success,
    externalId,
    errorMessage: error,
  });
  return { success, method, externalId, accessUrl, error };
}
