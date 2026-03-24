"use client";
// Admin: Chargebacks — lê da tabela dispute_log (webhook stripe → handleDispute)

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

interface DisputeRow {
  id: string;
  stripe_charge_id: string | null;
  subscription_id:  string | null;
  user_id:          string | null;
  amount:           number | null;
  status:           string | null;
  evidence_submitted_at: string | null;
  created_at:       string;
  profile?: { email: string | null; full_name: string | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  open:         "text-red-400 bg-red-500/10 border-red-500/20",
  under_review: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  won:          "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  lost:         "text-zinc-400 bg-zinc-800/60 border-zinc-700",
};

const STATUS_LABEL: Record<string, string> = {
  open:         "Aberta",
  under_review: "Em Revisão (evidência enviada automaticamente)",
  won:          "Ganhamos",
  lost:         "Perdemos",
};

export default function AdminDisputesPage() {
  const supabase                    = createClient();
  const [disputes, setDisputes]     = useState<DisputeRow[]>([]);
  const [loading,  setLoading]      = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dispute_log")
      .select(`
        id, stripe_charge_id, subscription_id, user_id, amount, status, created_at,
        profile:profiles!user_id(email, full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) toast.error("Erro: " + getErrorMessage(error));
    setDisputes((data ?? []) as unknown as DisputeRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleBlacklist = async (email: string | null) => {
    if (!email) { toast.error("Email não disponível"); return; }
    const { error } = await supabase
      .from("blacklisted_emails")
      .upsert({ email, reason: "chargeback_manual" }, { onConflict: "email" });
    if (error) { toast.error("Erro: " + getErrorMessage(error)); return; }
    toast.success(`${email} bloqueado`);
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50 flex items-center gap-2">
            <ShieldAlert size={22} className="text-red-400" /> Disputas / Chargebacks
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Registrados automaticamente pelo webhook Stripe.</p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-300 p-2 transition">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : disputes.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-12 text-center">
          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Nenhuma disputa registrada.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-xs text-zinc-500 border-b border-white/10 bg-zinc-950/40">
            <span>Comprador</span><span>Valor</span><span>Status</span><span>Data</span><span>Ações</span>
          </div>
          <div className="divide-y divide-white/5">
            {disputes.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/[0.02] transition">
                <div>
                  <p className="text-sm text-zinc-200">{d.profile?.email ?? d.user_id ?? "—"}</p>
                  <p className="text-xs text-zinc-500">{d.profile?.full_name ?? ""}</p>
                </div>
                <p className="text-sm text-zinc-200">R$ {(d.amount ?? 0).toFixed(2)}</p>
                <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status ?? "open"] ?? "text-zinc-400 bg-zinc-900 border-zinc-800"}`}>
                  {(d.status ?? "open").replace(/_/g, " ")}
                </span>
                <p className="text-xs text-zinc-500">{new Date(String(d.created_at ?? "")).toLocaleDateString("pt-BR")}</p>
                <div className="flex gap-2">
                  {d.stripe_charge_id && (
                    <a href={`https://dashboard.stripe.com/charges/${d.stripe_charge_id}`} target="_blank" rel="noopener"
                      className="text-zinc-500 hover:text-zinc-300 transition" title="Ver no Stripe">
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button onClick={() => handleBlacklist(d.profile?.email ?? null)}
                    className="text-red-500/60 hover:text-red-400 transition" title="Blacklist comprador">
                    <AlertTriangle size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
