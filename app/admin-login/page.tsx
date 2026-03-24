"use client";
// app/admin-login/page.tsx
// Login exclusivo de administradores.
// Não quebra o /login comum. Após autenticação, valida role=admin no DB.
// Se não for admin → logout automático + mensagem de erro.

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

function AdminLoginContent() {
  const supabase     = createClient();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const next         = searchParams.get("next") || "/admin";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Autenticar
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !authData.user) {
      toast.error("Credenciais inválidas.");
      setLoading(false);
      return;
    }

    // 2. Verificar role=admin no banco
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profile?.role !== "admin") {
      // Não é admin — forçar logout e bloquear
      await supabase.auth.signOut();
      toast.error("Acesso negado. Apenas administradores podem entrar aqui.");
      setLoading(false);
      return;
    }

    toast.success("Bem-vindo, Admin.");
    router.push(next);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <ShieldCheck size={26} className="text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-zinc-50">Acesso Administrativo</h1>
          <p className="text-zinc-500 text-sm mt-1">Área restrita — somente administradores</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition"
              placeholder="admin@empresa.com"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Senha</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-emerald-500 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 disabled:opacity-40 mt-2"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin" />
              : <><ShieldCheck size={15} /> <span>Entrar como Admin</span></>
            }
          </button>
        </form>

        <p className="text-center text-xs text-zinc-700 mt-8">
          Esta área é monitorada. Tentativas de acesso não autorizado são registradas.
        </p>
      </motion.div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-500" />
      </div>
    }>
      <AdminLoginContent />
    </Suspense>
  );
}
