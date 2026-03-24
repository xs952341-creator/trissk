// app/api/vendor/instances/route.ts
// Lista instâncias SaaS do vendor (compradores), com external_id, status, last_event_at e uso.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface InstanceRow {
  instance_id: string;
  buyer_id: string;
  product_id: string;
  external_id?: string | null;
  external_email?: string | null;
  status?: string | null;
  last_event_at?: string | null;
  total_events?: number | null;
  last_ping_at?: string | null;
  ping_fail_count?: number | null;
  stripe_subscription_id?: string | null;
  stripe_subscription_item_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface UsageRow {
  instance_id: string;
  quantity?: number | null;
}

function parsePeriod(p: string | null) {
  if (!p) return 30;
  const m = /^([0-9]+)d$/i.exec(p.trim());
  if (m) return Math.min(365, Math.max(1, Number(m[1])));
  return 30;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const admin = createAdminClient();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return failure("UNAUTHORIZED", 401, "Não autenticado");

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const periodDays = parsePeriod(url.searchParams.get("period"));

    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    // Instâncias do vendor via view
    let q = admin
      .from("vendor_instances_overview")
      .select("instance_id,buyer_id,product_id,external_id,external_email,status,last_event_at,total_events,last_ping_at,ping_fail_count,stripe_subscription_id,stripe_subscription_item_id,created_at,updated_at")
      .eq("vendor_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (status) q = q.eq("status", status);

    const { data: instances, error } = await q;
    if (error) return failure("QUERY_ERROR", 500, getErrorMessage(error));

    const typedInstances = (instances ?? []) as unknown as InstanceRow[];
    const instanceIds = typedInstances.map((r) => r.instance_id);

    // Uso no período (best-effort)
    const usageByInstance: Record<string, number> = {};
    if (instanceIds.length > 0) {
      const { data: usage } = await admin
        .from("saas_usage_events")
        .select("instance_id, quantity")
        .in("instance_id", instanceIds)
        .gte("created_at", since);

      for (const row of (usage ?? []) as unknown as UsageRow[]) {
        const id = row.instance_id;
        const qty = Number(row.quantity ?? 0);
        usageByInstance[id] = (usageByInstance[id] ?? 0) + qty;
      }
    }

    return success({
      period_days: periodDays,
      since,
      items: typedInstances.map((r) => ({
        ...r,
        usage_period_qty: usageByInstance[r.instance_id] ?? 0,
      })),
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
