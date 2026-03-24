"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/errors";

export default function RecuperarSenhaPage() {
  const supabase = createClient();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async () => {
    if (!email) { toast.error("Informe seu e-mail."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/recuperar-senha/nova-senha`,
    });
    if (error) { toast.error(getErrorMessage(error)); setLoading(false); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link href="/login" className="flex items-center gap-2 text-zinc-600 hover:text-zinc-400 text-sm mb-8 transition-colors">
          <ArrowLeft size={15} /> Voltar ao login
        </Link>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={28} className="text-emerald-400" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-zinc-100">E-mail enviado!</h2>
              <p className="text-zinc-500 text-sm">Verifique sua caixa de entrada em <span className="text-zinc-300">{email}</span> e clique no link para redefinir sua senha.</p>
              <p className="text-zinc-700 text-xs">Não recebeu? Verifique o spam ou tente novamente.</p>
              <button onClick={() => setSent(false)} className="text-emerald-400 text-sm hover:underline">Tentar com outro e-mail</button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">Recuperar senha</h2>
                <p className="text-zinc-500 text-sm mt-1">Insira seu e-mail e enviaremos um link de redefinição.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500">E-mail</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    placeholder="seu@email.com"
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors placeholder:text-zinc-700"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-emerald-500 text-zinc-950 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Enviar link de recuperação"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
