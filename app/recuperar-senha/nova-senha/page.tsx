"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

export default function NovaSenhaPage() {
  const supabase  = createClient();
  const router    = useRouter();
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);

  const handleSubmit = async () => {
    if (password.length < 8) { toast.error("A senha deve ter no mínimo 8 caracteres."); return; }
    if (password !== confirm)  { toast.error("As senhas não coincidem."); return; }
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) { toast.error(getErrorMessage(error)); setLoading(false); return; }
    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 2500);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
          {success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={28} className="text-emerald-400" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Senha atualizada!</h2>
              <p className="text-zinc-500 text-sm">Redirecionando para o dashboard...</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">Criar nova senha</h2>
                <p className="text-zinc-500 text-sm mt-1">Escolha uma senha forte com pelo menos 8 caracteres.</p>
              </div>

              {[{ label: "Nova senha", value: password, setter: setPassword }, { label: "Confirmar senha", value: confirm, setter: setConfirm }].map((field, i) => (
                <div key={i} className="space-y-1">
                  <label className="text-xs text-zinc-500">{field.label}</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                    <input
                      type={showPass ? "text" : "password"}
                      value={field.value}
                      onChange={e => field.setter(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors placeholder:text-zinc-700"
                    />
                    {i === 0 && (
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-emerald-500 text-zinc-950 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Salvar nova senha"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
