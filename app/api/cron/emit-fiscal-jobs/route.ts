// app/api/cron/emit-fiscal-jobs/route.ts
// Chamar via Vercel Cron (vercel.json: "crons": [{"path": "/api/cron/emit-fiscal-jobs", "schedule": "0 9 * * *"}])
// Também pode ser chamado manualmente para testes
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IS_PROD } from "@/lib/env";
import {
  CRON_SECRET,
  ENOTAS_API_KEY_PLATFORM,
  ENOTAS_COMPANY_ID_PLATFORM,
  verifyCronAuth,
} from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";
import {
  ENOTAS_BASE_URL,
  ENOTAS_CODIGO_SERVICO,
  ENOTAS_DESCRICAO_SERVICO,
  ENOTAS_API_TIMEOUT_MS,
} from "@/lib/config";
import { success, failure } from "@/lib/api/responses";

const supabase = createAdminClient();

const ENOTAS_BASE = ENOTAS_BASE_URL;

// Código de serviço padrão para "Licenciamento de Software" (LC 116/2003)
const CODIGO_SERVICO_SOFTWARE = ENOTAS_CODIGO_SERVICO;
const DESCRICAO_SERVICO = ENOTAS_DESCRICAO_SERVICO;

// Local types
interface FiscalJob {
  id: string;
  invoice_id: string;
  buyer_email: string;
  vendor_id: string;
  amount_gross: number;
  platform_fee: number;
  emit_after: string;
  status: string;
  profiles?: VendorProfile | null;
}

interface VendorProfile {
  enotas_api_key?: string;
  enotas_company_id?: string;
  email?: string;
  full_name?: string;
  cnpj?: string;
  razao_social?: string;
  inscricao_municipal?: string;
  fiscal_mode?: string;
}

interface TaxConfig {
  enabled?: boolean;
  cbs_rate?: number;
  ibs_rate?: number;
  nbs_code?: string;
  ibscbs_cst?: string;
  ind_op?: string;
}

 export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return success({ disabled: true, reason: "CRON_SECRET not set" });
  }
  if (!ENOTAS_API_KEY_PLATFORM || !ENOTAS_COMPANY_ID_PLATFORM) {
    return success({ disabled: true, reason: "eNotas platform keys not set" });
  }

  // Protect cron endpoint usando helper centralizado
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return failure("UNAUTHORIZED", 401, "Acesso negado.");
  }

  // Find all pending jobs ready to emit
  const { data: jobs, error } = await supabase
    .from("fiscal_jobs")
    .select(`
      id, invoice_id, buyer_email, vendor_id,
      amount_gross, platform_fee, emit_after, status,
      profiles!vendor_id (
        enotas_api_key, enotas_company_id, email,
        full_name, cnpj, razao_social, inscricao_municipal, fiscal_mode
      )
    `)
    .eq("status", "PENDING")
    .lte("emit_after", new Date().toISOString())
    .limit(50);

  if (error) {
    return failure("DB_ERROR", 500, getErrorMessage(error));
  }

  const results: Array<{ jobId: string; success: boolean; error?: string }> = [];

  for (const job of (jobs ?? []) as FiscalJob[]) {
    try {
      const vendor = job.profiles;
      const vendorAmount = Number(job.amount_gross) - Number(job.platform_fee);
      const fiscalMode: string = String(vendor?.fiscal_mode ?? "self"); // default legado = "self"

      // ── Ação A: NF do Vendor para o Comprador ───────────────────────────────
      // Emite se: fiscal_mode = "self" (vendor tem própria conta eNotas)
      //        ou fiscal_mode = "platform" (plataforma emite em nome do vendor)
      if (fiscalMode === "self" && vendor?.enotas_api_key && vendor?.enotas_company_id) {
        await emitirNFSe({
          apiKey:    String(vendor.enotas_api_key ?? ""),
          companyId: String(vendor.enotas_company_id ?? ""),
          idExterno: `vendor_${job.invoice_id}`,
          tomador: {
            email: String(job.buyer_email ?? ""),
            nome:  String(job.buyer_email ?? "").split("@")[0],
          },
          servico: {
            codigo:        CODIGO_SERVICO_SOFTWARE,
            discriminacao: `Licenciamento de Software — Fatura ${job.invoice_id}`,
            valorServico:  vendorAmount,
          },
        });
      } else if (fiscalMode === "platform" && ENOTAS_API_KEY_PLATFORM && ENOTAS_COMPANY_ID_PLATFORM) {
        // Plataforma emite em nome do vendor, mas com os dados do vendor como prestador
        // A plataforma assume aqui como intermediador fiscal
        await emitirNFSe({
          apiKey:    ENOTAS_API_KEY_PLATFORM,
          companyId: ENOTAS_COMPANY_ID_PLATFORM,
          idExterno: `vendor_platform_${job.invoice_id}`,
          tomador: {
            email:   job.buyer_email,
            nome:    String(job.buyer_email ?? "").split("@")[0],
          },
          servico: {
            codigo:        CODIGO_SERVICO_SOFTWARE,
            discriminacao: `Licenciamento de Software por ${vendor?.razao_social ?? vendor?.full_name ?? "Vendor"} — Fatura ${job.invoice_id}`,
            valorServico:  vendorAmount,
          },
        });
      }
      // fiscal_mode = "none" → vendor declarou que emite por conta própria / isento

      // ── Ação B: NF da Plataforma para o Vendor (SEMPRE — pela comissão) ──
      if (ENOTAS_API_KEY_PLATFORM && ENOTAS_COMPANY_ID_PLATFORM && Number(job.platform_fee) > 0) {
        await emitirNFSe({
          apiKey:    ENOTAS_API_KEY_PLATFORM,
          companyId: ENOTAS_COMPANY_ID_PLATFORM,
          idExterno: `platform_${job.invoice_id}`,
          tomador: {
            email:   String(vendor?.email ?? ""),
            nome:    String(vendor?.razao_social ?? vendor?.full_name ?? ""),
            cpfCnpj: String(vendor?.cnpj ?? ""),
          },
          servico: {
            codigo:        CODIGO_SERVICO_SOFTWARE,
            discriminacao: `Intermediação Tecnológica — Comissão de ${Number(job.platform_fee).toFixed(2)} BRL — Fatura ${job.invoice_id}`,
            valorServico:  Number(job.platform_fee ?? 0),
          },
        });
      }

      // Mark job as EMITTED
      await supabase.from("fiscal_jobs")
        .update({ status: "EMITTED", emitted_at: new Date().toISOString() })
        .eq("id", job.id);

      results.push({ jobId: String(job.id), success: true });
    } catch (e: unknown) {
      console.error(`[fiscal-cron] job ${job.id} failed:`, getErrorMessage(e));
      results.push({ jobId: String(job.id), success: false, error: getErrorMessage(e) });
    }
  }

  return success({
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed:    results.filter((r) => !r.success).length,
    results,
  });
}

