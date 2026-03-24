// app/status/page.tsx
// Página pública de status do sistema — mostra saúde em tempo real.
// Útil para transparência operacional e confiança de compradores/vendors.

import { CheckCircle, XCircle, Clock, Wifi } from "lucide-react";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { createClient } from "@/lib/supabase/client";

export const revalidate = 30; // revalida a cada 30 segundos

interface HealthCheck {
  ok: boolean;
  latency_ms?: number;
  error?: string;
}

interface HealthData {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime_seconds?: number;
  checks: {
    database?: HealthCheck;
    stripe?: HealthCheck;
    redis?: HealthCheck;
    email?: HealthCheck;
  };
  timestamp: string;
}

async function getHealth(): Promise<HealthData | null> {
  try {
    const base = getPublicAppUrl();
    const res = await fetch(`${base}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<HealthData>;
  } catch {
    return null;
  }
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
      <span className="text-sm text-zinc-300">{label}</span>
      <div className={`flex items-center gap-1.5 text-sm font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {ok
          ? <><CheckCircle className="w-4 h-4" /> Operacional</>
          : <><XCircle className="w-4 h-4" /> Degradado</>
        }
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const health = await getHealth();
  const isHealthy = health?.status === "ok";
  const checks = health?.checks ?? {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full ${isHealthy ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            <h1 className="text-xl font-semibold">Status do Sistema</h1>
          </div>
          <p className="text-sm text-zinc-500">
            {isHealthy
              ? "Todos os sistemas estão operacionais."
              : "Alguns sistemas estão degradados. Nossa equipe foi notificada."}
          </p>
        </div>
      </div>

      {/* Main status card */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Overall status */}
        <div className={`rounded-2xl border p-6 ${
          isHealthy
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>
          <div className="flex items-center gap-3">
            {isHealthy
              ? <CheckCircle className="w-8 h-8 text-emerald-400" />
              : <XCircle className="w-8 h-8 text-red-400" />
            }
            <div>
              <h2 className={`text-lg font-semibold ${isHealthy ? "text-emerald-300" : "text-red-300"}`}>
                {isHealthy ? "Todos os sistemas operacionais" : "Incidente em andamento"}
              </h2>
              <p className="text-sm text-zinc-500">
                Versão {health?.version ?? "—"} · Atualizado às {new Date().toLocaleTimeString("pt-BR")}
              </p>
            </div>
          </div>
        </div>

        {/* Component status */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-300">Componentes</h3>
          </div>
          <div className="px-6">
            <StatusBadge ok={checks.database?.ok ?? false} label="Banco de dados" />
            <StatusBadge ok={checks.stripe?.ok ?? true} label="Pagamentos (Stripe)" />
            <StatusBadge ok={checks.email?.ok ?? true} label="E-mail transacional" />
            <StatusBadge ok={checks.redis?.ok ?? true} label="Fila de jobs (Redis)" />
          </div>
        </div>

        {/* Metrics */}
        {health && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center">
              <Wifi className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-xs text-zinc-500">Latência DB</p>
              <p className="text-sm font-semibold text-zinc-200">
                {checks.database?.latency_ms != null ? `${checks.database.latency_ms}ms` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center">
              <Clock className="w-4 h-4 text-sky-400 mx-auto mb-1" />
              <p className="text-xs text-zinc-500">Uptime</p>
              <p className="text-sm font-semibold text-zinc-200">
                {health.uptime_seconds != null
                  ? `${Math.floor(health.uptime_seconds / 3600)}h`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center">
              <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-xs text-zinc-500">Versão</p>
              <p className="text-sm font-semibold text-zinc-200">{health.version}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-zinc-600">
          Esta página atualiza automaticamente a cada 30 segundos.
        </p>
      </div>
    </div>
  );
}
