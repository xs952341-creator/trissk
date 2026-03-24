"use client";
// app/(dashboards)/workspaces/page.tsx — Workspaces premium
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import {
  Building2, Plus, Users, Crown, Loader2, ChevronRight,
  Settings, X, Check, Zap, Shield,
} from "lucide-react";

type Workspace = { id: string; name: string; role: string; member_count?: number; created_at?: string };

const ROLE_CFG: Record<string, { label: string; cls: string }> = {
  admin:  { label: "Admin",  cls: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  member: { label: "Membro", cls: "text-sky-400 bg-sky-500/10 border-sky-500/25" },
  owner:  { label: "Dono",   cls: "text-violet-400 bg-violet-500/10 border-violet-500/25" },
};

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");

  const load = () =>
    fetch("/api/workspaces").then(r => r.json()).then(d => { setWorkspaces(d.workspaces ?? []); setLoading(false); }).catch(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const createWs = async () => {
    if (!name.trim()) { toast.error("Digite um nome para o workspace."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar");
      setWorkspaces(prev => [data.workspace, ...prev]);
      setName(""); setShowModal(false);
      toast.success("Workspace criado!");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally { setCreating(false); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-1">Workspaces</h1>
          <p className="text-zinc-600 text-sm">Gerencie times e compartilhe acessos com sua equipe.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm shrink-0 hover:-translate-y-0.5">
          <Plus size={14} />Novo workspace
        </button>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] px-4 py-3 flex items-start gap-2.5 mb-7">
        <Shield size={13} className="text-violet-400 shrink-0 mt-0.5" />
        <p className="text-violet-300/80 text-xs leading-relaxed">
          Workspaces permitem compartilhar acessos a produtos com membros da sua equipe.
          Cada membro pode ter o papel de <span className="font-semibold">Admin</span> ou <span className="font-semibold">Membro</span>.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-700">
          <Loader2 size={20} className="animate-spin mr-2" />Carregando...
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/[0.07] flex items-center justify-center mb-5">
            <Building2 size={28} className="text-zinc-700" />
          </div>
          <h3 className="text-zinc-200 font-bold text-lg mb-2">Nenhum workspace</h3>
          <p className="text-zinc-600 text-sm max-w-xs mb-8">Crie um workspace para começar a compartilhar acessos com seu time.</p>
          <button onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20">
            <Plus size={14} />Criar primeiro workspace
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {workspaces.map((ws, i) => {
            const role = ROLE_CFG[ws.role] ?? ROLE_CFG.member;
            return (
              <motion.div key={ws.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link href={`/workspaces/${ws.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-zinc-100 font-bold text-sm">{ws.name}</h3>
                      <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${role.cls}`}>{role.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-zinc-700 text-[10px]">
                      {ws.member_count !== undefined && <span className="flex items-center gap-1"><Users size={9} />{ws.member_count} membro{ws.member_count !== 1 ? "s" : ""}</span>}
                      {ws.created_at && <span>Criado em {new Date(String(ws.created_at ?? "")).toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/workspaces/${ws.id}/members`} onClick={e => e.stopPropagation()}
                      className="w-8 h-8 rounded-xl bg-zinc-800 border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all" title="Membros">
                      <Users size={13} />
                    </Link>
                    <Link href={`/workspaces/${ws.id}`} onClick={e => e.stopPropagation()}
                      className="w-8 h-8 rounded-xl bg-zinc-800 border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all" title="Configurações">
                      <Settings size={13} />
                    </Link>
                  </div>
                  <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.15 }}
              className="w-full max-w-md bg-zinc-950 border border-white/[0.09] rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-zinc-100 font-bold text-lg">Novo workspace</h2>
                  <p className="text-zinc-600 text-xs mt-0.5">Compartilhe acessos com seu time</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-zinc-700 hover:text-zinc-400 transition-colors"><X size={16} /></button>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nome do workspace</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Equipe de Marketing"
                  onKeyDown={e => e.key === "Enter" && createWs()}
                  className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-white/[0.07] text-zinc-500 hover:text-zinc-300 transition-all text-sm">Cancelar</button>
                <button onClick={createWs} disabled={!name.trim() || creating}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} />Criar</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
