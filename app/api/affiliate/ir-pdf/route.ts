// app/api/affiliate/ir-pdf/route.ts
// Gera relatório anual de comissões de afiliado para Imposto de Renda (IRPF).
// Cobre comissões L1 e L2 com total bruto e detalhamento por produto/mês.
// Retorna HTML A4 com window.print() automático.

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
interface AffiliateLinkInfo {
  code?: string;
  saas_products?: { name?: string } | { name?: string }[] | null;
}

interface CommissionRow {
  id: string;
  amount: number;
  level: number;
  status: string;
  created_at: string;
  affiliate_links?: AffiliateLinkInfo | null;
}

interface ProfileData {
  full_name?: string;
  email?: string;
  cpf?: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const adminSupabase = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const year = req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear() - 1);
    const yearNum = parseInt(year);

    // Dados do afiliado
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("full_name, email, cpf")
      .eq("id", user.id)
      .single();

    // Buscar comissões do ano
    const { data: commissions } = await adminSupabase
      .from("affiliate_commissions")
      .select(`
        id, amount, level, status, created_at,
        affiliate_links(code, saas_products(name))
      `)
      .eq("affiliate_id", user.id)
      .gte("created_at", `${yearNum}-01-01`)
      .lt("created_at", `${yearNum + 1}-01-01`)
      .order("created_at", { ascending: true });

    const rows = (commissions ?? []) as CommissionRow[];

    // Totais
    const totalL1 = rows.filter((r) => r.level === 1).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalL2 = rows.filter((r) => r.level === 2).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalL3 = rows.filter((r) => r.level === 3).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalAll = totalL1 + totalL2 + totalL3;

    const paidRows = rows.filter((r) => r.status === "paid");
    const pendingRows = rows.filter((r) => r.status === "pending");
    const totalPaid = paidRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalPending = pendingRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Agrupar por mês
    const byMonth: Record<string, { l1: number; l2: number; l3: number; count: number }> = {};
    rows.forEach((r) => {
      const d = new Date(String(r.created_at ?? ""));
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${yearNum}`;
      if (!byMonth[key]) byMonth[key] = { l1: 0, l2: 0, l3: 0, count: 0 };
      if (r.level === 1) byMonth[key].l1 += Number(r.amount ?? 0);
      if (r.level === 2) byMonth[key].l2 += Number(r.amount ?? 0);
      if (r.level === 3) byMonth[key].l3 += Number(r.amount ?? 0);
      byMonth[key].count++;
    });

    // Helper para extrair nome do produto
    function getProductName(r: CommissionRow): string {
      const link = r.affiliate_links;
      if (!link) return "Produto Desconhecido";
      const products = link.saas_products;
      if (!products) return "Produto Desconhecido";
      if (Array.isArray(products)) return products[0]?.name ?? "Produto Desconhecido";
      return products.name ?? "Produto Desconhecido";
    }

    // Helper para extrair código
    function getCode(r: CommissionRow): string {
      return r.affiliate_links?.code ?? "—";
    }

    // Agrupar por produto
    const byProduct: Record<string, number> = {};
    rows.forEach((r) => {
      const name = getProductName(r);
      byProduct[name] = (byProduct[name] ?? 0) + Number(r.amount ?? 0);
    });

    const typedProfile = profile as ProfileData | null;
    const affiliateName = typedProfile?.full_name ?? "Afiliado";
    const affiliateEmail = typedProfile?.email ?? user.email ?? "";
    const cpf = typedProfile?.cpf ?? "Não informado";
    const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  
    const monthRows = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => `
        <tr>
          <td>${month}</td>
          <td>${data.count}</td>
          <td class="green">${fmtBRL(data.l1)}</td>
          <td class="green">${data.l2 > 0 ? fmtBRL(data.l2) : "—"}</td>
          <td class="green">${data.l3 > 0 ? fmtBRL(data.l3) : "—"}</td>
          <td class="green bold">${fmtBRL(data.l1 + data.l2 + data.l3)}</td>
        </tr>
      `).join("");

    const productRows = Object.entries(byProduct)
      .sort(([, a], [, b]) => b - a)
      .map(([name, total]) => `
        <tr>
          <td>${name}</td>
          <td class="green">${fmtBRL(total)}</td>
          <td>${((total / totalAll) * 100).toFixed(1)}%</td>
        </tr>
      `).join("");

    const recentRows = rows.slice(-20).reverse().map((r) => `
      <tr>
        <td>${fmtDate(r.created_at ?? "")}</td>
        <td>${getProductName(r)}</td>
        <td>${getCode(r)}</td>
        <td class="center">L${r.level}</td>
        <td class="green">${fmtBRL(Number(r.amount ?? 0))}</td>
        <td class="${r.status === "paid" ? "green" : "orange"}">${r.status === "paid" ? "Pago" : "Pendente"}</td>
      </tr>
    `).join("");
  
    const html = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
  <meta charset="UTF-8">
  <title>Relatório de Comissões IR ${yearNum} — ${affiliateName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 20mm 15mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
  
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #8b5cf6; margin-bottom: 20px; }
    .logo { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .logo span { color: #8b5cf6; }
    .header-info { text-align: right; font-size: 10px; color: #666; }
    .header-info strong { display: block; font-size: 13px; color: #000; }
  
    .section-title { font-size: 13px; font-weight: 700; color: #8b5cf6; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .info-card { border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px 12px; }
    .info-card .label { font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
    .info-card .value { font-size: 14px; font-weight: 700; }
    .info-card.green .value { color: #10b981; }
    .info-card.purple .value { color: #8b5cf6; }
    .info-card.amber .value { color: #f59e0b; }
  
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 16px; }
    th { background: #f4f4f5; text-align: left; padding: 7px 8px; font-size: 9px; text-transform: uppercase; color: #666; font-weight: 600; }
    td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
    tr:hover td { background: #fafafa; }
    .green  { color: #10b981; font-weight: 600; }
    .purple { color: #8b5cf6; }
    .orange { color: #f59e0b; }
    .bold   { font-weight: 700; }
    .center { text-align: center; }
    .mono   { font-family: monospace; font-size: 9px; color: #888; }
  
    .total-row td { font-weight: 700; background: #fdf8ff; border-top: 2px solid #8b5cf6; }
  
    .disclaimer { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 14px; margin-top: 20px; font-size: 10px; color: #92400e; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e5e5; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  
    .badge-l1 { background: #dcfce7; color: #16a34a; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
    .badge-l2 { background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
    .badge-l3 { background: #f3e8ff; color: #7c3aed; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
  
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
  </head>
  <body>
  
  <div class="header">
    <div>
      <div class="logo">Playbook<span>.</span></div>
      <div style="font-size:11px; color:#666; margin-top:4px;">Programa de Afiliados — Extrato Anual</div>
    </div>
    <div class="header-info">
      <strong>Relatório de Comissões — ${yearNum}</strong>
      Gerado em ${now}<br>
      Válido para declaração IRPF ${yearNum + 1}
    </div>
  </div>
  
  <div style="font-size:11px; color:#555; margin-bottom:16px;">
    <strong>${affiliateName}</strong> &nbsp;·&nbsp; ${affiliateEmail} &nbsp;·&nbsp; CPF: ${cpf}<br>
    <span style="font-size:10px;color:#999">Rendimento de afiliado — Código de Atividade: 4010 (Comissões e Corretagens)</span>
  </div>
  
  <div class="info-grid">
    <div class="info-card purple">
      <div class="label">Total de Comissões</div>
      <div class="value">${fmtBRL(totalAll)}</div>
    </div>
    <div class="info-card green">
      <div class="label">Pagas (confirmadas)</div>
      <div class="value">${fmtBRL(totalPaid)}</div>
    </div>
    <div class="info-card amber">
      <div class="label">Pendentes</div>
      <div class="value">${fmtBRL(totalPending)}</div>
    </div>
    <div class="info-card">
      <div class="label">Transações</div>
      <div class="value">${rows.length}</div>
    </div>
  </div>
  
  ${totalL2 > 0 || totalL3 > 0 ? `
  <div class="info-grid" style="grid-template-columns: repeat(3,1fr)">
    <div class="info-card">
      <div class="label"><span class="badge-l1">L1</span> Direto</div>
      <div class="value" style="color:#16a34a">${fmtBRL(totalL1)}</div>
    </div>
    ${totalL2 > 0 ? `<div class="info-card">
      <div class="label"><span class="badge-l2">L2</span> Sub-afiliados</div>
      <div class="value" style="color:#0284c7">${fmtBRL(totalL2)}</div>
    </div>` : ""}
    ${totalL3 > 0 ? `<div class="info-card">
      <div class="label"><span class="badge-l3">L3</span> Rede</div>
      <div class="value" style="color:#7c3aed">${fmtBRL(totalL3)}</div>
    </div>` : ""}
  </div>
  ` : ""}
  
  <div class="section-title">Comissões por Mês</div>
  <table>
    <thead>
      <tr>
        <th>Mês</th><th>Trans.</th>
        <th><span class="badge-l1">L1</span> Direto</th>
        <th><span class="badge-l2">L2</span> Sub-aff.</th>
        <th><span class="badge-l3">L3</span> Rede</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${monthRows || `<tr><td colspan="6" style="color:#aaa;text-align:center;padding:20px">Nenhuma comissão neste período</td></tr>`}
      ${rows.length > 0 ? `
      <tr class="total-row">
        <td>TOTAL</td>
        <td>${rows.length}</td>
        <td>${fmtBRL(totalL1)}</td>
        <td>${totalL2 > 0 ? fmtBRL(totalL2) : "—"}</td>
        <td>${totalL3 > 0 ? fmtBRL(totalL3) : "—"}</td>
        <td>${fmtBRL(totalAll)}</td>
      </tr>` : ""}
    </tbody>
  </table>
  
  ${Object.keys(byProduct).length > 0 ? `
  <div class="section-title">Comissões por Produto</div>
  <table>
    <thead>
      <tr><th>Produto</th><th>Total Comissões</th><th>% do Total</th></tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>
  ` : ""}
  
  ${rows.length > 0 ? `
  <div class="section-title">Últimas Transações (máx. 20)</div>
  <table>
    <thead>
      <tr><th>Data</th><th>Produto</th><th>Código</th><th>Nível</th><th>Comissão</th><th>Status</th></tr>
    </thead>
    <tbody>${recentRows}</tbody>
  </table>
  ` : ""}
  
  <div class="disclaimer">
    ⚠ <strong>Aviso Legal:</strong> Este relatório tem caráter informativo e é gerado automaticamente com base nos dados da plataforma.
    Comissões de afiliado podem ser classificadas como <strong>rendimento de trabalho autônomo ou comissões</strong> — consulte um contador ou profissional tributário.
    Para declaração como Pessoa Física, utilize o código de atividade 4010 (Comissões e Corretagens) ou confira com seu contador.
    A plataforma não se responsabiliza por erros ou omissões na declaração do usuário. Valores em BRL (Real Brasileiro).
  </div>
  
  <div class="footer">
    <span>Playbook. Marketplace — Relatório Comissões Afiliado ${yearNum}</span>
    <span>Gerado por sistema automatizado · ${affiliateEmail}</span>
  </div>
  
  <script>
    window.onload = () => {
      setTimeout(() => window.print(), 400);
    };
  </script>
  </body>
  </html>`;
  
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Report-Year": year,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
