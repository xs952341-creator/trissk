// lib/jobs/reconcile.ts
// Módulo compartilhado para lógica de reconciliação financeira
// Usado tanto pelo cron quanto pelo admin manual

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";

const supabase = createAdminClient();

export async function runReconcile() {
  const traceId = crypto.randomUUID();

  try {
    log.info("reconcile", "run.started", "Reconciliação iniciada", { traceId });

    // 1. Reconciliação de orders vs ledger
    const { data: orders } = await supabase
      .from("orders")
      .select("id, user_id, stripe_session_id, amount, status, created_at")
      .eq("status", "paid");

    if (!orders) {
      log.info("reconcile", "run.no_orders", "Nenhuma order encontrada para reconciliação", { traceId });
      return NextResponse.json({ 
        traceId,
        message: "Nenhuma order encontrada",
        orders_checked: 0,
        discrepancies: 0
      });
    }

    let discrepancies = 0;

    for (const order of orders) {
      const { data: ledgerEntries } = await supabase
        .from("financial_ledger")
        .select("id, amount, type")
        .eq("order_id", order.id);

      if (!ledgerEntries || ledgerEntries.length === 0) {
        // Order paga não tem ledger - criar entrada
        await supabase
          .from("financial_ledger")
          .insert({
            order_id: order.id,
            user_id: order.user_id,
            amount: order.amount,
            type: "order_payment",
            description: `Pagamento order ${order.id}`,
            created_at: order.created_at
          });

        discrepancies++;
        log.info("reconcile", "ledger.created", "Ledger criado para order", { 
          traceId, 
          orderId: order.id, 
          amount: order.amount 
        });
      }
    }

    // 2. Verifica affiliate_sales sem comissão no ledger
    const { data: affiliateSales } = await supabase
      .from("affiliate_sales")
      .select("id, affiliate_id, commission_amount, created_at")
      .eq("status", "paid");

    if (affiliateSales) {
      for (const sale of affiliateSales) {
        const { data: commissionLedger } = await supabase
          .from("financial_ledger")
          .select("id")
          .eq("affiliate_sale_id", sale.id)
          .eq("type", "affiliate_commission");

        if (!commissionLedger || commissionLedger.length === 0) {
          // Comissão paga não tem ledger - criar entrada
          await supabase
            .from("financial_ledger")
            .insert({
              affiliate_sale_id: sale.id,
              user_id: sale.affiliate_id,
              amount: sale.commission_amount,
              type: "affiliate_commission",
              description: `Comissão afiliado ${sale.id}`,
              created_at: sale.created_at
            });

          discrepancies++;
          log.info("reconcile", "ledger.affiliate_created", "Ledger criado para comissão afiliado", { 
            traceId, 
            saleId: sale.id, 
            amount: sale.commission_amount 
          });
        }
      }
    }

    // 3. Limpa structured_logs antigos
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const { error: cleanupError } = await supabase
      .from("structured_logs")
      .delete()
      .lt("created_at", cutoffDate.toISOString());

    if (cleanupError) {
      log.warn("reconcile", "cleanup.failed", "Erro ao limpar logs antigos", { 
        traceId, 
        error: cleanupError.message 
      });
    }

    // 4. Log do resultado
    await supabase
      .from("structured_logs")
      .insert({
        level: "info",
        message: "Reconciliação financeira concluída",
        context: {
          traceId,
          orders_checked: orders.length,
          discrepancies,
          affiliate_sales_checked: affiliateSales?.length || 0,
          cleanup_logs: !cleanupError
        },
        created_at: new Date().toISOString()
      });

    log.info("reconcile", "run.completed", "Reconciliação concluída com sucesso", { 
      traceId, 
      orders_checked: orders.length,
      discrepancies 
    });

    return NextResponse.json({
      traceId,
      message: "Reconciliação concluída",
      orders_reconciliation: {
        orders_checked: orders.length,
        discrepancies
      },
      affiliate_sales_reconciliation: {
        sales_checked: affiliateSales?.length || 0,
        discrepancies: 0 // já contamos acima
      }
    });

  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log.error("reconcile", "run.failed", "Erro na reconciliação", { 
      traceId, 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json({
      traceId,
      error: "Internal server error",
      message: errorMessage
    }, { status: 500 });
  }
}
