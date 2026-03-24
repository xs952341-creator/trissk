
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, RefreshCw, AlertTriangle, Info, CheckCircle2, XCircle, Search, Filter } from "lucide-react";

const LEVEL_CONFIG = {
  debug:    { color: "text-zinc-500",  bg: "bg-zinc-800",    label: "DEBUG" },
  info:     { color: "text-blue-400",  bg: "bg-blue-500/10", label: "INFO"  },
  warn:     { color: "text-amber-400", bg: "bg-amber-500/10",label: "WARN"  },
  error:    { color: "text-red-400",   bg: "bg-red-500/10",  label: "ERROR" },
  critical: { color: "text-red-300",   bg: "bg-red-600/20",  label: "CRIT"  },
};

type Log = {
  id: string;
  level: keyof typeof LEVEL_CONFIG;
  service: string;
  event: string;
  message?: string;
  metadata?: unknown | null;
  trace_id?: string;
  created_at: string;
};

export default function ObservabilidadePage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("structured_logs")
      .select("id, level, service, event, message, metadata, trace_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (levelFilter !== "all") q = q.eq("level", levelFilter);
    if (serviceFilter !== "all") q = q.eq("service", serviceFilter);
    if (searchQuery) q = q.or(`event.ilike.%${searchQuery}%,message.ilike.%${searchQuery}%`);

    const { data } = await q;
    setLogs((data ?? []) as Log[]);

    // Carregar serviços únicos
    const { data: svcs } = await supabase
      .from("structured_logs")
      .select("service")
      .order("service");
    const unique = [...new Set((svcs ?? []).map((s) => s.service))];
    setServices(unique);
    setLoading(false);
  }, [levelFilter, serviceFilter, searchQuery]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const errorCount = logs.filter(l => l.level === "error" || l.level === "critical").length;
  const warnCount  = logs.filter(l => l.level === "warn").length;

  return (
    <div className="p-6 md:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Observabilidade</h1>
          <p className="text-zinc-500 text-sm mt-1">Logs estruturados do sistema — últimas 200 entradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              autoRefresh
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "border-white/10 text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <RefreshCw size={11} className={autoRefresh ? "animate-spin" : ""} />
            Auto (5s)
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-zinc-600 hover:text-zinc-400 transition-all">
            <RefreshCw size={11} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-red-400 text-2xl font-bold">{errorCount}</p>
          <p className="text-zinc-500 text-xs mt-1">Erros/Críticos</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-amber-400 text-2xl font-bold">{warnCount}</p>
          <p className="text-zinc-500 text-xs mt-1">Alertas</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-zinc-200 text-2xl font-bold">{logs.length}</p>
          <p className="text-zinc-500 text-xs mt-1">Total exibido</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {/* Level filter */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-1">
          {["all", "debug", "info", "warn", "error", "critical"].map(l => (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                levelFilter === l ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"
              }`}>
              {l === "all" ? "Todos" : l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Service filter */}
        {services.length > 0 && (
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none">
            <option value="all">Todos serviços</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 flex-1 min-w-[200px]">
          <Search size={12} className="text-zinc-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar evento ou mensagem..."
            className="bg-transparent text-xs text-zinc-300 outline-none flex-1 placeholder:text-zinc-700"
          />
        </div>
      </div>

      {/* Logs table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 p-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Carregando logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <CheckCircle2 size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum log encontrado com os filtros atuais.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Header */}
            <div className="grid grid-cols-12 px-4 py-3 text-zinc-700 text-[10px] uppercase tracking-widest hidden md:grid">
              <span className="col-span-1">Nível</span>
              <span className="col-span-2">Serviço</span>
              <span className="col-span-3">Evento</span>
              <span className="col-span-4">Mensagem</span>
              <span className="col-span-2 text-right">Quando</span>
            </div>
            {logs.map((l: Log) => {
              const cfg = LEVEL_CONFIG[String(l.level) as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info;
              const isExpanded = expanded === l.id;
              return (
                <div key={l.id} className={`hover:bg-white/[0.015] transition-colors ${isExpanded ? "bg-white/[0.02]" : ""}`}>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : l.id)}
                    className="w-full text-left"
                  >
                    <div className="grid grid-cols-12 px-4 py-3 items-center gap-1">
                      <div className="col-span-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <span className="col-span-2 text-zinc-500 text-xs truncate">{l.service}</span>
                      <span className="col-span-3 text-zinc-300 text-xs font-mono truncate">{l.event}</span>
                      <span className="col-span-4 text-zinc-500 text-xs truncate">{l.message || "—"}</span>
                      <span className="col-span-2 text-zinc-700 text-xs text-right">
                        {new Date(String(l.created_at ?? "")).toLocaleTimeString("pt-BR")}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 font-mono text-xs text-zinc-400 space-y-2">
                        <div><span className="text-zinc-600">trace_id: </span><span className="text-emerald-400">{l.trace_id || "—"}</span></div>
                        <div><span className="text-zinc-600">created_at: </span>{new Date(String(l.created_at ?? "")).toLocaleString("pt-BR")}</div>
                        {l.metadata ? (
                          <div>
                            <span className="text-zinc-600">metadata:</span>
                            <pre className="text-zinc-400 mt-1 whitespace-pre-wrap overflow-auto max-h-40">
                              {JSON.stringify(l.metadata)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
