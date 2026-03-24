
"use client";
// app/vendor/fiscal/setup/page.tsx
// Onboarding fiscal do vendor: aceitar termos + escolher modo de emissão de NF

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Loader2, FileText, CheckCircle2, ArrowRight, Building2,
  Zap, XCircle, Info, ShieldCheck, ExternalLink, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type FiscalMode = "self" | "platform" | "none";

interface Profile {
  fiscal_mode: FiscalMode | null;
  enotas_api_key: string | null;
  enotas_company_id: string | null;
  cnpj: string | null;
  razao_social: string | null;
  inscricao_municipal: string | null;
  fiscal_terms_accepted_at: string | null;
}

const MODES: { id: FiscalMode; icon: LucideIcon; title: string; subtitle: string; badge?: string }[] = [
  {
    id: "self",
    icon: Zap,
    title: "Emissão própria via eNotas",
    subtitle: "Você conecta sua conta eNotas e a plataforma emite cada NF-e automaticamente usando suas credenciais.",
    badge: "Recomendado",
  },
  {
    id: "platform",
    icon: Building2,
    title: "Plataforma emite por você",
    subtitle: "Informe seus dados de empresa e a plataforma emite as notas fiscais de venda usando a conta da plataforma. Taxa adicional pode ser aplicada.",
  },
  {
    id: "none",
    icon: XCircle,
    title: "Emito por conta própria",
    subtitle: "Você assume integralmente a responsabilidade fiscal e emite suas próprias notas sem integração. Não recomendado — risco de penalidades.",
  },
];

