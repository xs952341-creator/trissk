
"use client";
// app/(dashboards)/admin/comments/page.tsx
// Painel de moderação de comentários.

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Comment {
  id: string;
  body: string;
  created_at: string;
  status: string;
  profiles?: { full_name: string; email: string };
  saas_products?: { name: string };
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"pending" | "approved" | "rejected">("pending");

  const load = async (status: string) => {
    setLoading(true);
    const res  = await fetch(`/api/admin/comments?status=${status}`);
    const data = await res.json();
    setComments(data.comments ?? []);
    setLoading(false);
  };

  useEffect(() => { load(filter); }, [filter]);

  const moderate = async (commentId: string, action: "approve" | "reject") => {
    const res = await fetch("/api/admin/comments", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ commentId, action }),
    });
    if (res.ok) {
      toast.success(action === "approve" ? "Comentário aprovado" : "Comentário rejeitado");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } else {
      toast.error("Erro ao moderar");
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle size={20} className="text-zinc-500" /> Moderação de Comentários
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Aprove ou rejeite comentários dos compradores.</p>
        </div>
        <button onClick={() => load(filter)} className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-colors border ${
              filter === s ? "bg-white text-zinc-950 border-transparent" : "border-white/10 text-zinc-400 hover:border-white/20"
            }`}>
            {s === "pending" ? "Pendentes" : s === "approved" ? "Aprovados" : "Rejeitados"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-12 text-center text-zinc-600 text-sm">
          Nenhum comentário {filter === "pending" ? "pendente" : filter === "approved" ? "aprovado" : "rejeitado"}.
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {comments.map((c) => (
              <motion.div key={c.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-zinc-200 text-sm font-medium">{(c.profiles as {full_name?: string; email?: string} | null)?.full_name ?? "Usuário"}</span>
                      <span className="text-zinc-600 text-xs">{(c.profiles as {full_name?: string; email?: string} | null)?.email ?? ""}</span>
                      {(c.saas_products as {name?: string; slug?: string; logo_url?: string} | null)?.name && (
                        <span className="text-xs bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-zinc-400">
                          {(c.saas_products as {name?: string; slug?: string; logo_url?: string} | null)?.name ?? ""}
                        </span>
                      )}
                      <span className="text-zinc-700 text-xs">
                        {new Date(String(c.created_at ?? "")).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed">{c.body}</p>
                  </div>

                  {filter === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => moderate(c.id, "approve")}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-medium transition-colors">
                        <CheckCircle2 size={13} /> Aprovar
                      </button>
                      <button onClick={() => moderate(c.id, "reject")}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-medium transition-colors">
                        <XCircle size={13} /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
