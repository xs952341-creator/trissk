
"use client";
// app/vendor/reembolsos/page.tsx
// Vendor vê solicitações de reembolso dos seus compradores
// e pode aprovar via API.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { RefreshCw, Loader2, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

interface RefundRequest {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  stripe_invoice_id: string | null;
  buyer_email?: string;
  buyer_name?: string;
  product_name?: string;
  product_tiers?: { saas_products?: { name?: string } | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  active:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  canceled:  "text-zinc-400 bg-zinc-800/60 border-zinc-700",
  refunded:  "text-blue-400 bg-blue-500/10 border-blue-500/20",
  past_due:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

export default function VendorReembolsosPage() {
  const supabase = createClient();
  const [subs, setSubs]       = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    // Busca subscriptions do vendor com dados do comprador via join
    const { data, error } = await supabase
      .from("subscriptions")
      .select(`
        id, user_id, status, created_at, stripe_invoice_id,
        product_tiers ( saas_products ( name, vendor_id ) )
      `)
      .eq("product_tiers.saas_products.vendor_id", session.user.id)
      .in("status", ["active", "canceled"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) toast.error("Erro ao carregar: " + getErrorMessage(error));
    setSubs((data ?? []) as unknown as RefundRequest[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefund = async (subscriptionId: string) => {
    if (!confirm("Confirmar reembolso? Esta ação é irreversível.")) return;
    setProcessing(subscriptionId);
    try {
      const res = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Reembolso processado com sucesso!");
      setSubs(s => s.map(x => x.id === subscriptionId ? { ...x, status: "canceled" } : x));
    } catch (err: unknown) {
      toast.error("Erro: " + getErrorMessage(err));
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50 flex items-center gap-2">
            <RotateCcw size={22} className="text-amber-400" /> Reembolsos
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Gerencie solicitações de reembolso dos seus compradores (prazo: 7 dias — Art. 49 CDC).
          </p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-300 p-2 transition">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Info box */}
      <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-4 flex gap-3">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-300/80 text-xs leading-relaxed">
          Reembolsos processam imediatamente e são irreversíveis. O valor retorna ao cartão do comprador em 5–10 dias úteis.
          Sua comissão e a taxa da plataforma serão debitadas do seu saldo no Stripe.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : subs.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-12 text-center">
          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Nenhuma assinatura ativa encontrada.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 text-xs text-zinc-500 border-b border-white/10 bg-zinc-950/40">
            <span>Comprador / Produto</span>
            <span>Data</span>
            <span>Status</span>
            <span>Ação</span>
          </div>
          <div className="divide-y divide-white/5">
            {subs.map((s: RefundRequest) => {
              const productName = s.product_tiers?.saas_products?.name ?? "Produto";
              const isCanceled  = s.status === "canceled";
              return (
                <motion.div
                  key={String(s.id)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/[0.02] transition"
                >
                  <div>
                    <p className="text-sm text-zinc-200">{productName}</p>
                    <p className="text-xs text-zinc-500">ID: {String(s.id).slice(0, 8)}…</p>
                  </div>
                  <p className="text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(String(s.created_at ?? "")).toLocaleDateString("pt-BR")}
                  </p>
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[String(s.status)] ?? "text-zinc-400"}`}>
                    {s.status}
                  </span>
                  <button
                    onClick={() => !isCanceled && handleRefund(String(s.id ?? ""))}
                    disabled={isCanceled || processing === s.id}
                    className="inline-flex items-center gap-1.5 text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {processing === s.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : <RotateCcw size={11} />
                    }
                    {isCanceled ? "Reembolsado" : "Reembolsar"}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
