"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, type TooltipProps } from "recharts";
import {
  Loader2, ExternalLink, RefreshCw, CheckCircle2, Clock,
  XCircle, Zap, Key, Globe, ChevronRight, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import UsageSpeedometer from "@/components/saas/UsageSpeedometer";
import MagicAccessCard  from "@/components/buyer/MagicAccessCard";
import type { ComponentType } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type UsageSeriesPoint = {
  day: string;
  events: number;
};

type UsageEntry = {
  error?: string;
  total_events?: number;
  daily_activity?: UsageSeriesPoint[];
};

type EntitlementRow = {
  id: string;
  status: "active" | "revoked" | "expired";
  created_at: string;
  revoked_at: string | null;
  product_tier_id: string | null;
  product_id: string | null;
  source_invoice_id: string | null;
  instance_id?: string | null;
  product_tiers?: {
    id: string;
    tier_name: string;
    price_monthly: number | null;
    price_lifetime: number | null;
    has_consultancy: boolean;
    calendar_link: string | null;
    saas_products?: {
      id?: string | null;
      name?: string | null;
      delivery_method?: string;
      delivery_type?: string | null;
      magic_link_url?: string | null;
      provisioning_webhook_url?: string | null;
      logo_url?: string | null;
    } | null;
  } | null;
};

interface Entitlement {
  id: string;
  status: "active" | "revoked" | "expired";
  created_at: string;
  revoked_at: string | null;
  product_tier_id: string | null;
  product_id: string | null;
  source_invoice_id: string | null;
  product_tiers: {
    id: string;
    tier_name: string;
    price_monthly: number | null;
    price_lifetime: number | null;
    has_consultancy: boolean;
    calendar_link: string | null;
    saas_products: {
      id: string;
      name: string;
      delivery_method: string;
      delivery_type: string | null;
      magic_link_url: string | null;
      provisioning_webhook_url: string | null;
      logo_url: string | null;
    };
  } | null;
}

interface DeliveryEvent {
  id: string;
  product_id: string | null;
  status: "success" | "failed" | "permanently_failed";
  created_at: string;
  http_status: number | null;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    revoked: "bg-red-500/10 text-red-400 border-red-500/20",
    expired: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    revoked: "Revogado",
    expired: "Expirado",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full border px-2.5 py-1 ${styles[status] ?? styles.expired}`}>
      {status === "active" ? <CheckCircle2 size={10} /> : status === "revoked" ? <XCircle size={10} /> : <Clock size={10} />}
      {labels[status] ?? status}
    </span>
  );
}

function DeliveryBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <CheckCircle2 size={11} /> Entregue
      </span>
    );
  }
  if (status === "failed" || status === "permanently_failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-400">
        <AlertTriangle size={11} /> Falha na entrega
      </span>
    );
  }
  return null;
}

function MethodIcon({ method }: { method: string }) {
  if (method === "NATIVE_API") return <Zap size={14} className="text-violet-400" />;
  if (method === "NO_CODE_ZAPIER") return <Globe size={14} className="text-blue-400" />;
  return <Key size={14} className="text-zinc-400" />;
}

export default function MeusAcessosPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [deliveryMap, setDeliveryMap] = useState<Record<string, DeliveryEvent>>({});
  const [licenseMap, setLicenseMap] = useState<Record<string, string>>({});
  const [reprovisioning, setReprovisioning] = useState<string | null>(null);
  const [openUsageId, setOpenUsageId] = useState<string | null>(null);
  interface UsageEntry {
    current?: number;
    limit?: number;
    unit?: string;
    resetDate?: string;
    [key: string]: string | number | boolean | null | undefined;
  }
  const [usageMap, setUsageMap] = useState<Record<string, UsageEntry>>({});
  const [usageCounters, setUsageCounters] = useState<Record<string, { current: number; limit: number; unit: string; resetDate?: string }>>({});

  const load = async () => {
    setLoading(true);

    const { data: sessionRes } = await supabase.auth.getSession();
    if (!sessionRes.session) { setLoading(false); return; }

    const { data: ents } = await supabase
      .from("entitlements")
      .select(`
        id, status, created_at, revoked_at, product_tier_id, product_id, source_invoice_id,
        product_tiers (
          id, tier_name, price_monthly, price_lifetime, has_consultancy, calendar_link,
          saas_products ( id, name, delivery_method, delivery_type, magic_link_url, provisioning_webhook_url, logo_url )
        )
      `)
      .order("created_at", { ascending: false });

    setEntitlements((ents as unknown as Entitlement[]) ?? []);

    // Buscar license keys (opcional)
    try {
      const keyProductIds = (ents as unknown as EntitlementRow[])
        .map((e) => e.product_tiers?.saas_products?.id)
        .filter((id): id is string => Boolean(id));

      if (keyProductIds.length > 0) {
        const { data: keys } = await supabase
          .from("license_keys")
          .select("product_id, license_key")
          .in("product_id", keyProductIds)
          .eq("user_id", sessionRes.session.user.id)
          .eq("status", "active");

        const map: Record<string, string> = {};
        for (const k of (keys ?? []) as { product_id?: string; license_key?: string }[]) {
          if (String(k.product_id ?? "") && k.license_key && !map[String(k.product_id)]) map[String(k.product_id)] = k.license_key;
        }
        setLicenseMap(map);
      }
    } catch {
      // feature opcional
    }

    // Buscar último delivery event por product_id
    const productIds = (ents as unknown as EntitlementRow[])
      .map((e) => e.product_tiers?.saas_products?.id)
      .filter((id): id is string => Boolean(id));

    if (productIds.length > 0) {
      const { data: events } = await supabase
        .from("delivery_events")
        .select("id, product_id, status, created_at, http_status")
        .in("product_id", productIds)
        .eq("user_id", sessionRes.session.user.id)
        .order("created_at", { ascending: false });

      const map: Record<string, DeliveryEvent> = {};
      for (const ev of (events ?? []) as DeliveryEvent[]) {
        if (ev.product_id && !map[ev.product_id]) {
          map[String(ev.product_id)] = ev;
        }
      }
      setDeliveryMap(map);
    }

    // Buscar contadores de uso para produtos SaaS com metered billing
    try {
      const saasProductIds = (ents as unknown as EntitlementRow[])
        .map((e) => e.product_tiers?.saas_products?.id)
        .filter((id): id is string => Boolean(id));

      if (saasProductIds.length > 0 && sessionRes.session) {
        const period = new Date().toISOString().slice(0, 7); // YYYY-MM
        const { data: counters } = await supabase
          .from("saas_usage_counters")
          .select("product_id, event_type, total_count")
          .in("product_id", saasProductIds)
          .eq("user_id", sessionRes.session.user.id)
          .eq("period", period);

        const { data: limits } = await supabase
          .from("saas_usage_limits")
          .select("product_id, event_type, monthly_limit")
          .in("product_id", saasProductIds);

        const counterMap: Record<string, { current: number; limit: number; unit: string; resetDate?: string }> = {};
        const now = new Date();
        const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        for (const counter of (counters ?? [])  as Record<string, unknown>[]) {
          const limit = (limits ?? []).find(
            (l: Record<string, unknown>) => l.product_id === counter.product_id && l.event_type === counter.event_type
          );
          if (limit?.monthly_limit) {
            counterMap[String(counter.product_id)] = {
              current:   Number(counter.total_count ?? 0),
              limit:     limit.monthly_limit,
              unit:      counter.event_type === "ai_credit" ? "créditos" : counter.event_type === "api_call" ? "chamadas API" : "eventos",
              resetDate,
            };
          }
        }
        setUsageCounters(counterMap);
      }
    } catch {
      // usage counters são opcionais
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reprovision = async (ent: Entitlement) => {
    if (!ent.product_tier_id) return;
    setReprovisioning(ent.id);

    const res = await fetch("/api/provision/reprovision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_tier_id: ent.product_tier_id,
        invoice_id: ent.source_invoice_id,
      }),
    });

    const data = await res.json();
    setReprovisioning(null);

    if (data.ok) {
      toast.success("Acesso re-provisionado! Verifique seu email ou acesse o link.");
      load(); // Recarrega lista
    } else {
      toast.error(data.error ?? "Erro ao re-provisionar acesso.");
    }
  };

  const activeEnts = entitlements.filter((e) => e.status === "active");
  const revokedEnts = entitlements.filter((e) => e.status !== "active");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-zinc-500" size={20} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="mx-auto max-w-4xl px-5 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meus Acessos</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Todos os produtos que você tem acesso ativo
            </p>
          </div>
          <Link href="/buyer" className="text-sm text-zinc-500 hover:text-zinc-300 transition">
            ← Voltar
          </Link>
        </div>

        {/* Acessos Ativos */}
        {activeEnts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center space-y-3">
            <div className="text-4xl">📦</div>
            <p className="text-zinc-300 font-medium">Nenhum produto ativo</p>
            <p className="text-sm text-zinc-500">
              Suas assinaturas e compras aparecerão aqui após a confirmação do pagamento.
            </p>
            <Link
              href="/explorar"
              className="inline-flex items-center gap-2 mt-2 text-sm text-violet-400 hover:text-violet-300 transition"
            >
              Explorar produtos <ChevronRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
              Ativos — {activeEnts.length}
            </h2>
            <div className="grid gap-3">
              {activeEnts.map((ent) => {
                const product = ent.product_tiers?.saas_products;
                const tier = ent.product_tiers;
                const delivery = product?.id ? deliveryMap[String(product.id)] : undefined;
                const licenseKey = product?.id ? licenseMap[String(product.id)] : null;
                const hasWebhook = !!product?.provisioning_webhook_url;

                return (
                  <div
                    key={ent.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {product?.logo_url ? (
                          <img
                            src={product.logo_url}
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                            {product && <MethodIcon method={product.delivery_method} />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-zinc-100 truncate">
                              {product?.name ?? "Produto"}
                            </span>
                            <StatusBadge status={ent.status} />
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{tier?.tier_name}</p>
                          <div className="mt-1">
                            {delivery ? (
                              <DeliveryBadge status={delivery.status} />
                            ) : hasWebhook ? (
                              <span className="text-xs text-zinc-600">Aguardando entrega...</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                    {licenseKey && (
                      <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/40 p-4">
                        <div className="text-xs text-zinc-400 mb-1">Sua chave</div>
                        <div className="font-mono text-sm text-zinc-100 break-all">{licenseKey}</div>
                      </div>
                    )}

                      {/* Re-provisionar (se webhook falhou) */}
                      {hasWebhook && delivery?.status === "failed" && (
                        <button
                          onClick={() => reprovision(ent)}
                          disabled={reprovisioning === ent.id}
                          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/20 rounded-full px-3 py-1.5 transition disabled:opacity-50"
                        >
                          {reprovisioning === ent.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                          Re-tentar
                        </button>
                      )}
                    </div>

                    {openUsageId === (ent as EntitlementRow).instance_id && (
                      <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                        {usageMap[String((ent as EntitlementRow).instance_id)]?.error ? (
                          <div className="text-xs text-red-300">{usageMap[String((ent as EntitlementRow).instance_id)]?.error}</div>
                        ) : !usageMap[String((ent as EntitlementRow).instance_id)] ? (
                          <div className="flex items-center gap-2 text-xs text-zinc-300">
                            <Loader2 size={12} className="animate-spin" /> Carregando uso...
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs text-zinc-300 mb-2">
                              Total (30d): <span className="font-semibold text-white">{usageMap[String((ent as EntitlementRow).instance_id)]?.total_events ?? 0}</span>
                            </div>
                            <div className="h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={(usageMap[String((ent as EntitlementRow).instance_id)]?.daily_activity ?? []) as UsageSeriesPoint[]}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="day" hide />
                                  <YAxis allowDecimals={false} width={40} />
                                  <Tooltip />
                                  <Line type="monotone" dataKey="qty" dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Consultoria */}
                    {tier?.has_consultancy && tier?.calendar_link && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <a
                          href={tier.calendar_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition"
                        >
                          📅 Agendar consultoria inclusa
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    )}

                    {/* Acesso Mágico — botão SSO/Download baseado no delivery_type */}
                    {product && ent.status === "active" && (
                      <div className="mt-4">
                        <MagicAccessCard
                          productId={product.id}
                          productName={product.name}
                          tierName={tier?.tier_name}
                          logoUrl={product.logo_url}
                          deliveryType={product.delivery_type ?? "saas"}
                          magicLinkUrl={product.magic_link_url}
                          status={ent.status}
                          expiresAt={ent.revoked_at}
                        />
                      </div>
                    )}

                    {/* Velocímetro de consumo (somente se produto tem metered billing) */}
                    {product?.id && usageCounters[product.id] && (
                      <div className="mt-4">
                        <UsageSpeedometer
                          title="Uso do Ciclo Atual"
                          currentUsage={usageCounters[product.id].current}
                          maxLimit={usageCounters[product.id].limit}
                          unitName={usageCounters[product.id].unit}
                          resetDate={usageCounters[product.id].resetDate}
                          onUpgradePlan={() => {
                            window.location.href = `/checkout/${(product as unknown as Record<string,unknown>).slug ?? ""}`;
                          }}
                        />
                      </div>
                    )}

                    {/* Data de aquisição */}
                    <p className="text-xs text-zinc-600 mt-2">
                      Adquirido em {new Date(String(ent.created_at ?? "")).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Histórico (revogados/expirados) */}
        {revokedEnts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-medium text-zinc-600 uppercase tracking-widest">
              Histórico — {revokedEnts.length}
            </h2>
            <div className="grid gap-2">
              {revokedEnts.map((ent) => {
                const product = ent.product_tiers?.saas_products;
                const tier = ent.product_tiers;
                return (
                  <div
                    key={ent.id}
                    className="rounded-xl border border-white/5 bg-white/[0.01] p-4 opacity-60"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-sm text-zinc-300">{product?.name ?? "Produto"}</span>
                        <span className="text-zinc-600 mx-1.5">·</span>
                        <span className="text-xs text-zinc-500">{tier?.tier_name}</span>
                      </div>
                      <StatusBadge status={ent.status} />
                    </div>
                    {ent.revoked_at && (
                      <p className="text-xs text-zinc-700 mt-1">
                        Revogado em {new Date(String(ent.revoked_at ?? "")).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
