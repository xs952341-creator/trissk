"use client";

// app/demo/page.tsx — v51
// Demo interativa. TODOS os dados vêm de lib/demo/data.ts

import { useState } from "react";
import {
  TrendingUp, ShoppingBag, Users, DollarSign,
  BarChart2, Zap, Shield, Star, CheckCircle,
  Activity, CreditCard, ArrowUpRight,
} from "lucide-react";
import { MetricCard, MetricGrid } from "@/components/ui/MetricCard";
import { FEATURES as APP_FEATURES } from "@/lib/features";
import { APP_VERSION } from "@/lib/app-version";
import {
  DEMO_PRODUCTS, DEMO_RECENT_SALES, DEMO_AFFILIATES,
  DEMO_CERTIFICATES, DEMO_PLATFORM_MRR, DEMO_PLATFORM_GMV,
  formatBRL, generateDemoOrders,
} from "@/lib/demo/data";

type Tab = "dashboard" | "produtos" | "analytics" | "afiliados" | "ledger";
const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "produtos", label: "Produtos" },
  { id: "analytics", label: "Analytics" },
  { id: "afiliados", label: "Afiliados" },
  { id: "ledger", label: "Ledger" },
];

const DEMO_FEATURES = [
  { icon: DollarSign, title: "Pagamentos nativos", desc: "Stripe Connect com split automático entre plataforma e vendedores.", accent: "emerald" },
  { icon: Users, title: "Afiliados multi-nível", desc: "L1/L2/L3 com comissões automáticas e relatório de IR.", accent: "violet" },
  { icon: BarChart2, title: "Analytics completo", desc: "MRR, ARR, LTV, Churn Rate, Cohort Retention em tempo real.", accent: "sky" },
  { icon: Zap, title: "Auto-provisioning", desc: "SaaS entregue automaticamente via webhook, API ou magic link.", accent: "amber" },
  { icon: Shield, title: "Anti-fraude nativo", desc: "Stripe Radar + fingerprint + velocity check + disputas automáticas.", accent: "rose" },
  { icon: Star, title: "White-label", desc: "Domínio próprio, checkout customizado e identidade do vendor.", accent: "orange" },
];

const ACCENT: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  sky: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const DEMO_ORDERS = generateDemoOrders(20);
const DEMO_LEDGER = (Array.isArray(DEMO_ORDERS) ? DEMO_ORDERS as unknown as Record<string,unknown>[] : []).flatMap((o, i) => [
  { id: `led-sale-${i}`, type: "sale" as const, amount: Math.round(Number(o.grossCents ?? 0) * (1 - Number(o.platformFeePct ?? 0) / 100)), direction: "credit" as const, description: `Venda — ${DEMO_PRODUCTS.find(p => p.id === o.productId)?.name ?? "Produto"}` },
  { id: `led-fee-${i}`, type: "platform_fee" as const, amount: Math.round(Number(o.grossCents ?? 0) * Number(o.platformFeePct ?? 0) / 100), direction: "debit" as const, description: `Taxa plataforma ${o.platformFeePct}%` },
]).slice(0, 16);

