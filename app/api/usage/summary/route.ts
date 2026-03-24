// app/api/usage/summary/route.ts
// Retorna resumo de uso de uma instância SaaS para o comprador ou vendor.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdminClient();

// Local types
interface SaasProduct {
  name?: string;
  vendor_id: string;
}

interface InstanceRow {
  id: string;
  user_id: string;
  product_id: string;
  external_id?: string | null;
  total_events?: number | null;
  last_event_at?: string | null;
  saas_products?: SaasProduct | null;
}

interface UsageEvent {
  event_type: string;
  quantity?: number | null;
  recorded_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return failure("UNAUTHORIZED", 401, "Acesso negado");
    }

    const { searchParams } = req.nextUrl;
    const instanceId = searchParams.get("instance_id");
    const period = searchParams.get("period") ?? "30d";

    if (!instanceId) {
      return failure("MISSING_INSTANCE", 400, "instance_id é obrigatório");
    }

    // Verificar acesso: buyer (dono da instância) ou vendor (dono do produto)
    const { data: instanceRaw } = await admin
      .from("saas_instances")
      .select("id, user_id, product_id, external_id, total_events, last_event_at, saas_products(vendor_id, name)")
      .eq("id", instanceId)
      .maybeSingle();

    const instance = instanceRaw as unknown as InstanceRow | null;

    if (!instance) {
      return failure("NOT_FOUND", 404, "Instância não encontrada");
    }

    const isBuyer = instance.user_id === auth.user.id;
    const isVendor = instance.saas_products?.vendor_id === auth.user.id;

    if (!isBuyer && !isVendor) {
      return failure("FORBIDDEN", 403, "Acesso negado");
    }

    // Calcular período
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    // Buscar eventos do período
    const { data: events } = await admin
      .from("saas_usage_events")
      .select("event_type, quantity, recorded_at")
      .eq("instance_id", instanceId)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true });

    // Agregar por tipo
    const byType: Record<string, number> = {};
    let totalQuantity = 0;
    const dailyMap: Record<string, number> = {};

    for (const ev of (events ?? []) as UsageEvent[]) {
      const qty = Number(ev.quantity) || 1;
      byType[String(ev.event_type)] = (byType[String(ev.event_type)] ?? 0) + qty;
      totalQuantity += qty;

      const day = ev.recorded_at.slice(0, 10);
      dailyMap[day] = (dailyMap[day] ?? 0) + qty;
    }

    // Converter daily para array ordenada
    const dailyActivity = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return success({
      instance_id: instanceId,
      product_name: instance.saas_products?.name ?? "",
      external_id: instance.external_id,
      period_days: days,
      total_events: totalQuantity,
      all_time_events: instance.total_events ?? 0,
      last_event_at: instance.last_event_at ?? null,
      by_type: byType,
      daily_activity: dailyActivity,
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
