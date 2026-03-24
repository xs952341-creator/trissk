// app/api/vendor/webhooks-health/route.ts
// Painel de health de webhooks de entrega para o vendor.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface DeliveryEvent {
  id: string;
  created_at: string;
  status: string;
  url?: string | null;
  http_status?: number | null;
  error_message?: string | null;
  retry_count?: number | null;
  last_retried_at?: string | null;
  next_retry_at?: string | null;
  saas_products?: {
    id?: string;
    name?: string;
  } | {
    id?: string;
    name?: string;
  }[] | null;
}

interface EndpointStats {
  url: string;
  total: number;
  failed: number;
  lastError?: string;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

  const admin = createAdminClient();
  const vendorId = user.id;

  // Buscar delivery_events dos produtos do vendor (últimos 30 dias)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

  const { data: events, error } = await admin
    .from("delivery_events")
    .select(`
      id, created_at, status, url, http_status, error_message,
      retry_count, last_retried_at, next_retry_at,
      saas_products:product_id(id, name)
    `)
    .eq("vendor_id", vendorId)
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return failure("QUERY_ERROR", 500, getErrorMessage(error));

  const all = (events ?? []) as unknown as DeliveryEvent[];

  // Métricas agregadas
  const total = all.length;
  const successful = all.filter((e) => e.status === "success").length;
  const failed = all.filter((e) => e.status === "failed").length;
  const permFailed = all.filter((e) => e.status === "permanently_failed").length;
  const pendingRetry = all.filter((e) => e.status === "failed" && (e.retry_count ?? 0) < 5).length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;

  // Agrupar por URL de webhook para identificar endpoints problemáticos
  const byEndpoint: Record<string, EndpointStats> = {};
  for (const e of all) {
    const key = e.url ?? "unknown";
    if (!byEndpoint[key]) byEndpoint[key] = { url: key, total: 0, failed: 0 };
    byEndpoint[key].total++;
    if (e.status !== "success") {
      byEndpoint[key].failed++;
      if (e.error_message) byEndpoint[key].lastError = e.error_message;
    }
  }

  return success({
    metrics: { total, successful, failed, permFailed, pendingRetry, successRate },
    events: all.slice(0, 50),
    endpoints: Object.values(byEndpoint),
  });
}

// POST /api/vendor/webhooks-health  { eventId } → re-tenta manualmente um delivery
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

  const { eventId } = await req.json() as { eventId?: string };
  if (!eventId) return failure("MISSING_EVENT", 400, "eventId obrigatório");

  const admin = createAdminClient();

  // Verificar que o evento é do vendor
  const { data: ev } = await admin
    .from("delivery_events")
    .select("id, url, user_id, status, retry_count, vendor_id")
    .eq("id", eventId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!ev) return failure("NOT_FOUND", 404, "Evento não encontrado");
  if (ev.status === "success") return success({ ok: true, message: "Já foi entregue com sucesso" });

  // Re-tentar imediatamente
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(ev.user_id);
    const payload = {
      event: "user.provisioned",
      is_manual_retry: true,
      buyer: {
        id: ev.user_id,
        email: authUser.user?.email ?? "",
        name: (authUser.user?.user_metadata as { full_name?: string })?.full_name ?? "",
      },
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(String(ev.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const newStatus = res.ok ? "success" : "failed";
    await admin
      .from("delivery_events")
      .update({
        status: newStatus,
        http_status: res.status,
        error_message: res.ok ? null : `HTTP ${res.status}`,
        retry_count: (ev.retry_count ?? 0) + 1,
        last_retried_at: new Date().toISOString(),
        next_retry_at: null,
      })
      .eq("id", eventId);

    return success({ ok: res.ok, status: newStatus, httpStatus: res.status });
  } catch (e: unknown) {
    return failure("FETCH_ERROR", 500, getErrorMessage(e, "fetch_failed"));
  }
}
