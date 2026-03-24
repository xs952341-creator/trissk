"use client";

import type { ComponentType } from "react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingBag, Package, BarChart2, FileText, Link2, DollarSign,
  Users, ShieldCheck, ChevronLeft, ChevronRight, Menu, X, Shield,
  LogOut, CreditCard, User, Zap, LayoutDashboard, Settings, Bell,
  TrendingUp, Ticket, RotateCcw, Gift, Activity, MessageCircle, GitBranch, Globe, Building2, Blocks,
  AlertTriangle, Inbox, Wallet, Key, Server, Palette, Mail, Award,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Role = "buyer" | "vendor" | "affiliate" | "admin";

interface Notification {
  id: string; type: string; title: string; body: string;
  action_url: string | null; read: boolean; is_read?: boolean; created_at: string;
}

const NAV_GROUPS = [
  { label: null, items: [
    { href: "/dashboard",         icon: ShoppingBag,     label: "Minhas Compras",        roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/workspaces",        icon: Users,            label: "Workspaces",            roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/explorar",          icon: Zap,             label: "Explorar Produtos",     roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/pontos",            icon: Gift,            label: "Meus Pontos",           roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/carteira",          icon: Wallet,          label: "Carteira (Créditos)",   roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/buyer/pedidos",      icon: FileText,        label: "Pedidos",              roles: ["buyer","admin"] },
    { href: "/buyer/entregas",     icon: Zap,             label: "Entregas",             roles: ["buyer","admin"] },
    { href: "/buyer/ir-report",   icon: Inbox,           label: "Relatório IR (Compras)", roles: ["buyer","admin"] },
    { href: "/vendor/sales",       icon: BarChart2,       label: "Vendas",               roles: ["vendor","admin"] },
    { href: "/vendor/instances",   icon: Server,          label: "Instâncias SaaS",      roles: ["vendor","admin"] },
    { href: "/affiliate/links",    icon: Link2,           label: "Links de Afiliado",    roles: ["affiliate","admin"] },
    { href: "/dashboard/billing", icon: CreditCard,      label: "Faturamento / Cartoes", roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/dashboard/profile", icon: User,            label: "Meu Perfil",            roles: ["buyer","vendor","affiliate","admin"] },
    { href: "/configuracoes",     icon: Settings,        label: "Configuracoes",         roles: ["buyer","vendor","affiliate","admin"] },
  ]},
  { label: "Produtor", items: [
    { href: "/vendor/produtos",   icon: Package,         label: "Meus Produtos",         roles: ["vendor","admin"] },
    { href: "/vendor/sales",      icon: BarChart2,       label: "Vendas e Assinantes",   roles: ["vendor","admin"] },
    { href: "/vendor/payouts",    icon: DollarSign,      label: "Repasses",              roles: ["vendor","admin"] },
    { href: "/vendor/relatorios", icon: TrendingUp,      label: "Relatórios",            roles: ["vendor","admin"] },
    { href: "/vendor/ir-report",  icon: FileText,    label: "Relatório IR (PDF)",     roles: ["vendor","admin"] },
    { href: "/vendor/kyc",        icon: ShieldCheck,     label: "Verificação KYC",       roles: ["vendor","admin"] },
    { href: "/vendor/precos-internacionais", icon: Globe, label: "Preços Internacionais", roles: ["vendor","admin"] },
    { href: "/vendor/checkout-builder",  icon: Palette,    label: "Checkout Builder",      roles: ["vendor","admin"] },
    { href: "/vendor/email-marketing",    icon: Mail,        label: "Email Marketing",        roles: ["vendor","admin"] },
    { href: "/vendor/analytics",  icon: BarChart2,       label: "Analytics Avançado",    roles: ["vendor","admin"] },
    { href: "/vendor/suporte",    icon: Ticket,          label: "Suporte",               roles: ["vendor","admin"] },
    { href: "/vendor/reembolsos", icon: RotateCcw,       label: "Reembolsos",            roles: ["vendor","admin"] },
    { href: "/vendor/referrals",  icon: Link2,           label: "Referrals",             roles: ["vendor","admin"] },
    { href: "/vendor/webhooks",   icon: Activity,        label: "Webhooks Outbound",     roles: ["vendor","admin"] },
    { href: "/vendor/fiscal",     icon: FileText,        label: "Fiscal",                roles: ["vendor","admin"] },
    { href: "/vendor/white-label",icon: Globe,           label: "White-Label (Domínio)", roles: ["vendor","admin"] },
    { href: "/vendor/api-keys",   icon: Key,             label: "API Pública (Keys)",    roles: ["vendor","admin"] },
    { href: "/vendor/health-score",icon: Activity,       label: "Health Score (B2B)",    roles: ["vendor","admin"] },
    { href: "/vendor/resellers",  icon: Building2,               label: "Portal Revendedores",   roles: ["vendor","admin"] },
    { href: "/vendor/apps",       icon: Blocks,                  label: "Apps & Integrações",     roles: ["vendor","admin"] },
  ]},
  { label: "Afiliado", items: [
    { href: "/affiliate/links",   icon: Link2,           label: "Meus Links",            roles: ["affiliate","admin"] },
    { href: "/affiliate/extrato", icon: DollarSign,      label: "Extrato de Comissoes",  roles: ["affiliate","admin"] },
    { href: "/affiliate/ranking", icon: BarChart2,       label: "Ranking de Afiliados",  roles: ["affiliate","admin"] },
    { href: "/affiliate/ir-report", icon: FileText,      label: "Relatório IR (PDF)",    roles: ["affiliate","admin"] },
  ]},
  { label: "Admin", items: [
    { href: "/admin",             icon: LayoutDashboard, label: "GMV / Visao Geral",     roles: ["admin"] },
    { href: "/admin/review",      icon: ShieldCheck,     label: "Aprovacao de Produtos", roles: ["admin"] },
    { href: "/admin/comments",    icon: MessageCircle,   label: "Moderacao de Comentarios", roles: ["admin"] },
    { href: "/admin/lgpd",        icon: Shield,          label: "Solicitacoes LGPD",     roles: ["admin"] },
    { href: "/admin/users",       icon: Users,           label: "Gestao de Usuarios",    roles: ["admin"] },
    { href: "/admin/tickets",     icon: FileText,        label: "Tickets de Suporte",    roles: ["admin"] },
    { href: "/admin/cohort",      icon: TrendingUp,      label: "Cohort Retention",      roles: ["admin"] },
    { href: "/admin/ab-results",  icon: GitBranch,       label: "A/B Test Results",      roles: ["admin"] },
    { href: "/admin/disputes",    icon: BarChart2,       label: "Disputas / Chargebacks",roles: ["admin"] },
    { href: "/admin/radar",       icon: Shield,          label: "Stripe Radar (Fraude)", roles: ["admin"] },
    { href: "/admin/revenue",     icon: Wallet,          label: "Receita & Impostos",    roles: ["admin"] },
    { href: "/admin/dlq",         icon: AlertTriangle,   label: "Dead-Letter Queue",     roles: ["admin"] },
  ]},
];

function NavItem({ href, icon: Icon, label, active, collapsed }: {
  href: string; icon: ComponentType<{ size?: number | string; className?: string }>; label: string; active: boolean; collapsed: boolean;
}) {
  return (
    <Link href={href}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
        active ? "bg-white/10 text-zinc-100 border-l-2 border-emerald-500" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
      } ${collapsed ? "justify-center" : ""}`}>
      <Icon size={17} className={`shrink-0 ${active ? "text-emerald-400" : ""}`} />
      {!collapsed && <span>{label}</span>}
      {collapsed && (
        <div className="absolute left-full ml-3 bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
          {label}
        </div>
      )}
    </Link>
  );
}

function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifs.filter(n => !(n.is_read ?? n.read)).length;

  useEffect(() => {
    if (!userId) return;
    loadNotifications();
    const channel = supabase.channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        payload => setNotifs(prev => [payload.new as Notification, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadNotifications = async () => {
    const { data } = await supabase.from("notifications").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    setNotifs(data ?? []);
  };

  const markAllRead = async () => {
    await supabase.from("notifications").update({ is_read: true, read: true }).eq("user_id", userId).or("is_read.eq.false,read.eq.false");
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true, read: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true, read: true }).eq("id", id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true, read: true } : n));
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="relative p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/[0.04]">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-[9px] font-bold text-zinc-950 rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-80 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-zinc-200 font-semibold text-sm">Notificacoes</span>
              {unread > 0 && <button onClick={markAllRead} className="text-xs text-emerald-400 hover:underline">Marcar tudo como lido</button>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 text-sm">
                  <Bell size={24} className="mx-auto mb-2 opacity-30" />
                  Nenhuma notificacao
                </div>
              ) : notifs.map(n => (
                <div key={n.id}
                  onClick={() => { markRead(n.id); if (n.action_url) window.location.href = n.action_url; }}
                  className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] border-b border-white/5 transition-colors ${!(n.is_read ?? n.read) ? "bg-emerald-500/[0.03]" : ""}`}>
                  <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${!(n.is_read ?? n.read) ? "bg-emerald-500" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${(n.is_read ?? n.read) ? "text-zinc-400" : "text-zinc-100 font-medium"}`}>{n.title}</p>
                    <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-zinc-700 text-[10px] mt-1">
                      {new Date(String(n.created_at ?? "")).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({ role, userId, collapsed, onToggle, onClose, mobile = false }: {
  role: Role; userId: string; collapsed: boolean; onToggle: () => void; onClose?: () => void; mobile?: boolean;
}) {
  const supabase = createClient();
  const pathname = usePathname();
  const router   = useRouter();

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g, items: g.items.filter(i => i.roles.includes(role)),
  })).filter(g => g.items.length > 0);

  const signOut = async () => { await supabase.auth.signOut(); router.push("/login"); };

  return (
    <aside className={`flex flex-col bg-zinc-950 border-r border-white/10 h-full transition-all duration-300 ${mobile ? "w-72" : collapsed ? "w-[72px]" : "w-64"}`}>
      <div className={`flex items-center h-16 px-4 border-b border-white/10 shrink-0 ${collapsed && !mobile ? "justify-center" : "justify-between"}`}>
        <span className="font-bold text-lg tracking-tight text-zinc-50">
          {collapsed && !mobile ? "P." : <>Playbook<span className="text-emerald-400">.</span></>}
        </span>
        <div className="flex items-center gap-1">
          {(!collapsed || mobile) && <NotificationBell userId={userId} />}
          {mobile && onClose && <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 p-1"><X size={18} /></button>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <p className="text-zinc-700 text-[10px] uppercase tracking-widest font-medium mb-2 px-3">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItem key={item.href} {...{ href: item.href, icon: item.icon, label: item.label,
                  collapsed: collapsed && !mobile,
                  active: !!(pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))) }} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-0.5 shrink-0">
        <button onClick={signOut}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-all text-sm">
          <LogOut size={16} />
          {(!collapsed || mobile) && "Sair"}
        </button>
        {!mobile && (
          <button onClick={onToggle}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-zinc-700 hover:text-zinc-400 transition-all text-sm">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && "Recolher menu"}
          </button>
        )}
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [collapsed,  setCollapsed]  = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [role,       setRole]       = useState<Role>("buyer");
  const [userId,     setUserId]     = useState("");
  const pathname = usePathname();
  const router   = useRouter();

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);
      const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (data?.role) setRole(data.role as Role);
    });
  }, []);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-50 overflow-hidden">
      <div className="hidden md:block shrink-0">
        <Sidebar role={role} userId={userId} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)} className="fixed inset-0 bg-black/60 z-40 md:hidden" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden shadow-2xl">
              <Sidebar role={role} userId={userId} collapsed={false} onToggle={() => {}} onClose={() => setDrawerOpen(false)} mobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-white/10 bg-zinc-950 shrink-0">
          <span className="font-bold text-zinc-50 tracking-tight">Playbook<span className="text-emerald-400">.</span></span>
          <div className="flex items-center gap-2">
            {userId && <NotificationBell userId={userId} />}
            <button onClick={() => setDrawerOpen(true)} className="text-zinc-400 hover:text-zinc-100"><Menu size={20} /></button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
