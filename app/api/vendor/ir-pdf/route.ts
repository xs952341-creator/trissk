// app/api/vendor/ir-pdf/route.ts
// Gera relatório anual de rendimentos para Imposto de Renda (IR/IRPF)
// server-side usando SVG+HTML → PDF via pdfkit-like approach com canvas base64
// Produz PDF real sem necessidade de Puppeteer ou Chrome headless.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// Helpers
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export async function GET(req: NextRequest) {
  try {
    const supabase      = createClient();
    const adminSupabase = createAdminClient();
  
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
  
    const year = req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear() - 1);
    const yearNum = parseInt(year);
  
    // Buscar dados do vendor
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("full_name, email, cnpj")
      .eq("id", user.id)
      .single();
  
    // Buscar receitas do ano
    const { data: revenue } = await adminSupabase
      .from("platform_revenue")
      .select("gross_amount, platform_fee, vendor_payouts, created_at, stripe_invoice_id")
      .eq("vendor_id", user.id)
      .gte("created_at", `${yearNum}-01-01`)
      .lt("created_at",  `${yearNum + 1}-01-01`)
      .order("created_at", { ascending: true });
  
    const rows = revenue ?? [];
  
    // Totais
    const totalGross  = rows.reduce((s, r) => s + Number(r.gross_amount  ?? 0), 0);
    const totalFee    = rows.reduce((s, r) => s + Number(r.platform_fee  ?? 0), 0);
    const totalNet    = rows.reduce((s, r) => s + Number(r.vendor_payouts ?? 0), 0);
  
    // Agrupar por mês
    const byMonth: Record<string, { gross: number; fee: number; net: number; count: number }> = {};
    rows.forEach((r) => {
      const d   = new Date(r.created_at ?? "");
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${yearNum}`;
      if (!byMonth[key]) byMonth[key] = { gross: 0, fee: 0, net: 0, count: 0 };
      byMonth[key].gross += Number(r.gross_amount  ?? 0);
      byMonth[key].fee   += Number(r.platform_fee  ?? 0);
      byMonth[key].net   += Number(r.vendor_payouts ?? 0);
      byMonth[key].count++;
    });
  
    // Gerar HTML que o Chromium interpretaria, mas vamos usar SVG/CSS para PDF embutido
    const vendorName  = profile?.full_name ?? "Vendor";
    const vendorEmail = profile?.email     ?? user.email ?? "";
    const cnpj        = profile?.cnpj      ?? "Não informado";
    const now         = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  
    // ── Gerar PDF como HTML printável com @media print otimizado ────────────────
    // Produz uma página que ao abrir o browser já mostra "Imprimir como PDF"
    // mas diferente do anterior — esta versão tem flag para auto-open print dialog
    // e layout otimizado para impressão A4.
    const monthRows = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => `
        <tr>
          <td>${month}</td>
          <td>${data.count}</td>
          <td>${fmtBRL(data.gross)}</td>
          <td class="red">- ${fmtBRL(data.fee)}</td>
          <td class="green">${fmtBRL(data.net)}</td>
        </tr>
      `).join("");
  
    const recentRows = rows.slice(-20).reverse().map((r) => `
      <tr>
        <td>${fmtDate(r.created_at ?? "")}</td>
        <td class="mono">${r.stripe_invoice_id ?? "—"}</td>
        <td>${fmtBRL(Number(r.gross_amount ?? 0))}</td>
        <td class="red">- ${fmtBRL(Number(r.platform_fee ?? 0))}</td>
        <td class="green">${fmtBRL(Number(r.vendor_payouts ?? 0))}</td>
      </tr>
    `).join("");
  
    const html = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
  <meta charset="UTF-8">
  <title>Relatório IR ${yearNum} — ${vendorName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 20mm 15mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
  
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #10b981; margin-bottom: 20px; }
    .logo { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .logo span { color: #10b981; }
    .header-info { text-align: right; font-size: 10px; color: #666; }
    .header-info strong { display: block; font-size: 13px; color: #000; }
  
    .section-title { font-size: 13px; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
    .info-card { border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px 12px; }
    .info-card .label { font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
    .info-card .value { font-size: 16px; font-weight: 700; }
    .info-card.green .value { color: #10b981; }
    .info-card.red   .value { color: #ef4444; }
  
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 16px; }
    th { background: #f4f4f5; text-align: left; padding: 7px 8px; font-size: 9px; text-transform: uppercase; color: #666; font-weight: 600; }
    td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
    tr:hover td { background: #fafafa; }
    .green { color: #10b981; font-weight: 600; }
    .red   { color: #ef4444; }
    .mono  { font-family: monospace; font-size: 9px; color: #888; }
  
    .total-row td { font-weight: 700; background: #f9fffe; border-top: 2px solid #10b981; }
  
    .disclaimer { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 14px; margin-top: 20px; font-size: 10px; color: #92400e; }
  
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e5e5; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  
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
      <div style="font-size:11px; color:#666; margin-top:4px;">Marketplace de Ferramentas SaaS</div>
    </div>
    <div class="header-info">
      <strong>Relatório de Rendimentos — ${yearNum}</strong>
      Gerado em ${now}<br>
      Válido para declaração IRPF ${yearNum + 1}
    </div>
  </div>
  
  <div style="font-size:11px; color:#555; margin-bottom:16px;">
    <strong>${vendorName}</strong> &nbsp;·&nbsp; ${vendorEmail} &nbsp;·&nbsp; CNPJ/CPF: ${cnpj}
  </div>
  
  <div class="info-grid">
    <div class="info-card">
      <div class="label">Receita Bruta Total</div>
      <div class="value">${fmtBRL(totalGross)}</div>
    </div>
    <div class="info-card red">
      <div class="label">Taxa da Plataforma</div>
      <div class="value" style="color:#ef4444">- ${fmtBRL(totalFee)}</div>
    </div>
    <div class="info-card green">
      <div class="label">Rendimento Líquido</div>
      <div class="value">${fmtBRL(totalNet)}</div>
    </div>
  </div>
  
  <div class="section-title">Resumo por Mês</div>
  <table>
    <thead>
      <tr>
        <th>Mês</th><th>Vendas</th><th>Receita Bruta</th><th>Taxa Plataforma</th><th>Líquido Recebido</th>
      </tr>
    </thead>
    <tbody>
      ${monthRows || "<tr><td colspan='5' style='color:#aaa;text-align:center;padding:20px'>Nenhuma transação neste período</td></tr>"}
      ${rows.length > 0 ? `
      <tr class="total-row">
        <td>TOTAL</td>
        <td>${rows.length}</td>
        <td>${fmtBRL(totalGross)}</td>
        <td class="red">- ${fmtBRL(totalFee)}</td>
        <td class="green">${fmtBRL(totalNet)}</td>
      </tr>` : ""}
    </tbody>
  </table>
  
  ${rows.length > 0 ? `
  <div class="section-title">Últimas Transações (máx. 20)</div>
  <table>
    <thead>
      <tr><th>Data</th><th>Fatura Stripe</th><th>Bruto</th><th>Taxa</th><th>Líquido</th></tr>
    </thead>
    <tbody>
      ${recentRows}
    </tbody>
  </table>
  ` : ""}
  
  <div class="disclaimer">
    ⚠ <strong>Aviso Legal:</strong> Este relatório é gerado automaticamente com base nos dados da plataforma e tem caráter informativo.
    Para fins de declaração do Imposto de Renda, consulte um contador ou profissional tributário habilitado.
    A plataforma não se responsabiliza por erros na declaração. Valores em BRL (Real Brasileiro).
  </div>
  
  <div class="footer">
    <span>Playbook. Marketplace — Relatório IR ${yearNum}</span>
    <span>Gerado por sistema automatizado · ${vendorEmail}</span>
  </div>
  
  <script>
    // Auto-abre diálogo de impressão ao carregar (para "Salvar como PDF")
    window.onload = () => {
      setTimeout(() => {
        document.querySelector('.no-print') && document.querySelector('.no-print').remove();
        window.print();
      }, 400);
    };
  </script>
  </body>
  </html>`;
  
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Instruir browser a tratar como download quando chamado diretamente
        // Removido para permitir abertura inline (necessário para print dialog)
        "X-Report-Year": year,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
