"use client";
// app/vendor/ir-report/page.tsx
// Página para gerar o relatório de rendimentos para IR (IRPF)
// Gera um PDF server-side real via /api/vendor/ir-pdf que abre no browser
// com o diálogo de impressão pré-ativado → usuário salva como PDF com 1 clique.

import { useState } from "react";
import { FileText, Download, Info, ExternalLink, Loader2, CalendarDays } from "lucide-react";
import Link from "next/link";

const currentYear = new Date().getFullYear();
// Anos disponíveis: do ano corrente até 5 anos atrás
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function IRReportPage() {
  const [year,     setYear]     = useState(currentYear - 1);
  const [loading,  setLoading]  = useState(false);

  const openReport = () => {
    setLoading(true);
    // Abre em nova aba — a rota retorna HTML com window.print() automático
    const win = window.open(`/api/vendor/ir-pdf?year=${year}`, "_blank");
    // Timeout de segurança para resetar loading
    setTimeout(() => setLoading(false), 2000);
    if (!win) {
      alert("Popup bloqueado. Permita popups para este site e tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link href="/vendor/relatorios" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Relatórios
          </Link>
        </div>
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <FileText size={22} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatório IR — Rendimentos da Plataforma</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Documento com receita bruta, taxa da plataforma e líquido recebido para declaração do IRPF.
            </p>
          </div>
        </div>

        {/* Card principal */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-6">

          {/* Seletor de ano */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <CalendarDays size={15} className="text-emerald-400" />
              Ano de referência
            </label>
            <div className="flex gap-2 flex-wrap">
              {YEARS.map((y) => (
                <button key={y} onClick={() => setYear(y)}
                  className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all
                    ${year === y
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                      : "border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20"
                    }`}>
                  {y}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Para declaração do IRPF {year + 1}, selecione o ano-base {year}.
            </p>
          </div>

          {/* O que o relatório contém */}
          <div className="rounded-xl bg-zinc-900/60 border border-white/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">O relatório inclui</p>
            {[
              "Receita bruta total recebida no ano",
              "Taxa da plataforma descontada por transação",
              "Rendimento líquido disponível para saque",
              "Resumo mensal (mês a mês)",
              "Listagem das últimas 20 transações com ID Stripe",
              "Aviso legal e orientação para declaração",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>

          {/* Botão de download */}
          <div className="space-y-3">
            <button onClick={openReport} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full py-3.5 font-semibold transition-colors disabled:opacity-60">
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Abrindo relatório...</>
                : <><Download size={16} /> Gerar Relatório IR {year} (PDF)</>}
            </button>
            <p className="text-xs text-zinc-600 text-center">
              O relatório abrirá em nova aba. Use <strong className="text-zinc-500">Ctrl+P</strong> ou o diálogo de impressão para salvar como PDF.
            </p>
          </div>
        </div>

        {/* Aviso CNPJ */}
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 flex gap-3">
          <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-amber-300 font-medium">Configure seu CNPJ/CPF para o relatório</p>
            <p className="text-xs text-amber-500/80">
              Acesse <strong>Configurações → Dados Fiscais</strong> e informe seu CNPJ ou CPF.
              Ele será incluído no cabeçalho do relatório para identificação perante a Receita Federal.
            </p>
            <Link href="/configuracoes" className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline mt-1">
              Ir para configurações <ExternalLink size={11} />
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-4 rounded-xl border border-white/5 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-600">
            <strong className="text-zinc-500">Aviso Legal:</strong> Este relatório tem caráter informativo e é gerado automaticamente com base nos dados da plataforma.
            Para fins de declaração do Imposto de Renda, consulte um contador ou profissional tributário habilitado.
            A plataforma não se responsabiliza por erros ou omissões na declaração do usuário.
          </p>
        </div>

      </div>
    </div>
  );
}
