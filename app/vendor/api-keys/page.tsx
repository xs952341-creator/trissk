"use client";
// app/vendor/api-keys/page.tsx
// Gestão de API Keys para a API pública do vendor.

import { useState, useEffect } from "react";
import { Key, Plus, Trash2, Loader2, CheckCircle2, Copy, AlertTriangle, X, RefreshCw, Code, Eye, EyeOff, ExternalLink } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_hour: number;
  last_used_at: string | null;
  created_at: string;
}

const ALL_SCOPES = [
  { id: "products:read",     label: "Listar produtos",      description: "GET /api/v1/products" },
  { id: "products:write",    label: "Criar/editar produtos", description: "POST /api/v1/products" },
  { id: "subscribers:read",  label: "Listar assinantes",    description: "GET /api/v1/subscribers" },
];

export default function ApiKeysPage() {
  const [keys,       setKeys]       = useState<ApiKey[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [revoking,   setRevoking]   = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [newKey,     setNewKey]     = useState<string | null>(null);
  const [showKey,    setShowKey]    = useState(false);
  const [name,       setName]       = useState("");
  const [scopes,     setScopes]     = useState<string[]>(["products:read", "subscribers:read"]);
  const [toast,      setToast]      = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadKeys = async () => {
    setLoading(true);
    const res = await fetch("/api/vendor/api-keys");
    if (res.ok) { const d = await res.json(); setKeys(d.keys ?? []); }
    setLoading(false);
  };

  useEffect(() => { loadKeys(); }, []);

  const createKey = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/vendor/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Erro ao criar key", "err"); return; }
      setNewKey(data.key);
      setName(""); setScopes(["products:read", "subscribers:read"]); setShowForm(false);
      await loadKeys();
    } catch { showToast("Erro de conexão", "err"); }
    finally { setCreating(false); }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revogar esta API Key? Esta ação é irreversível.")) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/vendor/api-keys?id=${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? "Erro", "err"); return; }
      showToast("API Key revogada.");
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch { showToast("Erro de conexão", "err"); }
    finally { setRevoking(null); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!"));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium
          ${toast.type === "ok" ? "bg-emerald-950 border-emerald-500/40 text-emerald-300" : "bg-red-950 border-red-500/40 text-red-300"}`}>
          {toast.type === "ok" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Key size={22} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">API Pública — Chaves de Acesso</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Gerencie produtos e assinantes via API REST.</p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors">
            <Plus size={14} /> Nova API Key
          </button>
        </div>

        {/* Base URL */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Code size={13} />
            <span className="font-semibold text-zinc-400">Base URL</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-emerald-400 font-mono bg-zinc-900 px-3 py-2 rounded-lg flex-1">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/v1
            </code>
            <button onClick={() => copyToClipboard(`${window.location.origin}/api/v1`)}
              className="text-zinc-600 hover:text-zinc-400 p-2">
              <Copy size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { method: "GET",  path: "/api/v1/products",    label: "Listar produtos" },
              { method: "GET",  path: "/api/v1/subscribers", label: "Listar assinantes" },
              { method: "POST", path: "/api/v1/products",    label: "Criar produto" },
            ].map((ep) => (
              <div key={ep.path} className="flex items-center gap-2 text-zinc-600">
                <span className={`font-mono font-bold ${ep.method === "GET" ? "text-blue-500" : "text-amber-500"}`}>{ep.method}</span>
                <code className="text-zinc-500 font-mono">{ep.path}</code>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600">
            Autenticação: <code className="text-zinc-400">Authorization: Bearer pk_live_...</code>
          </p>
        </div>

        {/* Key revelada (só na criação) */}
        {newKey && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <h3 className="font-semibold text-amber-300">Copie sua API Key agora!</h3>
            </div>
            <p className="text-xs text-amber-500/80">Esta chave será exibida apenas uma vez. Não é possível recuperá-la depois.</p>
            <div className="flex items-center gap-2 bg-zinc-900 rounded-xl p-3">
              <code className="text-sm font-mono text-emerald-400 flex-1 overflow-x-auto">
                {showKey ? newKey : newKey.slice(0, 12) + "•".repeat(40) + newKey.slice(-4)}
              </code>
              <button onClick={() => setShowKey(!showKey)} className="text-zinc-600 hover:text-zinc-400 p-1">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => copyToClipboard(newKey)} className="text-zinc-500 hover:text-zinc-300 p-1">
                <Copy size={14} />
              </button>
            </div>
            <button onClick={() => setNewKey(null)}
              className="w-full border border-white/10 rounded-full py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              Entendi, já copiei minha chave
            </button>
          </div>
        )}

        {/* Form criar key */}
        {showForm && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5 space-y-4">
            <h3 className="font-semibold text-zinc-200">Nova API Key</h3>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Nome da key</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="ex: CRM Integration, Zapier Webhook..."
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Escopos (permissões)</label>
              {ALL_SCOPES.map((s) => (
                <label key={s.id} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={scopes.includes(s.id)}
                    onChange={(e) => setScopes(e.target.checked ? [...scopes, s.id] : scopes.filter((x) => x !== s.id))}
                    className="rounded text-emerald-500" />
                  <div>
                    <p className="text-sm text-zinc-300">{s.label}</p>
                    <p className="text-xs text-zinc-600 font-mono">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-white/10 rounded-full py-2.5 text-sm text-zinc-400 hover:border-white/20 hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
              <button onClick={createKey} disabled={creating || !name.trim() || scopes.length === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {creating ? <><Loader2 size={14} className="animate-spin" /> Criando...</> : "Criar API Key"}
              </button>
            </div>
          </div>
        )}

        {/* Lista de keys */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-200">API Keys Ativas ({keys.length}/10)</h2>
            <button onClick={loadKeys} disabled={loading} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/[0.04]">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 size={18} className="animate-spin" /> Carregando...
            </div>
          ) : keys.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Key size={32} className="mx-auto text-zinc-700" />
              <p className="text-zinc-500 text-sm">Nenhuma API Key ativa.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/30">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Key size={14} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{k.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs text-zinc-500 font-mono">{k.key_prefix}••••••••••••••••</code>
                      <span className="text-zinc-700">·</span>
                      {k.scopes.map((s) => (
                        <span key={s} className="text-[10px] text-zinc-600 font-mono">{s}</span>
                      ))}
                    </div>
                    {k.last_used_at && (
                      <p className="text-xs text-zinc-700 mt-0.5">
                        Último uso: {new Date(String(k.last_used_at ?? "")).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <button onClick={() => revokeKey(k.id)} disabled={revoking === k.id}
                    className="text-zinc-700 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                    {revoking === k.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
