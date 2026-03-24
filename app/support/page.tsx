"use client";
// app/support/page.tsx — Suporte premium com timeline de tickets
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Plus, MessageCircle, Clock, CheckCircle2,
  AlertCircle, XCircle, ChevronRight, HelpCircle, Zap,
  Search, Package, Ticket,
} from "lucide-react";

type TicketStatus = "open" | "pending" | "resolved" | "closed";
interface SupportTicket {
  id: string; status: TicketStatus; subject: string;
  category?: string; priority?: string; created_at: string; updated_at: string;
  message_count?: number;
}

const STATUS_CFG: Record<TicketStatus, { label: string; icon: ComponentType<{ size?: number | string }>; cls: string }> = {
  open:     { label: "Aberto",   icon: AlertCircle,  cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  pending:  { label: "Pendente", icon: Clock,        cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  resolved: { label: "Resolvido",icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  closed:   { label: "Fechado",  icon: XCircle,      cls: "text-zinc-500 bg-zinc-800 border-zinc-700" },
};

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(String(date ?? "")).getTime()) / 1000);
  if (s < 60)   return "agora";
  if (s < 3600) return `${Math.floor(s/60)}min atrás`;
  if (s < 86400)return `${Math.floor(s/3600)}h atrás`;
  return `${Math.floor(s/86400)}d atrás`;
}

export default function SupportPage() {
  const supabase = createClient();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | TicketStatus>("all");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login?next=/support"; return; }
      const res = await fetch("/api/support/tickets?scope=buyer");
      const json = await res.json();
      setTickets(json.tickets ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = tickets.filter(t => {
    const matchFilter = filter === "all" || t.status === filter;
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const open = tickets.filter(t => t.status === "open" || t.status === "pending").length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-1">Suporte</h1>
          <p className="text-zinc-600 text-sm">Abra tickets e converse com a equipe diretamente na plataforma.</p>
        </div>
        <Link href="/support/novo"
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 shrink-0 hover:-translate-y-0.5">
          <Plus size={14} />Novo ticket
        </Link>
      </div>

      {/* Stats banner */}
      {open > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 flex items-center gap-2.5 mb-6">
          <AlertCircle size={13} className="text-amber-400 shrink-0" />
          <p className="text-amber-300/80 text-xs">
            Você tem <span className="font-semibold text-amber-300">{open} ticket{open !== 1 ? "s" : ""}</span> aguardando resposta.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tickets..."
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700" />
        </div>
        <div className="flex gap-1.5">
          {(["all","open","pending","resolved","closed"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filter === s
                ? s === "all" ? "bg-white text-zinc-950 border-transparent" : STATUS_CFG[s as TicketStatus]?.cls ?? ""
                : "border-white/[0.07] text-zinc-600 hover:text-zinc-300"}`}>
              {s === "all" ? "Todos" : STATUS_CFG[s as TicketStatus]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-700">
          <Loader2 size={18} className="animate-spin mr-2" />Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-zinc-700 text-center">
          <Ticket size={28} className="mb-3 opacity-30" />
          <p className="text-sm mb-5">{search ? "Nenhum ticket com essa busca." : "Nenhum ticket ainda."}</p>
          {!search && (
            <Link href="/support/novo"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
              <Plus size={13} />Abrir primeiro ticket
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((t, i) => {
            const status = (t.status as TicketStatus) ?? "open";
            const cfg = STATUS_CFG[status] ?? STATUS_CFG.open;
            const StatusIcon = cfg.icon;
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link href={`/support/${t.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cfg.cls}`}>
                    <StatusIcon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-100 text-sm font-semibold truncate group-hover:text-emerald-400 transition-colors">{t.subject}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cfg.cls}`}>{cfg.label}</span>
                      {t.category && <span className="text-zinc-600 text-[10px]">{t.category}</span>}
                      <span className="text-zinc-700 text-[10px]">· {timeAgo(t.updated_at)}</span>
                      {t.message_count !== undefined && <span className="text-zinc-700 text-[10px]">· {t.message_count} msg</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* FAQ quick links */}
      <div className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="text-zinc-300 text-sm font-bold mb-4 flex items-center gap-2"><HelpCircle size={14} />Perguntas frequentes</h2>
        <div className="flex flex-col gap-2">
          {[
            "Como acessar meu produto após a compra?",
            "Como solicitar reembolso?",
            "Minha assinatura não renovou. O que fazer?",
            "Como atualizar meu cartão de crédito?",
          ].map(q => (
            <Link key={q} href="/support/novo"
              className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors flex items-center gap-1.5 py-1">
              <ChevronRight size={10} className="text-zinc-700" />{q}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