export default function DemoPage() {
  if (!APP_FEATURES.demoMode) {
    return null;
  }
  const [tab, setTab] = useState<Tab>("dashboard");
  const totalOrders = DEMO_ORDERS.length;
  const platformFeeCents = DEMO_ORDERS.reduce((s, o) => s + Math.round(o.grossCents * o.platformFeePct / 100), 0);
  const activeVendors = new Set(DEMO_PRODUCTS.map((p) => String(p.vendorId ?? ""))).size;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-2 text-center">
        <p className="text-xs text-emerald-400 font-medium">
          🎯 Demo interativa — dados de{" "}
          <code className="font-mono bg-emerald-500/10 px-1 rounded">lib/demo/data.ts</code>
          {" "}(mesma fonte do{" "}
          <code className="font-mono bg-emerald-500/10 px-1 rounded">npm run seed:demo</code>)
        </p>
      </div>

      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-lg">Playbook Hub</span>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full ml-1">{APP_VERSION} Demo</span>
          </div>
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-zinc-500 hover:text-zinc-300"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold mb-1">Dashboard da Plataforma</h1>
              <p className="text-sm text-zinc-500">Visão consolidada de todos os vendors</p>
            </div>
            <MetricGrid cols={4}>
              <MetricCard label="MRR Plataforma" value={formatBRL(DEMO_PLATFORM_MRR)} change={12.4} icon={<TrendingUp className="w-4 h-4" />} />
              <MetricCard label="Pedidos (período)" value={totalOrders} change={8.1} icon={<ShoppingBag className="w-4 h-4" />} />
              <MetricCard label="Vendors ativos" value={activeVendors} icon={<Users className="w-4 h-4" />} />
              <MetricCard label="Taxa coletada" value={formatBRL(platformFeeCents)} change={10.2} icon={<DollarSign className="w-4 h-4" />} />
            </MetricGrid>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Vendas recentes</h3>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1"><Activity className="w-3 h-3" /> Ao vivo</span>
              </div>
              <div className="divide-y divide-zinc-800">
                {DEMO_RECENT_SALES.map((sale, i) => (
                  <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold">{sale.buyerInitial}</div>
                      <div>
                        <p className="text-sm text-zinc-200 font-medium">{sale.buyerName}</p>
                        <p className="text-xs text-zinc-500">{sale.productName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-400">{formatBRL(sale.amountCents)}</p>
                      <p className="text-xs text-zinc-600">{sale.minutesAgo < 60 ? `${sale.minutesAgo} min atrás` : `${Math.floor(sale.minutesAgo / 60)}h atrás`}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "produtos" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold mb-1">Produtos</h1>
                <p className="text-sm text-zinc-500">{DEMO_PRODUCTS.length} produtos ativos</p>
              </div>
              <button className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">+ Novo produto</button>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Produto","Categoria","Preço/mês","Pedidos","Receita","Status"].map(h => (
                      <th key={h} className={`px-6 py-3 text-xs text-zinc-500 font-medium ${h === "Produto" || h === "Categoria" || h === "Status" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {DEMO_PRODUCTS.map(p => (
                    <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4"><div className="font-medium text-zinc-200">{p.name}</div><div className="text-xs text-zinc-600 truncate max-w-xs">{p.description}</div></td>
                      <td className="px-6 py-4 text-zinc-500 capitalize">{p.category}</td>
                      <td className="px-6 py-4 text-right text-zinc-300 tabular-nums">{formatBRL(p.priceMonthlyCents)}</td>
                      <td className="px-6 py-4 text-right text-zinc-400 tabular-nums">{p.totalOrders}</td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-medium tabular-nums">{formatBRL(p.totalRevenueCents)}</td>
                      <td className="px-6 py-4"><span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">Publicado</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-6">
            <div><h1 className="text-xl font-semibold mb-1">Analytics</h1><p className="text-sm text-zinc-500">Métricas calculadas em tempo real</p></div>
            <MetricGrid cols={3}>
              <MetricCard label="GMV (período)" value={formatBRL(DEMO_PLATFORM_GMV)} change={15.3} />
              <MetricCard label="Churn Rate" value="2,1%" change={-0.4} />
              <MetricCard label="LTV médio" value="R$ 892" change={4.2} />
            </MetricGrid>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <h3 className="text-sm font-semibold text-zinc-200 mb-6">Cohort Retention (6 meses)</h3>
              <div className="grid grid-cols-6 gap-3">
                {[100, 78, 65, 58, 54, 51].map((pct, i) => (
                  <div key={i} className="text-center">
                    <div className="h-20 flex items-end justify-center mb-2">
                      <div className="w-full rounded-t-lg bg-emerald-500/40 border border-emerald-500/20" style={{ height: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-600">{i === 0 ? "M0" : `M${i}`}</p>
                    <p className="text-xs font-semibold text-emerald-400">{pct}%</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "afiliados" && (
          <div className="space-y-6">
            <div><h1 className="text-xl font-semibold mb-1">Afiliados</h1><p className="text-sm text-zinc-500">{DEMO_AFFILIATES.length} afiliados ativos</p></div>
            <MetricGrid cols={3}>
              <MetricCard label="Comissões pagas" value={formatBRL(DEMO_AFFILIATES.reduce((s, a) => s + a.totalCommissionCents, 0))} icon={<CreditCard className="w-4 h-4" />} />
              <MetricCard label="Vendas via afiliado" value={DEMO_AFFILIATES.reduce((s, a) => s + a.totalSales, 0)} change={22.1} />
              <MetricCard label="Certificados emitidos" value={DEMO_CERTIFICATES.length} />
            </MetricGrid>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800 overflow-hidden">
              {DEMO_AFFILIATES.map((aff, i) => {
                const product = DEMO_PRODUCTS.find(p => p.id === aff.productId);
                return (
                  <div key={aff.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-zinc-700">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{aff.affiliateName}</p>
                        <p className="text-xs text-zinc-500">{product?.name} · <code className="font-mono">{aff.code}</code></p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-violet-400">{formatBRL(aff.totalCommissionCents)}</p>
                      <p className="text-xs text-zinc-600">{aff.totalSales} vendas · {aff.commissionPct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800"><h3 className="text-sm font-semibold text-zinc-200">Certificados digitais</h3></div>
              {DEMO_CERTIFICATES.map(cert => (
                <div key={cert.id} className="px-6 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                  <div><p className="text-sm font-medium text-zinc-200">{cert.buyerName}</p><p className="text-xs text-zinc-500">{cert.productName} · <code className="font-mono text-zinc-600">{cert.code}</code></p></div>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "ledger" && (
          <div className="space-y-6">
            <div><h1 className="text-xl font-semibold mb-1">Ledger Financeiro</h1><p className="text-sm text-zinc-500">Registro imutável de movimentações</p></div>
            <MetricGrid cols={4}>
              <MetricCard label="GMV (pedidos)" value={formatBRL(DEMO_ORDERS.reduce((s, o) => s + o.grossCents, 0))} />
              <MetricCard label="Taxa plataforma" value={formatBRL(platformFeeCents)} />
              <MetricCard label="Entradas" value={DEMO_LEDGER.length} />
              <MetricCard label="Reconciliados" value={`${Math.floor(DEMO_LEDGER.length * 0.95)}/${DEMO_LEDGER.length}`} />
            </MetricGrid>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Tipo","Descrição","Valor","Reconcil."].map(h => (
                      <th key={h} className={`px-4 py-3 text-xs text-zinc-500 font-medium ${h === "Valor" ? "text-right" : h === "Reconcil." ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {DEMO_LEDGER.map((entry, i) => (
                    <tr key={entry.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3"><span className={`text-xs font-medium ${entry.type === "sale" ? "text-emerald-400" : "text-red-400"}`}>{entry.type === "sale" ? "Venda" : "Taxa"}</span></td>
                      <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-xs">{entry.description}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${entry.direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>{entry.direction === "credit" ? "+" : "-"}{formatBRL(entry.amount)}</td>
                      <td className="px-4 py-3 text-center"><div className={`w-2 h-2 rounded-full mx-auto ${i % 11 !== 0 ? "bg-emerald-500" : "bg-amber-500"}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-16 pt-12 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Infraestrutura de nível enterprise</h2>
            <a href="/trust" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />Trust Center</a>
          </div>
          <p className="text-sm text-zinc-500 mb-8">Tudo que você precisa para operar como negócio sério desde o primeiro dia</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {DEMO_FEATURES.map(({ icon: Icon, title, desc, accent }) => (
              <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 ${ACCENT[accent]}`}><Icon size={16} /></div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
