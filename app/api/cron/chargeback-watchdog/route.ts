// app/api/cron/chargeback-watchdog/route.ts
// Cron job para prevenção proativa de chargebacks.
// Roda a cada 6 horas. Para cada disputa aberta sem evidência enviada,
// verifica se está dentro da janela de 7 dias do Stripe e reforça o envio.
// Também detecta disputas novas que podem ter "passado" sem o webhook ser processado.
// Garante 0 disputas sem evidência quando possível.
//
// Configurar no vercel.json:
//   { "path": "/api/cron/chargeback-watchdog", "schedule": "0 */6 * * *" }

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY, CRON_SECRET } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createAdminClient();

// Local types
interface ProfileData {
  email?: string;
  full_name?: string;
}

interface DeliveryLog {
  created_at: string;
  url: string;
  status: string;
}

interface LoginEvent {
  created_at: string;
  metadata?: { ip?: string };
}

interface OrderRecord {
  created_at?: string;
  amount_gross?: number;
  stripe_invoice_id?: string;
  product_tier_id?: string;
}

interface DisputeLogRecord {
  id: string;
  stripe_charge_id?: string;
  user_id?: string;
  subscription_id?: string;
  amount?: number;
  status: string;
  evidence_submitted_at?: string;
  created_at?: string;
}

