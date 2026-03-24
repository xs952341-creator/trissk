"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

type Msg = { id: string; sender_id: string; body: string; created_at: string };
type Ticket = { id: string; subject: string; status: string; buyer_id: string; vendor_id: string };

export default function VendorTicketPage() {
  const supabase = createClient();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    const res = await fetch(`/api/support/tickets/${id}/messages`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Não foi possível carregar o ticket.");
      return;
    }
    setTicket(json.ticket ?? null);
    setMessages(json.messages ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = `/login?next=/vendor/suporte/${id}`; return; }
      await load();
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setSending(true);
    const res = await fetch(`/api/support/tickets/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Erro ao enviar mensagem.");
      setSending(false);
      return;
    }
    setText("");
    await load();
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-300">
              <Loader2 className="animate-spin" size={18} /> Carregando...
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-bold tracking-tight">{ticket?.subject}</div>
                  <div className="text-xs text-zinc-400 mt-1">Status: {ticket?.status}</div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-sm text-zinc-200 whitespace-pre-wrap">{m.body}</div>
                    <div className="text-xs text-zinc-500 mt-2">{new Date(String(m.created_at ?? "")).toLocaleString("pt-BR")}</div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="mt-6 flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="flex-1 rounded-xl bg-zinc-950 border border-zinc-800 px-4 py-3 outline-none focus:border-zinc-600"
                  placeholder="Escreva sua mensagem..."
                />
                <button
                  onClick={send}
                  disabled={sending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 text-zinc-950 font-semibold px-4 hover:opacity-90 transition disabled:opacity-60"
                >
                  {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
