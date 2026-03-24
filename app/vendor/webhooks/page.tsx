"use client";
// Vendor Webhook Management — registrar e testar endpoints de webhooks outbound

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Play, Copy, CheckCircle2, Loader2, Zap, Globe, Eye, EyeOff, AlertTriangle, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

const AVAILABLE_EVENTS = [
  { value: "sale.created",                label: "Venda realizada" },
  { value: "sale.refunded",               label: "Reembolso processado" },
  { value: "subscription.created",        label: "Assinatura criada" },
  { value: "subscription.canceled",       label: "Assinatura cancelada" },
  { value: "subscription.payment_failed", label: "Pagamento falhou" },
  { value: "subscription.renewed",        label: "Assinatura renovada" },
  { value: "chargeback.opened",           label: "Chargeback aberto" },
  { value: "chargeback.resolved",         label: "Chargeback resolvido" },
  { value: "license.created",             label: "Licença criada" },
  { value: "license.revoked",             label: "Licença revogada" },
  { value: "instance.provisioned",        label: "Instância provisionada" },
  { value: "instance.suspended",          label: "Instância suspensa" },
];

interface Endpoint {
  id: string; url: string; events: string[]; is_active: boolean;
  description?: string; created_at: string; secret?: string;
}

interface TestResult {
  success: boolean; status_code?: number; response_body?: string;
  latency_ms?: number; error?: string;
}

export default function VendorWebhooksPage() {
  const supabase = createClient();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [newUrl,    setNewUrl]    = useState("");
  const [newDesc,   setNewDesc]   = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["sale.created", "subscription.canceled"]);
  const [showForm,  setShowForm]  = useState(false);
  const [secrets,   setSecrets]   = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing,   setTesting]   = useState<string | null>(null);
  const [copied,    setCopied]    = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/vendor/webhooks");
    const json = await res.json();
    setEndpoints(json.endpoints ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newUrl.trim()) { toast.error("URL é obrigatória"); return; }
    setCreating(true);
    try {
      const res  = await fetch("/api/vendor/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents, description: newDesc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Endpoint criado!");
      setNewUrl(""); setNewDesc(""); setShowForm(false);
      load();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este endpoint?")) return;
    const res = await fetch(`/api/vendor/webhooks?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removido"); load(); }
    else toast.error("Erro ao remover");
  };

  const handleToggle = async (endpoint: Endpoint) => {
    const res = await fetch("/api/vendor/webhooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: endpoint.id, is_active: !endpoint.is_active }),
    });
    if (res.ok) { load(); } else toast.error("Erro ao atualizar");
  };

  const handleTest = async (endpointId: string) => {
    setTesting(endpointId);
    try {
      const res  = await fetch("/api/vendor/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint_id: endpointId }),
      });
      const json = await res.json();
      setTestResults(prev => ({ ...prev, [endpointId]: json }));
      if (json.success) toast.success(`✅ Webhook entregue (${json.latency_ms}ms)`);
      else toast.error(`❌ Falhou: ${json.error ?? `HTTP ${json.status_code}`}`);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setTesting(null);
    }
  };

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleEvent = (ev: string) => {
    setNewEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Webhooks</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Receba eventos em tempo real no seu servidor</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-emerald-400 transition"
        >
          <Plus size={16} /> Novo Endpoint
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-zinc-200">Registrar novo endpoint</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">URL do endpoint <span className="text-red-400">*</span></label>
              <div className="relative">
                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://seu-servidor.com/webhooks/playbook"
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Descrição (opcional)</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Ex: CRM de vendas"
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">Eventos a receber</label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_EVENTS.map(ev => (
                  <label key={ev.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEvents.includes(ev.value)}
                      onChange={() => toggleEvent(ev.value)}
                      className="accent-emerald-500"
                    />
                    <span className="text-xs text-zinc-400">{ev.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Criar endpoint
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-zinc-300 px-4 py-2.5">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Endpoints list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zinc-600" /></div>
      ) : endpoints.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-12 text-center">
          <Zap size={32} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Nenhum webhook configurado</p>
          <p className="text-sm text-zinc-600 mt-1">Registre um endpoint para receber eventos de venda em tempo real</p>
        </div>
      ) : (
        <div className="space-y-4">
          {endpoints.map(ep => {
            const testRes = testResults[ep.id];
            return (
              <div key={ep.id} className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${ep.is_active ? "bg-emerald-500" : "bg-zinc-600"}`} />
                      <p className="text-sm font-medium text-zinc-200 truncate">{ep.url}</p>
                    </div>
                    {ep.description && <p className="text-xs text-zinc-500 mb-2">{ep.description}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {ep.events.map(ev => (
                        <span key={ev} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTest(ep.id)}
                      disabled={testing === ep.id || !ep.is_active}
                      className="flex items-center gap-1.5 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 transition disabled:opacity-40"
                    >
                      {testing === ep.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Testar
                    </button>
                    <button
                      onClick={() => handleToggle(ep)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                        ep.is_active
                          ? "bg-zinc-800 text-zinc-400 border-white/10 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                      }`}
                    >
                      {ep.is_active ? "Desativar" : "Ativar"}
                    </button>
                    <button onClick={() => handleDelete(ep.id)} className="text-zinc-600 hover:text-red-400 transition p-1.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Secret reveal */}
                {ep.secret && (
                  <div className="mt-3 flex items-center gap-2 bg-zinc-800 rounded-lg p-2.5">
                    <span className="text-xs text-zinc-500 shrink-0">Signing secret:</span>
                    <code className="flex-1 text-xs text-zinc-400 truncate font-mono">
                      {secrets[ep.id] ? ep.secret : `${ep.secret.slice(0, 12)}${"•".repeat(20)}`}
                    </code>
                    <button onClick={() => setSecrets(p => ({ ...p, [ep.id]: !p[ep.id] }))} className="text-zinc-600 hover:text-zinc-400">
                      {secrets[ep.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button onClick={() => copySecret(ep.id, ep.secret!)} className="text-zinc-600 hover:text-emerald-400">
                      {copied === ep.id ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                )}

                {/* Test result */}
                {testRes && (
                  <div className={`mt-3 p-3 rounded-xl text-xs ${testRes.success ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {testRes.success
                        ? <CheckCircle2 size={12} className="text-emerald-400" />
                        : <AlertTriangle size={12} className="text-red-400" />}
                      <span className={testRes.success ? "text-emerald-400" : "text-red-400"}>
                        {testRes.success ? `Entregue com sucesso — HTTP ${testRes.status_code} (${testRes.latency_ms}ms)` : `Falhou: ${testRes.error ?? `HTTP ${testRes.status_code}`}`}
                      </span>
                    </div>
                    {testRes.response_body && (
                      <pre className="text-zinc-500 font-mono mt-1 overflow-x-auto">{testRes.response_body}</pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Docs section */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">📚 Documentação rápida</h3>
        <div className="space-y-2 text-xs text-zinc-600">
          <p>• Todos os eventos são enviados via <code className="text-zinc-400">POST</code> com <code className="text-zinc-400">Content-Type: application/json</code></p>
          <p>• Cada request inclui o header <code className="text-zinc-400">X-Webhook-Signature: t=timestamp,v1=hmac_sha256</code></p>
          <p>• Retorne HTTP 200 para confirmar recebimento. Erros geram até 3 retentativas (1h, 24h).</p>
          <p>• Use o <strong className="text-zinc-400">signing secret</strong> para verificar autenticidade com HMAC-SHA256.</p>
        </div>
      </div>
    </div>
  );
}
