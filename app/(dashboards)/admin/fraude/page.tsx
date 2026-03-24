"use client";
// app/(dashboards)/admin/fraude/page.tsx
// Dashboard de sinais de fraude + gestão de IPs bloqueados

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Shield, AlertTriangle, XCircle, CheckCircle2,
  Loader2, Plus, Trash2, RefreshCw, User,
} from "lucide-react";

type Severity = "low" | "medium" | "high" | "critical";

interface FraudSignal {
  id: string;
  user_id: string | null;
  order_id: string | null;
  signal_type: string;
  severity: Severity;
  description: string | null;
  resolved: boolean;
  created_at: string;
  profiles?: { email: string | null; full_name: string | null } | null;
}

interface BlockedIp {
  id: string;
  ip: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

const SEV_CFG: Record<Severity, { label: string; color: string; bg: string }> = {
  low:      { label: "Baixo",    color: "text-blue-400",  bg: "bg-blue-500/10 border-blue-500/20"   },
  medium:   { label: "Médio",   color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  high:     { label: "Alto",    color: "text-orange-400",bg: "bg-orange-500/10 border-orange-500/20"},
  critical: { label: "Crítico", color: "text-red-400",   bg: "bg-red-500/10 border-red-500/20"     },
};

const TYPE_LABELS: Record<string, string> = {
  velocity_ip:         "Velocidade por IP",
  velocity_email:      "Velocidade por email",
  card_reuse:          "Reutilização de cartão",
  multiple_cards_ip:   "Vários cartões no IP",
  disposable_email:    "Email descartável",
  high_amount:         "Valor alto",
  country_mismatch:    "País divergente",
  chargeback_history:  "Histórico de chargeback",
};

const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR");

export default function FraudePage() {
  const supabase = createClient();
  const [tab, setTab]           = useState<"signals" | "blocked_ips">("signals");
  const [signals, setSignals]   = useState<FraudSignal[]>([]);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState<string | null>(null);
  // Block IP form
  const [newIp, setNewIp]       = useState("");
  const [newReason, setNewReason] = useState("");
  const [newDays, setNewDays]   = useState("");
  const [addingIp, setAddingIp] = useState(false);

  const loadSignals = useCallback(async () => {
    const { data } = await supabase
      .from("fraud_signals")
      .select("id, user_id, order_id, signal_type, severity, description, resolved, created_at, profiles(email, full_name)")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(100);
    setSignals((data ?? []) as unknown as FraudSignal[]);
  }, []);

  const loadBlockedIps = useCallback(async () => {
    const { data } = await supabase
      .from("blocked_ips")
      .select("id, ip, reason, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setBlockedIps((data ?? []) as BlockedIp[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSignals(), loadBlockedIps()]);
    setLoading(false);
  }, [loadSignals, loadBlockedIps]);

  useEffect(() => { load(); }, [load]);

  async function resolveSignal(id: string) {
    setActing(id);
    await supabase.from("fraud_signals").update({
      resolved: true, resolved_at: new Date().toISOString(),
    }).eq("id", id);
    setSignals(prev => prev.filter(s => s.id !== id));
    setActing(null);
  }

  async function blockIp() {
    if (!newIp.trim()) return;
    setAddingIp(true);
    const { error } = await supabase.from("blocked_ips").upsert({
      ip:         newIp.trim(),
      reason:     newReason || null,
      expires_at: newDays ? new Date(Date.now() + Number(newDays) * 86400_000).toISOString() : null,
    }, { onConflict: "ip" });
    if (!error) {
      setNewIp(""); setNewReason(""); setNewDays("");
      await loadBlockedIps();
    }
    setAddingIp(false);
  }

  async function unblockIp(id: string) {
    setActing(id);
    await supabase.from("blocked_ips").delete().eq("id", id);
    setBlockedIps(prev => prev.filter(b => b.id !== id));
    setActing(null);
  }

  const criticalCount = signals.filter(s => s.severity === "critical" || s.severity === "high").length;

  return (
    <div className="p-6 md:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2">
            <Shield size={22} className="text-red-400" /> Detecção de Fraude
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Sinais internos + IPs bloqueados. Complementa o Stripe Radar.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-500 hover:text-zinc-300 transition">
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-red-400 text-2xl font-bold">{criticalCount}</p>
          <p className="text-zinc-600 text-xs mt-1">Alto/Crítico</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-amber-400 text-2xl font-bold">{signals.length}</p>
          <p className="text-zinc-600 text-xs mt-1">Sinais abertos</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-zinc-200 text-2xl font-bold">{blockedIps.length}</p>
          <p className="text-zinc-600 text-xs mt-1">IPs bloqueados</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit">
        {(["signals", "blocked_ips"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
            {t === "signals" ? `Sinais (${signals.length})` : `IPs Bloqueados (${blockedIps.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      ) : tab === "signals" ? (
        /* SIGNALS */
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {signals.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <CheckCircle2 size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum sinal de fraude aberto.</p>
            </div>
          ) : signals.map(s => {
            const sev = SEV_CFG[s.severity] ?? SEV_CFG.medium;
            return (
              <div key={s.id} className="flex items-start gap-4 px-5 py-4 border-b border-white/5 hover:bg-white/[0.01]">
                <div className="mt-0.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sev.bg} ${sev.color}`}>
                    {sev.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-300 text-sm font-medium">{TYPE_LABELS[s.signal_type] ?? s.signal_type}</p>
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">{s.description ?? "—"}</p>
                  {s.profiles && (
                    <p className="text-zinc-700 text-xs mt-1 flex items-center gap-1">
                      <User size={10} />
                      {((s as unknown as Record<string,unknown>).profiles as Record<string,unknown> | null)?.full_name as string ?? "—"} · {((s as unknown as Record<string,unknown>).profiles as Record<string,unknown> | null)?.email as string ?? "—"}
                    </p>
                  )}
                  <p className="text-zinc-700 text-xs mt-0.5">{fmtDate(s.created_at)}</p>
                </div>
                <button onClick={() => resolveSignal(s.id)} disabled={acting === s.id}
                  className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-600 hover:text-emerald-400 border border-white/10 hover:border-emerald-500/30 rounded-lg px-3 py-1.5 transition">
                  {acting === s.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                  Resolver
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* BLOCKED IPS */
        <div className="space-y-4">
          {/* Add IP form */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-zinc-300 font-medium text-sm mb-4 flex items-center gap-2">
              <Plus size={14} /> Bloquear IP
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={newIp} onChange={e => setNewIp(e.target.value)}
                placeholder="Ex: 192.168.1.1"
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20" />
              <input value={newReason} onChange={e => setNewReason(e.target.value)}
                placeholder="Motivo (opcional)"
                className="md:col-span-2 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20" />
              <input value={newDays} onChange={e => setNewDays(e.target.value)}
                placeholder="Expirar em X dias (vazio=permanente)"
                type="number" min="1"
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20" />
            </div>
            <button onClick={blockIp} disabled={addingIp || !newIp.trim()}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm transition disabled:opacity-40">
              {addingIp ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
              Bloquear IP
            </button>
          </div>

          {/* List */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            {blockedIps.length === 0 ? (
              <div className="text-center py-10 text-zinc-600">
                <Shield size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum IP bloqueado.</p>
              </div>
            ) : blockedIps.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-4 border-b border-white/5 hover:bg-white/[0.01]">
                <div>
                  <p className="text-zinc-200 text-sm font-mono font-semibold">{b.ip}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{b.reason ?? "Sem motivo"}</p>
                  <p className="text-zinc-700 text-xs">
                    {b.expires_at
                      ? `Expira: ${fmtDate(b.expires_at)}`
                      : "Permanente"} · Bloqueado: {fmtDate(b.created_at)}
                  </p>
                </div>
                <button onClick={() => unblockIp(b.id)} disabled={acting === b.id}
                  className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-lg px-3 py-1.5 transition">
                  {acting === b.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  Desbloquear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
