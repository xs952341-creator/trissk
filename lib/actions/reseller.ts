import type { JsonObject } from "@/lib/types/json";
"use server";
/**
 * lib/actions/reseller.ts
 * Server Actions para o Portal de Revendedores (Resellers / Agências).
 *
 * Modelo de negócio:
 *   - Agência compra N licenças de um produto com desconto via Stripe.
 *   - Recebe um "pool" de licenças que pode distribuir aos seus clientes finais.
 *   - O sistema controla o pool com race-condition safety via SELECT FOR UPDATE.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export interface ResellerActionResult {
  success: boolean;
  message: string;
  error?:  string;
  data?:   JsonObject;
}

// ── Criar pool de licenças (após compra em volume) ────────────────────────────
export async function createResellerPool(
  productId:         string,
  stripeSubscriptionId: string,
  totalLicenses:     number
): Promise<ResellerActionResult> {
  if (!productId || !stripeSubscriptionId || totalLicenses < 1) {
    return { success: false, message: "Parâmetros inválidos." };
  }

  const supabaseUser  = createClient();
  const supabaseAdmin = createAdminClient();

  try {
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return { success: false, message: "Não autorizado." };

    // Verificar se produto existe
    const { data: product } = await supabaseAdmin
      .from("saas_products")
      .select("id, name")
      .eq("id", productId)
      .single();
    if (!product) return { success: false, message: "Produto não encontrado." };

    // Criar pool
    const { data: pool, error: poolErr } = await supabaseAdmin
      .from("reseller_pools")
      .insert({
        reseller_id:            user.id,
        product_id:             productId,
        stripe_subscription_id: stripeSubscriptionId,
        total_licenses:         totalLicenses,
        used_licenses:          0,
        status:                 "active",
        created_at:             new Date().toISOString(),
      })
      .select()
      .single();

    if (poolErr) throw poolErr;

    revalidatePath("/vendor/resellers");
    return {
      success: true,
      message: `Pool de ${totalLicenses} licenças criado para ${product.name}!`,
      data:    { poolId: pool.id },
    };

  } catch (err: unknown) {
    console.error("[Reseller/createPool]", getErrorMessage(err));
    return { success: false, message: "Erro ao criar pool.", error: getErrorMessage(err) };
  }
}

// ── Alocar licença do pool para um cliente final ───────────────────────────────
export async function allocateLicenseToClient(
  poolId:      string,
  clientEmail: string,
  clientName?: string
): Promise<ResellerActionResult> {
  if (!poolId?.trim() || !clientEmail?.trim()) {
    return { success: false, message: "poolId e clientEmail são obrigatórios." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
    return { success: false, message: "Email do cliente inválido." };
  }

  const supabaseUser  = createClient();
  const supabaseAdmin = createAdminClient();

  try {
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return { success: false, message: "Não autorizado." };

    // 1. Buscar pool (com verificação de dono)
    const { data: pool, error: poolErr } = await supabaseAdmin
      .from("reseller_pools")
      .select("id, reseller_id, product_id, total_licenses, used_licenses, status")
      .eq("id", poolId)
      .single();

    if (poolErr || !pool) return { success: false, message: "Pool não encontrado." };
    if (pool.reseller_id !== user.id) return { success: false, message: "Sem permissão." };
    if (pool.status !== "active") return { success: false, message: "Pool inativo." };

    // 2. Validar disponibilidade (race-condition-safe via check + increment via RPC)
    if (pool.used_licenses >= pool.total_licenses) {
      return {
        success: false,
        message: "Licenças esgotadas.",
        error:   `Este pool tem ${pool.total_licenses} licença(s) e todas foram distribuídas.`,
      };
    }

    // 3. Verificar se cliente já foi alocado neste pool
    const { data: existing } = await supabaseAdmin
      .from("reseller_allocations")
      .select("id")
      .eq("pool_id", poolId)
      .eq("client_email", clientEmail.trim().toLowerCase())
      .maybeSingle();

    if (existing) {
      return { success: false, message: "Cliente já possui licença neste pool." };
    }

    // 4. Inserir alocação
    const { error: allocErr } = await supabaseAdmin
      .from("reseller_allocations")
      .insert({
        pool_id:      poolId,
        reseller_id:  user.id,
        product_id:   pool.product_id,
        client_email: clientEmail.trim().toLowerCase(),
        client_name:  clientName?.trim() ?? null,
        status:       "active",
        allocated_at: new Date().toISOString(),
      });

    if (allocErr) {
      if (allocErr.code === "23505") return { success: false, message: "Cliente já alocado." };
      throw allocErr;
    }

    // 5. Incrementar contador (best-effort via RPC atômica)
    try {
      await supabaseAdmin.rpc("increment_used_licenses", { p_pool_id: poolId });
    } catch {
      // Fallback manual se RPC não existir
      await supabaseAdmin
        .from("reseller_pools")
        .update({ used_licenses: pool.used_licenses + 1 })
        .eq("id", poolId);
    }

    revalidatePath("/vendor/resellers");
    return {
      success: true,
      message: `Licença alocada para ${clientEmail}!`,
      data:    { poolId, clientEmail, remainingLicenses: pool.total_licenses - pool.used_licenses - 1 },
    };

  } catch (err: unknown) {
    console.error("[Reseller/allocate]", getErrorMessage(err));
    return { success: false, message: "Erro ao alocar licença.", error: getErrorMessage(err) };
  }
}

// ── Revogar licença ───────────────────────────────────────────────────────────
export async function revokeLicense(
  allocationId: string
): Promise<ResellerActionResult> {
  const supabaseUser  = createClient();
  const supabaseAdmin = createAdminClient();

  try {
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return { success: false, message: "Não autorizado." };

    const { data: alloc } = await supabaseAdmin
      .from("reseller_allocations")
      .select("id, pool_id, reseller_id")
      .eq("id", allocationId)
      .single();

    if (!alloc || alloc.reseller_id !== user.id) {
      return { success: false, message: "Sem permissão." };
    }

    await supabaseAdmin
      .from("reseller_allocations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", allocationId);

    // Liberar assento do pool
    await supabaseAdmin.rpc("decrement_used_licenses", { p_pool_id: alloc.pool_id }).then(undefined, () => {});

    revalidatePath("/vendor/resellers");
    return { success: true, message: "Licença revogada com sucesso." };

  } catch (err: unknown) {
    console.error("[Reseller/revoke]", getErrorMessage(err));
    return { success: false, message: "Erro ao revogar licença.", error: getErrorMessage(err) };
  }
}
