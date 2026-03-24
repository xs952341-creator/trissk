"use client";
/**
 * app/(dashboards)/vendor/apps/page.tsx
 * Ecossistema de Integrações — App Store do Vendor.
 *
 * Lê aplicações OAuth disponíveis da tabela oauth_applications (criada em MIGRATION_V32).
 * Lê instalações activas da tabela oauth_installations.
 * Instalar: inicia fluxo OAuth 2.0 → /oauth/authorize?client_id=...
 * Desinstalar: revoga token via DELETE /api/vendor/integrations/[id]
 *
 * Apps de plataforma (Zapier, Webhooks) são mostradas como "nativas"
 * com link directo para as páginas existentes no dashboard.
 */

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Search, Zap, Database, CheckCircle2, ArrowRight,
  Loader2, Blocks, Globe, Mail, MessageSquare,
  RefreshCw, ExternalLink, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface OAuthApp {
  client_id:   string;
  name:        string;
  description: string | null;
  logo_url:    string | null;
  scopes:      string[];
  status:      string;
}

interface Installation {
  id:            string;
  app_client_id: string;
  scopes:        string[];
  installed_at:  string;
}

// ── Apps nativas (não precisam de OAuth — já estão no dashboard) ────────────
const NATIVE_APPS = [
  {
    id:          "webhooks",
    name:        "Webhooks",
    description: "Receba notificações em tempo real no seu servidor para cada evento de venda.",
    icon:        <Database size={22} />,
    color:       "rgba(125,211,252,0.12)",
    iconColor:   "#7dd3fc",
    href:        "/vendor/webhooks",
    category:    "Developers",
  },
  {
    id:          "zapier",
    name:        "Zapier",
    description: "Conecte a mais de 6.000 apps sem código. Automatize follow-ups, CRM e muito mais.",
    icon:        <Zap size={22} />,
    color:       "rgba(251,146,60,0.12)",
    iconColor:   "#fb923c",
    href:        "https://zapier.com/apps/webhook/integrations",
    external:    true,
    category:    "Automação",
  },
  {
    id:          "email-mkt",
    name:        "Email Marketing",
    description: "Sequências automáticas de email para onboarding e recuperação de clientes.",
    icon:        <Mail size={22} />,
    color:       "rgba(167,139,250,0.12)",
    iconColor:   "#a78bfa",
    href:        "/vendor/email-marketing",
    category:    "Marketing",
  },
];

// ── Skeleton ────────────────────────────────────────────────────────────────
function AppCardSkeleton() {
  return (
    <div className="card p-5 animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="skeleton w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
      </div>
      <div className="skeleton h-3 w-full rounded" />
      <div className="skeleton h-3 w-3/4 rounded" />
      <div className="skeleton h-9 w-28 rounded-xl" />
    </div>
  );
}

// ── Card de App OAuth ────────────────────────────────────────────────────────
function OAuthAppCard({
  app,
  installation,
  onInstall,
  onUninstall,
  loading,
}: {
  app:          OAuthApp;
  installation: Installation | null;
  onInstall:    (clientId: string) => void;
  onUninstall:  (installId: string) => void;
  loading:      boolean;
}) {
  const installed = !!installation;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 flex flex-col gap-4 hover:border-default transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)" }}>
            {app.logo_url
              ? <img src={app.logo_url} alt={app.name} className="w-full h-full object-cover rounded-xl" />
              : <Globe size={22} style={{ color: "var(--text-muted)" }} />}
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
              {app.name}
            </p>
            <p className="text-[10px] uppercase tracking-wider font-semibold mt-0.5"
              style={{ color: "var(--text-faint)" }}>
              {app.scopes.slice(0, 2).join(" · ")}
            </p>
          </div>
        </div>
        {installed && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(34,212,160,0.1)", color: "var(--brand)", border: "1px solid rgba(34,212,160,0.2)" }}>
            <CheckCircle2 size={9} />Instalado
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {app.description ?? "Integração via OAuth 2.0."}
      </p>

      <button
        onClick={() => installed ? onUninstall(installation!.id) : onInstall(app.client_id)}
        disabled={loading}
        className={`self-start flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
          installed ? "btn-secondary" : "btn-primary"
        }`}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> :
         installed ? "Gerir" :
         <><ArrowRight size={12} />Conectar</>}
      </button>
    </motion.div>
  );
}

