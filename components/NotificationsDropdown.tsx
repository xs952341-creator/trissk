import React from "react";
"use client";
// components/NotificationsDropdown.tsx — v2 Premium
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Bell, CheckCircle2, ShoppingBag, Zap, CreditCard,
  AlertTriangle, Info, X, ExternalLink, Loader2,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  read: boolean;
  is_read?: boolean;
  created_at: string;
}

interface TypeConfig {
  icon: ComponentType<{ size?: number | string }>;
  cls: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  sale:         { icon: ShoppingBag, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  subscription: { icon: Zap,         cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  payment:      { icon: CreditCard,  cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  warning:      { icon: AlertTriangle,cls:"text-amber-400 bg-amber-500/10 border-amber-500/20" },
  info:         { icon: Info,        cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  success:      { icon: CheckCircle2,cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

function timeAgo(date: string) {
  const d = new Date(String(date ?? ""));
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function NotificationsDropdown() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifs.filter(n => !n.is_read && !n.read).length;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setUserId(session.user.id);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("notifications")
      .select("id,type,title,body,action_url,read,is_read,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { setNotifs((data || []) as Notification[]); setLoading(false); });

    // Realtime subscribe
    const channel = supabase.channel("notifs:" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setNotifs(prev => [payload.new as Notification, ...prev].slice(0, 20))
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-xl bg-zinc-900 border border-white/[0.07] flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:border-white/[0.14] transition-all">
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[9px] font-black text-zinc-950 shadow-md">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-zinc-950 border border-white/[0.09] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <span className="text-zinc-200 text-sm font-semibold">Notificações</span>
                {unread > 0 && (
                  <span className="bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                    {unread} nova{unread !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-zinc-600 hover:text-emerald-400 transition-colors font-medium">
                    Marcar todas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-zinc-700 hover:text-zinc-400 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-zinc-700">
                  <Loader2 size={16} className="animate-spin mr-2" />Carregando...
                </div>
              ) : notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-700">
                  <Bell size={28} className="mb-3 opacity-30" />
                  <p className="text-xs">Nenhuma notificação</p>
                </div>
              ) : (
                notifs.map(n => {
                  const cfg = TYPE_CONFIG[String(n.type)] ?? TYPE_CONFIG.info;
                  const Icon = cfg.icon;
                  const isUnread = !n.is_read && !n.read;
                  const inner = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer border-b border-white/[0.04] last:border-0 ${isUnread ? "bg-white/[0.02]" : ""}`}
                      onClick={() => markRead(n.id)}
                    >
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${cfg.cls}`}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-semibold leading-tight ${isUnread ? "text-zinc-100" : "text-zinc-400"}`}>{n.title}</p>
                          <span className="text-[10px] text-zinc-700 shrink-0">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                        {n.action_url && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-500 font-medium">
                            Ver detalhes <ExternalLink size={9} />
                          </div>
                        )}
                      </div>
                      {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />}
                    </div>
                  );
                  return n.action_url ? (
                    <Link key={n.id} href={n.action_url} onClick={() => setOpen(false)}>{inner}</Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifs.length > 0 && (
              <div className="px-4 py-2.5 border-t border-white/[0.07]">
                <Link href="/dashboard" onClick={() => setOpen(false)}
                  className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1 font-medium">
                  Ver todas as notificações
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
