
"use client";
// app/vendor/precos-internacionais/page.tsx
// Vendor configura preços em USD e EUR para seus tiers.
// O sistema cria os Prices no Stripe via API e salva os IDs.
// A partir daí, o checkout exibe o seletor de moeda automaticamente.

import { useState, useEffect } from "react";
import { Globe, Plus, CheckCircle2, Loader2, AlertTriangle, Info, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Tier {
  id: string;
  tier_name: string;
  price_monthly: number | null;
  price_lifetime: number | null;
  price_usd_monthly: number | null;
  price_usd_lifetime: number | null;
  price_eur_monthly: number | null;
  price_eur_lifetime: number | null;
  stripe_usd_monthly_price_id: string | null;
  stripe_usd_lifetime_price_id: string | null;
  stripe_eur_monthly_price_id: string | null;
  stripe_eur_lifetime_price_id: string | null;
  saas_products: { id: string; name: string } | null;
}

type ProductMini = {
  id: string;
  name: string;
};

interface PriceForm {
  tierId: string;
  currency: "USD" | "EUR";
  monthlyPrice: number | null;
  lifetimePrice: number | null;
  productName: string;
  tierName: string;
}

const CURRENCIES = [
  { key: "usd" as const, label: "USD — Dólar Americano", flag: "🇺🇸", symbol: "US$" },
  { key: "eur" as const, label: "EUR — Euro", flag: "🇪🇺", symbol: "€" },
];

export default function PrecosInternacionaisPage() {
  const supabase = createClient();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PriceForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadTiers = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }

    const { data } = await supabase
      .from("product_tiers")
      .select(`
        id, tier_name, price_monthly, price_lifetime,
        price_usd_monthly, price_usd_lifetime,
        price_eur_monthly, price_eur_lifetime,
        stripe_usd_monthly_price_id, stripe_usd_lifetime_price_id,
        stripe_eur_monthly_price_id, stripe_eur_lifetime_price_id,
        saas_products!inner(id, name, vendor_id)
      `)
      .eq("saas_products.vendor_id", user.id)
      .order("created_at", { ascending: true });

    setTiers((data ?? []) as unknown as Tier[]);
    setLoading(false);
  };

  useEffect(() => { loadTiers(); }, []);

  const openForm = (tierId: string, currency: "usd" | "eur") => {
    const tier = tiers.find((t) => t.id === tierId);
    const field_m = currency === "usd" ? "price_usd_monthly" : "price_eur_monthly";
    const field_l = currency === "usd" ? "price_usd_lifetime" : "price_eur_lifetime";
    setForm({
      tierId,
      currency: currency as "USD" | "EUR",
      monthlyPrice: tier ? (tier[field_m as keyof Tier] as number | null) ?? null : null,
      lifetimePrice: tier ? (tier[field_l as keyof Tier] as number | null) ?? null : null,
      productName: tier?.saas_products?.name ?? "Produto",
      tierName: tier?.tier_name ?? "",
    });
  };

  const submitForm = async () => {
    if (!form) return;
    const monthlyNum = form.monthlyPrice ?? null;
    const lifetimeNum = form.lifetimePrice ?? null;

    if (!monthlyNum && !lifetimeNum) {
      showToast("Informe pelo menos um preço (monthly ou lifetime)", "err"); return;
    }

    const tier = tiers.find((t) => t.id === form.tierId);

    setSaving(true);
    try {
      const res = await fetch("/api/vendor/stripe-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: form.tierId,
          currency: form.currency,
          monthlyPrice: monthlyNum,
          lifetimePrice: lifetimeNum,
          productName: tier?.saas_products?.name ?? "Produto",
          tierName: tier?.tier_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Erro ao salvar", "err"); return; }
      showToast(`Preços em ${form.currency} salvos e Prices criados no Stripe!`);
      setForm(null);
      await loadTiers();
    } catch { showToast("Erro de conexão", "err"); }
    finally { setSaving(false); }
  };

  // Agrupar tiers por produto
  const byProduct: Record<string, { productName: string; tiers: Tier[] }> = {};
  tiers.forEach((t: Tier) => {
    const prod = t.saas_products as ProductMini | null;
    const pid = prod?.id ?? "unknown";
    if (!byProduct[pid]) byProduct[pid] = { productName: prod?.name ?? "Produto", tiers: [] };
    byProduct[pid].tiers.push(t);
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium
          ${toast.type === "ok" ? "bg-emerald-950 border-emerald-500/40 text-emerald-300" : "bg-red-950 border-red-500/40 text-red-300"}`}>
          {toast.type === "ok" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Modal de formulário */}
      {form && (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-white/10 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-zinc-100">
                Configurar {form.currency} — {tiers.find((t) => t.id === form.tierId)?.tier_name}
              </h3>
              <button onClick={() => setForm(null)} className="text-zinc-600 hover:text-zinc-400"><X size={16} /></button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Preço mensal ({form.currency})</label>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-sm">{form.currency === "USD" ? "US$" : ""}</span>
                  <input type="number" step="0.01" min="0"
                    value={form.monthlyPrice ?? ""}
                    onChange={(e) => setForm({ ...form, monthlyPrice: parseFloat(e.target.value) || null })}
                    placeholder="ex: 29.90"
                    className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <p className="text-xs text-zinc-600">Deixe em branco para não criar price mensal nesta moeda.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Preço lifetime ({form.currency})</label>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-sm">{form.currency === "USD" ? "US$" : ""}</span>
                  <input type="number" step="0.01" min="0"
                    value={form.lifetimePrice ?? ""}
                    onChange={(e) => setForm({ ...form, lifetimePrice: parseFloat(e.target.value) || null })}
                    placeholder="ex: 199.00"
                    className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 flex gap-2">
              <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/80">
                Serão criados novos Prices no Stripe na moeda selecionada. Ação irreversível — prices no Stripe não podem ser editados, apenas arquivados.
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setForm(null)} disabled={saving}
                className="flex-1 border border-white/10 rounded-full py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors">
                Cancelar
              </button>
              <button onClick={submitForm} disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Globe size={22} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Preços Internacionais</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Configure USD e EUR para seus tiers. O checkout exibirá o seletor de moeda automaticamente.</p>
            </div>
          </div>
          <button onClick={loadTiers} disabled={loading}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Info */}
        <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 flex gap-3">
          <Info size={15} className="text-zinc-500 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-500 space-y-1">
            <p>Cada moeda requer um Stripe Price separado. Ao configurar, criamos o Price via API e salvamos o ID.</p>
            <p>Clientes que seleccionam USD ou EUR são cobrados na moeda original — sem conversão pela plataforma.</p>
            <p>A taxa de split (Connect Express) é calculada automaticamente para cada moeda.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-zinc-500">
            <Loader2 size={20} className="animate-spin" /> Carregando tiers...
          </div>
        ) : tiers.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Globe size={40} className="mx-auto text-zinc-700" />
            <p className="text-zinc-500">Você ainda não tem produtos com tiers configurados.</p>
            <Link href="/vendor/produtos" className="text-emerald-400 hover:underline text-sm">Criar produto →</Link>
          </div>
        ) : (
          Object.entries(byProduct).map(([productId, { productName, tiers: prodTiers }]) => (
            <div key={productId} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h2 className="text-base font-semibold text-zinc-200 mb-4">{productName}</h2>
              <div className="space-y-4">
                {prodTiers.map((tier) => (
                  <div key={tier.id} className="rounded-xl border border-white/5 bg-zinc-900/30 p-4">
                    <p className="text-sm font-semibold text-zinc-200 mb-3">{tier.tier_name}</p>
                    <div className="text-xs text-zinc-600 mb-3">
                      BRL base: {tier.price_monthly ? `R$ ${tier.price_monthly}/mês` : "—"}{" "}
                      {tier.price_lifetime ? `· R$ ${tier.price_lifetime} lifetime` : ""}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CURRENCIES.map((curr) => {
                        const monthlyField  = curr.key === "usd" ? "price_usd_monthly"  : "price_eur_monthly";
                        const lifetimeField = curr.key === "usd" ? "price_usd_lifetime" : "price_eur_lifetime";
                        const stripeField   = curr.key === "usd" ? "stripe_usd_monthly_price_id" : "stripe_eur_monthly_price_id";
                        const isConfigured  = !!(tier[stripeField as keyof Tier]);
                        const monthly       = tier[monthlyField as keyof Tier] as number | null;
                        const lifetime      = tier[lifetimeField as keyof Tier] as number | null;

                        return (
                          <div key={curr.key}
                            className={`rounded-xl border p-3 transition-all
                              ${isConfigured
                                ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                                : "border-white/5 bg-zinc-900/20"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span>{curr.flag}</span>
                                <span className="text-sm font-medium text-zinc-200">{curr.key.toUpperCase()}</span>
                                {isConfigured && <CheckCircle2 size={13} className="text-emerald-400" />}
                              </div>
                              <button onClick={() => openForm(tier.id, curr.key)}
                                className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors flex items-center gap-1">
                                <Plus size={10} /> {isConfigured ? "Editar" : "Configurar"}
                              </button>
                            </div>
                            {isConfigured ? (
                              <div className="text-xs text-zinc-500 space-y-0.5">
                                {monthly  && <p>{curr.symbol} {monthly.toFixed(2)}/mês ✓</p>}
                                {lifetime && <p>{curr.symbol} {lifetime.toFixed(2)} lifetime ✓</p>}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-700">Não configurado — clique para adicionar</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