// ── Card de App Nativa ────────────────────────────────────────────────────────
function NativeAppCard({ app }: { app: typeof NATIVE_APPS[0] }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: app.color, border: "1px solid var(--border-subtle)", color: app.iconColor }}>
            {app.icon}
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
              {app.name}
            </p>
            <p className="text-[10px] uppercase tracking-wider font-semibold mt-0.5"
              style={{ color: "var(--text-faint)" }}>
              {app.category}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: "rgba(34,212,160,0.1)", color: "var(--brand)", border: "1px solid rgba(34,212,160,0.2)" }}>
          <CheckCircle2 size={9} />Nativo
        </span>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {app.description}
      </p>

      {app.external ? (
        <a href={app.href} target="_blank" rel="noopener noreferrer"
          className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold btn-secondary">
          <ExternalLink size={12} />Abrir
        </a>
      ) : (
        <Link href={app.href}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold btn-secondary">
          <ArrowRight size={12} />Configurar
        </Link>
      )}
    </motion.div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────
function VendorAppsPageInner() {
  const supabase = createClient();

  const searchParams = useSearchParams();
  const [oauthApps,     setOauthApps]     = useState<OAuthApp[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadingApp,    setLoadingApp]    = useState<string | null>(null);
  const [search,        setSearch]        = useState("");

  // ── Carregar dados ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const [appsRes, instRes] = await Promise.all([
      supabase.from("oauth_applications").select("client_id,name,description,logo_url,scopes,status").eq("status", "active"),
      supabase.from("oauth_installations").select("id,app_client_id,scopes,installed_at").eq("vendor_id", session.user.id).is("revoked_at", null),
    ]);

    setOauthApps(appsRes.data ?? []);
    setInstallations(instRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Feedback após fluxo OAuth
  useEffect(() => {
    if (searchParams?.get("oauth_success")) {
      toast.success("Integração autorizada com sucesso!");
    }
    if (searchParams?.get("oauth_error")) {
      toast.error("Autorização recusada ou cancelada.");
    }
  }, [searchParams]);

  // ── Instalar (iniciar fluxo OAuth 2.0 real) ──────────────────────────────
  const handleInstall = (clientId: string) => {
    // Redireciona para o endpoint OAuth real com PKCE
    const verifier  = crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem("oauth_verifier", verifier);
    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: `${window.location.origin}/api/oauth/callback`,
      scope:        "read:sales,read:analytics,read:products",
      state:        crypto.randomUUID(),
    });
    window.location.href = `/api/oauth/authorize?${params}`;
  };

  // ── Desinstalar ───────────────────────────────────────────────────────────
  const handleUninstall = async (installId: string) => {
    setLoadingApp(installId);
    const { error } = await supabase
      .from("oauth_installations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", installId);

    if (error) {
      toast.error("Erro ao remover integração.");
    } else {
      toast.success("Integração removida.");
      await load();
    }
    setLoadingApp(null);
  };

  // ── Filtro de pesquisa ────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredNative = NATIVE_APPS.filter(a =>
    a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
  );
  const filteredOAuth = oauthApps.filter(a =>
    a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q)
  );

  const totalInstalled = installations.length + NATIVE_APPS.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <span className="section-eyebrow mb-1 block">Integrações</span>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Ecossistema & Apps
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {totalInstalled} integraç{totalInstalled === 1 ? "ão activa" : "ões activas"} no seu workspace.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary px-4 py-2 text-xs gap-2">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Actualizar
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-7">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-faint)" }} />
        <input
          type="text"
          placeholder="Procurar integrações…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-base pl-10 text-sm"
        />
      </div>

      {/* Apps nativas */}
      {filteredNative.length > 0 && (
        <section className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-4"
            style={{ color: "var(--text-faint)" }}>
            Nativas da Plataforma
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNative.map(app => <NativeAppCard key={app.id} app={app} />)}
          </div>
        </section>
      )}

      {/* Apps OAuth */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <AppCardSkeleton key={i} />)}
        </div>
      ) : filteredOAuth.length > 0 ? (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-4"
            style={{ color: "var(--text-faint)" }}>
            Apps de Terceiros
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOAuth.map(app => {
              const inst = installations.find(i => i.app_client_id === app.client_id) ?? null;
              return (
                <OAuthAppCard
                  key={app.client_id}
                  app={app}
                  installation={inst}
                  onInstall={handleInstall}
                  onUninstall={handleUninstall}
                  loading={loadingApp === app.client_id || loadingApp === inst?.id}
                />
              );
            })}
          </div>
        </section>
      ) : !loading && filteredNative.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-4"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
            <Blocks size={22} style={{ color: "var(--text-faint)" }} />
          </div>
          <p className="text-sm font-semibold mb-1"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>
            Nenhuma app encontrada
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Tente pesquisar com outros termos.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function VendorAppsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{borderColor:"var(--brand)"}}/></div>}>
      <VendorAppsPageInner />
    </Suspense>
  );
}