export default function FiscalSetupPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState<"terms" | "mode" | "config" | "done">("terms");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [mode, setMode] = useState<FiscalMode | null>(null);

  // Form fields
  const [apiKey, setApiKey]       = useState("");
  const [compId, setCompId]       = useState("");
  const [cnpj, setCnpj]           = useState("");
  const [razao, setRazao]         = useState("");
  const [inscricao, setInscricao] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/enotas/config");
      if (res.ok) {
        const data: Profile = await res.json();
        setProfile(data);
        if (data.fiscal_terms_accepted_at) setTermsAccepted(true);
        if (data.fiscal_mode) {
          setMode(data.fiscal_mode);
          if (data.fiscal_mode === "self") {
            setApiKey(data.enotas_api_key ?? "");
            setCompId(data.enotas_company_id ?? "");
          }
          setCnpj(data.cnpj ?? "");
          setRazao(data.razao_social ?? "");
          setInscricao(data.inscricao_municipal ?? "");
          // If already configured, go straight to config step to allow editing
          if (data.fiscal_mode) setStep("mode");
        }
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!mode) { toast.error("Selecione um modo de emissão."); return; }
    if (mode === "self" && (!apiKey || !compId)) {
      toast.error("Preencha a chave de API e o ID da empresa eNotas.");
      return;
    }
    if (mode === "platform" && (!cnpj || !razao)) {
      toast.error("Preencha CNPJ e Razão Social.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/enotas/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fiscal_mode: mode,
        enotas_api_key: apiKey || undefined,
        enotas_company_id: compId || undefined,
        cnpj: cnpj || undefined,
        razao_social: razao || undefined,
        inscricao_municipal: inscricao || undefined,
      }),
    });

    if (res.ok) {
      toast.success("Configuração fiscal salva!");
      setStep("done");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Erro ao salvar.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-4">
          <Link href="/vendor/fiscal" className="hover:text-zinc-300 transition">Fiscal</Link>
          <ChevronRight size={12} />
          <span className="text-zinc-300">Configuração</span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-50">Configuração Fiscal</h1>
        <p className="text-zinc-400 text-sm">
          Defina como as notas fiscais das suas vendas serão emitidas.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {(["terms", "mode", "config", "done"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === s ? "bg-emerald-500 text-zinc-950" :
              ["terms","mode","config","done"].indexOf(step) > i ? "bg-emerald-500/20 text-emerald-400" :
              "bg-white/5 text-zinc-600"
            }`}>
              {["terms","mode","config","done"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            {i < 3 && <div className={`h-px w-8 transition-all ${["terms","mode","config","done"].indexOf(step) > i ? "bg-emerald-500/40" : "bg-white/5"}`} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1: TERMOS */}
        {step === "terms" && (
          <motion.div
            key="terms"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Responsabilidade Fiscal do Vendor</h2>
              </div>
              <div className="text-sm text-zinc-400 leading-relaxed space-y-3 max-h-72 overflow-y-auto pr-1">
                <p>
                  O Playbook Hub opera como <strong className="text-zinc-200">intermediador financeiro</strong> (Stripe Connect). A responsabilidade legal e tributária pela venda do software ao consumidor final é <strong className="text-zinc-200">exclusiva do Vendor</strong>.
                </p>
                <p>
                  Ao vender nesta plataforma, você declara que:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>É o detentor ou licenciado do software que está comercializando;</li>
                  <li>É responsável pela emissão da NF-e ao comprador pelo valor integral da transação;</li>
                  <li>A plataforma emitirá nota fiscal apenas sobre o valor da sua comissão (Application Fee) contra você;</li>
                  <li>Está ciente de que omissão fiscal pode resultar em penalidades legais, bloqueio de saldo e banimento da plataforma;</li>
                  <li>As notas serão emitidas em regime de <strong className="text-zinc-200">Licenciamento de Software</strong> (LC 116/2003, item 1.05 ou similar).</li>
                </ul>
                <p>
                  Para suporte técnico sobre integração eNotas, consulte{" "}
                  <a href="https://enotas.com.br/docs" target="_blank" rel="noopener" className="text-emerald-400 underline hover:text-emerald-300">
                    enotas.com.br/docs
                  </a>.
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div
                  onClick={() => setTermsAccepted((v) => !v)}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    termsAccepted
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-white/20 bg-zinc-900 group-hover:border-white/40"
                  }`}
                >
                  {termsAccepted && <CheckCircle2 size={13} className="text-zinc-950" />}
                </div>
                <span className="text-sm text-zinc-300 leading-relaxed">
                  Li e aceito as responsabilidades fiscais acima, incluindo a obrigação de emissão de NF-e ao comprador.
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (!termsAccepted) { toast.error("Aceite os termos para continuar."); return; }
                  setStep("mode");
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold px-6 py-3 hover:bg-emerald-400 transition disabled:opacity-40"
              >
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 2: ESCOLHA DE MODO */}
        {step === "mode" && (
          <motion.div
            key="mode"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <h2 className="text-sm font-semibold text-zinc-300">Como você quer emitir suas notas fiscais?</h2>

            <div className="space-y-3">
              {MODES.map((m) => {
                const Icon = m.icon;
                const isSelected = mode === m.id;
                return (
                  <motion.button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.995 }}
                    className={`w-full flex items-start gap-4 p-5 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${isSelected ? "bg-emerald-500/20" : "bg-white/5"}`}>
                      <Icon size={18} className={isSelected ? "text-emerald-400" : "text-zinc-500"} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${isSelected ? "text-zinc-50" : "text-zinc-200"}`}>{m.title}</span>
                        {m.badge && (
                          <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 border border-emerald-500/30">
                            {m.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{m.subtitle}</p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {mode === "none" && (
              <div className="flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  Ao escolher esta opção, você declara que emitirá as notas fiscais por fora e assume toda responsabilidade tributária. A plataforma não se responsabiliza por omissões.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("terms")} className="text-sm text-zinc-500 hover:text-zinc-300 transition">
                ← Voltar
              </button>
              <button
                onClick={() => {
                  if (!mode) { toast.error("Selecione um modo."); return; }
                  if (mode === "none") { handleSave(); return; }
                  setStep("config");
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold px-6 py-3 hover:bg-emerald-400 transition"
              >
                {mode === "none" ? "Confirmar" : "Configurar"} <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: CONFIGURAÇÃO */}
        {step === "config" && mode !== "none" && (
          <motion.div
            key="config"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-5">
              {mode === "self" ? (
                <>
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-emerald-400" />
                    <h2 className="text-sm font-semibold text-zinc-200">Credenciais eNotas</h2>
                    <a
                      href="https://enotas.com.br"
                      target="_blank"
                      rel="noopener"
                      className="ml-auto text-xs text-zinc-500 hover:text-emerald-400 flex items-center gap-1 transition"
                    >
                      Abrir eNotas <ExternalLink size={11} />
                    </a>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium">Chave de API eNotas <span className="text-red-400">*</span></label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Sua chave de API"
                        className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500/50 placeholder:text-zinc-600 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium">ID da Empresa no eNotas <span className="text-red-400">*</span></label>
                      <input
                        value={compId}
                        onChange={(e) => setCompId(e.target.value)}
                        placeholder="Ex: a1b2c3d4-e5f6-…"
                        className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500/50 placeholder:text-zinc-600 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium">CNPJ (opcional)</label>
                      <input
                        value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        placeholder="00.000.000/0001-00"
                        className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500/50 placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-emerald-400" />
                    <h2 className="text-sm font-semibold text-zinc-200">Dados da sua empresa</h2>
                  </div>
                  <div className="flex gap-2 rounded-xl bg-blue-500/5 border border-blue-500/20 p-3">
                    <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-300">
                      A plataforma emitirá as NF-e das suas vendas usando a conta eNotas da plataforma, com os dados da sua empresa como prestador.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium">CNPJ <span className="text-red-400">*</span></label>
                      <input
                        value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        placeholder="00.000.000/0001-00"
                        className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500/50 placeholder:text-zinc-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium">Razão Social <span className="text-red-400">*</span></label>
                      <input
                        value={razao}
                        onChange={(e) => setRazao(e.target.value)}
                        placeholder="Ex: Empresa XYZ Ltda"
                        className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500/50 placeholder:text-zinc-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium">Inscrição Municipal (se houver)</label>
                      <input
                        value={inscricao}
                        onChange={(e) => setInscricao(e.target.value)}
                        placeholder="Número de inscrição municipal"
                        className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-emerald-500/50 placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep("mode")} className="text-sm text-zinc-500 hover:text-zinc-300 transition">
                ← Voltar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold px-6 py-3 hover:bg-emerald-400 transition disabled:opacity-50"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : <><ShieldCheck size={15} /> Salvar configuração</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 4: DONE */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center space-y-4"
          >
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-50">Configuração fiscal salva!</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {mode === "self" && "As notas fiscais serão emitidas automaticamente via sua conta eNotas a cada venda confirmada."}
                {mode === "platform" && "A plataforma emitirá as NF-e das suas vendas automaticamente usando os dados da sua empresa."}
                {mode === "none" && "Você assumiu a responsabilidade de emitir as notas por conta própria. Mantenha sua regularidade fiscal."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link
                href="/vendor/fiscal"
                className="rounded-xl bg-white text-zinc-950 font-bold px-5 py-2.5 text-sm hover:bg-zinc-200 transition"
              >
                Ver painel fiscal
              </Link>
              <Link
                href="/vendor/produtos"
                className="rounded-xl border border-white/10 text-zinc-300 px-5 py-2.5 text-sm hover:border-white/20 hover:text-zinc-100 transition"
              >
                Ir para produtos
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
