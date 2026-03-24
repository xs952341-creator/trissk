"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, MessageCircle } from "lucide-react";

type Ticket = {
  id: string;
  status: string;
  subject: string;
  updated_at: string;
};

export default function VendorSupport() {
  const supabase = createClient();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login?next=/vendor/suporte"; return; }
      const res = await fetch("/api/support/tickets?scope=vendor");
      const json = await res.json().catch(() => ({}));
      setTickets(json.tickets ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">Suporte</h1>
        <p className="text-zinc-400 mt-1">Responda seus clientes sem sair da plataforma.</p>

        <div className="mt-8 grid gap-3">
          {loading && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex items-center gap-2 text-zinc-300">
              <Loader2 className="animate-spin" size={18} /> Carregando...
            </div>
          )}
          {!loading && tickets.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-300">
              Nenhum ticket no momento.
            </div>
          )}
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/vendor/suporte/${t.id}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:bg-zinc-900 transition flex items-center justify-between"
            >
              <div>
                <div className="font-semibold tracking-tight">{t.subject}</div>
                <div className="text-xs text-zinc-400 mt-1">Status: <span className="text-zinc-200">{t.status}</span></div>
              </div>
              <MessageCircle className="text-zinc-400" size={18} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
