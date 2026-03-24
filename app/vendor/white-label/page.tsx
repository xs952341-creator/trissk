"use client";
// app/vendor/white-label/page.tsx
// Gerencia domínios personalizados (white-label) para o vendor.
// Vendor configura seu domínio → sistema gera TXT para verificação DNS.
// Após verificado, o domínio redireciona para a página do produto com branding do vendor.

import { useState, useEffect } from "react";
import { Globe, Plus, Trash2, Loader2, CheckCircle2, Clock, AlertTriangle, X, Copy, RefreshCw, Info, ExternalLink } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

interface DomainRecord {
  id: string;
  domain: string;
  product_slug: string | null;
  verify_token: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

interface DnsInstructions {
  type: string;
  name: string;
  value: string;
  ttl: number;
  note: string;
}

export default function WhiteLabelPage() {
  const [domains,    setDomains]    = useState<DomainRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [verifying,  setVerifying]  = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [slugInput,  setSlugInput]  = useState("");
  const [newDomainInstructions, setNewDomainInstructions] = useState<DnsInstructions | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadDomains = async () => {
    setLoading(true);
    const res = await fetch("/api/vendor/white-label");
    if (res.ok) {
      const data = await res.json();
      setDomains(data.domains ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { loadDomains(); }, []);

  const addDomain = async () => {
    if (!domainInput.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/vendor/white-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim(), productSlug: slugInput.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Erro ao adicionar domínio", "err"); return; }
      setNewDomainInstructions(data.instructions);
      setDomainInput(""); setSlugInput(""); setShowForm(false);
      await loadDomains();
      showToast("Domínio adicionado! Configure o TXT record abaixo.");
    } catch { showToast("Erro de conexão", "err"); }
    finally { setAdding(false); }
  };

  const verifyDomain = async (domainId: string) => {
    setVerifying(domainId);
    try {
      const res = await fetch("/api/vendor/white-label", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      });
      const data = await res.json();
      showToast(data.message, data.verified ? "ok" : "err");
      if (data.verified) await loadDomains();
    } catch { showToast("Erro de conexão", "err"); }
    finally { setVerifying(null); }
  };

  const deleteDomain = async (id: string) => {
    if (!confirm("Remover este domínio? A página personalizada será desativada.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/vendor/white-label?id=${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? "Erro ao remover", "err"); return; }
      showToast("Domínio removido.");
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch { showToast("Erro de conexão", "err"); }
    finally { setDeleting(null); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!"));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium max-w-sm
          ${toast.type === "ok" ? "bg-emerald-950 border-emerald-500/40 text-emerald-300" : "bg-red-950 border-red-500/40 text-red-300"}`}>
          {toast.type === "ok" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Globe size={22} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">White-Label — Domínio Personalizado</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Configure seu domínio para que clientes acessem seu produto com sua marca.
              </p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">
            <Plus size={14} /> Adicionar Domínio
          </button>
        </div>

        {/* Info */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 flex gap-3">
          <Info size={15} className="text-zinc-500 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-500 space-y-1.5">
            <p>O white-label permite que clientes acessem seus produtos via domínio próprio (ex: <code className="text-zinc-400">app.minhaempresa.com</code>).</p>
            <p>Após adicionar o domínio, configure o TXT record no seu DNS para verificação. Em seguida, aponte o CNAME ou A record para o domínio desta plataforma.</p>
            <div className="flex gap-4 mt-2">
              <div className="bg-zinc-800 rounded-lg p-2.5 font-mono text-[10px] text-zinc-400">
                <div className="text-zinc-600 mb-1">CNAME record</div>
                <div>{BRAND.domain}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Form adicionar domínio */}
        {showForm && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-5 space-y-4">
            <h3 className="font-semibold text-zinc-200">Novo Domínio Personalizado</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Domínio (sem https://)</label>
                <input value={domainInput} onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="app.minhaempresa.com"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 font-mono transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Slug do produto (opcional)</label>
                <input value={slugInput} onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="meu-saas"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
            <p className="text-xs text-zinc-600">
              Se o slug do produto for informado, acessar o domínio raiz (/) redirecionará para a página desse produto.
              Caso contrário, exibirá todos os seus produtos.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-white/10 rounded-full py-2.5 text-sm text-zinc-400 hover:border-white/20 hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
              <button onClick={addDomain} disabled={adding || !domainInput.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-full py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {adding ? <><Loader2 size={14} className="animate-spin" /> Adicionando...</> : "Adicionar"}
              </button>
            </div>
          </div>
        )}

        {/* DNS Instructions após adicionar */}
        {newDomainInstructions && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <h3 className="font-semibold text-amber-300">Configure o TXT Record no seu DNS</h3>
              </div>
              <button onClick={() => setNewDomainInstructions(null)} className="text-zinc-600 hover:text-zinc-400">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Tipo", value: newDomainInstructions.type },
                { label: "Nome", value: newDomainInstructions.name },
                { label: "Valor", value: newDomainInstructions.value },
              ].map(({ label, value }) => (
                <div key={label} className="bg-zinc-900/60 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-zinc-200 font-mono flex-1 truncate">{value}</p>
                    <button onClick={() => copyToClipboard(value)} className="text-zinc-600 hover:text-zinc-400 shrink-0">
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-500/80">{newDomainInstructions.note}</p>
            <p className="text-xs text-zinc-600">
              Após configurar o TXT, volte aqui e clique em "Verificar" no domínio adicionado.
              Em seguida, aponte um CNAME record para o domínio desta plataforma.
            </p>
          </div>
        )}

        {/* Lista de domínios */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-200">Seus Domínios ({domains.length})</h2>
            <button onClick={loadDomains} disabled={loading}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/[0.04]">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 size={18} className="animate-spin" /> Carregando...
            </div>
          ) : domains.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Globe size={36} className="mx-auto text-zinc-700" />
              <p className="text-zinc-500 text-sm">Nenhum domínio configurado.</p>
              <p className="text-zinc-600 text-xs">Adicione seu domínio personalizado para ativar o white-label.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map((d) => (
                <div key={d.id}
                  className={`rounded-xl border p-4 transition-all
                    ${d.verified ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-white/5 bg-zinc-900/20"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${d.verified ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono text-zinc-200 truncate">{d.domain}</p>
                          {d.verified && (
                            <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer"
                              className="text-zinc-600 hover:text-zinc-400">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {d.verified ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 size={11} /> Verificado {d.verified_at ? `em ${new Date(String(d.verified_at ?? "")).toLocaleDateString("pt-BR")}` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-400 flex items-center gap-1">
                              <Clock size={11} /> Aguardando verificação DNS
                            </span>
                          )}
                          {d.product_slug && (
                            <span className="text-xs text-zinc-600">→ {d.product_slug}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!d.verified && (
                        <button onClick={() => verifyDomain(d.id)} disabled={verifying === d.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-60">
                          {verifying === d.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                          Verificar
                        </button>
                      )}
                      <button onClick={() => deleteDomain(d.id)} disabled={deleting === d.id}
                        className="text-zinc-700 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                        {deleting === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                  {/* TXT record para domínios não verificados */}
                  {!d.verified && (
                    <div className="mt-3 bg-zinc-900/60 rounded-lg p-3 space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">TXT Record para Verificação</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-zinc-400 flex-1 truncate">
                          Nome: <span className="text-zinc-300">_playbook-verify.{d.domain}</span>
                        </p>
                        <button onClick={() => copyToClipboard(`_playbook-verify.${d.domain}`)} className="text-zinc-600 hover:text-zinc-400">
                          <Copy size={11} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-zinc-400 flex-1 truncate">
                          Valor: <span className="text-zinc-300">{d.verify_token}</span>
                        </p>
                        <button onClick={() => copyToClipboard(d.verify_token)} className="text-zinc-600 hover:text-zinc-400">
                          <Copy size={11} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
