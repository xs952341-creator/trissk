"use client";
// components/ProductComments.tsx
// Seção de comentários com moderação. Compradores verificados → aprovação automática.
// Outros → "pendente de moderação".

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, Loader2, User, CheckCircle2, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Comment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  profiles?: { full_name: string | null; avatar_url: string | null };
}

interface Props {
  productId: string;
}

function Avatar({ name, url }: { name?: string | null; url?: string | null }) {
  if (url) return <img src={url} alt="" className="w-8 h-8 rounded-full object-cover" />;
  const initial = (name ?? "?")[0].toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-400">
      {initial}
    </div>
  );
}

function CommentItem({ c, onReply }: { c: Comment; onReply: (id: string, name: string) => void }) {
  const elapsed = (() => {
    const diffMs  = Date.now() - new Date(String(c.created_at ?? "")).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin}min atrás`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `${h}h atrás`;
    return new Date(String(c.created_at ?? "")).toLocaleDateString("pt-BR");
  })();

  return (
    <div className="flex gap-3">
      <Avatar name={(c.profiles as {full_name?: string; email?: string} | null)?.full_name} url={c.profiles?.avatar_url} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-zinc-200 text-sm font-medium">{(c.profiles as {full_name?: string; email?: string} | null)?.full_name ?? "Usuário"}</span>
          <span className="text-zinc-700 text-xs">{elapsed}</span>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">{c.body}</p>
        <button
          onClick={() => onReply(c.id, (c.profiles as {full_name?: string; email?: string} | null)?.full_name ?? "Usuário")}
          className="text-xs text-zinc-600 hover:text-zinc-400 mt-1.5 transition-colors">
          Responder
        </button>
      </div>
    </div>
  );
}

export default function ProductComments({ productId }: Props) {
  const supabase   = createClient();
  const [comments, setComments]     = useState<Comment[]>([]);
  const [loading,  setLoading]      = useState(true);
  const [text,     setText]         = useState("");
  const [sending,  setSending]      = useState(false);
  const [cursor,   setCursor]       = useState<string | null>(null);
  const [hasMore,  setHasMore]      = useState(false);
  const [userId,   setUserId]       = useState<string | null>(null);
  const [replyTo,  setReplyTo]      = useState<{ id: string; name: string } | null>(null);

  const fetchComments = useCallback(async (append = false) => {
    const params = new URLSearchParams({ productId, limit: "15" });
    if (append && cursor) params.set("cursor", cursor);
    const res  = await fetch(`/api/comments?${params}`);
    const data = await res.json();
    const list = data.comments ?? [];
    setComments((prev) => append ? [...prev, ...list] : list);
    setCursor(data.nextCursor ?? null);
    setHasMore(!!data.nextCursor);
    setLoading(false);
  }, [productId, cursor]);

  useEffect(() => {
    fetchComments();
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, [productId]);

  const submit = async () => {
    if (!text.trim()) return;
    if (!userId) { toast.error("Faça login para comentar"); return; }

    setSending(true);
    try {
      const res = await fetch("/api/comments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productId, body: text, parentId: replyTo?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao enviar"); return; }
      toast.success(data.message);
      setText("");
      setReplyTo(null);
      if (data.comment?.status === "approved") {
        // Adicionar imediatamente à lista
        setComments((prev) => [{ ...data.comment, profiles: { full_name: "Você", avatar_url: null } }, ...prev]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-zinc-500" />
        <h3 className="font-semibold text-zinc-200 text-sm">
          Comentários {comments.length > 0 ? `(${comments.length})` : ""}
        </h3>
      </div>

      {/* Caixa de texto */}
      {userId ? (
        <div className="space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              Respondendo a <span className="text-zinc-300">{replyTo.name}</span>
              <button onClick={() => setReplyTo(null)} className="hover:text-zinc-300">✕</button>
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={replyTo ? `Respondendo a ${replyTo.name}...` : "Deixe um comentário..."}
                rows={2}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/50 resize-none transition-colors"
              />
            </div>
            <button
              onClick={submit}
              disabled={sending || !text.trim()}
              className="self-end p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 border border-white/5 rounded-xl px-4 py-3 bg-white/[0.02]">
          <a href="/login" className="text-emerald-400 hover:underline">Faça login</a> para comentar neste produto.
        </p>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-8">
          Nenhum comentário ainda. Seja o primeiro!
        </p>
      ) : (
        <div className="space-y-5">
          <AnimatePresence>
            {comments.map((c) => (
              <motion.div key={c.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <CommentItem c={c} onReply={(id, name) => setReplyTo({ id, name })} />
              </motion.div>
            ))}
          </AnimatePresence>

          {hasMore && (
            <button
              onClick={() => fetchComments(true)}
              className="w-full py-2 text-sm text-zinc-600 hover:text-zinc-400 transition-colors flex items-center justify-center gap-1.5">
              <ChevronDown size={14} /> Ver mais comentários
            </button>
          )}
        </div>
      )}
    </div>
  );
}
