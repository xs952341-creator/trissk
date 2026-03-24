"use client";
/**
 * LoginPage v3 — Padrão Apple/Stripe
 * Tipografia Syne, split-screen elegante, animações suaves, SSO detection, magic link.
 */

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, Building2, CheckCircle2, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/errors";

// ── Google logo inline ────────────────────────────────────────────────────────
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── Perks animadas ────────────────────────────────────────────────────────────
const PERKS = [
  { icon: "⚡", text: "Checkout nativo com PIX e cartão" },
  { icon: "🤝", text: "Afiliados multi-level L1/L2/L3" },
  { icon: "📊", text: "Analytics MRR, LTV e Churn" },
  { icon: "🔒", text: "Segurança enterprise com RLS" },
  { icon: "🌍", text: "Multi-moeda e nota fiscal" },
];

// ── Inner login form ──────────────────────────────────────────────────────────
function LoginPageInner() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoad, setGoogleLoad] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoDomain, setSsoDomain] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    if (errorParam) toast.error("Erro ao autenticar. Tente novamente.");
  }, [errorParam]);

  // SSO detection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = email.trim().toLowerCase();
      if (!v.includes("@")) { setSsoEnabled(false); setSsoDomain(null); return; }
      try {
        const res = await fetch(`/api/auth/sso-lookup?email=${encodeURIComponent(v)}`);
        const j = await res.json();
        if (cancelled) return;
        setSsoEnabled(Boolean(j?.enabled));
        setSsoDomain(j?.domain ?? null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [email]);

  const handleGoogle = async () => {
    setGoogleLoad(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) { toast.error(getErrorMessage(error)); setGoogleLoad(false); }
  };

  const handleSSO = async () => {
    if (!ssoDomain) return;
    setSsoLoading(true);
    const { error } = await supabase.auth.signInWithSSO({
      domain: ssoDomain,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { toast.error(getErrorMessage(error)); setSsoLoading(false); }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) { toast.error("Preencha todos os campos."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { toast.error(error.message === "Invalid login credentials" ? "Email ou senha incorretos." : getErrorMessage(error)); return; }
        router.push(next);
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
        });
        if (error) { toast.error(getErrorMessage(error)); return; }
        toast.success("Conta criada! Verifique seu email para confirmar.");
        router.push("/verificar-email");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--surface-0)" }}
    >
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12 relative overflow-hidden"
        style={{ background: "var(--surface-1)", borderRight: "1px solid var(--border-subtle)" }}
      >
        {/* Background glow */}
        <div
          className="absolute top-[-10%] left-[-20%] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(34,212,160,0.08) 0%, transparent 70%)" }}
        />

        {/* Logo */}
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 mb-16">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-brand"
              style={{ background: "var(--brand)" }}
            >
              <Zap size={17} className="text-black/80" fill="currentColor" />
            </div>
            <span
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              Playbook<span style={{ color: "var(--brand)" }}>Hub</span>
            </span>
          </Link>

          <h2
            className="text-3xl font-bold mb-3 leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            A plataforma de SaaS<br />mais completa do Brasil.
          </h2>
          <p className="text-sm leading-relaxed mb-10" style={{ color: "var(--text-muted)" }}>
            Venda, distribua e escale seus produtos digitais com infraestrutura de nível enterprise.
          </p>

          {/* Perks */}
          <div className="space-y-3">
            {PERKS.map((perk, i) => (
              <motion.div
                key={perk.text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex items-center gap-3"
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)" }}
                >
                  {perk.icon}
                </div>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{perk.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer quote */}
        <div className="card p-4">
          <p className="text-xs italic leading-relaxed mb-2" style={{ color: "var(--text-secondary)" }}>
            "O dunning automático sozinho recuperou mais de R$ 3.200 em cobranças que teriam sido perdidas."
          </p>
          <p className="text-[10px] font-semibold" style={{ color: "var(--brand)" }}>
            — Camila S., criadora de conteúdo de IA
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "var(--brand)" }}
            >
              <Zap size={15} className="text-black/80" fill="currentColor" />
            </div>
            <span className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
              Playbook<span style={{ color: "var(--brand)" }}>Hub</span>
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1
              className="text-2xl font-bold mb-1.5"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              {magicSent ? "Verifique seu email" : mode === "login" ? "Entrar na conta" : "Criar conta grátis"}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {magicSent
                ? "Enviamos um link mágico para seu email."
                : mode === "login"
                  ? "Bem-vindo de volta ao Playbook Hub."
                  : "Comece gratuitamente. Sem cartão de crédito."}
            </p>
          </div>

          {magicSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <div
                className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "rgba(34,212,160,0.1)", border: "1px solid rgba(34,212,160,0.2)" }}
              >
                <CheckCircle2 size={28} style={{ color: "var(--brand)" }} />
              </div>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Clique no link que enviamos para <strong style={{ color: "var(--text-primary)" }}>{email}</strong> para entrar.
              </p>
              <button
                onClick={() => setMagicSent(false)}
                className="text-sm underline"
                style={{ color: "var(--text-muted)" }}
              >
                Tentar novamente
              </button>
            </motion.div>
          ) : (
            <>
              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={googleLoad}
                className="btn-secondary w-full py-3 text-sm mb-4 relative"
              >
                {googleLoad ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <GoogleIcon size={16} />
                )}
                Continuar com Google
              </button>

              {/* SSO */}
              {ssoEnabled && ssoDomain && (
                <motion.button
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  onClick={handleSSO}
                  disabled={ssoLoading}
                  className="btn-secondary w-full py-3 text-sm mb-4"
                  style={{ color: "#7dd3fc", borderColor: "rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.05)" }}
                >
                  {ssoLoading ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
                  SSO Empresarial ({ssoDomain})
                </motion.button>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="divider flex-1" />
                <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>ou</span>
                <div className="divider flex-1" />
              </div>

              {/* Email */}
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    placeholder="seu@email.com"
                    className="input-base pl-10"
                    autoComplete="email"
                    aria-label="Email"
                  />
                </div>

                <div className="relative">
                  <Lock
                    size={14}
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    placeholder="Senha"
                    className="input-base pl-10 pr-10"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    aria-label="Senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="btn-primary w-full py-3.5 text-sm mb-4"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Entrar" : "Criar conta grátis"}
                    <ArrowRight size={14} />
                  </>
                )}
              </button>

              {/* Toggle mode */}
              <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
                {mode === "login" ? "Não tem conta?" : "Já tem conta?"}{" "}
                <button
                  onClick={() => setMode(m => m === "login" ? "signup" : "login")}
                  className="font-semibold transition-colors hover:underline"
                  style={{ color: "var(--brand)" }}
                >
                  {mode === "login" ? "Criar conta grátis" : "Entrar"}
                </button>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ── Export com Suspense ───────────────────────────────────────────────────────
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--surface-0)" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  );
}
