
"use client";
// app/vendor/fiscal/page.tsx
// Dashboard fiscal do vendor — mostra status atual e histórico de emissões

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, FileText, CheckCircle2, AlertTriangle, Settings,
  Zap, Building2, XCircle, RefreshCw, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

type FiscalMode = "self" | "platform" | "none" | null;

const MODE_INFO: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  self:     { icon: Zap,       label: "Emissão própria (eNotas)",            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  platform: { icon: Building2, label: "Plataforma emite por você",            color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  none:     { icon: XCircle,   label: "Emissão manual (responsabilidade sua)", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
};

interface FiscalJob {
  id: string; invoice_id: string; buyer_email: string;
  amount_gross: number; platform_fee: number;
  status: "PENDING" | "EMITTED" | "FAILED";
  emitted_at: string | null; emit_after: string; created_at: string;
}

export default function FiscalPage() {
  const supabase = createClient();
  const [loading, setLoading]   = useState(true);
  const [fiscalMode, setFiscalMode] = useState<FiscalMode>(null);
  const [termsAt, setTermsAt]   = useState<string | null>(null);
  const [jobs, setJobs]         = useState<FiscalJob[]>([]);
  const [stats, setStats]       = useState({ pending: 0, emitted: 0, failed: 0 });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/enotas/config");
      if (res.ok) {
        const data = await res.json();
        setFiscalMode(data.fiscal_mode ?? null);
        setTermsAt(data.fiscal_terms_accepted_at ?? null);
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: jobsData } = await supabase
          .from("fiscal_jobs")
          .select("id, invoice_id, buyer_email, amount_gross, platform_fee, status, emitted_at, emit_after, created_at")
          .eq("vendor_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(30);
        if (jobsData) {
          setJobs(jobsData as FiscalJob[]);
          setStats({
            pending: jobsData.filter((j: Record<string, unknown>) => j.status === "PENDING").length,
            emitted: jobsData.filter((j: Record<string, unknown>) => j.status === "EMITTED").length,
            failed:  jobsData.filter((j: Record<string, unknown>) => j.status === "FAILED").length,
          });
        }
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-zinc-500" />
    </div>
  );

  const modeInfo = fiscalMode ? MODE_INFO[fiscalMode] : null;

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-4xl">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-50">Fiscal</h1>
          <p className="text-zinc-400 text-sm">Notas fiscais das suas vendas</p>
        </div>
        <Link
          href="/vendor/fiscal/setup"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 text-zinc-300 px-4 py-2.5 text-sm hover:border-white/20 hover:text-zinc-100 transition"
        >
          <Settings size={14} /> Configurar
        </Link>
      </div>

      {!fiscalMode || !termsAt ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-300">Configuração fiscal pendente</h2>
          </div>
          <p className="text-sm text-zinc-400">
            Você ainda não configurou como suas notas fiscais serão emitidas. Configure antes de fazer sua primeira venda.
          </p>
          <Link href="/vendor/fiscal/setup"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 text-zinc-950 font-bold px-5 py-2.5 text-sm hover:bg-amber-400 transition">
            Configurar agora <ArrowRight size={14} />
          </Link>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 flex items-center justify-between ${modeInfo?.color}`}>
          <div className="flex items-center gap-3">
            {modeInfo && modeInfo.icon({ size: 18, className: "text-current" })}
            <div>
              <p className="text-sm font-semibold text-zinc-100">{modeInfo?.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Configurado em {new Date(String(termsAt ?? "")).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
          <Link href="/vendor/fiscal/setup" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition">
            Alterar <Settings size={11} />
          </Link>
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pendentes", value: stats.pending, color: "text-amber-400" },
          { label: "Emitidas",  value: stats.emitted, color: "text-emerald-400" },
          { label: "Com erro",  value: stats.failed,  color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5 space-y-1">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <FileText size={14} className="text-zinc-500" /> Histórico de emissões
          </h2>
          <button onClick={() => window.location.reload()} className="text-zinc-600 hover:text-zinc-400 transition">
            <RefreshCw size={13} />
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="p-10 text-center text-zinc-600 text-sm">
            Nenhuma nota fiscal ainda. Aparecem D+8 após cada venda confirmada.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {jobs.map((job) => (
              <div key={job.id} className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition">
                <div className="space-y-0.5">
                  <div className="text-sm text-zinc-200 font-medium">{job.buyer_email}</div>
                  <div className="text-xs text-zinc-500">
                    {job.invoice_id.slice(0, 22)}… · {new Date(String(job.created_at ?? "")).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm text-zinc-200">R$ {(job.amount_gross - job.platform_fee).toFixed(2)}</div>
                    <div className="text-xs text-zinc-600">fee: R$ {job.platform_fee.toFixed(2)}</div>
                  </div>
                  {job.status === "EMITTED" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium">
                      <CheckCircle2 size={10} /> Emitida
                    </span>
                  )}
                  {job.status === "FAILED" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 text-xs font-medium">
                      <AlertTriangle size={10} /> Erro
                    </span>
                  )}
                  {job.status === "PENDING" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 text-xs font-medium">
                      <RefreshCw size={10} /> Pendente
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
