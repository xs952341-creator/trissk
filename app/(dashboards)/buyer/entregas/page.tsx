"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import type { ComponentType } from "react";

type DeliveryEvent = {
  id: string;
  created_at: string;
  status: "success" | "failed";
  http_status: number | null;
  url: string;
  error_message: string | null;
  stripe_invoice_id: string | null;
  saas_products?: { id: string; name: string } | null;
};

function Pill({ children }: { children?: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

export default function BuyerDeliveriesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DeliveryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data: sessionRes } = await supabase.auth.getSession();
      if (!sessionRes.session) {
        setLoading(false);
        setRows([]);
        return;
      }

      // Delivery logs (auditoria). If table doesn't exist yet, we show a friendly empty state.
      const { data, error: qErr } = await supabase
        .from("delivery_events")
        .select("id,created_at,status,http_status,url,error_message,stripe_invoice_id, saas_products:product_id(id,name)")
        .order("created_at", { ascending: false })
        .limit(50);

      if (qErr) {
        setError(qErr.message);
        setRows([]);
      } else {
        setRows((data as unknown as DeliveryEvent[]) ?? []);
      }

      setLoading(false);
    };

    run();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="mx-auto max-w-6xl px-5 py-10 space-y-6">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
            <p className="text-sm text-zinc-400">Acompanhe o status de provisionamento e links entregues.</p>
          </div>
          <Link href="/buyer" className="text-sm text-zinc-400 hover:text-zinc-200 transition">← Voltar</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 text-sm text-zinc-400">
            <div className="font-medium text-zinc-200">Não foi possível carregar os logs.</div>
            <div className="mt-2 text-zinc-500">{error}</div>
            <div className="mt-4 text-zinc-500">
              Se você ainda não criou a tabela <span className="text-zinc-300">delivery_events</span>, isso é esperado.
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-10 text-center text-sm text-zinc-500">
            Nenhuma entrega registrada ainda.
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
            <div className="divide-y divide-white/10">
              {rows.map((r) => (
                <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-zinc-100 truncate">
                        {(r.saas_products as {name?: string; slug?: string; logo_url?: string} | null)?.name ?? "Entrega"}
                      </div>
                      {r.status === "success" ? (
                        <Pill>✅ Sucesso</Pill>
                      ) : (
                        <Pill>⚠️ Falhou</Pill>
                      )}
                      {typeof r.http_status === "number" && <Pill>HTTP {r.http_status}</Pill>}
                      {r.stripe_invoice_id && <Pill>Fatura {r.stripe_invoice_id}</Pill>}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500 break-all">{r.url}</div>
                    {r.error_message && (
                      <div className="mt-2 text-xs text-red-300/80 break-words">{r.error_message}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-zinc-500">
                    {new Date(String(r.created_at ?? "")).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