// ── eNotas NFSe Emission Helper ───────────────────────────────────────────────

export const dynamic = 'force-dynamic';
interface NfsePayload {
  apiKey:    string;
  companyId: string;
  idExterno: string;
  tomador: {
    nome?:   string;
    email?:  string;
    cpfCnpj?: string;
    endereco?: {
      logradouro?: string; numero?: string; bairro?: string;
      cidade?: string; uf?: string; cep?: string;
    };
  };
  servico: {
    codigo:        string;
    discriminacao: string;
    valorServico:  number;
  };
}

async function emitirNFSe({ apiKey, companyId, idExterno, tomador, servico }: NfsePayload) {
  const payload: Record<string, unknown> = {
    idExterno,
    dataCompetencia: new Date().toISOString().split("T")[0],
    tomador: {
      nome:    tomador.nome ?? "Não identificado",
      email:   tomador.email ?? "",
      ...(tomador.cpfCnpj ? { cpfCnpj: tomador.cpfCnpj.replace(/\D/g, "") } : {}),
      endereco: tomador.endereco ?? {},
    },
    servico: {
      codigo:       servico.codigo,
      discriminacao: servico.discriminacao,
      valorServico:  servico.valorServico,
      issRetido:    false,
    },
    ambiente: IS_PROD ? "producao" : "homologacao",
  };

  // ── Reforma Tributária do Consumo (RTC) — CBS/IBS 2026 (best-effort) ─────
  // A Receita Federal orienta emissão com destaque de CBS e IBS a partir de 01/01/2026.
  // (campos e regras variam por provedor/município; aqui é opcional e não quebra emissão)
  try {
    const { data: cfg } = await supabase
      .from("tax_rtc_configs")
      .select("enabled, cbs_rate, ibs_rate, nbs_code, ibscbs_cst, ind_op")
      .eq("scope", "platform")
      .limit(1)
      .maybeSingle();

    if (cfg?.enabled) {
      const cbsRate = Number(cfg.cbs_rate ?? 0.009);
      const ibsRate = Number(cfg.ibs_rate ?? 0.001);
      const base = Number(servico.valorServico ?? 0);
      const cbsValor = Math.round(base * cbsRate * 100) / 100;
      const ibsValor = Math.round(base * ibsRate * 100) / 100;

      // Campos genéricos (alguns provedores usam estes nomes ou equivalentes)
      payload.servico = {
        ...(payload.servico as Record<string,unknown>),
        ...(cfg.nbs_code ? { codigoNbs: cfg.nbs_code } : {}),
        ...(cfg.ibscbs_cst ? { cstIBSCBS: cfg.ibscbs_cst } : {}),
        ...(cfg.ind_op ? { indOpIBSCBS: cfg.ind_op } : {}),
        rtc: {
          cbs: { aliquota: cbsRate, valor: cbsValor },
          ibs: { aliquota: ibsRate, valor: ibsValor },
        },
      };
    }
  } catch {
    // se não existir tabela/config, não faz nada
  }

  let res = await fetch(`${ENOTAS_BASE}/empresas/${companyId}/nfse`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key":      apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ENOTAS_API_TIMEOUT_MS),
  });

  // Se o provedor rejeitar campos RTC desconhecidos, faz retry limpando rtc.
  if (!res.ok) {
    const txt = await res.text();
    const maybeUnknown = /campo|field|propriedade|property|json/i.test(txt) && /rtc|IBS|CBS|Nbs|IBSCBS/i.test(txt);
    if (maybeUnknown) {
      const payload2 = JSON.parse(JSON.stringify(payload));
      if (payload2?.servico?.rtc) delete payload2.servico.rtc;
      if (payload2?.servico?.codigoNbs) delete payload2.servico.codigoNbs;
      if (payload2?.servico?.cstIBSCBS) delete payload2.servico.cstIBSCBS;
      if (payload2?.servico?.indOpIBSCBS) delete payload2.servico.indOpIBSCBS;
      res = await fetch(`${ENOTAS_BASE}/empresas/${companyId}/nfse`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key":      apiKey,
        },
        body: JSON.stringify(payload2),
        signal: AbortSignal.timeout(ENOTAS_API_TIMEOUT_MS),
      });
    } else {
      // restore text for final error below
      (res as unknown as Record<string,unknown>)._cached_text = txt;
    }
  }

  if (!res.ok) {
    const err = (res as unknown as Record<string,unknown>)._cached_text ?? (await res.text());
    throw new Error(`eNotas API error ${res.status}: ${String(err).slice(0, 200)}`);
  }

  return res.json();
}
