"use client";

import { motion } from "framer-motion";
import { Mail, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function VerificarEmailPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center">
            <Mail size={36} className="text-emerald-400" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Confirme seu e-mail</h1>
          <p className="text-zinc-500 text-sm mt-3 leading-relaxed">
            Enviamos um link de confirmação para o seu e-mail. Clique nele para ativar sua conta e começar a usar a plataforma.
          </p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 text-left space-y-3">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">O que fazer agora</p>
          {["Abra seu e-mail", "Procure uma mensagem de Playbook Hub", "Clique em 'Confirmar e-mail'", "Você será redirecionado automaticamente"].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>
              <span className="text-zinc-400 text-sm">{step}</span>
            </div>
          ))}
        </div>
        <p className="text-zinc-700 text-xs">Não recebeu? Verifique o spam ou entre em contato com o suporte.</p>
        <Link href="/login" className="flex items-center justify-center gap-2 text-zinc-600 hover:text-zinc-400 text-sm transition-colors">
          <ArrowLeft size={14} /> Voltar ao login
        </Link>
      </motion.div>
    </div>
  );
}
