"use client";
// app/(dashboards)/admin/radar/page.tsx
// Gerencia as regras de fraude do Stripe Radar diretamente do painel admin.
// Não precisa acessar o Stripe Dashboard.

import { useState, useEffect } from "react";
import { Shield, Plus, Trash2, Loader2, AlertTriangle, Info, RefreshCw, CheckCircle2, X } from "lucide-react";

interface RadarRule {
  id: string;
  predicate: string;
  action: string;
  created: number;
  enabled: boolean;
}

// Regras recomendadas prontas para ativar
const RECOMMENDED_RULES = [
  {
    label: "Bloquear > 3 cartões por IP em 24h",
    predicate: ":card_count_by_ip_address_24_hour_interval: > 3",
    category: "velocity",
  },
  {
    label: "Bloquear país de alto risco (seletos)",
    predicate: ":ip_country: in ('KP', 'IR', 'SY', 'CU')",
    category: "geo",
  },
  {
    label: "Revisão se CVC falhou",
    predicate: "::cvc_check:: = 'fail'",
    category: "cvc",
  },
  {
    label: "Revisão se CEP não coincide",
    predicate: "::address_zip_check:: = 'fail'",
    category: "avs",
  },
  {
    label: "Bloquear > 5 tentativas por cartão em 24h",
    predicate: ":card_count_by_card_fingerprint_24_hour_interval: > 5",
    category: "velocity",
  },
  {
    label: "Bloquear VPN/proxy detectado",
    predicate: ":is_proxy_or_vpn: = true",
    category: "network",
  },
  {
    label: "Revisão se Tor network",
    predicate: ":is_in_tor_range: = true",
    category: "network",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  velocity: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  geo:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  cvc:      "text-red-400 bg-red-500/10 border-red-500/20",
  avs:      "text-orange-400 bg-orange-500/10 border-orange-500/20",
  network:  "text-violet-400 bg-violet-500/10 border-violet-500/20",
};

export default function RadarRulesPage() {
  const [rules,       setRules]       = useState<RadarRule[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [warning,     setWarning]     = useState<string | null>(null);
  const [creating,    setCreating]    = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [customRule,  setCustomRule]  = useState("");
  const [showCustom,  setShowCustom]  = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadRules = async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/admin/radar");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao carregar regras"); return; }
      setRules(data.rules ?? []);
      if (data.warning) setWarning(data.warning);
    } catch { setError("Erro de conexão"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRules(); }, []);

  const createRule = async (predicate: string) => {
    setCreating(true);
    try {
      const res  = await fetch("/api/admin/radar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predicate }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Erro ao criar regra", "err"); return; }
      showToast("Regra criada com sucesso!");
      setCustomRule("");
      setShowCustom(false);
      await loadRules();
    } catch { showToast("Erro de conexão", "err"); }
    finally { setCreating(false); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Remover esta regra Radar?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/radar?id=${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? "Erro ao remover", "err"); return; }
      showToast("Regra removida.");
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch { showToast("Erro de conexão", "err"); }
    finally { setDeleting(null); }
  };

  // Verificar quais recomendadas já estão ativas
  const activePredicates = new Set(rules.map((r) => r.predicate));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium
          ${toast.type === "ok" ? "bg-emerald-950 border-emerald-500/40 text-emerald-300" : "bg-red-950 border-red-500/40 text-red-300"}`}>
          {toast.type === "ok" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Shield size={22} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Stripe Radar — Regras de Fraude</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Crie e gerencie regras para bloquear ou revisar pagamentos suspeitos.</p>
            </div>
          </div>
          <button onClick={loadRules} disabled={loading}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Warning Radar não habilitado */}
        {warning && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 flex gap-3">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">{warning}</p>
          </div>
        )}

        {/* Info box */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 flex gap-3">
          <Info size={15} className="text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-500">
            O Stripe Radar avalia cada pagamento em tempo real. Regras com ação <strong className="text-zinc-400">block</strong> rejeitam automaticamente;
            regras <strong className="text-zinc-400">review</strong> colocam em fila para revisão manual no Stripe Dashboard.
            Requer Stripe com Radar habilitado (disponível em todos os planos com exceção do legacy free tier).
          </p>
        </div>

        {/* Regras recomendadas */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-base font-semibold text-zinc-200 mb-4">Regras Recomendadas</h2>
          <div className="space-y-2">
            {RECOMMENDED_RULES.map((rec) => {
              const active = activePredicates.has(rec.predicate);
              const colorClass = CATEGORY_COLORS[rec.category] ?? "text-zinc-400 bg-zinc-800 border-zinc-700";
              return (
                <div key={rec.predicate}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                    ${active ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-white/5 bg-zinc-900/30"}`}>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colorClass}`}>
                    {rec.category}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{rec.label}</p>
                    <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate">{rec.predicate}</p>
                  </div>
                  {active ? (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={13} /> Ativa
                    </span>
                  ) : (
                    <button onClick={() => createRule(rec.predicate)} disabled={creating}
                      className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors flex items-center gap-1 disabled:opacity-50">
                      {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Ativar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Regras ativas */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-200">Regras Ativas ({rules.length})</h2>
            <button onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors">
              <Plus size={12} /> Regra personalizada
            </button>
          </div>

          {/* Formulário regra custom */}
          {showCustom && (
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
              <p className="text-xs text-zinc-400">
                Escreva o predicate Radar. Exemplos:{" "}
                <code className="text-emerald-400">:risk_score: &gt; 75</code>,{" "}
                <code className="text-emerald-400">::cvc_check:: = 'fail'</code>,{" "}
                <code className="text-emerald-400">:ip_country: in ('NG', 'RU')</code>
              </p>
              <div className="flex gap-2">
                <input value={customRule} onChange={(e) => setCustomRule(e.target.value)}
                  placeholder=":risk_score: > 75"
                  className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 font-mono focus:outline-none focus:border-emerald-500/50 transition-colors" />
                <button onClick={() => createRule(customRule)} disabled={creating || !customRule.trim()}
                  className="px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                  {creating ? <Loader2 size={14} className="animate-spin" /> : "Criar"}
                </button>
                <button onClick={() => setShowCustom(false)} className="text-zinc-600 hover:text-zinc-400 px-2">
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 size={18} className="animate-spin" /> Carregando regras...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400 text-sm">{error}</div>
          ) : rules.length === 0 ? (
            <div className="py-12 text-center text-zinc-600 space-y-2">
              <Shield size={32} className="mx-auto opacity-20" />
              <p className="text-sm">Nenhuma regra ativa.</p>
              <p className="text-xs">Ative uma regra recomendada acima ou crie uma personalizada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/30">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${rule.enabled ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-zinc-300 truncate">{rule.predicate}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Ação: <span className={`font-semibold ${rule.action === "block" ? "text-red-400" : "text-amber-400"}`}>{rule.action}</span>
                      {" · "}
                      Criada em {new Date(rule.created * 1000).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <button onClick={() => deleteRule(rule.id)} disabled={deleting === rule.id}
                    className="text-zinc-700 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                    {deleting === rule.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
