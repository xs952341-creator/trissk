
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Loader2, DollarSign, TrendingUp, Calendar, Package, Link2 } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type ProductMini = {
  name?: string | null;
  logo_url?: string | null;
};

type AffiliateProfileMini = {
  full_name?: string | null;
  email?: string | null;
};

type AffiliateSaleRow = {
  id: string;
  status: "paid" | "pending" | string;
  created_at: string;
  commission_amount?: number | null;
  upline_commission_amount?: number | null;
  saas_products?: ProductMini | null;
  profiles?: AffiliateProfileMini | null;
};

export default function ExtratoAfiliado() {
  const supabase = createClient();
  const [sales,     setSales]     = useState<AffiliateSaleRow[]>([]);
  const [l2Sales,   setL2Sales]   = useState<AffiliateSaleRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [total,     setTotal]     = useState(0);
  const [pending,   setPending]   = useState(0);
  const [totalL2,   setTotalL2]   = useState(0);
  const [tab, setTab] = useState<"l1" | "l2">("l1");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const uid = session.user.id;

      // L1: vendas diretas
      supabase.from("affiliate_sales")
        .select("*, saas_products(name, logo_url)")
        .eq("affiliate_id", uid)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          const rows = data ?? [];
          setSales(rows);
          setTotal(rows.filter(r => r.status === "paid").reduce((a, r) => a + Number(r.commission_amount ?? 0), 0));
          setPending(rows.filter(r => r.status === "pending").reduce((a, r) => a + Number(r.commission_amount ?? 0), 0));
        });

      // L2: comissões de upline (vendas onde eu sou o upline)
      supabase.from("affiliate_sales")
        .select("*, saas_products(name, logo_url), profiles!affiliate_id(full_name, email)")
        .eq("upline_affiliate_id", uid)
        .gt("upline_commission_amount", 0)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          const rows = data ?? [];
          setL2Sales(rows);
          setTotalL2(rows.reduce((a, r) => a + Number(r.upline_commission_amount ?? 0), 0));
          setLoading(false);
        });
    });
  }, []);

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-zinc-600" />
    </div>
  );

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Extrato de Comissões</h1>
        <p className="text-zinc-500 text-sm mt-1">Histórico detalhado das suas comissões como afiliado.</p>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Total L1 Recebido", value: fmt(total),        icon: DollarSign, color: "text-emerald-400" },
          { label: "Aguardando L1",     value: fmt(pending),       icon: TrendingUp, color: "text-yellow-400" },
          { label: "Total Vendas L1",   value: String(sales.length), icon: Package,  color: "text-blue-400" },
          { label: "Comissões L2 (Upline)", value: fmt(totalL2),  icon: Link2,      color: "text-violet-400" },
        ].map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <c.icon size={16} className={c.color} />
              <span className="text-xs text-zinc-500">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-zinc-50">{c.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabs L1 / L2 */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit">
        <button onClick={() => setTab("l1")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "l1" ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
          Comissões Diretas ({sales.length})
        </button>
        <button onClick={() => setTab("l2")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "l2" ? "bg-zinc-800 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
          Upline — Indicações ({l2Sales.length})
        </button>
      </div>

      {tab === "l2" && l2Sales.length > 0 && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-violet-300 text-sm font-medium">💡 O que é comissão de Upline?</p>
          <p className="text-zinc-500 text-xs mt-1">
            Quando você recruta um afiliado para um programa, você ganha uma porcentagem das comissões que esse afiliado gera (L2).
            Isso cria uma rede de indicação de 2 níveis.
          </p>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold text-zinc-100 text-sm">
            {tab === "l1" ? "Vendas Diretas (L1)" : "Comissões de Indicados (L2)"}
          </h2>
        </div>
        {(tab === "l1" ? sales : l2Sales).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <DollarSign size={32} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              {tab === "l1" ? "Nenhuma venda registrada ainda." : "Nenhuma comissão de upline ainda."}
            </p>
            <p className="text-zinc-700 text-xs">
              {tab === "l1"
                ? "Compartilhe seus links de afiliado para começar a ganhar."
                : "Indique outros afiliados para produtos e ganhe % das comissões deles."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {(tab === "l1" ? sales : l2Sales).map((s: AffiliateSaleRow, i: number) => (
              <motion.div key={String(s.id)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {s.saas_products?.logo_url
                    ? <img src={s.saas_products.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                    : <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center"><Package size={14} className="text-zinc-600" /></div>
                  }
                  <div>
                    <p className="text-sm text-zinc-200 font-medium">{s.saas_products?.name ?? "Produto"}</p>
                    {tab === "l2" && s.profiles && (
                      <p className="text-xs text-violet-400">{s.profiles.full_name ?? s.profiles.email ?? "Afiliado"}</p>
                    )}
                    <p className="text-xs text-zinc-600 flex items-center gap-1">
                      <Calendar size={10} /> {new Date(String(s.created_at ?? "")).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {(() => {
                    const amount = tab === "l1" 
                      ? Number(s.commission_amount ?? 0) 
                      : Number(s.upline_commission_amount ?? 0);
                    return (
                      <>
                        <p className="text-sm font-bold text-zinc-100">
                          {fmt(amount)}
                        </p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          tab === "l2" ? "bg-violet-500/10 text-violet-400"
                          : s.status === "paid" ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          {tab === "l2" ? "Upline" : s.status === "paid" ? "Pago" : "Pendente"}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

