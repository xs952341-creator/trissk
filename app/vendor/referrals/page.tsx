
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Copy, Plus } from "lucide-react";
import { toast } from "sonner";

type ReferralCode = {
  code: string;
  created_at: string;
  active?: boolean;
};

export default function VendorReferrals() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<{ code: string; created_at: string }[]>([]);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "/login?next=/vendor/referrals"; return; }

    const { data } = await supabase
      .from("vendor_referral_codes")
      .select("code,created_at,active")
      .eq("referrer_id", session.user.id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    setCodes((data ?? []).map((c: ReferralCode) => ({ code: c.code, created_at: c.created_at })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await fetch("/api/vendor/referrals/create", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Erro ao criar código."); return; }
    toast.success("Código gerado.");
    await load();
  };

  const copyLink = async (code: string) => {
    const link = `${location.origin}/onboarding?vref=${encodeURIComponent(code)}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado.");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Referral de Vendors</h1>
            <p className="text-zinc-400 mt-1">Indique produtores. Você ganha taxa reduzida por 6 meses quando eles virarem vendor.</p>
          </div>
          <button
            onClick={create}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-800 transition"
          >
            <Plus size={16} /> Gerar código
          </button>
        </div>

        <div className="mt-8 grid gap-3">
          {loading && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex items-center gap-2 text-zinc-300">
              <Loader2 className="animate-spin" size={18} /> Carregando...
            </div>
          )}

          {!loading && codes.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-300">
              Nenhum código ainda. Gere um e compartilhe.
            </div>
          )}

          {codes.map((c) => (
            <div key={c.code} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold tracking-tight">{c.code}</div>
                <div className="text-xs text-zinc-400 mt-1">{new Date(String(c.created_at ?? "")).toLocaleString("pt-BR")}</div>
              </div>
              <button
                onClick={() => copyLink(c.code)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 text-zinc-950 font-semibold px-4 py-2 hover:opacity-90 transition"
              >
                <Copy size={16} /> Copiar link
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
