"use client";
// app/solicitar-dados/page.tsx
// Formulário LGPD: usuário solicita acesso, correção, portabilidade ou exclusão de dados.
// Cria um ticket de suporte especial com tag "lgpd".

import { useState, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LEGAL } from "@/lib/legal";
import { Shield, CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

const TIPOS_SOLICITACAO = [
  { value: "acesso",          label: "Acesso — quero uma cópia dos meus dados" },
  { value: "correcao",        label: "Correção — quero corrigir dados incorretos" },
  { value: "exclusao",        label: "Exclusão — quero deletar minha conta e dados" },
  { value: "portabilidade",   label: "Portabilidade — quero exportar meus dados" },
  { value: "revogacao",       label: "Revogação de consentimento de marketing" },
  { value: "oposicao",        label: "Oposição ao tratamento por legítimo interesse" },
];

function SolicitarDadosContent() {
  const [tipo,    setTipo]    = useState("");
  const [email,   setEmail]   = useState("");
  const [nome,    setNome]    = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo || !email || !nome) { setError("Preencha todos os campos obrigatórios."); return; }
    setLoading(true); setError("");

    try {
      const res = await fetch("/api/lgpd/solicitar", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, email, nome, detalhe }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao enviar solicitação. Tente novamente."));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md">
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-50 mb-2">Solicitação recebida!</h2>
          <p className="text-zinc-400 text-sm">
            Atenderemos sua solicitação em <strong className="text-zinc-200">{LEGAL.LGPD.PRAZO_EXCLUSAO}</strong>.
            Você receberá uma confirmação em <strong className="text-zinc-200">{email}</strong>.
          </p>
          <Link href="/" className="mt-6 inline-block text-emerald-500 hover:text-emerald-400 text-sm transition">
            ← Voltar para o início
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <Link href="/privacidade" className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors">← Política de Privacidade</Link>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Shield size={22} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-50">Solicitação de Dados (LGPD)</h1>
            <p className="text-zinc-500 text-sm">Exercite seus direitos previstos na Lei nº 13.709/2018</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tipo de solicitação */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Tipo de solicitação *</label>
            <div className="relative">
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                required
                className="w-full appearance-none bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition"
              >
                <option value="" disabled>Selecione o tipo...</option>
                {TIPOS_SOLICITACAO.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Nome completo *</label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
              placeholder="Como consta na sua conta"
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">E-mail da conta *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="email@utilizado.na.conta.com"
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition"
            />
          </div>

          {/* Detalhes */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Detalhes adicionais (opcional)</label>
            <textarea
              value={detalhe}
              onChange={e => setDetalhe(e.target.value)}
              rows={4}
              placeholder="Descreva sua solicitação com mais detalhes, se necessário..."
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="rounded-xl bg-zinc-900/60 border border-white/5 p-4 text-xs text-zinc-500 space-y-1">
            <p>📋 Atendemos em <strong className="text-zinc-400">{LEGAL.LGPD.PRAZO_EXCLUSAO}</strong></p>
            <p>⚠️ {LEGAL.LGPD.EXCECAO_EXCLUSAO}</p>
            <p>📧 Confirmação enviada para o e-mail informado</p>
          </div>

          <button
            type="submit"
            disabled={loading || !tipo || !email || !nome}
            className="w-full bg-emerald-500 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin" />
              : "Enviar Solicitação"
            }
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-600 text-center">
          Dúvidas? Escreva para{" "}
          <a href={`mailto:${LEGAL.LGPD.CONTATO_DPO}`} className="text-emerald-600 hover:text-emerald-500">
            {LEGAL.LGPD.CONTATO_DPO}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SolicitarDadosPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-500" />
      </div>
    }>
      <SolicitarDadosContent />
    </Suspense>
  );
}
