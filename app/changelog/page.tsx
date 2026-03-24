// app/changelog/page.tsx
// Página pública de changelog — mostra evolução do produto.
// Transmite produto vivo e em constante melhoria.

import { CheckCircle, Zap, Shield, Code2, Layers } from "lucide-react";

interface Release {
  version: string;
  date: string;
  type: "major" | "feature" | "fix";
  highlights: string[];
  badge?: string;
}

const RELEASES: Release[] = [
  {
    version: "v49",
    date: "Mar 2026",
    type: "major",
    badge: "Atual",
    highlights: [
      "CI/CD com GitHub Actions (lint + typecheck + testes)",
      "seed:demo — dados de demonstração reproduzíveis",
      "Documentação técnica completa (5 guias: setup, billing, arquitetura, dados, deploy)",
      "admin/system movido para padrão unificado",
      "Relatório de performance documentado",
    ],
  },
  {
    version: "v48",
    date: "Mar 2026",
    type: "feature",
    highlights: [
      "Skeleton loading (7 variants) — experiência premium de carregamento",
      "Command Palette (Cmd+K) com 17 comandos e busca em tempo real",
      "Trust Center — compliance e segurança para enterprise",
      "Admin System page — observabilidade operacional",
    ],
  },
  {
    version: "v47",
    date: "Mar 2026",
    type: "feature",
    highlights: [
      "100% consistência de tratamento de erros (getErrorMessage em 117 arquivos)",
      "LoadingState, EmptyState, ErrorState — estados de UI padronizados",
      "MetricCard + MetricGrid — cards de métricas reutilizáveis",
      "ProductPreview — card de produto para landing e dashboard",
      "Demo page interativa com dados fictícios",
      "Status page com health em tempo real",
    ],
  },
  {
    version: "v46",
    date: "Mar 2026",
    type: "fix",
    highlights: [
      "lib/errors.ts — helper central getErrorMessage()",
      "Zero Record<string, any> em todo o projeto",
      "Interfaces explícitas: ProductReviewUpdate, StripePriceUpdates, ReconcileResults",
    ],
  },
  {
    version: "v45",
    date: "Mar 2026",
    type: "fix",
    highlights: [
      "lib/types/json.ts — JsonObject, JsonValue canônicos",
      "Redução significativa de any em áreas críticas",
      "6 novos testes de integração com helpers mockados",
      "4 test helpers: mock-request, mock-supabase, mock-stripe, mock-session",
    ],
  },
  {
    version: "v44",
    date: "Mar 2026",
    type: "fix",
    highlights: [
      "lib/types/api.ts — ApiSuccess<T>, ApiError, 28 ApiErrorCode",
      "LogMeta recursivo exportado no logger",
      "Tipos melhorados em componentes críticos",
      "E2E de 9 fluxos críticos",
    ],
  },
  {
    version: "v43",
    date: "Mar 2026",
    type: "major",
    highlights: [
      "Zero any em handlers e services do webhook Stripe",
      "Schema V39_CONSOLIDATION declarado como fonte de verdade",
      "140+ testes de integração cobrindo todos os handlers",
      "Testes de refund/chargeback/idempotência profunda",
    ],
  },
  {
    version: "v42",
    date: "Mar 2026",
    type: "major",
    highlights: [
      "Webhook Stripe modularizado em 8 handlers + 7 services",
      "Fim do monólito de 80KB",
      "route.ts enxuto (~95 linhas)",
      "Health endpoint versionado",
    ],
  },
];

const TYPE_CONFIG = {
  major: { label: "Major", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  feature: { label: "Feature", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  fix: { label: "Fix", color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-sky-400" />
            </div>
            <h1 className="text-3xl font-bold">Changelog</h1>
          </div>
          <p className="text-zinc-400 text-lg">
            Histórico de evoluções do Playbook Hub. Produto vivo, em constante melhoria.
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-zinc-800" />

          <div className="space-y-8">
            {RELEASES.map((release) => {
              const cfg = TYPE_CONFIG[release.type];
              return (
                <div key={release.version} className="relative flex gap-6">
                  {/* Dot */}
                  <div className="relative z-10 mt-1.5 w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
                    {release.type === "major" ? (
                      <Zap className="w-4 h-4 text-emerald-400" />
                    ) : release.type === "feature" ? (
                      <Layers className="w-4 h-4 text-sky-400" />
                    ) : (
                      <Shield className="w-4 h-4 text-violet-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-lg font-bold text-zinc-100">{release.version}</h2>
                      <span className={`text-xs font-medium border px-2 py-0.5 rounded-full ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {release.badge && (
                        <span className="text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          {release.badge}
                        </span>
                      )}
                      <span className="text-xs text-zinc-600">{release.date}</span>
                    </div>

                    <ul className="space-y-2">
                      {release.highlights.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                          <span className="text-sm text-zinc-400">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
