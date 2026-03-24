"use client";
// app/(dashboards)/admin/tickets/page.tsx
// Visão admin de todos os tickets de suporte

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Ticket, ExternalLink } from "lucide-react";
import Link from "next/link";

interface Ticket {
  id: string;
  status: string;
  subject: string;
  created_at: string;
  updated_at: string;
  buyer_id: string | null;
  vendor_id: string | null;
  buyer_profile: { email: string | null; full_name: string | null } | null;
  vendor_profile: { email: string | null; full_name: string | null } | null;
}

const STATUS_COLOR: Record<string, string> = {
  open:        "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  in_progress: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  closed:      "text-zinc-500 bg-zinc-800/60 border-zinc-700",
};

const STATUS_FILTER = ["all", "open", "in_progress", "closed"];

export default function AdminTicketsPage() {
  const supabase = createClient();
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");

  async function load() {
    setLoading(true);
    let q = supabase
      .from("support_tickets")
      .select(`
        id, status, subject, created_at, updated_at, buyer_id, vendor_id,
        buyer_profile:profiles!buyer_id(email, full_name),
        vendor_profile:profiles!vendor_id(email, full_name)
      `)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (filter !== "all") q = q.eq("status", filter);

    const { data, error } = await q;
    if (error) toast.error("Erro ao carregar tickets");
    setTickets((data ?? []) as unknown as Ticket[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Erro ao atualizar ticket"); return; }
    toast.success("Status atualizado");
    setTickets((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-50 flex items-center gap-2">
            <Ticket size={22} className="text-blue-400" /> Tickets de Suporte
          </h1>
          <p className="text-zinc-400 text-sm">Visão geral de todos os tickets da plataforma.</p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-300 transition p-2">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTER.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-xl px-4 py-2 text-xs font-medium transition border ${
              filter === s
                ? "bg-white text-zinc-950 border-transparent"
                : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300"
            }`}
          >
            {s === "all" ? "Todos" : s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-white/5 p-12 text-center text-zinc-500 text-sm">
          Nenhum ticket encontrado.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 text-xs text-zinc-500 border-b border-white/10 bg-zinc-950/40">
            <span>Assunto</span>
            <span>Comprador / Vendor</span>
            <span>Status</span>
            <span>Criado</span>
            <span></span>
          </div>
          <div className="divide-y divide-white/5">
            {tickets.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/[0.02] transition">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{t.subject || "Sem assunto"}</div>
                  <div className="text-xs text-zinc-600">{t.id.slice(0, 12)}…</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-300">{t.buyer_profile?.email ?? "—"}</div>
                  <div className="text-xs text-zinc-500">{t.vendor_profile?.email ?? "—"}</div>
                </div>
                <div>
                  <select
                    value={t.status}
                    onChange={(e) => handleStatusChange(t.id, e.target.value)}
                    className={`rounded-lg border px-2 py-1 text-xs font-medium bg-transparent outline-none cursor-pointer ${STATUS_COLOR[t.status] ?? "text-zinc-400 bg-zinc-900 border-zinc-800"}`}
                  >
                    <option value="open">open</option>
                    <option value="in_progress">in progress</option>
                    <option value="closed">closed</option>
                  </select>
                </div>
                <div className="text-xs text-zinc-500 whitespace-nowrap">
                  {new Date(String(t.created_at ?? "")).toLocaleDateString("pt-BR")}
                </div>
                <div>
                  <Link
                    href={`/support/${t.id}`}
                    className="text-zinc-500 hover:text-zinc-300 transition"
                    title="Abrir ticket"
                  >
                    <ExternalLink size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
