import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retorna o % de taxa da plataforma para um vendor.
 * Prioridade:
 * 1) profiles.custom_platform_fee_pct (se definido)
 * 2) vendor_fee_tiers (por volume no mês corrente)
 * 3) DEFAULT_PLATFORM_FEE_PCT (caller)
 */
export async function getEffectivePlatformFeePct(opts: {
  vendorId: string;
  defaultFeePct: number;
  asOf?: Date;
}): Promise<number> {
  const supabase = createAdminClient();

  // 1) custom override
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("custom_platform_fee_pct")
    .eq("id", opts.vendorId)
    .single();

  if (!profErr) {
    const v = Number((prof as Record<string, unknown> | null)?.custom_platform_fee_pct);
    if (!Number.isNaN(v) && v > 0) return v;
  }

  // 2) volume tiers
  const asOf = opts.asOf ?? new Date();
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1, 0, 0, 0));
  const startIso = start.toISOString();

  const { data: volRows } = await supabase
    .from("financial_ledger")
    .select("amount")
    .eq("vendor_id", opts.vendorId)
    .eq("entry_type", "sale")
    .gte("created_at", startIso);

  const volume = (volRows ?? []).reduce((acc: number, r: Record<string, unknown>) => acc + Number(r.amount ?? 0), 0);

  const { data: tiers } = await supabase
    .from("vendor_fee_tiers")
    .select("min_volume, fee_pct")
    .eq("vendor_id", opts.vendorId)
    .order("min_volume", { ascending: true });

  if (tiers && tiers.length > 0) {
    let best = Number(opts.defaultFeePct);
    for (const t of tiers as { min_volume?: number; fee_pct?: number }[]) {
      const min = Number(t.min_volume ?? 0);
      const pct = Number(t.fee_pct ?? best);
      if (volume >= min) best = pct;
    }
    if (!Number.isNaN(best) && best > 0) return best;
  }

  return opts.defaultFeePct;
}
