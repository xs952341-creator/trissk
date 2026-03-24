// lib/jobs/fiscal.ts
// Módulo compartilhado para lógica de emissão fiscal
// Usado tanto pelo cron quanto pelo admin manual

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IS_PROD } from "@/lib/env";
import {
  CRON_SECRET,
  ENOTAS_API_KEY_PLATFORM,
  ENOTAS_COMPANY_ID_PLATFORM,
} from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";
import {
  ENOTAS_BASE_URL,
  ENOTAS_CODIGO_SERVICO,
  ENOTAS_DESCRICAO_SERVICO,
  ENOTAS_API_TIMEOUT_MS,
} from "@/lib/config";
import { log } from "@/lib/logger";

const supabase = createAdminClient();
const ENOTAS_BASE = ENOTAS_BASE_URL;
const CODIGO_SERVICO_SOFTWARE = ENOTAS_CODIGO_SERVICO;
const DESCRICAO_SERVICO = ENOTAS_DESCRICAO_SERVICO;

interface FiscalJob {
  id: string;
  order_id: string;
  vendor_id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface EnotasResponse {
  id: string;
  numero: string;
  status: string;
  pdf?: string;
  xml?: string;
}

export async function runFiscalJobs() {
  const traceId = crypto.randomUUID();

  try {
    log.info("fiscal", "run.started", "Emissão fiscal iniciada", { traceId });

    // 1. Buscar jobs pendentes
    const { data: jobs, error: jobsError } = await supabase
      .from("fiscal_notes")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10); // Processar em lotes

    if (jobsError) {
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      log.info("fiscal", "run.no_jobs", "Nenhum job fiscal pendente", { traceId });
      return NextResponse.json({
        traceId,
        message: "Nenhum job fiscal pendente",
        jobs_processed: 0,
        jobs_issued: 0,
        jobs_failed: 0
      });
    }

    let issued = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        // 2. Obter dados da order para emissão
        const { data: order } = await supabase
          .from("orders")
          .select("*, profiles!orders_user_id_fkey(email, full_name)")
          .eq("id", job.order_id)
          .single();

        if (!order) {
          throw new Error("Order não encontrada");
        }

        // 3. Obter dados do vendor
        const { data: vendor } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", job.vendor_id)
          .single();

        if (!vendor) {
          throw new Error("Vendor não encontrado");
        }

        // 4. Emitir nota fiscal via eNotas (simulação)
        const notaResponse = await emitNotaFiscal({
          orderId: job.order_id,
          amount: job.amount,
          customerEmail: order.profiles?.email || "",
          customerName: order.profiles?.full_name || "",
          vendorEmail: vendor.email,
          vendorName: vendor.full_name
        });

        // 5. Atualizar status do job
        await supabase
          .from("fiscal_notes")
          .update({
            number: notaResponse.numero,
            status: "issued",
            pdf_url: notaResponse.pdf,
            xml_url: notaResponse.xml,
            issued_at: new Date().toISOString()
          })
          .eq("id", job.id);

        issued++;
        log.info("fiscal", "note.issued", "Nota fiscal emitida com sucesso", {
          traceId,
          jobId: job.id,
          orderId: job.order_id,
          number: notaResponse.numero
        });

      } catch (error) {
        failed++;
        const errorMessage = getErrorMessage(error);
        
        // Atualizar status para erro
        await supabase
          .from("fiscal_notes")
          .update({
            status: "error",
            error_message: errorMessage
          })
          .eq("id", job.id);

        log.error("fiscal", "note.failed", "Erro ao emitir nota fiscal", {
          traceId,
          jobId: job.id,
          orderId: job.order_id,
          error: errorMessage
        });
      }
    }

    log.info("fiscal", "run.completed", "Emissão fiscal concluída", {
      traceId,
      jobs_processed: jobs.length,
      jobs_issued: issued,
      jobs_failed: failed
    });

    return NextResponse.json({
      traceId,
      message: "Emissão fiscal concluída",
      jobs_processed: jobs.length,
      jobs_issued: issued,
      jobs_failed: failed
    });

  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log.error("fiscal", "run.failed", "Erro na emissão fiscal", {
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

async function emitNotaFiscal(data: {
  orderId: string;
  amount: number;
  customerEmail: string;
  customerName: string;
  vendorEmail: string;
  vendorName: string;
}): Promise<EnotasResponse> {
  // Simulação de emissão via eNotas API
  // Em produção, aqui faria a chamada real para a API eNotas
  
  const numero = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  
  return {
    id: crypto.randomUUID(),
    numero,
    status: "issued",
    pdf: `https://notas.e-notas.com.br/pdf/${numero}`,
    xml: `https://notas.e-notas.com.br/xml/${numero}`
  };
}
