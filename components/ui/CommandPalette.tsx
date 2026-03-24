"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FEATURES } from "@/lib/features";
import {
  LayoutDashboard, Package, TrendingUp, Users, DollarSign,
  Settings, FileText, Webhook, Star, BarChart2, ShieldCheck,
  Search, Command,
} from "lucide-react";

interface CommandItem {
  label: string;
  description?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  keywords?: string[];
}

const BASE_COMMANDS: CommandItem[] = [
  // Vendor
  { label: "Dashboard Vendor", href: "/vendor", icon: LayoutDashboard, group: "Vendor", keywords: ["início", "home"] },
  { label: "Produtos", href: "/vendor/produtos", icon: Package, group: "Vendor", keywords: ["criar", "editar"] },
  { label: "Vendas", href: "/vendor/sales", icon: DollarSign, group: "Vendor", keywords: ["pedidos", "orders"] },
  { label: "Analytics", href: "/vendor/analytics", icon: TrendingUp, group: "Vendor", keywords: ["métricas", "mrr"] },
  { label: "Afiliados", href: "/vendor/referrals", icon: Star, group: "Vendor", keywords: ["comissões", "links"] },
  { label: "Payouts", href: "/vendor/payouts", icon: DollarSign, group: "Vendor", keywords: ["repasse", "saque"] },
  { label: "Webhooks", href: "/vendor/webhooks", icon: Webhook, group: "Vendor", keywords: ["integrações"] },
  { label: "Checkout Builder", href: "/vendor/checkout-builder", icon: BarChart2, group: "Vendor" },
  // Admin
  { label: "Painel Admin", href: "/(dashboards)/admin", icon: ShieldCheck, group: "Admin", keywords: ["administração"] },
  { label: "Ledger Financeiro", href: "/(dashboards)/admin/ledger", icon: FileText, group: "Admin", keywords: ["transações", "auditoria"] },
  { label: "Revisão de Produtos", href: "/(dashboards)/admin/review", icon: Package, group: "Admin", keywords: ["aprovação"] },
  { label: "Observabilidade", href: "/(dashboards)/admin/observabilidade", icon: BarChart2, group: "Admin", keywords: ["logs", "sistema"] },
  { label: "Usuários", href: "/(dashboards)/admin/users", icon: Users, group: "Admin" },
  { label: "Sistema", href: "/admin/system", icon: Settings, group: "Admin", keywords: ["saúde", "status"] },
  // Plataforma
  { label: "Status do Sistema", href: "/status", icon: ShieldCheck, group: "Plataforma" },
    { label: "Smoke Tests", href: "/docs/smoke-tests", icon: FileText, group: "Plataforma", keywords: ["validação", "testes rápidos"] },
  { label: "Changelog", href: "/changelog", icon: FileText, group: "Plataforma", keywords: ["versões", "histórico"] },
  { label: "Trust Center", href: "/trust", icon: ShieldCheck, group: "Plataforma", keywords: ["segurança", "confiança"] },
  { label: "Configurações", href: "/(dashboards)/configuracoes", icon: Settings, group: "Configurações" },
];

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-emerald-500/30 text-emerald-300 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function CommandPalette() {
  const COMMANDS: CommandItem[] = FEATURES.demoMode
    ? [...BASE_COMMANDS, { label: "Demonstração", href: "/demo", icon: LayoutDashboard, group: "Plataforma" }]
    : BASE_COMMANDS;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Filter commands by query
  const filtered = query.trim()
    ? COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.keywords?.some(k => k.toLowerCase().includes(query.toLowerCase()))
      )
    : COMMANDS;

  // Group results
  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const allItems = Object.values(groups).flat();

  const navigate = useCallback((href: string) => {
    router.push(href);
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Open: Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(v => !v);
        setQuery("");
        setSelected(0);
        return;
      }
      // Close: Escape
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!open) return;
      // Arrow navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(s => Math.min(s + 1, allItems.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
      }
      // Enter to navigate
      if (e.key === "Enter" && allItems[selected]) {
        navigate(allItems[selected].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, allItems, selected, navigate]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Buscar página, ação..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          <div className="flex items-center gap-1">
            <kbd className="text-[10px] text-zinc-600 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {Object.entries(groups).length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm">
              Nenhum resultado para &quot;{query}&quot;
            </div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
                  {group}
                </p>
                {items.map(item => {
                  const globalIdx = allItems.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setSelected(globalIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        selected === globalIdx
                          ? "bg-emerald-500/10 text-zinc-100"
                          : "text-zinc-400 hover:bg-zinc-800/50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${selected === globalIdx ? "text-emerald-400" : "text-zinc-600"}`} />
                      <span className="text-sm flex-1">{highlight(item.label, query)}</span>
                      {selected === globalIdx && (
                        <kbd className="text-[10px] text-zinc-600 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">↵</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-zinc-800 px-4 py-2 flex items-center gap-3 text-[10px] text-zinc-700">
          <span className="flex items-center gap-1"><Command className="w-3 h-3" />K para abrir</span>
          <span>↑↓ para navegar</span>
          <span>↵ para selecionar</span>
        </div>
      </div>
    </div>
  );
}
