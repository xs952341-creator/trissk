"use client";
// app/affiliate/page.tsx — Dashboard de Afiliado Premium v2
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Link2, DollarSign, TrendingUp, BarChart2, Copy,
  CheckCircle2, Clock, ArrowUpRight, Star, ExternalLink,
  Users, Zap, ChevronRight, Award,
} from "lucide-react";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Local types
interface ProductInfo {
  name?: string;
  logo_url?: string;
}

interface AffiliateLink {
  id: string;
  code: string;
  click_count?: number;
  conversion_count?: number;
  saas_products?: ProductInfo | ProductInfo[] | null;
}

interface AffiliateSale {
  id: string;
  commission_amount?: number;
  gross_amount?: number;
  created_at?: string;
  status?: string;
}

// Helper to get first element if array
function getFirst<T>(val: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(val)) return val[0];
  return val ?? undefined;
}

function StatCard({ icon: Icon, label, value, sub, accent = "zinc" }: {
  icon: ComponentType<{ size?: number | string }>; label: string; value: string; sub?: string; accent?: string;
}) {
  const cls: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    violet:  "text-violet-400 bg-violet-500/10 border-violet-500/20",
    amber:   "text-amber-400 bg-amber-500/10 border-amber-500/20",
    sky:     "text-sky-400 bg-sky-500/10 border-sky-500/20",
    zinc:    "text-zinc-400 bg-zinc-800 border-zinc-700",
  };
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${cls[accent]}`}>
          <Icon size={14} />
        </div>
        <span className="text-zinc-600 text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-black text-zinc-50 tracking-tight">{value}</p>
      {sub && <p className="text-zinc-600 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/[0.07] flex items-center justify-center transition-all">
      {copied ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Copy size={11} className="text-zinc-500" />}
    </button>
  );
}

export default function AffiliateHome() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [sales, setSales] = useState<AffiliateSale[]>([]);
  const [links, setLinks] = useState<AffiliateLink[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const [{ data: p }, { data: s }, { data: l }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", session.user.id).single(),
        supabase.from("affiliate_sales").select("id,commission_amount,gross_amount,created_at,status").eq("affiliate_id", session.user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("affiliate_links").select("id,code,click_count,conversion_count,saas_products(name,logo_url)").eq("affiliate_id", session.user.id).order("created_at", { ascending: false }).limit(8),
      ]);

      setName(p?.full_name ?? "");
      setSales((s ?? [])  as AffiliateSale[]);
      setLinks((l ?? [])  as AffiliateLink[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-zinc-700">
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  const totalComm = sales.reduce((s, x) => s + (x.commission_amount || 0), 0);
  const pendingComm = sales.filter(x => x.status === "pending").reduce((s, x) => s + (x.commission_amount || 0), 0);
  const totalClicks = links.reduce((s, l) => s + (l.click_count || 0), 0);
  const totalConversions = links.reduce((s, l) => s + (l.conversion_count || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-1">
            {name ? `Olá, ${name.split(" ")[0]} 👋` : "Painel de Afiliado"}
          </h1>
          <p className="text-zinc-600 text-sm">Acompanhe suas comissões e links de afiliado.</p>
        </div>
        <Link href="/affiliate/links"
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm shrink-0 hover:-translate-y-0.5">
          <Link2 size={14} />Meus links
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard icon={DollarSign} label="Comissão total" value={fmt(totalComm)} sub="Aprovadas + pendentes" accent="emerald" />
        <StatCard icon={Clock} label="Pendente saque" value={fmt(pendingComm)} sub="Aguardando liberação" accent="amber" />
        <StatCard icon={Users} label="Cliques totais" value={totalClicks.toString()} sub="Todos os links" accent="sky" />
        <StatCard icon={TrendingUp} label="Conversões" value={totalConversions.toString()}
          sub={totalClicks > 0 ? `Taxa: ${pct(totalConversions / totalClicks)}` : "—"} accent="violet" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Links ativos */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="text-zinc-200 text-sm font-bold">Meus links</h2>
            <Link href="/affiliate/links" className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-0.5">
              Ver todos <ChevronRight size={10} />
            </Link>
          </div>
          {links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-700">
              <Link2 size={24} className="mb-2 opacity-40" />
              <p className="text-xs mb-3">Nenhum link criado</p>
              <Link href="/affiliate/links" className="text-[11px] text-emerald-500 hover:underline">Criar meu primeiro link →</Link>
            </div>
          ) : (
            <div className="flex flex-col">
              {links.map((l, i) => {
                const prod = getFirst(l.saas_products);
                const clickCount = Number(l.click_count ?? 0);
                const convCount = Number(l.conversion_count ?? 0);
                const convRate = clickCount > 0 ? convCount / clickCount : 0;
                return (
                  <div key={l.id} className={`px-5 py-3.5 flex items-center gap-3 ${i < links.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
                    <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-white/[0.07] overflow-hidden flex items-center justify-center text-zinc-600 font-bold text-[10px] shrink-0">
                      {prod?.logo_url ? <img src={prod.logo_url} className="w-full h-full object-cover" alt="" /> : (prod?.name || "P").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-200 text-xs font-semibold truncate">{prod?.name || "Produto"}</p>
                      <p className="text-zinc-600 text-[10px]">{clickCount} cliques · {convCount} vendas · {pct(convRate)}</p>
                    </div>
                    <CopyButton text={`${typeof window !== "undefined" ? window.location.origin : ""}/ref/${l.code}`} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Últimas comissões */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="text-zinc-200 text-sm font-bold">Últimas comissões</h2>
            <Link href="/affiliate/extrato" className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-0.5">
              Ver extrato <ChevronRight size={10} />
            </Link>
          </div>
          {sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-700">
              <DollarSign size={24} className="mb-2 opacity-40" />
              <p className="text-xs mb-3">Nenhuma comissão ainda</p>
              <Link href="/explorar" className="text-[11px] text-emerald-500 hover:underline">Explorar produtos para promover →</Link>
            </div>
          ) : (
            <div className="flex flex-col">
              {sales.slice(0, 8).map((s, i) => (
                <div key={String(s.id)} className={`px-5 py-3 flex items-center gap-3 ${i < Math.min(sales.length, 8) - 1 ? "border-b border-white/[0.04]" : ""}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.status === "approved" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                    {s.status === "approved" ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Clock size={11} className="text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-xs">{new Date(String(s.created_at ?? "")).toLocaleDateString("pt-BR")}</p>
                    <p className="text-zinc-600 text-[10px]">Venda de {fmt(Number(s.gross_amount ?? 0) || 0)}</p>
                  </div>
                  <span className={`text-xs font-bold ${s.status === "approved" ? "text-emerald-400" : "text-amber-400"}`}>
                    +{fmt(Number(s.commission_amount ?? 0) || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/affiliate/extrato",  icon: BarChart2,  label: "Extrato",       desc: "Histórico completo" },
          { href: "/affiliate/ranking",  icon: Award,      label: "Ranking",       desc: "Top afiliados" },
          { href: "/affiliate/ir-report",icon: DollarSign, label: "Relatório IR",  desc: "PDF para declaração" },
          { href: "/explorar",           icon: Zap,        label: "Novos produtos",desc: "Explorar catálogo" },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-2 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group">
            <a.icon size={14} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
            <div>
              <p className="text-zinc-300 text-xs font-semibold">{a.label}</p>
              <p className="text-zinc-700 text-[10px]">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
