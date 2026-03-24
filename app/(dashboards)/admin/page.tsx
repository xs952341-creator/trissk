"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ShieldCheck, Star, CheckCircle2, XCircle, Loader2, RefreshCw,
  BadgeAlert, DollarSign, Package, Users, Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";


type Tab = "overview" | "vendors" | "review";

interface PendingProduct {
  id: string; name: string; description: string; created_at: string;
  delivery_method: string; provisioning_webhook_url: string | null;
  profiles: { full_name: string; email: string } | null;
}

interface Vendor {
  id: string; full_name: string; email: string;
  custom_platform_fee_pct: number; is_verified_vendor: boolean; is_staff_pick: boolean;
  _revenue?: number;
}

// GMV data loaded from real database — see loadOverview()
// Fallback vazio evita gráfico com dados falsos

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1.5">{label}</p>
      {payload.map((p: Record<string, unknown>) => (
        <p key={String(p.name)} style={{ color: p.color as string }} className="font-medium">
          {String(p.name ?? "")}: R$ {Number(p.value ?? 0).toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
};

function StatCard({ label, value, icon, color = "text-zinc-50" }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-3 text-zinc-600">{icon}</div>
      <p className={`font-bold text-2xl tracking-tight ${color}`}>{value}</p>
      <p className="text-zinc-600 text-xs mt-1">{label}</p>
    </motion.div>
  );
}

export default function SuperAdminPanel() {
  const [tab,            setTab]            = useState<Tab>("overview");
  const [pendingProds,   setPendingProds]   = useState<PendingProduct[]>([]);
  const [vendors,        setVendors]        = useState<Vendor[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [testStatus,     setTestStatus]     = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [rejectModal,    setRejectModal]    = useState<PendingProduct | null>(null);
  const [rejectReason,   setRejectReason]   = useState("");
  const [rejectLoading,  setRejectLoading]  = useState(false);
  // Stats reais do banco
  const [gmvData,        setGmvData]        = useState<{day:string;gmv:number;fee:number}[]>([]);
  const [realStats,      setRealStats]      = useState({ gmv30d: 0, platformRevenue: 0, activeVendors: 0 });
  const [loadingOverview, setLoadingOverview] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (tab === "overview") loadOverview();
    if (tab === "review")   loadPending();
    if (tab === "vendors")  loadVendors();
  }, [tab]);

  const loadOverview = async () => {
    setLoadingOverview(true);
    try {
      // Buscar dados reais de revenue dos últimos 30 dias
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data: revenueData } = await supabase
        .from("platform_revenue")
        .select("gross_amount, platform_fee, created_at")
        .gte("created_at", thirtyDaysAgo);

      const gmv30d = (revenueData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.gross_amount ?? 0), 0);
      const platformRevenue = (revenueData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.platform_fee ?? 0), 0);

      // Contar vendors ativos (com ao menos 1 venda no período)
      const { count: activeVendors } = await supabase
        .from("platform_revenue")
        .select("vendor_id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo)
        .not("vendor_id", "is", null);

      setRealStats({ gmv30d, platformRevenue, activeVendors: activeVendors ?? 0 });

      // Agrupar por dia da semana para o gráfico (últimos 7 dias)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data: weekData } = await supabase
        .from("platform_revenue")
        .select("gross_amount, platform_fee, created_at")
        .gte("created_at", sevenDaysAgo);

      // Agrupa por dia
      const byDay: Record<string, { gmv: number; fee: number }> = {};
      const dayNames = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400_000);
        byDay[d.toDateString()] = { gmv: 0, fee: 0 };
      }
      for (const row of (weekData ?? [])) {
        const key = new Date(String(row.created_at ?? "")).toDateString();
        if (byDay[key]) {
          byDay[key].gmv += row.gross_amount ?? 0;
          byDay[key].fee += row.platform_fee ?? 0;
        }
      }
      const chartData = Object.entries(byDay).map(([dateStr, vals]) => ({
        day: dayNames[new Date(String(dateStr ?? "")).getDay()],
        gmv: Math.round(vals.gmv),
        fee: Math.round(vals.fee),
      }));
      setGmvData(chartData);
    } catch (e) {
      console.error("[admin] loadOverview failed:", e);
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadPending = async () => {
    setLoadingPending(true);
    const { data } = await supabase
      .from("saas_products")
      .select("id, name, description, created_at, delivery_method, provisioning_webhook_url, profiles(full_name, email)")
      .eq("approval_status", "PENDING_REVIEW")
      .order("created_at", { ascending: true });
    setPendingProds((data ?? []) as unknown as PendingProduct[]);
    setLoadingPending(false);
  };

  const loadVendors = async () => {
    setLoadingVendors(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, custom_platform_fee_pct, is_verified_vendor, is_staff_pick")
      .eq("role", "vendor");
    setVendors((data ?? []) as unknown as Vendor[]);
    setLoadingVendors(false);
  };

  const pingWebhook = async (product: PendingProduct) => {
    const url = product.provisioning_webhook_url;
    if (!url) { setTestStatus((s) => ({ ...s, [String(product.id)]: "fail" })); return; }

    setTestStatus((s) => ({ ...s, [String(product.id)]: "testing" }));
    try {
      const { data: { session: testSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/vendor/test-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testSession?.access_token ?? ""}`,
        },
        body: JSON.stringify({ webhookUrl: url }),
      });
      const data = await res.json();
      setTestStatus((s) => ({ ...s, [String(product.id)]: data.success ? "ok" : "fail" }));
    } catch {
      setTestStatus((s) => ({ ...s, [String(product.id)]: "fail" }));
    }
  };

  const approveProduct = async (product: PendingProduct) => {
    const status = testStatus[product.id];
    if (status === "fail") { toast.error("Corrija a URL de integração antes de aprovar."); return; }

    if (status !== "ok") {
      await pingWebhook(product);
      if (testStatus[String(product.id)] === "fail") return;
    }

    const { error } = await supabase.from("saas_products").update({ approval_status: "APPROVED" }).eq("id", product.id);
    if (error) { toast.error("Erro ao aprovar produto."); return; }
    toast.success(`"${product.name}" aprovado e publicado!`);
    setPendingProds((p) => p.filter((x) => x.id !== product.id));
  };

  const rejectProduct = async () => {
    if (!rejectModal) return;
    setRejectLoading(true);
    const { error } = await supabase.from("saas_products")
      .update({ approval_status: "REJECTED", rejection_reason: rejectReason })
      .eq("id", rejectModal.id);
    setRejectLoading(false);
    if (error) { toast.error("Erro ao rejeitar."); return; }
    toast.success(`"${rejectModal.name}" rejeitado.`);
    setPendingProds((p) => p.filter((x) => x.id !== rejectModal.id));
    setRejectModal(null); setRejectReason("");
  };

  const updateVendorFee = async (vendorId: string, pct: number) => {
    if (pct < 0 || pct > 50) { toast.error("Taxa deve ser entre 0% e 50%."); return; }
    await supabase.from("profiles").update({ custom_platform_fee_pct: pct }).eq("id", vendorId);
    toast.success("Taxa atualizada.");
  };

  const toggleVerified = async (vendor: Vendor) => {
    const newVal = !vendor.is_verified_vendor;
    await supabase.from("profiles").update({ is_verified_vendor: newVal }).eq("id", vendor.id);
    setVendors((v) => v.map((x) => x.id === vendor.id ? { ...x, is_verified_vendor: newVal } : x));
    toast.success(newVal ? "Vendedor verificado!" : "Verificação removida.");
  };

  const toggleStaffPick = async (vendor: Vendor) => {
    const newVal = !vendor.is_staff_pick;
    await supabase.from("profiles").update({ is_staff_pick: newVal }).eq("id", vendor.id);
    setVendors((v) => v.map((x) => x.id === vendor.id ? { ...x, is_staff_pick: newVal } : x));
    toast.success(newVal ? "Staff Pick ativado!" : "Staff Pick removido.");
  };

  const webhookDotColor = (id: string) => {
    const s = testStatus[id];
    if (!s || s === "idle")    return "bg-zinc-600";
    if (s === "testing")       return "bg-amber-400 animate-pulse";
    if (s === "ok")            return "bg-emerald-400";
    return "bg-red-400";
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-xl font-bold tracking-tight">Painel Super Admin</h1>
          <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5 tracking-widest uppercase">Admin</span>
          {pendingProds.length > 0 && (
            <span className="text-[10px] font-bold bg-amber-500 text-zinc-950 rounded-full px-2 py-0.5">
              {pendingProds.length} em revisão
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-8 w-fit">
          {([
            { key: "overview", label: "Visão Geral" },
            { key: "vendors",  label: "Produtores" },
            { key: "review",   label: `Revisão${pendingProds.length ? ` (${pendingProds.length})` : ""}` },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="GMV (30d)" 
                value={loadingOverview ? "..." : `R$ ${realStats.gmv30d.toLocaleString("pt-BR", {minimumFractionDigits:0})}`}
                icon={<DollarSign size={16} />} color="text-zinc-50" />
              <StatCard label="Receita Plataforma"
                value={loadingOverview ? "..." : `R$ ${realStats.platformRevenue.toLocaleString("pt-BR", {minimumFractionDigits:0})}`}
                icon={<DollarSign size={16} />} color="text-emerald-400" />
              <StatCard label="Produtores Ativos"
                value={loadingOverview ? "..." : String(realStats.activeVendors)}
                icon={<Users size={16} />} />
              <StatCard label="Aguardando Revisão" value={String(pendingProds.length)} icon={<Clock size={16} />} color="text-amber-400" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-zinc-400 text-sm font-medium mb-5">GMV vs. Receita da Plataforma (7 dias)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={gmvData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.05)" }} />
                  <Line type="monotone" dataKey="gmv" stroke="#e4e4e7"  strokeWidth={2} dot={false} name="GMV" />
                  <Line type="monotone" dataKey="fee" stroke="#10b981" strokeWidth={2} dot={false} name="Plataforma" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ── VENDORS ── */}
        {tab === "vendors" && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="hidden md:grid grid-cols-6 px-5 py-3 text-zinc-700 text-[10px] uppercase tracking-widest border-b border-white/10">
              <span className="col-span-2">Produtor</span>
              <span className="text-center">Verificado</span>
              <span className="text-center">Taxa %</span>
              <span className="text-center">Staff Pick</span>
              <span className="text-right">Receita Est.</span>
            </div>

            {loadingVendors ? (
              [1,2,3].map((i) => (
                <div key={i} className="px-5 py-4 border-b border-white/5">
                  <div className="animate-pulse h-4 bg-zinc-800 rounded-xl w-1/3" />
                </div>
              ))
            ) : vendors.length === 0 ? (
              <p className="text-center text-zinc-600 py-12">Nenhum produtor ainda.</p>
            ) : vendors.map((v) => (
              <div key={v.id} className="grid grid-cols-2 md:grid-cols-6 items-center px-5 py-4 border-b border-white/5 hover:bg-white/[0.02] gap-y-2">
                <div className="col-span-2">
                  <p className="text-zinc-200 text-sm font-medium">{v.full_name}</p>
                  <p className="text-zinc-600 text-xs">{v.email}</p>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => toggleVerified(v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${v.is_verified_vendor ? "bg-emerald-500" : "bg-zinc-700"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${v.is_verified_vendor ? "translate-x-4" : ""}`} />
                  </button>
                </div>
                <div className="flex justify-center">
                  <input
                    type="number" min="0" max="50" step="0.5"
                    defaultValue={v.custom_platform_fee_pct}
                    onBlur={(e) => updateVendorFee(v.id, parseFloat(e.target.value))}
                    className="w-16 text-center bg-zinc-950 border border-white/10 rounded-lg py-1 text-sm text-zinc-200 outline-none focus:border-white/25"
                  />
                  <span className="text-zinc-600 text-xs self-center ml-1">%</span>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => toggleStaffPick(v)}
                    className={`transition-colors ${v.is_staff_pick ? "text-amber-400" : "text-zinc-700 hover:text-amber-400/60"}`}>
                    <Star size={16} fill={v.is_staff_pick ? "currentColor" : "none"} />
                  </button>
                </div>
                <p className="text-right text-zinc-500 text-sm">—</p>
              </div>
            ))}
          </div>
        )}

        {/* ── REVIEW ── */}
        {tab === "review" && (
          <div className="space-y-5">
            {loadingPending ? (
              [1, 2].map((i) => <div key={i} className="animate-pulse h-40 bg-zinc-900 rounded-2xl" />)
            ) : pendingProds.length === 0 ? (
              <div className="text-center py-20 text-zinc-600">
                <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-500/50" />
                <p>Fila vazia. Nenhum produto aguardando revisão.</p>
              </div>
            ) : pendingProds.map((product) => {
              const status = testStatus[String(product.id)] ?? "idle";
              return (
                <motion.div key={product.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-zinc-50 font-semibold">{product.name}</p>
                      <p className="text-zinc-600 text-xs mt-0.5">{(product.profiles as {full_name?: string; email?: string} | null)?.full_name} · {(product.profiles as {full_name?: string; email?: string} | null)?.email}</p>
                    </div>
                    <p className="text-zinc-700 text-xs">{new Date(String(product.created_at ?? "")).toLocaleDateString("pt-BR")}</p>
                  </div>

                  <p className="text-zinc-500 text-sm mb-4 line-clamp-2">{product.description}</p>

                  {product.provisioning_webhook_url && (
                    <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-zinc-950 border border-white/10">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${webhookDotColor(product.id)}`} />
                      <code className="flex-1 text-xs text-zinc-500 truncate">{product.provisioning_webhook_url}</code>
                    </div>
                  )}

                  {status === "fail" && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5">
                      <BadgeAlert size={14} className="text-red-400 shrink-0" />
                      <p className="text-red-400 text-xs">A URL de integração falhou. Verifique a API antes de aprovar.</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-2">
                    <button onClick={() => pingWebhook(product)} disabled={status === "testing"}
                      className="flex items-center gap-1.5 text-xs border border-white/10 text-zinc-500 hover:text-zinc-300 rounded-full px-3 py-2 transition-all disabled:opacity-60">
                      {status === "testing" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      {status === "testing" ? "Testando..." : "Testar Acesso"}
                    </button>
                    <button onClick={() => { setRejectModal(product); setRejectReason(""); }}
                      className="flex items-center gap-1.5 text-xs border border-red-500/20 text-red-400 hover:bg-red-500/5 rounded-full px-3 py-2 transition-all">
                      <XCircle size={11} /> Rejeitar
                    </button>
                    <button onClick={() => approveProduct(product)}
                      disabled={status === "testing" || status === "fail"}
                      className="flex items-center gap-1.5 text-xs bg-emerald-500 text-zinc-950 font-semibold rounded-full px-4 py-2 hover:bg-emerald-400 transition-all disabled:opacity-40">
                      <CheckCircle2 size={11} /> Aprovar Produto
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-zinc-50 font-semibold mb-1">Rejeitar Produto</h3>
            <p className="text-zinc-600 text-xs mb-4">Informe o motivo para o produtor poder corrigir e reenviar.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4} placeholder="Ex: URL de webhook não está respondendo corretamente..."
              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-white/10 rounded-full py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
              <button onClick={rejectProduct} disabled={rejectLoading || !rejectReason.trim()}
                className="flex-1 bg-red-500/90 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-red-500 disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors">
                {rejectLoading && <Loader2 size={13} className="animate-spin" />}
                {rejectLoading ? "Rejeitando..." : "Rejeitar"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