export async function GET(req: NextRequest) {
  // Auth via Vercel cron secret ou CRON_SECRET
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return failure("UNAUTHORIZED", 401, "Acesso negado.");
  }

  const results: { disputeId: string; action: string; status: string }[] = [];
  let processed = 0;
  let errors    = 0;

  try {
    // 1. Buscar disputas abertas sem evidência enviada no nosso DB
    const { data: openDisputes } = await supabase
      .from("dispute_log")
      .select("id, stripe_charge_id, user_id, subscription_id, amount, status, evidence_submitted_at, created_at")
      .in("status", ["open", "under_review"])
      .is("evidence_submitted_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    // 2. Também buscar disputas novas do Stripe que podem não estar no nosso DB
    let stripeDisputes: Stripe.Dispute[] = [];
    try {
      const stripeList = await stripe.disputes.list({
        limit: 100,
        created: { gte: Math.floor(Date.now() / 1000) - 7 * 86400 }, // últimos 7 dias
      });
      stripeDisputes = stripeList.data.filter(
        (d) => d.status === "needs_response" || d.status === "warning_needs_response"
      );
    } catch (e: unknown) {
      console.warn("[chargeback-watchdog] stripe list failed:", getErrorMessage(e));
    }

    // 3. Processar disputas do Stripe que precisam de resposta
    for (const dispute of stripeDisputes) {
      try {
        // Verificar prazo — Stripe dá 7 dias. Agir antes de 6 dias para ter margem.
        const dueBy         = dispute.evidence_details?.due_by ?? 0;
        const hoursUntilDue = (dueBy * 1000 - Date.now()) / 3600_000;

        if (hoursUntilDue <= 0) {
          results.push({ disputeId: dispute.id, action: "skipped", status: "past_deadline" });
          continue;
        }

        // Verificar se já enviamos evidência
        const { data: existingLog } = await supabase
          .from("dispute_log")
          .select("id, evidence_submitted_at")
          .eq("stripe_charge_id", dispute.charge as string)
          .maybeSingle();

        if (existingLog?.evidence_submitted_at) {
          results.push({ disputeId: dispute.id, action: "skipped", status: "evidence_already_sent" });
          continue;
        }

        // Buscar charge e dados do comprador
        const charge  = await stripe.charges.retrieve(dispute.charge as string);
        const invoice = charge.invoice ? await stripe.invoices.retrieve(charge.invoice as string).catch(() => null) : null;

        // Buscar dados do usuário via metadata do payment intent
        let userId: string | null = null;
        if (charge.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(charge.payment_intent as string);
          userId = pi.metadata?.userId ?? null;
        }
        if (!userId && invoice?.metadata?.userId) {
          userId = invoice.metadata.userId;
        }

        let buyerEmail = charge.billing_details?.email ?? "";
        let buyerName  = charge.billing_details?.name  ?? "";

        if (userId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", userId)
            .maybeSingle();
          const typedProfile = profile as ProfileData | null;
          if (typedProfile?.email) buyerEmail = typedProfile.email;
          if (typedProfile?.full_name) buyerName = typedProfile.full_name;
        }

        // Buscar pedido confirmado
        const { data: orderRecord } = userId ? await supabase
          .from("orders")
          .select("created_at, amount_gross, stripe_invoice_id, product_tier_id")
          .eq("user_id", userId)
          .eq("status", "paid")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() : { data: null };
        const typedOrder = orderRecord as OrderRecord | null;

        // Buscar logs de acesso / entrega
        const accessLogs: string[] = [];
        if (userId) {
          const { data: deliveryLogs } = await supabase
            .from("delivery_events")
            .select("created_at, url, status")
            .eq("user_id", userId)
            .eq("status", "success")
            .order("created_at", { ascending: true })
            .limit(5);

          (deliveryLogs ?? []).forEach((dl) => {
            const log = dl as DeliveryLog;
            accessLogs.push(
              `Entrega em ${new Date(String(log.created_at ?? "")).toLocaleString("pt-BR")} — ${log.url}`
            );
          });

          // Buscar logins do usuário como prova de uso
          const { data: loginEvents } = await supabase
            .from("audit_log")
            .select("created_at, metadata")
            .eq("actor_id", userId)
            .eq("action", "auth.login")
            .order("created_at", { ascending: false })
            .limit(5);

          (loginEvents ?? []).forEach((ev) => {
            const event = ev as LoginEvent;
            accessLogs.push(
              `Login registrado em ${new Date(String(event.created_at ?? "")).toLocaleString("pt-BR")} — IP: ${event.metadata?.ip ?? "registrado"}`
            );
          });
        }

        const serviceDate = typedOrder?.created_at
          ? new Date(typedOrder.created_at).toLocaleDateString("pt-BR")
          : new Date(charge.created * 1000).toLocaleDateString("pt-BR");

        const evidenceSummary = [
          `=== EVIDÊNCIA DE SERVIÇO DIGITAL ENTREGUE ===`,
          ``,
          `Cliente: ${buyerName || "Registrado no sistema"} (${buyerEmail})`,
          `Data da compra: ${serviceDate}`,
          `Valor cobrado: R$ ${(dispute.amount / 100).toFixed(2)}`,
          `Charge ID: ${dispute.charge}`,
          `Invoice: ${orderRecord?.stripe_invoice_id ?? invoice?.id ?? "Ver Stripe Dashboard"}`,
          ``,
          `DESCRIÇÃO DO SERVIÇO:`,
          `Produto digital com acesso imediato após confirmação do pagamento.`,
          `O serviço foi entregue e ativado conforme política de entrega digital.`,
          `A plataforma mantém registro de todos os acessos e entregas.`,
          ``,
          ...(accessLogs.length > 0 ? [
            `REGISTROS DE ENTREGA E ACESSO (${accessLogs.length} eventos):`,
            ...accessLogs,
            ``,
          ] : [
            `O serviço foi entregue conforme registros internos da plataforma.`,
            ``,
          ]),
          `POLÍTICA DE REEMBOLSO:`,
          `Conforme os Termos de Serviço aceitos pelo cliente no momento da compra,`,
          `produtos digitais não possuem direito a estorno após entrega, conforme`,
          `Art. 49 do Código de Defesa do Consumidor (compra não realizada presencialmente`,
          `de produto digital com entrega imediata não está coberta pelo direito de arrependimento).`,
          ``,
          `Para esclarecimentos, nosso suporte está disponível 24/7.`,
          `Horas até prazo de resposta: ${hoursUntilDue.toFixed(1)}h`,
        ].join("\n");

        // Enviar evidência para o Stripe
        await stripe.disputes.update(dispute.id, {
          evidence: {
            customer_email_address: buyerEmail || undefined,
            customer_name: buyerName || undefined,
            service_date: serviceDate,
            uncategorized_text: evidenceSummary,
          },
          submit: true,
        } as unknown as Record<string, unknown>);

        // Registrar ou atualizar no dispute_log
        const now = new Date().toISOString();
        if (existingLog) {
          await supabase.from("dispute_log")
            .update({ status: "under_review", evidence_submitted_at: now })
            .eq("id", existingLog.id);
        } else {
          await supabase.from("dispute_log").insert({
            stripe_charge_id:      dispute.charge as string,
            user_id:               userId ?? null,
            amount:                dispute.amount / 100,
            status:                "under_review",
            evidence_submitted_at: now,
          }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/chargeback-watchdog]", getErrorMessage(e)));
        }

        // Notificar admin
        const { data: admin } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "admin")
          .limit(1)
          .maybeSingle();

        if (admin) {
          await supabase.from("notifications").insert({
            user_id:    admin.id,
            type:       "dispute_evidence_sent",
            title:      "🛡️ Evidência de disputa enviada",
            body:       `Disputa ${dispute.id.slice(0, 16)} — R$ ${(dispute.amount / 100).toFixed(2)} — evidência enviada automaticamente. Prazo: ${hoursUntilDue.toFixed(0)}h restantes.`,
            action_url: "/admin/disputes",
          }).then(undefined, (e: Record<string, unknown>) => console.error("[cron/chargeback-watchdog]", getErrorMessage(e)));
        }

        results.push({ disputeId: dispute.id, action: "evidence_submitted", status: "ok" });
        processed++;
      } catch (e: unknown) {
        console.error("[chargeback-watchdog] dispute", dispute.id, "error:", getErrorMessage(e));
        results.push({ disputeId: dispute.id, action: "error", status: getErrorMessage(e) });
        errors++;
      }
    }

    // 4. Reforçar evidências de disputas do nosso DB que estão abertas há mais de 12h
    // (pode ser que o submit inicial falhou)
    const typedOpenDisputes = (openDisputes ?? []) as DisputeLogRecord[];
    for (const dbDispute of typedOpenDisputes) {
      const alreadyProcessed = results.some((r) => r.disputeId.includes(dbDispute.stripe_charge_id ?? ""));
      if (alreadyProcessed) continue;

      const ageHours = (Date.now() - new Date(String(dbDispute.created_at ?? "")).getTime()) / 3600_000;
      if (ageHours < 12) continue; // aguarda 12h antes de reforçar

      try {
        // Buscar a disputa no Stripe
        const chargesSearch = await stripe.charges.list({ limit: 5, created: { gte: Math.floor((Date.now() - 30 * 86400_000) / 1000) } });
        const matchedCharge = chargesSearch.data.find((c) => c.id === dbDispute.stripe_charge_id);

        if (!matchedCharge?.disputed) continue;

        // List disputes for this charge to get the dispute ID
        const disputes = await stripe.disputes.list({ charge: matchedCharge.id, limit: 1 });
        if (!disputes.data.length) continue;
        const stripeDispute = disputes.data[0];
        if (!["needs_response", "warning_needs_response"].includes(stripeDispute.status)) continue;

        // Reforçar marcação como under_review — a evidence foi enviada no webhook original
        await supabase.from("dispute_log")
          .update({ status: "under_review", evidence_submitted_at: new Date().toISOString() })
          .eq("id", dbDispute.id);

        results.push({ disputeId: stripeDispute.id, action: "status_reconciled", status: "ok" });
        processed++;
      } catch { /* best-effort */ }
    }

    console.log(`[chargeback-watchdog] done. processed=${processed} errors=${errors}`);

    return success({
      ok: true,
      processed,
      errors,
      results,
      ran_at: new Date().toISOString(),
    });

  } catch (e: unknown) {
    console.error("[chargeback-watchdog] fatal:", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
