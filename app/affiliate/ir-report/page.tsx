"use client";
// app/affiliate/ir-report/page.tsx
// Relatório anual de comissões para declaração do IRPF.

import { useState } from "react";
import { FileText, Download, Loader2, CalendarDays, Info } from "lucide-react";
import Link from "next/link";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function AffiliateIRReportPage() {
  const [year,    setYear]    = useState(currentYear - 1);
  const [loading, setLoading] = useState(false);

  const openReport = () => {
    setLoading(true);
    const win = window.open(`/api/affiliate/ir-pdf?year=${year}`, "_blank");
    setTimeout(() => setLoading(false), 2000);
    if (!win) {
      alert("Popup bloqueado. Permita popups para este site e tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/affiliate/extrato" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
            ← Extrato de Comissões
          </Link>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <FileText size={22} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatório IR — Comissões de Afiliado</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Informe de rendimentos de comissões (L1, L2, L3) para declaração do IRPF.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <CalendarDays size={15} className="text-violet-400" />
              Ano de referência
            </label>
            <div className="flex gap-2 flex-wrap">
              {YEARS.map((y) => (
                <button key={y} onClick={() => setYear(y)}
                  className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all
                    ${year === y
                      ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
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

          <div className="rounded-xl bg-zinc-900/60 border border-white/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">O relatório inclui</p>
            {[
              "Total de comissões L1 (diretas), L2 e L3",
              "Separação entre comissões pagas e pendentes",
              "Resumo mensal de comissões",
              "Distribuição por produto",
              "Últimas 20 transações com produto, código e status",
              "Orientação de código de atividade para declaração (4010)",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button onClick={openReport} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white rounded-full py-3.5 font-semibold transition-colors disabled:opacity-60">
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Abrindo relatório...</>
                : <><Download size={16} /> Gerar Relatório Comissões {year} (PDF)</>}
            </button>
            <p className="text-xs text-zinc-600 text-center">
              Abrirá em nova aba. Use <strong className="text-zinc-500">Ctrl+P</strong> para salvar como PDF.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 flex gap-3">
          <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-amber-300 font-medium">Configure seu CPF para o relatório</p>
            <p className="text-xs text-amber-500/80">
              Acesse <strong>Configurações → Dados Fiscais</strong> e informe seu CPF.
              Ele será incluído no cabeçalho do relatório.
            </p>
            <Link href="/configuracoes" className="text-xs text-amber-400 hover:underline inline-block mt-1">
              Ir para configurações →
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/5 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-600">
            <strong className="text-zinc-500">Aviso Legal:</strong> Comissões de afiliado podem ser classificadas como rendimento de trabalho autônomo ou comissões
            dependendo do volume e da forma jurídica do afiliado. Consulte um contador ou profissional tributário habilitado.
            A plataforma não se responsabiliza por erros ou omissões na declaração.
          </p>
        </div>
      </div>
    </div>
  );
}
