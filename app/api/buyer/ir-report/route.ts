// app/api/buyer/ir-report/route.ts
// Relatório anual de compras para o Buyer — usado na declaração de IR (IRPF)
// Retorna HTML estilizado com tabela de pagamentos + window.print() automático.
// O usuário abre em nova aba → Ctrl+P → Salvar como PDF.

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { failure } from "@/lib/api/responses";

export const runtime = "nodejs";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(String(iso ?? "")).toLocaleDateString("pt-BR");
}

// Local types
interface VendorInfo {
  full_name?: string;
  cnpj?: string;
}

interface ProductInfo {
  name?: string;
  slug?: string;
  logo_url?: string;
}

interface TierInfo {
  tier_name?: string;
  price_monthly?: number;
  id?: string;
}

interface OrderRow {
  id: string;
  amount_gross: number;
  currency: string;
  created_at: string;
  stripe_invoice_id?: string | null;
  product_id?: string;
  saas_products?: ProductInfo | ProductInfo[] | null;
  product_tiers?: TierInfo | TierInfo[] | null;
  vendors?: VendorInfo | VendorInfo[] | null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const adminSupabase = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const year = req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear() - 1);
    const yearNum = parseInt(year);

    // Dados do buyer
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("full_name, email, cpf")
      .eq("id", user.id)
      .single();

    // Buscar pedidos pagos do ano
    const { data: orders } = await adminSupabase
      .from("orders")
      .select(`
        id, amount_gross, currency, created_at, stripe_invoice_id, product_id,
        saas_products:product_id (name, vendor_id),
        product_tiers:product_tier_id (tier_name),
        vendors:vendor_id (full_name, cnpj, email)
      `)
      .eq("user_id", user.id)
      .eq("status", "paid")
      .gte("created_at", `${yearNum}-01-01`)
      .lt("created_at", `${yearNum + 1}-01-01`)
      .order("created_at", { ascending: true });

    const rows = (orders ?? []) as OrderRow[];
    const total = rows.reduce((s, r) => s + Number(r.amount_gross ?? 0), 0);

    // Helpers para extrair dados
    function getProductName(r: OrderRow): string {
      const sp = r.saas_products;
      const pt = r.product_tiers;
      if (Array.isArray(sp)) return sp[0]?.name ?? "Produto";
      if (sp?.name) return sp.name;
      if (Array.isArray(pt)) return pt[0]?.tier_name ?? "Produto";
      return pt?.tier_name ?? "Produto";
    }

    function getVendorName(r: OrderRow): string {
      const v = r.vendors;
      if (Array.isArray(v)) return v[0]?.full_name ?? "Plataforma";
      return v?.full_name ?? "Plataforma";
    }

    function getVendorCnpj(r: OrderRow): string {
      const v = r.vendors;
      if (Array.isArray(v)) return v[0]?.cnpj ?? "";
      return v?.cnpj ?? "";
    }

    // Agrupar por vendor/produto para o resumo
    const byProduct: Record<string, { name: string; vendor: string; cnpj: string; total: number; count: number }> = {};
    rows.forEach((r) => {
      const pName = getProductName(r);
      const vName = getVendorName(r);
      const vCnpj = getVendorCnpj(r);
      const key = r.product_id ?? pName;
      if (!byProduct[key]) byProduct[key] = { name: pName, vendor: vName, cnpj: vCnpj, total: 0, count: 0 };
      byProduct[key].total += Number(r.amount_gross ?? 0);
      byProduct[key].count += 1;
    });

    const productRows = Object.values(byProduct);
  
    // Gerar HTML do relatório
    const reportDate = new Date().toLocaleDateString("pt-BR");
    const buyerName  = profile?.full_name ?? user.email ?? "Usuário";
    const buyerCpf   = profile?.cpf ? profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "Não informado";
  
    const html = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relatório IRPF ${year} — Playbook Hub</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; padding: 32px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
      .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
      .logo span { color: #059669; }
      .header-right { text-align: right; font-size: 11px; color: #555; }
      h1 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
      .section { margin-bottom: 24px; }
      .section-title { font-size: 13px; font-weight: 700; color: #059669; border-bottom: 1px solid #d1fae5; padding-bottom: 4px; margin-bottom: 12px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
      .info-item label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; display: block; }
      .info-item span { font-size: 12px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      thead tr { background: #f0fdf4; }
      th { text-align: left; padding: 6px 10px; font-weight: 700; color: #065f46; border-bottom: 2px solid #6ee7b7; white-space: nowrap; }
      td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; }
      tr:hover td { background: #f9fafb; }
      .amount { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
      .total-row td { font-weight: 700; background: #f0fdf4; border-top: 2px solid #6ee7b7; }
      .summary-table { margin-top: 16px; }
      .disclaimer { margin-top: 24px; padding: 12px 16px; background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; font-size: 10px; color: #92400e; line-height: 1.6; }
      .disclaimer strong { display: block; margin-bottom: 4px; }
      .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
      @media print {
        body { padding: 16px; }
        .no-print { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="logo">Playbook<span>Hub</span></div>
        <div style="font-size:11px;color:#555;margin-top:4px">Plataforma de SaaS &amp; Produtos Digitais</div>
      </div>
      <div class="header-right">
        <strong>RELATÓRIO DE PAGAMENTOS — IRPF</strong><br/>
        Ano-Calendário: ${year}<br/>
        Emitido em: ${reportDate}
      </div>
    </div>

    <!-- Dados do declarante -->
    <div class="section">
      <div class="section-title">Dados do Declarante</div>
      <div class="info-grid">
        <div class="info-item"><label>Nome completo</label><span>${buyerName}</span></div>
        <div class="info-item"><label>CPF</label><span>${buyerCpf}</span></div>
        <div class="info-item"><label>E-mail</label><span>${profile?.email ?? user.email ?? "—"}</span></div>
        <div class="info-item"><label>Total pago no ano</label><span style="color:#059669">${fmtBRL(total)}</span></div>
      </div>
    </div>

    <!-- Detalhamento de compras -->
    <div class="section">
      <div class="section-title">Detalhamento de Pagamentos — ${year}</div>
      ${rows.length === 0
        ? `<p style="color:#666;font-style:italic">Nenhum pagamento registrado neste ano.</p>`
        : `
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Produto / Plano</th>
            <th>Fornecedor</th>
            <th>CNPJ do Fornecedor</th>
            <th>Invoice</th>
            <th class="amount">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
          <tr>
            <td>${fmtDate(String(r.created_at ?? ""))}</td>
            <td>${getProductName(r)}</td>
            <td>${getVendorName(r)}</td>
            <td>${getVendorCnpj(r) ? getVendorCnpj(r).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"}</td>
            <td style="color:#6b7280;font-size:10px">${r.stripe_invoice_id?.slice(0, 20) ?? "—"}</td>
            <td class="amount">${fmtBRL(Number(r.amount_gross ?? 0))}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td colspan="5"><strong>TOTAL ${year}</strong></td>
            <td class="amount">${fmtBRL(total)}</td>
          </tr>
        </tbody>
      </table>`}
    </div>

    <!-- Resumo por produto -->
    ${productRows.length > 0 ? `
    <div class="section">
      <div class="section-title">Resumo por Produto (para Deduções)</div>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Fornecedor</th>
            <th>CNPJ</th>
            <th>Nº Pagamentos</th>
            <th class="amount">Total</th>
          </tr>
        </thead>
        <tbody>
          ${productRows.map((p) => `
          <tr>
            <td>${p.name}</td>
            <td>${p.vendor}</td>
            <td>${p.cnpj ? p.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"}</td>
            <td style="text-align:center">${p.count}</td>
            <td class="amount">${fmtBRL(p.total)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <!-- Disclaimer legal -->
    <div class="disclaimer">
      <strong>⚠️ Aviso Legal — Documento Informativo</strong>
      Este relatório é fornecido exclusivamente para fins informativos. Não constitui documento fiscal oficial (NF-e, NFS-e) nem certidão de pagamento reconhecida pela Receita Federal.
      Para a declaração do IRPF, utilize os comprovantes de pagamento originais emitidos pelos fornecedores.
      Gastos com software e serviços digitais geralmente não são dedutíveis no IRPF de pessoa física, exceto quando utilizados para atividade profissional (MEI ou equiparado).
      Consulte um contador credenciado para orientação fiscal.
    </div>

    <div class="footer">
      Playbook Hub — ${reportDate} — Este documento foi gerado automaticamente pelo sistema.
    </div>

    <script>
      // Abrir diálogo de impressão automaticamente
      window.onload = function() {
        setTimeout(function() { window.print(); }, 800);
      };
    </script>
  </body>
  </html>`;
  
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
