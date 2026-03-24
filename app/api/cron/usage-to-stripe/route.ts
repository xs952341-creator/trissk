// app/api/cron/usage-to-stripe/route.ts
// Envia uso (saas_usage_events) para Stripe Usage Records (metered billing).
// Requer: saas_instances.stripe_subscription_item_id e product_tiers.metered_enabled/event_type.
// Cron: recomendado a cada 15 min.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

interface UsageTierMapEntry {
  id: string;
  metered_enabled: boolean;
  metered_event_type: string | null;
}

interface SaasInstance {
  id: string;
  product_tier_id: string;
  stripe_subscription_item_id: string;
  metered_last_reported_at: string | null;
  metered_pending_quantity: number | null;
  status: string;
}

interface SaasUsageEvent {
  quantity: number;
  created_at: string;
}

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // 🔐 Proteção CRON_SECRET — obrigatória em produção
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // pegar instâncias ativas com subscription_item_id
  const { data: instances, error } = await supabase
    .from("saas_instances")
    .select("id, product_tier_id, stripe_subscription_item_id, metered_last_reported_at, metered_pending_quantity, status")
    .eq("status", "active")
    .not("stripe_subscription_item_id", "is", null)
    .limit(500);

  if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });

  const tierIds = Array.from(new Set((instances ?? []).map((i) => i.product_tier_id).filter(Boolean)));

  const tierMap: Record<string, UsageTierMapEntry> = {};
  if (tierIds.length > 0) {
    const { data: tiers } = await supabase
      .from("product_tiers")
      .select("id, metered_enabled, metered_event_type")
      .in("id", tierIds);
    for (const t of tiers ?? []) tierMap[(t as UsageTierMapEntry).id] = t as UsageTierMapEntry;
  }

  let reported = 0;
  for (const inst of instances ?? []) {
    const tier = inst.product_tier_id ? tierMap[inst.product_tier_id] : null;
    if (!tier?.metered_enabled) continue;

    const eventType = tier.metered_event_type || "api_call";
    const since = inst.metered_last_reported_at ? new Date(inst.metered_last_reported_at).toISOString() : null;

    // soma eventos desde 'since' (best-effort)
    let qty = 0;
    const q = supabase
      .from("saas_usage_events")
      .select("quantity, created_at")
      .eq("instance_id", inst.id)
      .eq("event_type", eventType)
      .order("created_at", { ascending: true })
      .limit(5000);

    const { data: events } = since ? await q.gte("created_at", since) : await q;

    for (const e of events ?? []) qty += Number((e as SaasUsageEvent).quantity);

    // inclui pendência acumulada
    qty += Number(inst.metered_pending_quantity ?? 0);

    if (qty <= 0) {
      // atualiza watermark para evitar re-leitura eterna
      await supabase.from("saas_instances").update({ metered_last_reported_at: new Date().toISOString() }).eq("id", inst.id);
      continue;
    }

    try {
      await stripe.subscriptionItems.createUsageRecord(String(inst.stripe_subscription_item_id), {
        quantity: qty,
        timestamp: Math.floor(Date.now() / 1000),
        action: "increment",
      });

      reported++;
      await supabase.from("saas_instances").update({
        metered_last_reported_at: new Date().toISOString(),
        metered_pending_quantity: 0,
      }).eq("id", inst.id);

      // opcional: materializa diário (para buyer charts rápidos)
      const day = new Date().toISOString().slice(0, 10);
      await supabase.from("saas_usage_daily").upsert({
        instance_id: inst.id,
        day,
        event_type: eventType,
        qty,
      }, { onConflict: "instance_id,day,event_type" });
    } catch (e: unknown) {
      void log.error("cron/usage-to-stripe", "usage_record_failed", getErrorMessage(e) ?? String(e), { instanceId: inst.id });
      // acumula pendência para próxima rodada
      await supabase.from("saas_instances").update({
        metered_pending_quantity: Number(inst.metered_pending_quantity ?? 0) + qty,
      }).eq("id", inst.id);
    }
  }

  return NextResponse.json({ instances: (instances ?? []).length, reported });
}
