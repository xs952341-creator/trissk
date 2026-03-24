"use client";
// app/vendor/produtos/page.tsx — Lista de produtos do vendor com UI premium
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import {
  Plus, Package, BarChart2, Loader2, CheckCircle2, Clock,
  XCircle, Eye, Settings, Zap, TrendingUp, DollarSign,
  Users, ArrowRight, Edit3, Globe, Key, Webhook, Star,
  ChevronRight, AlertCircle, ShieldCheck, ExternalLink,
} from "lucide-react";

interface Product {
  id: string; name: string; description: string; logo_url?: string; slug?: string;
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
  delivery_method: string; price_monthly?: number; price_lifetime?: number;
  sales_count: number; trending_score: number; is_staff_pick: boolean;
  created_at: string; category?: string;
}

const STATUS_CONFIG = {
  APPROVED: { label: "Publicado", icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  PENDING:  { label: "Em revisão", icon: Clock,        cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  REJECTED: { label: "Reprovado",  icon: XCircle,      cls: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

const fmtBRL = (v?: number) => v ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : "—";

function ProductRow({ product, onSelect }: { product: Product; onSelect: () => void }) {
  const status = STATUS_CONFIG[product.approval_status] || STATUS_CONFIG.PENDING;
  const StatusIcon = status.icon;
  const price = product.price_monthly ?? product.price_lifetime;
  const isMonthly = !!product.price_monthly;

  return (
    <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-white/[0.12] transition-all cursor-pointer"
      onClick={onSelect}>
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-white/[0.07] overflow-hidden flex items-center justify-center text-zinc-500 font-bold text-sm shrink-0">
          {product.logo_url ? <img src={product.logo_url} className="w-full h-full object-cover" alt={product.name} /> : product.name.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-zinc-100 font-semibold text-sm">{product.name}</h3>
            {product.is_staff_pick && (
              <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 font-semibold">
                <Star size={7} fill="currentColor" />Staff Pick
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${status.cls}`}>
              <StatusIcon size={9} />{status.label}
            </span>
            <span className="text-zinc-700 text-[10px]">{product.delivery_method}</span>
            {product.category && <span className="text-zinc-700 text-[10px]">· {product.category}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Preço</p>
          <p className="text-zinc-200 text-sm font-bold">{fmtBRL(price)}{price && <span className="text-zinc-600 font-normal text-[10px]">{isMonthly ? "/mês" : " único"}</span>}</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Vendas</p>
          <p className="text-zinc-200 text-sm font-bold">{product.sales_count || 0}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/vendor/products/${product.id}/integration`} onClick={e => e.stopPropagation()}
            className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all" title="Integração">
            <Webhook size={13} />
          </Link>
          {product.approval_status === "APPROVED" && product.slug && (
            <Link href={`/produtos/${product.slug}`} target="_blank" onClick={e => e.stopPropagation()}
              className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all" title="Ver produto">
              <ExternalLink size={13} />
            </Link>
          )}
          <button className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all" title="Editar">
            <Edit3 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/[0.07] flex items-center justify-center mb-5">
        <Package size={28} className="text-zinc-700" />
      </div>
      <h3 className="text-zinc-200 font-bold text-lg mb-2">Nenhum produto ainda</h3>
      <p className="text-zinc-600 text-sm max-w-xs mb-8">Crie seu primeiro produto e comece a vender na plataforma.</p>
      <Link href="/admin/playbooks/novo"
        className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm hover:-translate-y-0.5">
        <Plus size={15} />Criar primeiro produto
      </Link>
    </motion.div>
  );
}

export default function VendorProductsPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("saas_products")
        .select("id,name,description,logo_url,slug,approval_status,delivery_method,price_monthly,price_lifetime,sales_count,trending_score,is_staff_pick,created_at,category")
        .eq("vendor_id", session.user.id)
        .order("created_at", { ascending: false });
      setProducts((data || []) as Product[]);
      setLoading(false);
    })();
  }, []);

  const approved = products.filter(p => p.approval_status === "APPROVED");
  const pending  = products.filter(p => p.approval_status === "PENDING");
  const totalSales = products.reduce((s, p) => s + (p.sales_count || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-1">Meus Produtos</h1>
          <p className="text-zinc-600 text-sm">Gerencie seus produtos e acompanhe o desempenho.</p>
        </div>
        <Link href="/admin/playbooks/novo"
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm hover:-translate-y-0.5 shrink-0">
          <Plus size={14} />Novo produto
        </Link>
      </div>

      {/* Stats */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total de produtos", value: products.length, icon: Package, color: "zinc" },
            { label: "Publicados", value: approved.length, icon: CheckCircle2, color: "emerald" },
            { label: "Em revisão", value: pending.length, icon: Clock, color: "amber" },
            { label: "Total de vendas", value: totalSales, icon: TrendingUp, color: "violet" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} className={color === "emerald" ? "text-emerald-400" : color === "amber" ? "text-amber-400" : color === "violet" ? "text-violet-400" : "text-zinc-500"} />
                <span className="text-zinc-600 text-[10px] uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-2xl font-black text-zinc-50 tracking-tight">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pending banner */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 mb-6 flex items-center gap-3">
          <AlertCircle size={15} className="text-amber-400 shrink-0" />
          <p className="text-amber-300 text-xs">
            <span className="font-semibold">{pending.length} produto{pending.length > 1 ? "s" : ""} em revisão.</span>
            {" "}Produtos aprovados ficam visíveis na vitrine automaticamente. Revisão em até 48h úteis.
          </p>
        </div>
      )}

      {/* Products list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-700">
          <Loader2 size={20} className="animate-spin mr-2" />Carregando produtos...
        </div>
      ) : products.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {products.map(p => (
            <ProductRow key={p.id} product={p} onSelect={() => setSelected(p)} />
          ))}
        </div>
      )}

      {/* Quick actions */}
      {products.length > 0 && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: "/vendor/analytics",  icon: BarChart2,   label: "Ver Analytics", desc: "MRR, Churn, LTV" },
            { href: "/vendor/webhooks",   icon: Webhook,     label: "Configurar Webhooks", desc: "Integrações outbound" },
            { href: "/vendor/checkout-builder", icon: Zap, label: "Checkout Builder", desc: "Personalizar visual" },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex items-center gap-3 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-white/[0.07] flex items-center justify-center text-zinc-500 group-hover:text-zinc-200 transition-colors shrink-0">
                <a.icon size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-zinc-200 text-xs font-semibold">{a.label}</p>
                <p className="text-zinc-600 text-[10px]">{a.desc}</p>
              </div>
              <ChevronRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors ml-auto" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
