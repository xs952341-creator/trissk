
"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, BarChart2, FileText, Zap, ShieldCheck, BadgeAlert,
  Copy, CheckCircle2, Loader2, ExternalLink, Eye, Plus,
  Download, TrendingUp, Users, DollarSign, RefreshCw,
  Link2, Settings, ChevronDown, ChevronUp, Save, Info,
  UserCheck, UserX, Clock as ClockIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getErrorMessage } from "@/lib/errors";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Tab = "overview" | "products" | "fiscal" | "affiliate" | "financeiro";

interface Product {
  id: string; name: string; approval_status: string; sales_count: number; trending_score: number;
  delivery_method: string; provisioning_webhook_url?: string; zapier_webhook_url?: string;
  webhook_signing_secret?: string; allows_affiliates: boolean;
  // affiliate fields v16
  affiliate_commission_percent?: number;
  affiliate_commission_type_v2?: string;
  affiliate_commission_fixed?: number;
  affiliate_description?: string;
}

type UserProfile = {
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

type ReferralRequest = {
  id: string;
  profiles?: UserProfile | null;
  message?: string | null;
  status: string;
};

type FiscalJob = {
  id: string;
  created_at: string;
  status: string;
  buyer_email: string;
  amount_gross: number;
  platform_fee: number;
  emit_after: string;
};

type RevenueDataPoint = {
  date: string;
  revenue: number;
};

interface Product {
  id: string; name: string; approval_status: string; sales_count: number; trending_score: number;
  delivery_method: string; provisioning_webhook_url?: string; zapier_webhook_url?: string;
  webhook_signing_secret?: string; allows_affiliates: boolean;
  // affiliate fields v16
  affiliate_commission_percent?: number;
  affiliate_commission_type_v2?: string;
  affiliate_commission_fixed?: number;
  affiliate_description?: string;
  affiliate_cookie_days?: number;
  affiliate_attribution_model?: string;
  affiliate_approval_mode?: string;
  affiliate_share_buyer_data?: boolean;
  affiliate_marketplace_visible?: boolean;
}

interface AffiliateRequest {
  id: string;
  affiliate_id: string;
  product_id: string;
  status: string;
  message?: string;
  created_at: string;
  profiles?: { full_name: string; email: string };
}

interface FinancialSummary {
  total_revenue: number;
  mrr: number;
  active_subs: number;
  churn_count: number;
  ltv: number;
  by_product: { product_id: string; product_name: string; logo_url?: string; revenue: number; sales_count: number }[];
  by_affiliate: { affiliate_id: string; affiliate_name?: string; affiliate_email?: string; sales_count: number; total_commission: number; total_sales_amount: number }[];
  revenue_series: { month: string; revenue: number }[];
  period_days: number;
}

const fmtBRL = (v: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const COOKIE_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
  { label: "60 dias", value: 60 },
  { label: "90 dias", value: 90 },
  { label: "Eterno (0)", value: 0 },
];

// Componente de configuração completa de afiliado por produto (Kiwify-like)
function AffiliateProductConfig({ product, onSave }: { product: Product; onSave: (id: string, data: Partial<Product>) => void }) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(product.allows_affiliates ?? false);
  const [commType, setCommType] = useState<"percent"|"fixed">(
    (product.affiliate_commission_type_v2 as "percent" | "fixed") ?? "percent"
  );
  const [commPct, setCommPct] = useState<number>(product.affiliate_commission_percent ?? 30);
  const [commFixed, setCommFixed] = useState<number>(product.affiliate_commission_fixed ?? 0);
  const [description, setDescription] = useState(product.affiliate_description ?? "");
  const [cookieDays, setCookieDays] = useState<number>(product.affiliate_cookie_days ?? 30);
  const [attribution, setAttribution] = useState(product.affiliate_attribution_model ?? "last_click");
  const [approvalMode, setApprovalMode] = useState(product.affiliate_approval_mode ?? "auto");
  const [shareBuyerData, setShareBuyerData] = useState(product.affiliate_share_buyer_data ?? false);
  const [marketplaceVisible, setMarketplaceVisible] = useState(product.affiliate_marketplace_visible ?? true);
  const [requests, setRequests] = useState<AffiliateRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);

  useEffect(() => {
    if (expanded && enabled) loadRequests();
  }, [expanded, enabled]);

  const loadRequests = async () => {
    setLoadingReqs(true);
    const { data } = await supabase
      .from("affiliate_product_requests")
      .select("id, affiliate_id, product_id, status, message, created_at, profiles(full_name, email)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });
    setRequests((data ?? []) as unknown as AffiliateRequest[]);
    setLoadingReqs(false);
  };

  const handleReview = async (requestId: string, status: "approved" | "rejected") => {
    const { error } = await supabase.rpc("approve_affiliate_request", {
      p_request_id: requestId,
      p_status: status,
    });
    if (error) { toast.error("Erro ao processar solicitação."); return; }
    toast.success(status === "approved" ? "Afiliado aprovado!" : "Solicitação rejeitada.");
    await loadRequests();
  };

  const save = async () => {
    setSaving(true);
    interface VendorProfilePayload {
      name?: string;
      description?: string;
      support_email?: string;
      website?: string;
      logo_url?: string;
      category?: string;
      [key: string]: unknown;
    }

    const payload: VendorProfilePayload = {
      allows_affiliates: enabled,
      affiliate_commission_type_v2: commType,
      affiliate_commission_percent: commType === "percent" ? commPct : 0,
      affiliate_commission_fixed: commType === "fixed" ? commFixed : 0,
      affiliate_description: description || null,
      affiliate_cookie_days: cookieDays,
      affiliate_attribution_model: attribution,
      affiliate_approval_mode: approvalMode,
      affiliate_share_buyer_data: shareBuyerData,
      affiliate_marketplace_visible: marketplaceVisible,
      // Keep backward compat fields in sync
      affiliate_first_month_pct: commType === "percent" ? commPct : 0,
      affiliate_recurring_pct: commType === "percent" ? commPct : 0,
    };
    const { error } = await supabase.from("saas_products").update(payload).eq("id", product.id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    toast.success("Configurações de afiliado salvas!");
    onSave(product.id, { ...payload, allows_affiliates: enabled });
    setSaving(false);
  };

  const inviteLink = typeof window !== "undefined"
    ? `${window.location.origin}/affiliate/solicitar?produto=${product.id}`
    : "";

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Link de convite copiado!");
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <Package size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-zinc-200 font-medium text-sm">{product.name}</p>
            {enabled && (
              <p className="text-zinc-600 text-xs mt-0.5">
                {commType === "percent" ? `${commPct}% de comissão` : `R$ ${commFixed} fixo`}
                {" · "}
                {approvalMode === "auto" ? "Aprovação automática" : "Aprovação manual"}
                {pendingCount > 0 && <span className="text-amber-400"> · {pendingCount} aguardando</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle afiliados */}
          <button
            onClick={() => { setEnabled(!enabled); }}
            className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-zinc-700"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </button>
          {/* Expand/collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-zinc-600 hover:text-zinc-400 p-1 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Config expandida */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 p-5 space-y-6">
              {!enabled && (
                <div className="rounded-xl bg-zinc-900 border border-white/5 p-4 text-center">
                  <p className="text-zinc-500 text-sm">Ative os afiliados acima para configurar o programa.</p>
                </div>
              )}

              {enabled && (
                <>
                  {/* Comissão */}
                  <div>
                    <label className="text-zinc-400 text-xs font-medium mb-3 block">Tipo de Comissão</label>
                    <div className="flex gap-2 mb-4">
                      {(["percent","fixed"] as const).map(t => (
                        <button key={t} onClick={() => setCommType(t)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${commType === t ? "bg-emerald-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 border border-white/10 hover:border-white/20"}`}>
                          {t === "percent" ? "Percentual (%)" : "Fixo (R$)"}
                        </button>
                      ))}
                    </div>
                    {commType === "percent" ? (
                      <div>
                        <label className="text-zinc-500 text-xs mb-1.5 block">Percentual de Comissão (%)</label>
                        <div className="flex items-center gap-3">
                          <input type="range" min={1} max={80} value={commPct}
                            onChange={e => setCommPct(Number(e.target.value))}
                            className="flex-1 accent-emerald-500" />
                          <div className="w-16 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-center text-emerald-400 font-bold text-sm">
                            {commPct}%
                          </div>
                        </div>
                        <p className="text-zinc-600 text-xs mt-1">Afiliado recebe {commPct}% do valor de cada venda.</p>
                      </div>
                    ) : (
                      <div>
                        <label className="text-zinc-500 text-xs mb-1.5 block">Valor Fixo por Venda (R$)</label>
                        <input type="number" min={0} step={0.01} value={commFixed}
                          onChange={e => setCommFixed(Number(e.target.value))}
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50" />
                        <p className="text-zinc-600 text-xs mt-1">Afiliado recebe R$ {commFixed.toFixed(2)} fixo por venda, independente do valor.</p>
                      </div>
                    )}
                  </div>

                  {/* Descrição para afiliados */}
                  <div>
                    <label className="text-zinc-400 text-xs font-medium mb-1.5 block">
                      Descrição para Afiliados
                      <span className="text-zinc-600 font-normal ml-1">(o que podem/não podem fazer, materiais)</span>
                    </label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                      rows={4} placeholder="Ex: Você pode divulgar em redes sociais, email marketing e YouTube. Não é permitido spam, anúncios pagos em Google Ads ou tráfego incentivado..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 resize-none placeholder:text-zinc-700" />
                  </div>

                  {/* Cookie e Atribuição */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-zinc-400 text-xs font-medium mb-1.5 block">Duração do Cookie</label>
                      <select value={cookieDays} onChange={e => setCookieDays(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50">
                        {COOKIE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-zinc-400 text-xs font-medium mb-1.5 block">Modelo de Atribuição</label>
                      <select value={attribution} onChange={e => setAttribution(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/50">
                        <option value="last_click">Último clique</option>
                        <option value="first_click">Primeiro clique</option>
                      </select>
                    </div>
                  </div>

                  {/* Aprovação */}
                  <div>
                    <label className="text-zinc-400 text-xs font-medium mb-2 block">Aprovação de Afiliados</label>
                    <div className="flex gap-2">
                      {([
                        { v: "auto",   label: "Automática", desc: "Qualquer um pode se afiliar" },
                        { v: "manual", label: "Manual",    desc: "Você aprova cada solicitação" },
                      ]).map(o => (
                        <button key={o.v} onClick={() => setApprovalMode(o.v)}
                          className={`flex-1 p-3 rounded-xl text-left transition-all border ${approvalMode === o.v ? "border-emerald-500/50 bg-emerald-500/5" : "border-white/10 bg-zinc-900 hover:border-white/20"}`}>
                          <p className="text-sm font-medium text-zinc-200">{o.label}</p>
                          <p className="text-xs text-zinc-600 mt-0.5">{o.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opções extras */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-zinc-300 text-sm">Compartilhar dados do comprador</p>
                        <p className="text-zinc-600 text-xs">Afiliados veem nome/email de quem compraram através deles</p>
                      </div>
                      <button onClick={() => setShareBuyerData(!shareBuyerData)}
                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${shareBuyerData ? "bg-emerald-500" : "bg-zinc-700"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${shareBuyerData ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-zinc-300 text-sm">Visível no marketplace de afiliados</p>
                        <p className="text-zinc-600 text-xs">Afiliados podem encontrar seu produto publicamente</p>
                      </div>
                      <button onClick={() => setMarketplaceVisible(!marketplaceVisible)}
                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${marketplaceVisible ? "bg-emerald-500" : "bg-zinc-700"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${marketplaceVisible ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {/* Link de convite */}
                  <div>
                    <label className="text-zinc-400 text-xs font-medium mb-1.5 block">Link de Convite Direto</label>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5">
                      <code className="flex-1 text-xs text-emerald-400 truncate font-mono">{inviteLink}</code>
                      <button onClick={copyInvite} className="text-zinc-600 hover:text-zinc-300 shrink-0">
                        <Copy size={13} />
                      </button>
                    </div>
                    <p className="text-zinc-600 text-xs mt-1">Compartilhe com afiliados que você quer convidar diretamente.</p>
                  </div>

                  {/* Solicitações pendentes */}
                  {approvalMode === "manual" && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-zinc-400 text-xs font-medium">Solicitações de Afiliação</label>
                        <button onClick={loadRequests} className="text-zinc-600 hover:text-zinc-400">
                          <RefreshCw size={12} />
                        </button>
                      </div>
                      {loadingReqs ? (
                        <div className="flex items-center gap-2 text-zinc-600 text-xs py-3">
                          <Loader2 size={13} className="animate-spin" /> Carregando...
                        </div>
                      ) : requests.length === 0 ? (
                        <p className="text-zinc-600 text-xs py-3">Nenhuma solicitação ainda.</p>
                      ) : (
                        <div className="space-y-2">
                          {requests.map(r => (
                            <div key={r.id} className="rounded-xl border border-white/10 bg-zinc-950 p-3 flex items-center gap-3">
                              <div className="flex-1">
                                <p className="text-zinc-300 text-xs font-medium">{(r.profiles as UserProfile | null)?.full_name ?? "—"}</p>
                                <p className="text-zinc-600 text-xs">{(r.profiles as UserProfile | null)?.email ?? ""}</p>
                                {r.message && <p className="text-zinc-500 text-xs mt-1 italic">"{r.message}"</p>}
                              </div>
                              {r.status === "pending" ? (
                                <div className="flex gap-1.5 shrink-0">
                                  <button onClick={() => handleReview(r.id, "approved")}
                                    className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                                    <UserCheck size={13} />
                                  </button>
                                  <button onClick={() => handleReview(r.id, "rejected")}
                                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                                    <UserX size={13} />
                                  </button>
                                </div>
                              ) : (
                                <span className={`text-xs font-medium shrink-0 ${r.status === "approved" ? "text-emerald-400" : "text-red-400"}`}>
                                  {r.status === "approved" ? "Aprovado" : "Rejeitado"}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Salvar */}
              <button onClick={save} disabled={saving}
                className="w-full bg-emerald-500 text-zinc-950 font-bold py-2.5 rounded-xl hover:bg-emerald-400 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED:       "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    PENDING_REVIEW: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    REJECTED:       "border-red-500/30 text-red-400 bg-red-500/10",
  };
  const labels: Record<string, string> = { APPROVED: "Aprovado", PENDING_REVIEW: "Em Revisão", REJECTED: "Rejeitado" };
  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${map[status] ?? map.PENDING_REVIEW}`}>
      {labels[status] ?? status}
    </span>
  );
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv  = [keys.join(","), ...data.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function VendorDashboardInner() {
  const [tab,         setTab]         = useState<Tab>("overview");
  const [products,    setProducts]    = useState<Product[]>([]);
  const [fiscalJobs,  setFiscalJobs]  = useState<FiscalJob[]>([]);
  const [profile,     setProfile]     = useState<Record<string, unknown> | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [copiedSec,   setCopiedSec]   = useState(false);
  const [enotasKey,   setEnotasKey]   = useState("");
  const [enotasId,    setEnotasId]    = useState("");
  const [cnpj,        setCnpj]        = useState("");
  const [savingFisc,  setSavingFisc]  = useState(false);
  const [testWh,      setTestWh]      = useState<Record<string, "idle"|"testing"|"ok"|"fail">>({});
  const [testLog,     setTestLog]     = useState<Record<string, string>>({});
  const [kycLoading,  setKycLoading]  = useState(false);
  const [syncingKyc,  setSyncingKyc]  = useState(false);
  const [connected,   setConnected]   = useState(false);
  const [financial,   setFinancial]   = useState<FinancialSummary | null>(null);
  const [finLoading,  setFinLoading]  = useState(false);
  const [finPeriod,   setFinPeriod]   = useState(30);
  const supabase = createClient();
  const searchParams = useSearchParams();

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === "products") loadProducts();
    if (tab === "fiscal") loadFiscal();
    if (tab === "financeiro") loadFinancial(finPeriod);
  }, [tab]);

  const syncConnectStatus = useCallback(async (silent = false) => {
    try {
      setSyncingKyc(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/stripe/connect/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!silent) {
        if (data?.connected) toast.success("Status do Stripe atualizado.");
        else if (data?.error) toast.error(data.error);
      }
      if (data?.connected) setConnected(true);
    } catch {
      if (!silent) toast.error("Erro ao sincronizar com Stripe.");
    } finally {
      setSyncingKyc(false);
    }
  }, [supabase, toast]);

  // Ao voltar do Stripe Connect (return_url/refresh_url), sincroniza as flags no profile
  useEffect(() => {
    const kyc = searchParams?.get("kyc");
    if (kyc === "complete" || kyc === "refresh") {
      syncConnectStatus(true);
    }
  }, [searchParams, syncConnectStatus]);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: p } = await supabase.from("profiles")
      .select("id, full_name, email, custom_platform_fee_pct, is_verified_vendor, stripe_payouts_enabled, stripe_kyc_enabled, stripe_connect_account_id, enotas_api_key, enotas_company_id, cnpj, fb_pixel_id, tiktok_pixel_id")
      .eq("id", session.user.id).single();
    setProfile(p as unknown as Record<string, unknown> | null);
    setEnotasKey(p?.enotas_api_key ?? "");
    setEnotasId(p?.enotas_company_id ?? "");
    setCnpj(p?.cnpj ?? "");

    await loadProducts(session.user.id);
    setLoading(false);
  };

  const loadProducts = async (uid?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const id = uid ?? session?.user.id;
    if (!id) return;
    const { data } = await supabase.from("saas_products")
      .select("id, name, approval_status, sales_count, trending_score, delivery_method, provisioning_webhook_url, zapier_webhook_url, webhook_signing_secret, allows_affiliates, affiliate_commission_percent, affiliate_commission_type_v2, affiliate_commission_fixed, affiliate_description, affiliate_cookie_days, affiliate_attribution_model, affiliate_approval_mode, affiliate_share_buyer_data, affiliate_marketplace_visible")
      .eq("vendor_id", id).order("created_at", { ascending: false });
    setProducts(data ?? []);
  };

  const loadFinancial = async (days = 30) => {
    setFinLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setFinLoading(false); return; }
    const { data, error } = await supabase.rpc("vendor_financial_summary", {
      p_vendor_id: session.user.id,
      p_days: days,
    });
    if (!error && data) setFinancial(data as unknown as FinancialSummary);
    setFinLoading(false);
  };

  const loadFiscal = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("fiscal_jobs")
      .select("id, buyer_email, amount_gross, platform_fee, emit_after, status, created_at")
      .eq("vendor_id", session.user.id).order("emit_after", { ascending: false }).limit(50);
    setFiscalJobs(data ?? []);
  };

  const saveFiscal = async () => {
    setSavingFisc(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSavingFisc(false); return; }
    await supabase.from("profiles").update({
      enotas_api_key:    enotasKey  || null,
      enotas_company_id: enotasId   || null,
      cnpj:              cnpj       || null,
    }).eq("id", session.user.id);
    toast.success("Configurações fiscais salvas!");
    setSavingFisc(false);
  };

  const startKYC = async () => {
    setKycLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/stripe/onboarding", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast.error("Erro ao iniciar verificação.");
    } catch { toast.error("Erro ao iniciar KYC."); }
    setKycLoading(false);
  };

  const testWebhook = async (product: Product) => {
    const url = product.provisioning_webhook_url ?? product.zapier_webhook_url;
    if (!url) { toast.error("Configure uma URL de webhook primeiro."); return; }
    setTestWh((s) => ({ ...s, [String(product.id)]: "testing" }));
    setTestLog((s) => ({ ...s, [String(product.id)]: "" }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/vendor/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ webhookUrl: url }),
      });
      const data = await res.json();
      setTestWh((s) => ({ ...s, [String(product.id)]: data.success ? "ok" : "fail" }));
      setTestLog((s) => ({ ...s, [String(product.id)]: `Status ${data.statusCode} · ${data.latencyMs}ms\n${data.response}` }));
    } catch (e: unknown) {
      setTestWh((s) => ({ ...s, [String(product.id)]: "fail" }));
      setTestLog((s) => ({ ...s, [String(product.id)]: getErrorMessage(e) }));
    }
  };

  const copySec = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSec(true);
    toast.success("Secret copiado!");
    setTimeout(() => setCopiedSec(false), 3000);
  };

  const kycOk = profile?.stripe_payouts_enabled && profile?.stripe_kyc_enabled;

  const MRR = products.reduce((acc, p) => acc + 0, 0);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {!loading && !kycOk && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BadgeAlert size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="text-red-300 font-semibold text-sm">Ação Exigida: Verifique sua identidade</p>
                <p className="text-red-400/70 text-xs">Seus saques estão bloqueados até a verificação KYC ser concluída.</p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={() => syncConnectStatus()}
                disabled={syncingKyc}
                className="flex items-center gap-1.5 bg-white/5 text-white rounded-full px-4 py-2 text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 border border-white/10"
              >
                {syncingKyc ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Atualizar
              </button>
              <button onClick={startKYC} disabled={kycLoading}
                className="flex items-center gap-1.5 bg-red-500 text-white rounded-full px-4 py-2 text-sm font-semibold hover:bg-red-400 transition-colors disabled:opacity-60">
                {kycLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                {kycLoading ? "Abrindo..." : "Verificar Agora"}
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Painel do Produtor</h1>
            <p className="text-zinc-500 text-sm-0.5">{(profile as UserProfile | null)?.full_name ?? "Carregando..."}</p>
          </div>
          <Link href="/vendor/produtos/novo"
            className="flex items-center gap-1.5 bg-white text-zinc-950 rounded-full px-4 py-2 text-sm font-semibold hover:bg-zinc-200 transition-colors">
            <Plus size={14} /> Novo Produto
          </Link>
        </div>

        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-8 w-fit flex-wrap">
          {([
            { key: "overview",   label: "Visão Geral" },
            { key: "products",   label: "Produtos" },
            { key: "fiscal",     label: "Fiscal" },
            { key: "affiliate",  label: "Afiliados" },
            { key: "financeiro", label: "Financeiro" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "MRR",              value: `R$ ${MRR.toLocaleString("pt-BR")}`, icon: <DollarSign size={16} />, color: "text-emerald-400" },
                { label: "Assinantes Ativos", value: "—",                                icon: <Users size={16} /> },
                { label: "Produtos Ativos",   value: String(products.filter(p => p.approval_status === "APPROVED").length), icon: <Package size={16} /> },
                { label: "Trending Score",    value: String(products[0]?.trending_score ?? 0), icon: <TrendingUp size={16} /> },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="text-zinc-600 mb-3">{s.icon}</div>
                  <p className={`font-bold text-2xl tracking-tight ${s.color ?? "text-zinc-50"}`}>{s.value}</p>
                  <p className="text-zinc-600 text-xs mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>

            {products[0]?.webhook_signing_secret && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-zinc-400 text-xs mb-2">Signing Secret (validar webhooks recebidos)</p>
                <div className="flex items-center gap-3 bg-zinc-950 rounded-xl px-4 py-2.5 border border-white/10">
                  <code className="flex-1 font-mono text-emerald-400 text-xs truncate">{products[0].webhook_signing_secret}</code>
                  <button onClick={() => copySec(products[0].webhook_signing_secret!)}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors">
                    {copiedSec ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "products" && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-zinc-50 font-semibold text-sm">Meus Produtos ({products.length})</h2>
              <button onClick={() => exportCSV(products.map(p => ({ nome: p.name, status: p.approval_status, vendas: p.sales_count })), "produtos.csv")}
                className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 border border-white/10 rounded-full px-3 py-1.5 transition-colors">
                <Download size={11} /> Exportar CSV
              </button>
            </div>
            <div className="hidden md:grid grid-cols-5 px-5 py-3 text-zinc-700 text-[10px] uppercase tracking-widest border-b border-white/5">
              <span className="col-span-2">Produto</span><span className="text-center">Status</span><span className="text-center">Vendas</span><span className="text-right">Ação</span>
            </div>
            {products.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <Package size={36} className="mx-auto mb-3 opacity-30" />
                <p>Nenhum produto cadastrado ainda.</p>
                <Link href="/vendor/produtos/novo" className="text-emerald-500 hover:underline text-sm mt-2 inline-block">Cadastrar primeiro produto →</Link>
              </div>
            ) : products.map((p) => (
              <div key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <div className="grid grid-cols-2 md:grid-cols-5 items-center px-5 py-4 gap-y-2">
                  <div className="col-span-2">
                    <p className="text-zinc-200 text-sm font-medium">{p.name}</p>
                    <p className="text-zinc-600 text-xs">{p.delivery_method}</p>
                  </div>
                  <div className="flex justify-start md:justify-center"><StatusBadge status={p.approval_status} /></div>
                  <p className="text-zinc-400 text-sm text-left md:text-center">{p.sales_count}</p>
                  <div className="flex gap-2 justify-start md:justify-end">
                    <Link href={`/produto/${p.id}`} className="text-zinc-600 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                      <ExternalLink size={13} />
                    </Link>
                    <Link
                      href={`/vendor/products/${p.id}/integration`}
                      className="flex items-center gap-1 text-xs rounded-full px-3 py-1.5 border border-violet-500/30 text-violet-400 hover:text-violet-300 hover:border-violet-500/50 transition-all"
                    >
                      <Settings size={10} /> Integração
                    </Link>
                    <button onClick={() => testWebhook(p)} disabled={testWh[String(p.id)] === "testing"}
                      className={`flex items-center gap-1 text-xs rounded-full px-3 py-1.5 border transition-all ${testWh[String(p.id)] === "ok" ? "border-emerald-500/30 text-emerald-400" : testWh[String(p.id)] === "fail" ? "border-red-500/30 text-red-400" : "border-white/10 text-zinc-600 hover:text-zinc-400"}`}>
                      {testWh[String(p.id)] === "testing" ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                      {testWh[String(p.id)] === "ok" ? "✓ OK" : testWh[String(p.id)] === "fail" ? "✗ Falhou" : "Testar"}
                    </button>
                  </div>
                </div>
                {testLog[p.id] && (
                  <div className="mx-5 mb-3 bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 font-mono text-xs text-zinc-500 whitespace-pre-wrap">
                    {testLog[p.id]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "fiscal" && (
          <div className="space-y-6 max-w-lg">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-zinc-50 font-semibold text-sm mb-1">Configuração Fiscal (eNotas)</h2>
              <p className="text-zinc-600 text-xs mb-6 leading-relaxed">
                A emissão de Notas Fiscais para o consumidor final é de sua responsabilidade exclusiva. Insira sua chave de integração abaixo para automatizar este processo, ou deixe em branco caso prefira emitir suas notas manualmente no portal da sua prefeitura.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">Chave de API eNotas</label>
                  <input value={enotasKey} onChange={(e) => setEnotasKey(e.target.value)} placeholder="STRIPE_SECRET_KEY" type="password"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">ID da Empresa no eNotas</label>
                  <input value={enotasId} onChange={(e) => setEnotasId(e.target.value)} placeholder="uuid da empresa no eNotas"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">CNPJ (sem pontuação)</label>
                  <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00000000000100"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25" />
                </div>
                <button onClick={saveFiscal} disabled={savingFisc}
                  className="w-full bg-white text-zinc-950 rounded-full py-2.5 text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {savingFisc ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {savingFisc ? "Salvando..." : "Salvar Configurações"}
                </button>
              </div>
            </div>

            {fiscalJobs.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                  <h3 className="text-zinc-50 font-semibold text-sm">Histórico de NF-e</h3>
                  <button onClick={() => exportCSV(fiscalJobs as FiscalJob[], "fiscal-jobs.csv")}
                    className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 border border-white/10 rounded-full px-3 py-1.5">
                    <Download size={11} /> CSV
                  </button>
                </div>
                {fiscalJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between px-5 py-3 border-b border-white/5 hover:bg-white/[0.01]">
                    <div>
                      <p className="text-zinc-300 text-xs">{job.buyer_email}</p>
                      <p className="text-zinc-700 text-xs">{new Date(String(job.emit_after ?? "")).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-zinc-300 text-xs font-medium">R$ {job.amount_gross.toFixed(2)}</p>
                      <span className={`text-xs ${job.status === "EMITTED" ? "text-emerald-400" : job.status === "ABORTED" ? "text-red-400" : "text-amber-400"}`}>
                        {job.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "affiliate" && (
          <div className="space-y-4 max-w-2xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-2">
              <h2 className="text-zinc-50 font-semibold text-sm mb-1">Programa de Afiliados</h2>
              <p className="text-zinc-500 text-xs leading-relaxed">
                Configure comissão, descrição e regras de cada produto separadamente.
                Apenas produtos <span className="text-emerald-400">Aprovados</span> aparecem aqui.
              </p>
            </div>
            {products.filter(p => p.approval_status === "APPROVED").length === 0 ? (
              <div className="text-center py-12 text-zinc-600">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum produto aprovado ainda.</p>
              </div>
            ) : products.filter(p => p.approval_status === "APPROVED").map((p) => (
              <AffiliateProductConfig
                key={p.id}
                product={p}
                onSave={(id, data) => setProducts(prev => prev.map(x => x.id === id ? { ...x, ...data } : x))}
              />
            ))}
          </div>
        )}

        {tab === "financeiro" && (
          <div className="space-y-6 max-w-4xl">
            {/* Seletor de período */}
            <div className="flex items-center gap-2">
              {[
                { label: "7 dias",  value: 7  },
                { label: "30 dias", value: 30 },
                { label: "90 dias", value: 90 },
                { label: "1 ano",   value: 365 },
              ].map(p => (
                <button key={p.value}
                  onClick={() => { setFinPeriod(p.value); loadFinancial(p.value); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${finPeriod === p.value ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400 border border-white/10"}`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => loadFinancial(finPeriod)} className="ml-2 text-zinc-600 hover:text-zinc-400 transition-colors">
                <RefreshCw size={13} className={finLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {finLoading && (
              <div className="flex items-center gap-2 text-zinc-500 py-8">
                <Loader2 size={16} className="animate-spin" /> Carregando dados financeiros...
              </div>
            )}

            {!finLoading && financial && (
              <>
                {/* KPIs principais */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: "Receita Total",     value: fmtBRL(financial.total_revenue), icon: <DollarSign size={14} />, color: "text-emerald-400" },
                    { label: "MRR",               value: fmtBRL(financial.mrr),           icon: <TrendingUp size={14} />,  color: "text-blue-400" },
                    { label: "Assinantes Ativos", value: String(financial.active_subs),   icon: <Users size={14} />,       color: "text-violet-400" },
                    { label: "Churn (período)",   value: String(financial.churn_count),   icon: <BarChart2 size={14} />,   color: "text-amber-400" },
                    { label: "LTV Estimado",      value: fmtBRL(financial.ltv),           icon: <Eye size={14} />,         color: "text-pink-400" },
                  ].map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                      <div className={`mb-2 ${s.color}`}>{s.icon}</div>
                      <p className={`font-bold text-lg tracking-tight ${s.color}`}>{s.value}</p>
                      <p className="text-zinc-600 text-xs mt-0.5">{s.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Gráfico de receita mensal */}
                {financial.revenue_series.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <h3 className="text-zinc-300 text-sm font-medium mb-4">Receita Mensal</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={financial.revenue_series} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#52525b" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#52525b" }} tickFormatter={v => `R$${v}`} />
                        <Tooltip
                          contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number) => [fmtBRL(Number(v)), "Receita"]}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Receita por Produto */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                      <h3 className="text-zinc-300 text-sm font-medium">Receita por Produto</h3>
                      <button onClick={() => exportCSV(financial.by_product, "receita-por-produto.csv")}
                        className="text-zinc-600 hover:text-zinc-400 text-xs flex items-center gap-1">
                        <Download size={11} /> CSV
                      </button>
                    </div>
                    {financial.by_product.length === 0 ? (
                      <p className="text-zinc-600 text-xs px-5 py-4">Sem dados no período.</p>
                    ) : financial.by_product.map((p) => (
                      <div key={p.product_id} className="flex items-center justify-between px-5 py-3 border-b border-white/5 hover:bg-white/[0.01]">
                        <div className="flex items-center gap-2">
                          {p.logo_url && <img src={p.logo_url} alt="" className="w-6 h-6 rounded-lg object-cover" />}
                          <div>
                            <p className="text-zinc-300 text-xs font-medium">{p.product_name}</p>
                            <p className="text-zinc-600 text-xs">{p.sales_count} venda{p.sales_count !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <p className="text-emerald-400 text-sm font-semibold">{fmtBRL(p.revenue)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Receita por Afiliado */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                      <h3 className="text-zinc-300 text-sm font-medium">Receita por Afiliado</h3>
                      <button onClick={() => exportCSV(financial.by_affiliate, "receita-por-afiliado.csv")}
                        className="text-zinc-600 hover:text-zinc-400 text-xs flex items-center gap-1">
                        <Download size={11} /> CSV
                      </button>
                    </div>
                    {financial.by_affiliate.length === 0 ? (
                      <p className="text-zinc-600 text-xs px-5 py-4">Nenhuma venda via afiliado no período.</p>
                    ) : financial.by_affiliate.map((a) => (
                      <div key={a.affiliate_id} className="flex items-center justify-between px-5 py-3 border-b border-white/5 hover:bg-white/[0.01]">
                        <div>
                          <p className="text-zinc-300 text-xs font-medium">{a.affiliate_name ?? "Afiliado"}</p>
                          <p className="text-zinc-600 text-xs">{a.affiliate_email} · {a.sales_count} venda{a.sales_count !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-blue-400 text-xs font-semibold">{fmtBRL(a.total_sales_amount)}</p>
                          <p className="text-zinc-600 text-xs">comissão: {fmtBRL(a.total_commission)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!finLoading && !financial && (
              <div className="text-center py-16 text-zinc-600">
                <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Clique em atualizar para carregar os dados financeiros.</p>
                <button onClick={() => loadFinancial(finPeriod)}
                  className="mt-4 text-emerald-500 text-sm hover:underline">Carregar agora →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VendorDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <VendorDashboardInner />
    </Suspense>
  );
}
