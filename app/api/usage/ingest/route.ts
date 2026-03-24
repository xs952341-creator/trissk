// app/api/usage/ingest/route.ts
// Recebe eventos de uso do SaaS externo e os armazena por instância.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase = createAdminClient();

// Local types
interface ProductRow {
  id: string;
  vendor_id: string;
  name?: string;
  webhook_signing_secret?: string | null;
}

interface InstanceRow {
  id: string;
  user_id: string;
  status?: string | null;
}

interface EntitlementRow {
  status: string;
  ends_at?: string | null;
  product_tier_id?: string | null;
}

interface TierRow {
  limits?: Record<string, unknown> | null;
}

interface UsageEventRow {
  quantity?: number | null;
}

export async function POST(req: NextRequest) {
  // Rate limit por IP para mitigar abuso/ataque de ingestão
  const rl = await rateLimit(`usage_ingest:${getIP(req)}`, 120, 60_000);
  if (!rl.success) return failure("RATE_LIMIT", 429, "Too many requests");

  // Auth via x-api-key (webhook_signing_secret do produto)
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return failure("AUTH_REQUIRED", 401, "x-api-key header obrigatório");
  }

  // Anti-replay simples (opcional): rejeita request_id repetido
  const requestId = req.headers.get("x-request-id");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return failure("INVALID_JSON", 400, "JSON inválido");
  }

  const { external_id, product_id, event_type, quantity = 1, metadata = {} } = body;

  if (!external_id || !product_id || !event_type) {
    return failure("MISSING_FIELDS", 400, "external_id, product_id e event_type são obrigatórios");
  }

  // Validar API key contra webhook_signing_secret do produto
  const { data: productRaw, error: prodErr } = await supabase
    .from("saas_products")
    .select("id, vendor_id, name, webhook_signing_secret")
    .eq("id", product_id)
    .maybeSingle();

  const product = productRaw as unknown as ProductRow | null;

  if (prodErr || !product) {
    return failure("NOT_FOUND", 404, "Produto não encontrado");
  }

  if (!product.webhook_signing_secret || product.webhook_signing_secret !== apiKey) {
    return failure("INVALID_KEY", 401, "API key inválida");
  }

  // Anti-replay por produto (best-effort)
  if (requestId) {
    try {
      const { error: idempErr } = await supabase.from("api_request_ids").insert({
        provider: "usage",
        scope: String(product_id),
        request_id: requestId,
        created_at: new Date().toISOString(),
      } as Record<string, unknown>);
      if (idempErr?.code === "23505") {
        return failure("DUPLICATE", 409, "duplicate request");
      }
    } catch {
      // tabela opcional — ignora
    }
  }

  // Encontrar instância pelo external_id
  const { data: instanceRaw } = await supabase
    .from("saas_instances")
    .select("id, user_id, status")
    .eq("product_id", product_id)
    .eq("external_id", external_id)
    .maybeSingle();

  const instance = instanceRaw as unknown as InstanceRow | null;

  if (!instance) {
    return failure("NOT_FOUND", 404, "Instância não encontrada para este external_id");
  }

  // ── Entitlements enforcement (premium) ───────────────────────────────────
  // Fonte única: entitlements. Se não houver, bloqueia o registro de uso.
  const { data: entRaw } = await supabase
    .from("entitlements")
    .select("status, ends_at, product_tier_id")
    .eq("user_id", instance.user_id)
    .eq("product_id", product_id)
    .maybeSingle();

  const ent = entRaw as unknown as EntitlementRow | null;

  if (!ent || ent.status !== "active") {
    return failure("INVALID_ENTITLEMENT", 403, "Entitlement inválido");
  }
  if (ent.ends_at && new Date(ent.ends_at).getTime() < Date.now()) {
    return failure("EXPIRED_ENTITLEMENT", 403, "Entitlement expirado");
  }

  // Aplicar limites do tier (best-effort)
  try {
    if (ent.product_tier_id) {
      const { data: tierRaw } = await supabase
        .from("product_tiers")
        .select("limits")
        .eq("id", ent.product_tier_id)
        .maybeSingle();
      const tier = tierRaw as unknown as TierRow | null;
      const limits = tier?.limits ?? {};
      const apiLimit = Number(limits.api_calls_per_month ?? limits.monthly_usage ?? 0);
      if (apiLimit > 0) {
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        const { data: usageAgg } = await supabase
          .from("saas_usage_events")
          .select("quantity")
          .eq("product_id", product_id)
          .eq("user_id", instance.user_id)
          .gte("recorded_at", start.toISOString())
          .limit(20000);
        const used = (usageAgg ?? [] as UsageEventRow[]).reduce((acc: number, r: UsageEventRow) => acc + Number(r.quantity ?? 0), 0);
        const nextUsed = used + (Number(quantity) || 1);
        if (nextUsed > apiLimit) {
          return failure("QUOTA_EXCEEDED", 402, "quota exceeded");
        }
      }
    }
  } catch {
    // se alguma tabela/coluna não existir, não bloqueia
  }

  // Registrar evento de uso
  const { error: insertErr } = await supabase.from("saas_usage_events").insert({
    instance_id: instance.id,
    user_id: instance.user_id,
    product_id,
    event_type,
    quantity: Number(quantity) || 1,
    metadata,
    recorded_at: new Date().toISOString(),
  });

  if (insertErr) {
    console.error("[usage/ingest] insert error:", insertErr.message);
    return failure("INSERT_ERROR", 500, "Erro ao registrar evento");
  }

  // Atualizar contadores agregados na instância (best-effort)
  await supabase.rpc("increment_instance_usage", {
    p_instance_id: instance.id,
    p_quantity: Number(quantity) || 1,
  }).then(undefined, (e: unknown) => console.error("[usage/ingest]", getErrorMessage(e)));

  return success({ recorded: true });
}
