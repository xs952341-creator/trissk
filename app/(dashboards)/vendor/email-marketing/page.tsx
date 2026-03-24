"use client";
// Email Marketing — sequências automáticas, broadcast, automações
// Kiwify-level: welcome sequence, upsell sequence, abandoned cart, broadcast

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Mail, Plus, Play, Pause, Trash2, Edit3, Users,
  Clock, BarChart2, Loader2, CheckCircle2, X, Send,
  Zap, ChevronRight, AlertTriangle
} from "lucide-react";

type SequenceType = "welcome" | "upsell" | "abandoned_cart" | "renewal_reminder" | "broadcast" | "custom";

interface EmailSequence {
  id: string;
  name: string;
  type: SequenceType;
  product_id?: string;
  is_active: boolean;
  total_subscribers: number;
  open_rate?: number;
  click_rate?: number;
  steps: EmailStep[];
  created_at: string;
}

interface EmailStep {
  id: string;
  delay_days: number;
  subject: string;
  preview_text?: string;
  html_body: string;
  sent_count: number;
}

interface Stats {
  total_sequences: number;
  active_sequences: number;
  total_sent: number;
  avg_open_rate: number;
}

const TYPE_LABELS: Record<SequenceType, { label: string; icon: string; desc: string }> = {
  welcome:            { label: "Boas-vindas",       icon: "👋", desc: "Enviada logo após a compra" },
  upsell:             { label: "Upsell",             icon: "⚡", desc: "Oferta para compradores" },
  abandoned_cart:     { label: "Carrinho Abandonado",icon: "🛒", desc: "Recuperação de compra" },
  renewal_reminder:   { label: "Lembrete Renovação", icon: "🔔", desc: "Antes do vencimento" },
  broadcast:          { label: "Broadcast",          icon: "📢", desc: "Email para toda a base" },
  custom:             { label: "Personalizada",       icon: "✨", desc: "Sequência customizada" },
};

export default function EmailMarketingPage() {
  const supabase = createClient();
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newType, setNewType]       = useState<SequenceType>("welcome");
  const [editing, setEditing]       = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/vendor/email-sequences");
    const json = await res.json();
    setSequences(json.sequences ?? []);
    setStats(json.stats ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Nome é obrigatório"); return; }
    setCreating(true);
    const res  = await fetch("/api/vendor/email-sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type: newType }),
    });
    const json = await res.json();
    if (!res.ok) toast.error(json.error);
    else { toast.success("Sequência criada!"); setShowCreate(false); setNewName(""); load(); }
    setCreating(false);
  };

  const handleToggle = async (seq: EmailSequence) => {
    const res = await fetch(`/api/vendor/email-sequences/${seq.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !seq.is_active }),
    });
    if (res.ok) load();
    else toast.error("Erro ao atualizar");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover sequência?")) return;
    const res = await fetch(`/api/vendor/email-sequences/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removida"); load(); }
    else toast.error("Erro ao remover");
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Email Marketing</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Sequências automáticas, broadcasts e automações</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-emerald-400 transition">
          <Plus size={16} /> Nova sequência
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Sequências ativas", value: stats.active_sequences, icon: <Zap size={14} />, color: "text-emerald-400" },
            { label: "Total enviados",    value: stats.total_sent.toLocaleString("pt-BR"), icon: <Send size={14} />, color: "text-blue-400" },
            { label: "Taxa de abertura",  value: `${stats.avg_open_rate.toFixed(1)}%`, icon: <BarChart2 size={14} />, color: "text-violet-400" },
            { label: "Total sequências",  value: stats.total_sequences, icon: <Mail size={14} />, color: "text-zinc-400" },
          ].map(m => (
            <div key={m.label} className="bg-zinc-900 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{m.label}</span>
                <span className={m.color}>{m.icon}</span>
              </div>
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">Nova sequência</h3>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Nome da sequência</label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Ex: Boas-vindas — Produto X"
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-2 block">Tipo de sequência</label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(TYPE_LABELS).map(([type, info]) => (
                <button key={type} onClick={() => setNewType(type as SequenceType)}
                  className={`text-left p-3 border rounded-xl transition ${
                    newType === type ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/20"
                  }`}>
                  <span className="text-lg">{info.icon}</span>
                  <p className="text-xs font-medium text-zinc-300 mt-1">{info.label}</p>
                  <p className="text-xs text-zinc-600">{info.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={creating}
              className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold text-sm px-5 py-2 rounded-xl hover:bg-emerald-400 disabled:opacity-50 transition">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Criar sequência
            </button>
            <button onClick={() => setShowCreate(false)} className="text-sm text-zinc-500 hover:text-zinc-300 px-4">Cancelar</button>
          </div>
        </div>
      )}

      {/* Sequences list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zinc-600" /></div>
      ) : sequences.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-12 text-center">
          <Mail size={32} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Nenhuma sequência ainda</p>
          <p className="text-sm text-zinc-600 mt-1">Crie sua primeira sequência de email automática</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map(seq => {
            const typeInfo = TYPE_LABELS[seq.type];
            return (
              <div key={seq.id} className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{typeInfo.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-200">{seq.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          seq.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                        }`}>
                          {seq.is_active ? "Ativa" : "Pausada"}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{typeInfo.label} · {seq.steps?.length ?? 0} emails</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-zinc-600">
                          <Users size={10} className="inline mr-1" />
                          {seq.total_subscribers?.toLocaleString("pt-BR") ?? 0} inscritos
                        </span>
                        {seq.open_rate !== undefined && (
                          <span className="text-xs text-zinc-600">
                            <BarChart2 size={10} className="inline mr-1" />
                            {seq.open_rate.toFixed(1)}% abertura
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditing(seq.id)}
                      className="text-xs flex items-center gap-1.5 border border-white/10 text-zinc-400 px-3 py-1.5 rounded-lg hover:border-white/20 hover:text-zinc-200 transition">
                      <Edit3 size={12} /> Editar
                    </button>
                    <button onClick={() => handleToggle(seq)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                        seq.is_active
                          ? "bg-zinc-800 text-zinc-400 border-white/10 hover:border-red-500/30 hover:text-red-400"
                          : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      }`}>
                      {seq.is_active ? "Pausar" : "Ativar"}
                    </button>
                    <button onClick={() => handleDelete(seq.id)} className="text-zinc-600 hover:text-red-400 p-1.5 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Steps preview */}
                {seq.steps?.length > 0 && (
                  <div className="mt-4 pl-11">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {seq.steps.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-2 shrink-0">
                          <div className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 min-w-[120px]">
                            <p className="text-xs font-medium text-zinc-300 truncate">{step.subject}</p>
                            <p className="text-xs text-zinc-600 mt-0.5">
                              {step.delay_days === 0 ? "Imediato" : `+${step.delay_days}d`}
                            </p>
                          </div>
                          {i < seq.steps.length - 1 && <ChevronRight size={12} className="text-zinc-700 shrink-0" />}
                        </div>
                      ))}
                      <button className="shrink-0 text-xs text-emerald-400 hover:underline flex items-center gap-1">
                        <Plus size={10} /> Email
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
