"use client";
// Página pública de validação de certificado

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface CertData {
  valid: boolean;
  certificate?: {
    buyer_name: string;
    product_name: string;
    issued_at: string;
    code: string;
  };
  message?: string;
}

function CertificadoInner() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [result, setResult] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = async () => {
    if (!code.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/certificates?code=${encodeURIComponent(code.trim())}`);
    const json = await res.json();
    setResult(json);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <ShieldCheck size={40} className="text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-zinc-50">Validar Certificado</h1>
          <p className="text-zinc-500 text-sm mt-2">Digite o código de validação para verificar autenticidade</p>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && validate()}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none font-mono focus:border-emerald-500/50 uppercase"
            />
            <button onClick={validate} disabled={loading || !code.trim()}
              className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold px-5 py-3 rounded-xl hover:bg-emerald-400 disabled:opacity-50 transition">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </div>

          {result && (
            <div className={`rounded-xl border p-5 ${result.valid
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {result.valid
                  ? <CheckCircle2 size={20} className="text-emerald-400" />
                  : <XCircle size={20} className="text-red-400" />}
                <span className={`font-semibold ${result.valid ? "text-emerald-300" : "text-red-300"}`}>
                  {result.valid ? "Certificado válido e autêntico" : "Certificado inválido ou não encontrado"}
                </span>
              </div>
              {result.valid && result.certificate && (
                <div className="space-y-1 text-sm text-zinc-300">
                  <p><span className="text-zinc-500">Aluno:</span> {result.certificate.buyer_name}</p>
                  <p><span className="text-zinc-500">Produto:</span> {result.certificate.product_name}</p>
                  <p><span className="text-zinc-500">Emitido em:</span> {new Date(result.certificate.issued_at).toLocaleDateString("pt-BR")}</p>
                  <p><span className="text-zinc-500">Código:</span> <code className="font-mono text-emerald-400">{result.certificate.code}</code></p>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-700 mt-6">
          <a href="/" className="hover:text-zinc-500">Playbook Hub</a> — Plataforma de Certificação Digital
        </p>
      </div>
    </div>
  );
}

export default function CertificadoPage() {
  return <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}><CertificadoInner /></Suspense>;
}
