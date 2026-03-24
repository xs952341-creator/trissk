"use client";
// app/(dashboards)/workspaces/[id]/members/page.tsx — Membros do workspace premium
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Users, Plus, Loader2, X, Crown, Shield, User,
  Trash2, Check, Mail, ArrowLeft, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

interface Member {
  id: string; user_id: string; role: "owner" | "admin" | "member";
  profiles?: { full_name?: string; email?: string; avatar_url?: string };
  joined_at?: string;
}

interface RoleConfig {
  label: string;
  icon: ComponentType<{ size?: number | string }>;
  cls: string;
}

const ROLE_CFG: Record<string, RoleConfig> = {
  owner:  { label: "Dono",   icon: Crown,  cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  admin:  { label: "Admin",  icon: Shield, cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  member: { label: "Membro", icon: User,   cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
};

export default function WorkspaceMembersPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch(`/api/workspaces/${id}/members`);
    const d = await r.json();
    setMembers(d.members ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const invite = async () => {
    if (!email.trim()) { toast.error("Digite um email."); return; }
    setInviting(true);
    const r = await fetch(`/api/workspaces/invite`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: id, email: email.trim(), role }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Falha ao convidar."); setInviting(false); return; }
    toast.success(`Convite enviado para ${email}!`);
    setEmail(""); setShowInvite(false); setInviting(false);
    load();
  };

  const remove = async (userId: string, memberName?: string) => {
    setRemovingId(userId);
    await fetch(`/api/workspaces/${id}/members/remove`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    toast.success(`${memberName || "Membro"} removido.`);
    setMembers(prev => prev.filter(m => m.user_id !== userId));
    setRemovingId(null);
  };

  const changeRole = async (userId: string, newRole: string) => {
    await fetch(`/api/workspaces/${id}/members/role`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    toast.success("Papel atualizado.");
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/workspaces/${id}`} className="w-8 h-8 rounded-xl border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all">
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-50 tracking-tight">Membros</h1>
          <p className="text-zinc-600 text-xs">{members.length} membro{members.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20">
          <Plus size={12} />Convidar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-zinc-700"><Loader2 size={18} className="animate-spin mr-2" />Carregando...</div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          {members.map((m, i) => {
            const cfg = ROLE_CFG[String(m.role)] ?? ROLE_CFG.member;
            const RoleIcon = cfg.icon;
            const profile = m.profiles as { full_name?: string; email?: string; avatar_url?: string } | null;
            const isOwner = m.role === "owner";
            return (
              <div key={m.id} className={`flex items-center gap-3 px-5 py-4 ${i < members.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/[0.07] overflow-hidden flex items-center justify-center text-zinc-500 font-bold text-sm shrink-0">
                  {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> : (profile?.full_name || profile?.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-100 text-sm font-semibold truncate">{profile?.full_name || "Usuário"}</p>
                  <p className="text-zinc-600 text-[10px] truncate">{profile?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner ? (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cfg.cls}`}>
                      <RoleIcon size={9} />{cfg.label}
                    </span>
                  ) : (
                    <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}
                      className="text-[10px] font-semibold bg-zinc-900 border border-white/[0.07] rounded-lg px-2 py-1 text-zinc-300 outline-none cursor-pointer hover:border-white/15 transition-colors">
                      <option value="admin">Admin</option>
                      <option value="member">Membro</option>
                    </select>
                  )}
                  {!isOwner && (
                    <button onClick={() => remove(m.user_id, profile?.full_name)}
                      disabled={removingId === m.user_id}
                      className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-all disabled:opacity-50">
                      {removingId === m.user_id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="flex flex-col items-center py-10 text-zinc-700 text-center">
              <Users size={24} className="mb-2 opacity-30" /><p className="text-xs">Nenhum membro ainda.</p>
            </div>
          )}
        </div>
      )}

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.15 }}
              className="w-full max-w-sm bg-zinc-950 border border-white/[0.09] rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-zinc-100 font-bold">Convidar membro</h2>
                <button onClick={() => setShowInvite(false)} className="text-zinc-700 hover:text-zinc-400"><X size={15} /></button>
              </div>
              <div className="flex flex-col gap-3 mb-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                    <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && invite()}
                      placeholder="email@empresa.com" type="email"
                      className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Papel</label>
                  <div className="flex gap-2">
                    {(["member","admin"] as const).map(r => (
                      <button key={r} onClick={() => setRole(r)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${role === r ? ROLE_CFG[r].cls : "border-white/[0.07] text-zinc-600 hover:text-zinc-300"}`}>
                        {ROLE_CFG[r].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.07] text-zinc-500 text-sm hover:text-zinc-300 transition-all">Cancelar</button>
                <button onClick={invite} disabled={!email.trim() || inviting}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all">
                  {inviting ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />Convidar</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
