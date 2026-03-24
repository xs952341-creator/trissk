"use client";
// app/buyer/ir-report/page.tsx
// Relatório de compras anual para o IRPF — página do Buyer.
// Gera HTML via API que abre em nova aba com Ctrl+P automático → salvar como PDF.

import { useState } from "react";
import { FileText, Download, Info, ExternalLink, Loader2, CalendarDays, ShieldCheck } from "lucide-react";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function BuyerIRReportPage() {
  const [year,    setYear]    = useState(currentYear - 1);
  const [loading, setLoading] = useState(false);

  const openReport = () => {
    setLoading(true);
    const win = window.open(`/api/buyer/ir-report?year=${year}`, "_blank");
    setTimeout(() => setLoading(false), 2000);
    if (!win) {
      alert("Popup bloqueado. Permita popups para este site e tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">Relatório IR — Compras</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Extrato anual dos pagamentos realizados para auxiliar na sua declaração de IRPF
        </p>
      </div>

      {/* Card principal */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <FileText size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-zinc-200 font-semibold">Relatório Anual de Pagamentos</p>
            <p className="text-zinc-500 text-xs">Todos os produtos adquiridos no Playbook Hub</p>
          </div>
        </div>

        {/* Seletor de ano */}
        <div>
          <label className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-2">
            <CalendarDays size={13} /> Ano-Calendário
          </label>
          <div className="flex gap-2 flex-wrap">
            {YEARS.map((y) => (
              <button key={y} onClick={() => setYear(y)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all
                  ${year === y
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20"}`}>
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Botão gerar */}
        <button onClick={openReport} disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 font-semibold transition-colors disabled:opacity-60">
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Gerando relatório...</>
            : <><Download size={16} /> Gerar Relatório {year}</>}
        </button>

        <p className="text-zinc-600 text-xs text-center">
          Abrirá em nova aba · Use Ctrl+P para salvar como PDF
        </p>
      </div>

      {/* O que está incluído */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <p className="text-zinc-300 font-semibold text-sm">O que consta no relatório</p>
        <ul className="space-y-2">
          {[
            "Lista detalhada de todos os pagamentos do ano",
            "Nome do fornecedor e CNPJ quando disponível",
            "Valores por produto e total anual",
            "Resumo por produto para facilitar deduções",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-zinc-400 text-sm">
              <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Aviso legal */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
        <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-zinc-400 text-xs leading-relaxed">
          <strong className="text-amber-400 block mb-1">Documento informativo, não oficial</strong>
          Este relatório não substitui documentos fiscais oficiais (NF-e, NFS-e).
          Para a declaração do IRPF, utilize os comprovantes emitidos pelos fornecedores.
          Consulte um contador para orientação sobre deduções aplicáveis.
        </div>
      </div>
    </div>
  );
}
