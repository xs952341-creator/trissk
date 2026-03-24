"use client";
// app/(dashboards)/admin/lgpd/page.tsx — Painel admin para solicitações LGPD

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LEGAL } from "@/lib/legal";
import { toast } from "sonner";
import { Shield, RefreshCw, Loader2, CheckCircle2, Clock } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

interface LgpdRequest {
  id: string; tipo: string; email: string; nome: string;
  detalhe: string | null; status: string; created_at: string;
}

const TIPO_LABELS: Record<string, string> = {
  acesso: "Acesso", correcao: "Correção", exclusao: "Exclusão",
  portabilidade: "Portabilidade", revogacao: "Revogação", oposicao: "Oposição",
};

const STATUS_STYLES: Record<string, string> = {
  pending:     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  in_progress: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  resolved:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  rejected:    "text-zinc-400 bg-zinc-800/60 border-zinc-700",
};

export default function AdminLgpdPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<LgpdRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lgpd_requests").select("*")
      .order("created_at", { ascending: false }).limit(100);
    if (error) toast.error("Erro: " + getErrorMessage(error));
    setRequests((data ?? []) as LgpdRequest[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("lgpd_requests")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { toast.error("Erro: " + getErrorMessage(error)); return; }
    setRequests(r => r.map(x => x.id === id ? { ...x, status } : x));
    toast.success("Status atualizado");
  };

  const pending = requests.filter(r => r.status === "pending").length;

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50 flex items-center gap-2">
            <Shield size={22} className="text-emerald-400" /> Solicitações LGPD
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Prazo: <strong className="text-zinc-200">{LEGAL.LGPD.PRAZO_EXCLUSAO}</strong> · DPO: {LEGAL.LGPD.CONTATO_DPO}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pending > 0 && (
            <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium px-3 py-1 rounded-full">
              {pending} pendente{pending > 1 ? "s" : ""}
            </span>
          )}
          <button onClick={load} className="text-zinc-500 hover:text-zinc-300 p-2 transition">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-12 text-center">
          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Nenhuma solicitação LGPD registrada.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 text-xs text-zinc-500 border-b border-white/10 bg-zinc-950/40">
            <span>Tipo</span><span>Solicitante</span><span>Data</span><span>Status</span><span>Ação</span>
          </div>
          <div className="divide-y divide-white/5">
            {requests.map((r) => (
              <div key={r.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/[0.02] transition">
                <span className="text-xs bg-zinc-800 border border-white/10 text-zinc-300 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                  {TIPO_LABELS[r.tipo] ?? r.tipo}
                </span>
                <div>
                  <p className="text-sm text-zinc-200">{r.nome}</p>
                  <p className="text-xs text-zinc-500">{r.email}</p>
                  {r.detalhe && <p className="text-xs text-zinc-600 mt-0.5 truncate max-w-xs">{r.detalhe}</p>}
                </div>
                <p className="text-xs text-zinc-500 whitespace-nowrap">{new Date(String(r.created_at ?? "")).toLocaleDateString("pt-BR")}</p>
                <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status] ?? "text-zinc-400"}`}>
                  {r.status === "pending" && <Clock size={10} className="inline mr-1" />}
                  {r.status === "resolved" && <CheckCircle2 size={10} className="inline mr-1" />}
                  {r.status}
                </span>
                <select
                  value={r.status}
                  onChange={e => updateStatus(r.id, e.target.value)}
                  className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded-lg px-2 py-1 focus:outline-none"
                >
                  <option value="pending">pending</option>
                  <option value="in_progress">in_progress</option>
                  <option value="resolved">resolved</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
