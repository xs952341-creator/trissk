// app/api/cron/saas-health-check/route.ts
// Verifica periodicamente se instâncias SaaS ativas ainda são válidas no sistema externo.
// Schedule: a cada 6h (vercel.json)
//
// Fluxo por instância:
//   1. Para cada saas_instance com status=active e external_id,
//      chama GET {health_check_url}?external_id={external_id}
//   2. Se resposta ok (2xx) → atualiza last_ping_at
//   3. Se 404 → marca instance como suspended + notifica vendor
//   4. Se erro de rede → incrementa ping_fail_count (após 3 falhas → suspended)
//   5. Registra resultado em saas_instance_health_logs

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import type { SaasInstanceWithProduct, SaasProductHealth } from "@/lib/types/database";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase = createAdminClient();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return failure("UNAUTHORIZED", 401, "Acesso negado.");
  }

  try {
    // Buscar instâncias ativas com external_id + health_check_url configurada no produto
    const { data: instances, error } = await supabase
      .from("saas_instances")
      .select(`
        id, user_id, product_id, external_id, ping_fail_count,
        saas_products ( id, vendor_id, name, health_check_url, provisioning_webhook_url )
      `)
      .eq("status", "active")
      .not("external_id", "is", null)
      .order("last_ping_at", { ascending: true, nullsFirst: true })
      .limit(100);

    if (error) {
      console.error("[health-check] query error:", getErrorMessage(error));
      return failure("DB_ERROR", 500, getErrorMessage(error));
    }

    if (!instances || instances.length === 0) {
      return success({ checked: 0, message: "Nenhuma instância ativa com external_id" });
    }

    let checked = 0, healthy = 0, suspended = 0, failed = 0;

    await Promise.allSettled(
      instances.map(async (inst: SaasInstanceWithProduct) => {
        checked++;
        const productRaw = inst.saas_products;
        const product: SaasProductHealth | null = Array.isArray(productRaw) ? productRaw[0] : productRaw;
        const healthUrl = product?.health_check_url ?? null;

        // Se não tem health_check_url, apenas atualiza last_ping_at como "unknown"
        if (!healthUrl) {
          await supabase
            .from("saas_instances")
            .update({ last_ping_at: new Date().toISOString() })
            .eq("id", String(inst.id ?? ""));
          healthy++;
          return;
        }

        const url = new URL(healthUrl);
        url.searchParams.set("external_id", String(inst.external_id ?? ""));
        url.searchParams.set("user_id", String(inst.user_id ?? ""));

        try {
          const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
              "x-playbook-event": "health.check",
              "x-playbook-instance-id": String(inst.id ?? ""),
            },
            signal: AbortSignal.timeout(8_000),
          });

          const now = new Date().toISOString();

          if (res.ok) {
            // Instância saudável
            await supabase
              .from("saas_instances")
              .update({ last_ping_at: now, ping_fail_count: 0 })
              .eq("id", String(inst.id ?? ""));

            await logHealthEvent(String(inst.id ?? ""), String(inst.user_id ?? ""), inst.product_id, "healthy", res.status, null);
            healthy++;

          } else if (res.status === 404) {
            // Instância não encontrada no SaaS externo — suspender
            await supabase
              .from("saas_instances")
              .update({
                status: "suspended",
                last_ping_at: now,
                updated_at: now,
              })
              .eq("id", String(inst.id ?? ""));

            await supabase
              .from("saas_access")
              .update({ active: false, revoked_at: now, revoke_reason: "health_check_404" })
              .eq("instance_id", inst.id);

            await logHealthEvent(String(inst.id ?? ""), String(inst.user_id ?? ""), inst.product_id, "not_found", res.status, "external_id não encontrado");

            // Notificar vendor
            if (product?.vendor_id) {
              await supabase.from("notifications").insert({
                user_id: product.vendor_id,
                type: "saas_instance_suspended",
                title: "⚠️ Instância SaaS suspensa",
                body: `Uma instância de ${product.name} não foi encontrada no sistema externo (external_id: ${inst.external_id}). Verifique sua integração.`,
                action_url: `/vendor`,
              });
            }

            suspended++;

          } else {
            // Outro erro HTTP — incrementar fail count
            const newFailCount = (inst.ping_fail_count ?? 0) + 1;
            const shouldSuspend = newFailCount >= 3;

            await supabase
              .from("saas_instances")
              .update({
                last_ping_at: now,
                ping_fail_count: newFailCount,
                ...(shouldSuspend ? { status: "suspended", updated_at: now } : {}),
              })
              .eq("id", String(inst.id ?? ""));

            await logHealthEvent(String(inst.id ?? ""), String(inst.user_id ?? ""), inst.product_id, "error", res.status, `HTTP ${res.status}`);

            if (shouldSuspend && product?.vendor_id) {
              await supabase.from("notifications").insert({
                user_id: product.vendor_id,
                type: "saas_instance_suspended",
                title: "⚠️ Instância SaaS com falhas repetidas",
                body: `${product.name}: instância ${inst.external_id} falhou 3 health checks consecutivos e foi suspensa.`,
                action_url: `/vendor`,
              });
            }

            failed++;
          }

        } catch (e: unknown) {
          // Erro de rede
          const newFailCount = (inst.ping_fail_count ?? 0) + 1;
          const shouldSuspend = newFailCount >= 3;

          await supabase
            .from("saas_instances")
            .update({
              last_ping_at: new Date().toISOString(),
              ping_fail_count: newFailCount,
              ...(shouldSuspend ? { status: "suspended", updated_at: new Date().toISOString() } : {}),
            })
            .eq("id", String(inst.id ?? ""));

          await logHealthEvent(String(inst.id ?? ""), String(inst.user_id ?? ""), inst.product_id, "error", null, getErrorMessage(e, "network_error"));
          failed++;
        }
      })
    );

    console.log(`[health-check] checked=${checked} healthy=${healthy} suspended=${suspended} failed=${failed}`);
    return success({ checked, healthy, suspended, failed });

  } catch (err: unknown) {
    console.error("[health-check] fatal:", getErrorMessage(err));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(err, "Erro interno."));
  }
}

async function logHealthEvent(
  instanceId: string,
  userId: string,
  productId: string | null,
  result: "healthy" | "not_found" | "error",
  httpStatus: number | null,
  errorMessage: string | null
) {
  await supabase.from("saas_instance_health_logs").insert({
    instance_id: instanceId,
    user_id: userId,
    product_id: productId,
    result,
    http_status: httpStatus,
    error_message: errorMessage,
  }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/saas-health-check]", getErrorMessage(e))); // best-effort: não quebra se tabela não existir
}
