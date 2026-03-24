"use client";
// Área do comprador — Meus Certificados

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Award, Download, ExternalLink, Shield, Loader2, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Certificate {
  id: string;
  code: string;
  product_name: string;
  vendor_name: string;
  issued_at: string;
  is_valid: boolean;
}

export default function MeusCertificadosPage() {
  const supabase = createClient();
  const [certs,   setCerts]   = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res  = await fetch("/api/certificates");
      const json = await res.json();
      setCerts(json.certificates ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-50">Meus Certificados</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Certificados de conclusão dos produtos</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zinc-600" /></div>
      ) : certs.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-12 text-center">
          <Award size={32} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Nenhum certificado ainda</p>
          <p className="text-sm text-zinc-600 mt-1">Complete produtos para ganhar certificados</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {certs.map(c => (
            <div key={c.id} className="bg-zinc-900 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
              {/* Decorative border */}
              <div className="absolute inset-0 border-[3px] border-emerald-500/20 rounded-2xl pointer-events-none" />
              
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <Award size={18} className="text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{c.product_name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">por {c.vendor_name}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-zinc-500">
                <div className="flex items-center justify-between">
                  <span>Emitido em</span>
                  <span className="text-zinc-300">{new Date(String(c.issued_at ?? "")).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Código</span>
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono text-emerald-400 text-xs">{c.code}</code>
                    <button onClick={() => copy(c.code)} className="text-zinc-600 hover:text-zinc-400">
                      {copied === c.code ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <a href={`/certificado?code=${c.code}`} target="_blank"
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-zinc-800 text-zinc-300 border border-white/10 py-2 rounded-xl hover:border-emerald-500/40 hover:text-emerald-400 transition">
                  <Shield size={12} /> Validar
                </a>
                <button
                  onClick={() => window.open(`/api/certificates/download?code=${c.code}`, "_blank")}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-2 rounded-xl hover:bg-emerald-500/30 transition">
                  <Download size={12} /> Baixar PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
