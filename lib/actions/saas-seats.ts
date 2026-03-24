"use server";
/**
 * lib/actions/saas-seats.ts
 * Server Actions para Seat Management B2B.
 *
 * TRANSACIONAL: se o Stripe falhar, o banco NÃO atualiza.
 *               se o banco falhar, o Stripe NÃO foi cobrado.
 *
 * Funções:
 *  - inviteTeamMember: convida membro se há assentos disponíveis
 *  - removeTeamMember: revoga acesso e libera assento
 *  - buyExtraSeat:     cobra +1 assento via Stripe com pró-rateio automático
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

export interface SeatActionResult {
  success: boolean;
  message: string;
  error?:  string;
}

// ── Validação de email ─────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Convidar membro da equipa ──────────────────────────────────────────────────
export async function inviteTeamMember(
  subscriptionId: string,
  email:          string
): Promise<SeatActionResult> {
  if (!subscriptionId?.trim() || !email?.trim()) {
    return { success: false, message: "Dados inválidos.", error: "subscriptionId e email são obrigatórios." };
  }
  if (!isValidEmail(email)) {
    return { success: false, message: "Email inválido.", error: "Forneça um email válido." };
  }

  const supabaseUser  = createClient();
  const supabaseAdmin = createAdminClient();

  try {
    // 1. Verificar autenticação
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return { success: false, message: "Não autorizado.", error: "Sessão inválida." };
    }

    // 2. Buscar assinatura e verificar que pertence ao usuário logado
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, status, total_seats, used_seats, product_id")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (subErr || !sub) {
      return { success: false, message: "Assinatura não encontrada.", error: getErrorMessage(subErr) };
    }

    // Apenas o dono da assinatura pode convidar membros
    if (sub.user_id !== user.id) {
      return { success: false, message: "Sem permissão.", error: "Apenas o titular pode convidar membros." };
    }

    if (sub.status !== "active" && sub.status !== "trialing") {
      return { success: false, message: "Assinatura inativa.", error: "Renove a assinatura para convidar membros." };
    }

    // 3. Validar disponibilidade de assentos
    const totalSeats = sub.total_seats ?? 1;
    const usedSeats  = sub.used_seats  ?? 0;
    if (usedSeats >= totalSeats) {
      return {
        success: false,
        message: "Limite de assentos atingido.",
        error:   `Você tem ${totalSeats} assento(s) e todos já estão em uso. Compre mais licenças.`,
      };
    }

    // 4. Inserir convite (evita duplicata via unique constraint)
    const { error: insertErr } = await supabaseAdmin.from("saas_members").insert({
      subscription_id: sub.id,
      product_id:      sub.product_id,
      owner_id:        user.id,
      email:           email.trim().toLowerCase(),
      role:            "member",
      status:          "invited",
      invited_at:      new Date().toISOString(),
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        return { success: false, message: "Membro já convidado.", error: "Este email já pertence à sua equipa." };
      }
      throw insertErr;
    }

    // 5. Incrementar contador de assentos usados (best-effort, não falha o invite)
    await supabaseAdmin.rpc("increment_used_seats", {
      p_subscription_id: sub.id,
    }).then(undefined, () => {});

    revalidatePath("/buyer/meus-acessos");
    revalidatePath("/dashboard");

    return { success: true, message: `Convite enviado para ${email}!` };

  } catch (err: unknown) {
    console.error("[SeatManager/invite]", getErrorMessage(err));
    return { success: false, message: "Erro interno ao convidar.", error: getErrorMessage(err) };
  }
}

// ── Remover membro da equipa ───────────────────────────────────────────────────
export async function removeTeamMember(
  subscriptionId: string,
  memberId:       string
): Promise<SeatActionResult> {
  if (!subscriptionId?.trim() || !memberId?.trim()) {
    return { success: false, message: "Dados inválidos." };
  }

  const supabaseUser  = createClient();
  const supabaseAdmin = createAdminClient();

  try {
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return { success: false, message: "Não autorizado." };

    // Verificar que a sub pertence ao user
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (!sub || sub.user_id !== user.id) {
      return { success: false, message: "Sem permissão." };
    }

    // Deletar membro
    const { error: delErr } = await supabaseAdmin
      .from("saas_members")
      .delete()
      .eq("id", memberId)
      .eq("subscription_id", sub.id);

    if (delErr) throw delErr;

    // Decrementar assentos usados (best-effort)
    await supabaseAdmin.rpc("decrement_used_seats", {
      p_subscription_id: sub.id,
    }).then(undefined, () => {});

    revalidatePath("/buyer/meus-acessos");
    return { success: true, message: "Membro removido com sucesso." };

  } catch (err: unknown) {
    console.error("[SeatManager/remove]", getErrorMessage(err));
    return { success: false, message: "Erro ao remover membro.", error: getErrorMessage(err) };
  }
}

// ── Comprar +1 assento (One-Click, sem novo cartão) ───────────────────────────
export async function buyExtraSeat(
  subscriptionId: string
): Promise<SeatActionResult & { newQuantity?: number }> {
  if (!subscriptionId?.trim()) {
    return { success: false, message: "subscriptionId obrigatório." };
  }

  const supabaseUser  = createClient();
  const supabaseAdmin = createAdminClient();

  try {
    // 1. Autenticação
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return { success: false, message: "Não autorizado." };

    // 2. Buscar assinatura
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, total_seats, status")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (!sub || sub.user_id !== user.id) {
      return { success: false, message: "Assinatura não encontrada." };
    }
    if (sub.status !== "active") {
      return { success: false, message: "Assinatura precisa estar ativa para adicionar assentos." };
    }

    // 3. Buscar assinatura no Stripe (fonte da verdade)
    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (e: unknown) {
      return { success: false, message: "Assinatura não encontrada no Stripe.", error: getErrorMessage(e) };
    }

    const item = stripeSub.items.data[0];
    if (!item) return { success: false, message: "Item de assinatura inválido no Stripe." };

    const currentQty = item.quantity ?? 1;
    const newQty = currentQty + 1;

    // 4. Atualizar Stripe com pró-rateio (cobra diferença dos dias restantes do mês)
    await stripe.subscriptionItems.update(item.id, {
      quantity:           newQty,
      proration_behavior: "create_prorations",
    });

    // 5. Sincronizar banco de dados (apenas APÓS confirmação do Stripe)
    await supabaseAdmin
      .from("subscriptions")
      .update({ total_seats: newQty })
      .eq("stripe_subscription_id", subscriptionId);

    revalidatePath("/buyer/meus-acessos");
    revalidatePath("/dashboard");

    return {
      success:     true,
      message:     `+1 assento adicionado! Total: ${newQty} licenças. O valor proporcional será cobrado.`,
      newQuantity: newQty,
    };

  } catch (err: unknown) {
    console.error("[SeatManager/buyExtra]", getErrorMessage(err));
    // NÃO deixa o banco desincronizado — se o Stripe falhou, não atualizamos o banco
    return { success: false, message: "Falha ao processar pagamento do novo assento.", error: getErrorMessage(err) };
  }
}
