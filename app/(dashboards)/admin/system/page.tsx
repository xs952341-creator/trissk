// app/(dashboards)/admin/system/page.tsx
// Painel de saúde operacional do sistema — admin only.
// Consome /api/health e dados internos para mostrar status em tempo real.

import { CheckCircle, XCircle, Clock, Database, CreditCard, Mail, Zap, Server, AlertCircle } from "lucide-react";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ServiceStatus {
  name: string;
  ok: boolean;
  latency_ms?: number;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface HealthData {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime_seconds?: number;
  checks?: {
    database?: { ok: boolean; latency_ms?: number };
    stripe?: { ok: boolean };
    redis?: { ok: boolean };
    email?: { ok: boolean };
  };
  timestamp?: string;
}

async function fetchHealth(): Promise<HealthData | null> {
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

function StatusRow({ service }: { service: ServiceStatus }) {
  const Icon = service.icon;
  return (
    <div className="flex items-center justify-between py-4 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
          service.ok
            ? "bg-emerald-500/10 border-emerald-500/20"
            : "bg-red-500/10 border-red-500/20"
        }`}>
          <Icon className={`w-4 h-4 ${service.ok ? "text-emerald-400" : "text-red-400"}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-200">{service.name}</p>
          {service.detail && <p className="text-xs text-zinc-600">{service.detail}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {service.latency_ms != null && (
          <span className="text-xs text-zinc-600 tabular-nums">{service.latency_ms}ms</span>
        )}
        <div className={`flex items-center gap-1.5 text-sm font-medium ${
          service.ok ? "text-emerald-400" : "text-red-400"
        }`}>
          {service.ok
            ? <><CheckCircle className="w-4 h-4" /> Operacional</>
            : <><XCircle className="w-4 h-4" /> Falha</>
          }
        </div>
      </div>
    </div>
  );
}

export default async function AdminSystemPage() {
  const health = await fetchHealth();
  const checks = health?.checks ?? {};
  const isOk = health?.status === "ok";

  const services: ServiceStatus[] = [
    { name: "Banco de dados (Supabase)", ok: checks.database?.ok ?? false, latency_ms: checks.database?.latency_ms, detail: "PostgreSQL + RLS + Auth", icon: Database },
    { name: "Pagamentos (Stripe)", ok: checks.stripe?.ok ?? true, detail: "Connect + Webhooks + Billing", icon: CreditCard },
    { name: "E-mail (Resend)", ok: checks.email?.ok ?? true, detail: "Transacional + Marketing", icon: Mail },
    { name: "Fila de jobs (Redis/Upstash)", ok: checks.redis?.ok ?? true, detail: "Background jobs + Cron", icon: Zap },
  ];

  const allOk = services.every(s => s.ok);
  const failCount = services.filter(s => !s.ok).length;

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Sistema</h1>
          <p className="text-zinc-500 text-sm mt-1">Saúde operacional da plataforma em tempo real</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${
          allOk
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {allOk
            ? <><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Todos operacionais</>
            : <><AlertCircle className="w-4 h-4" /> {failCount} serviço{failCount > 1 ? "s" : ""} com falha</>
          }
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Versão", value: health?.version ?? "—", icon: Server },
          { label: "Status", value: health?.status ?? "—", icon: CheckCircle },
          { label: "Uptime", value: health?.uptime_seconds != null ? `${Math.floor(health.uptime_seconds / 3600)}h` : "—", icon: Clock },
          { label: "Serviços", value: `${services.filter(s => s.ok).length}/${services.length}`, icon: Zap },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-3.5 h-3.5 text-zinc-600" />
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
            <p className="text-lg font-semibold text-zinc-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Services */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Componentes do sistema</h2>
        </div>
        <div className="px-6">
          {services.map(service => (
            <StatusRow key={service.name} service={service} />
          ))}
        </div>
      </div>

      {/* Config check */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Variáveis de ambiente críticas</h2>
        </div>
        <div className="px-6 py-2">
          {[
            { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
            { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key" },
            { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret" },
            { key: "NEXT_PUBLIC_APP_URL", label: "App URL" },
            { key: "SENTRY_DSN", label: "Sentry DSN (opcional)" },
          ].map(({ key, label }) => {
            const defined = !!process.env[key];
            return (
              <div key={key} className="flex items-center justify-between py-3 border-b border-zinc-800/60 last:border-0">
                <div>
                  <p className="text-sm text-zinc-300">{label}</p>
                  <p className="text-xs text-zinc-600 font-mono">{key}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  defined
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-amber-500/10 text-amber-400"
                }`}>
                  {defined ? "Configurada" : "Ausente"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-zinc-700">
        Atualizado às {new Date().toLocaleTimeString("pt-BR")} · Esta página é acessível apenas para admins
      </p>
    </div>
  );
}
