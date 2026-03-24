
import Link from "next/link";
import { getPublicAppUrl } from "@/lib/runtime-config";

// ── Tipos ──────────────────────────────────────────────────────────────
type AffiliateRankingRow = {
  affiliate_id?: string | null;
  name?: string | null;
  sales_count?: number | null;
  commission_total?: number | null;
};

export const dynamic = "force-dynamic";

async function getRanking() {
  const base = getPublicAppUrl();
  const res = await fetch(`${base}/api/ranking/affiliates`, { cache: "no-store" });
  if (!res.ok) return { rows: [] };
  return res.json();
}

export default async function AffiliateRanking() {
  const { rows } = await getRanking();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Ranking de Afiliados</h1>
            <p className="text-zinc-400">Top afiliados por comissão (últimos 30 dias).</p>
          </div>
          <Link href="/affiliate/extrato" className="text-sm text-zinc-300 hover:text-white">Ver meu extrato</Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
          <div className="divide-y divide-white/10">
            {rows.map((r: AffiliateRankingRow, idx: number) => (
              <div key={String(r.affiliate_id ?? idx)} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm text-zinc-200">{idx + 1}</div>
                  <div>
                    <div className="font-medium text-zinc-100">{r.name ?? "Afiliado"}</div>
                    <div className="text-xs text-zinc-400">{r.sales_count ?? 0} vendas</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-zinc-100">R$ {Number(r.commission_total ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  <div className="text-xs text-zinc-500">30 dias</div>
                </div>
              </div>
            ))}
            {!rows?.length && <div className="p-6 text-sm text-zinc-400">Sem dados ainda.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
