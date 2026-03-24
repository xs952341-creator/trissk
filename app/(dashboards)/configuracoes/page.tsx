"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, User, Mail, Lock, Eye, EyeOff, Shield } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

export default function ConfiguracoesPage() {
  const supabase = createClient();
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPass,  setShowPass]  = useState(false);
  const [loadInfo,  setLoadInfo]  = useState(false);
  const [loadPass,  setLoadPass]  = useState(false);
  const [role,      setRole]      = useState("buyer");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setEmail(session.user.email ?? "");
      supabase.from("profiles").select("full_name, role").eq("id", session.user.id).single()
        .then(({ data }) => { if (data) { setName(data.full_name ?? ""); setRole(data.role ?? "buyer"); } });
    });
  }, []);

  const saveInfo = async () => {
    setLoadInfo(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", session.user.id);
    if (error) toast.error("Erro ao salvar."); else toast.success("Perfil atualizado!");
    setLoadInfo(false);
  };

  const savePassword = async () => {
    if (password.length < 8) { toast.error("Mínimo 8 caracteres."); return; }
    if (password !== confirm)  { toast.error("As senhas não coincidem."); return; }
    setLoadPass(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(getErrorMessage(error)); else { toast.success("Senha atualizada!"); setPassword(""); setConfirm(""); }
    setLoadPass(false);
  };

  const changeRole = async (newRole: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("profiles").update({ role: newRole }).eq("id", session.user.id);
    setRole(newRole);
    toast.success("Papel atualizado!");
  };

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-zinc-50">Configurações</h1>

      {/* Informações pessoais */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <User size={16} className="text-emerald-400" />
          </div>
          <h2 className="font-semibold text-zinc-100">Informações Pessoais</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Nome completo</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors" />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">E-mail</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={email} readOnly
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-500 cursor-not-allowed" />
          </div>
          <p className="text-xs text-zinc-700">O e-mail não pode ser alterado aqui.</p>
        </div>

        <button onClick={saveInfo} disabled={loadInfo}
          className="bg-emerald-500 text-zinc-950 font-bold px-6 py-2.5 rounded-xl hover:bg-emerald-400 transition-all text-sm flex items-center gap-2 disabled:opacity-60">
          {loadInfo ? <Loader2 size={14} className="animate-spin" /> : "Salvar alterações"}
        </button>
      </motion.div>

      {/* Senha */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Lock size={16} className="text-emerald-400" />
          </div>
          <h2 className="font-semibold text-zinc-100">Alterar Senha</h2>
        </div>

        {[{ label: "Nova senha", value: password, setter: setPassword }, { label: "Confirmar nova senha", value: confirm, setter: setConfirm }].map((f, i) => (
          <div key={i} className="space-y-1">
            <label className="text-xs text-zinc-500">{f.label}</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} value={f.value} onChange={e => f.setter(e.target.value)} placeholder="••••••••"
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 pr-10 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors placeholder:text-zinc-700" />
              {i === 0 && (
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
          </div>
        ))}

        <button onClick={savePassword} disabled={loadPass}
          className="bg-zinc-800 border border-white/10 text-zinc-200 font-semibold px-6 py-2.5 rounded-xl hover:bg-zinc-700 transition-all text-sm flex items-center gap-2 disabled:opacity-60">
          {loadPass ? <Loader2 size={14} className="animate-spin" /> : "Atualizar senha"}
        </button>
      </motion.div>

      {/* Papel na plataforma */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-emerald-400" />
          </div>
          <h2 className="font-semibold text-zinc-100">Meu Papel na Plataforma</h2>
        </div>
        <p className="text-zinc-500 text-sm">Altere como você usa a plataforma. Isso afeta quais menus aparecem para você.</p>
        <div className="grid grid-cols-3 gap-3">
          {[{ id: "buyer", label: "Comprador" }, { id: "vendor", label: "Produtor" }, { id: "affiliate", label: "Afiliado" }].map(r => (
            <button key={r.id} onClick={() => changeRole(r.id)}
              className={`py-2.5 rounded-xl text-sm font-medium transition-all border ${
                role === r.id ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
