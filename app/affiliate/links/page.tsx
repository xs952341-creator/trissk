"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Link2, Copy, Plus, X, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface AffiliateLink {
  id: string;
  code: string;
  product_id: string | null;
  playbook_id: string | null;
  click_count: number;
  conversion_count: number;
  created_at: string;
  saas_products?: { name: string; logo_url: string | null } | null;
  playbooks?: { title: string } | null;
}

interface Product {
  id: string;
  name: string;
  logo_url: string | null;
  category: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition"
      title="Copiar link"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  );
}

function ProductPickerModal({
  products,
  loading,
  onSelect,
  onClose,
}: {
  products: Product[];
  loading: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [products, q]
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <span className="font-semibold text-zinc-100">Selecionar Produto</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm outline-none focus:border-white/25 placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="p-4 space-y-1 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-zinc-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">
              {q ? "Nenhum produto encontrado." : "Nenhum produto disponível para afiliação."}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5 transition text-left"
              >
                <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {p.logo_url ? (
                    <img src={p.logo_url} alt={p.name} className="h-9 w-9 object-cover" />
                  ) : (
                    <Link2 size={14} className="text-zinc-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100 truncate">{p.name}</div>
                  {p.category && <div className="text-xs text-zinc-500">{p.category}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function AffiliateLinks() {
  const supabase = createClient();
  const [loading,    setLoading]    = useState(true);
  const [links,      setLinks]      = useState<AffiliateLink[]>([]);
  const [creating,   setCreating]   = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [prodLoading,setProdLoading]= useState(false);
  const baseUrl = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  // Realtime badge: pisca quando chegar clique/conversão ao vivo
  const [realtimeEvent, setRealtimeEvent] = useState<{type: "click" | "conversion"; code: string} | null>(null);

  async function load() {
    setLoading(true);
    const res  = await fetch("/api/affiliate/links", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLinks(json.links ?? []);
    setLoading(false);
  }

  async function loadProducts() {
    setProdLoading(true);
    const { data } = await supabase
      .from("saas_products")
      .select("id, name, logo_url, category")
      .eq("approval_status", "APPROVED")
      .eq("allows_affiliates", true)
      .order("name");
    setProducts((data as Product[]) ?? []);
    setProdLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Realtime: escuta affiliate_links para updates ao vivo ──────────────────
  useEffect(() => {
    let userId: string | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      userId = session?.user.id ?? null;
      if (!userId) return;

      const channel = supabase
        .channel("affiliate-realtime")
        .on(
          "postgres_changes",
          {
            event:  "UPDATE",
            schema: "public",
            table:  "affiliate_links",
          },
          (payload) => {
            const updated = payload.new as AffiliateLink;
            const old     = payload.old as AffiliateLink;
            setLinks(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));

            // Badge de evento ao vivo
            if ((updated.click_count ?? 0) > (old.click_count ?? 0)) {
              setRealtimeEvent({ type: "click", code: updated.code });
              setTimeout(() => setRealtimeEvent(null), 3000);
            } else if ((updated.conversion_count ?? 0) > (old.conversion_count ?? 0)) {
              setRealtimeEvent({ type: "conversion", code: updated.code });
              setTimeout(() => setRealtimeEvent(null), 5000);
            }
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    });
  }, []);

  async function openPicker() {
    setShowPicker(true);
    if (products.length === 0) loadProducts();
  }

  async function createLink(productId: string) {
    setShowPicker(false);
    setCreating(true);
    const res  = await fetch("/api/affiliate/links", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ product_id: productId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(json.error ?? "Erro ao criar link");
    else {
      toast.success("Link de afiliado criado!");
      await load();
    }
    setCreating(false);
  }

  function linkUrl(code: string) {
    return `${baseUrl}/explorar?ref=${encodeURIComponent(code)}`;
  }

  const totalClicks      = links.reduce((a, l) => a + (l.click_count      ?? 0), 0);
  const totalConversions = links.reduce((a, l) => a + (l.conversion_count ?? 0), 0);

  return (
    <>
      {showPicker && (
        <ProductPickerModal
          products={products}
          loading={prodLoading}
          onSelect={createLink}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="p-6 md:p-10 space-y-6">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-50">Links de Afiliado</h1>
              {/* Realtime live indicator */}
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                ao vivo
              </span>
            </div>
            <p className="text-zinc-400 text-sm">Gere links rastreáveis e acompanhe cliques e conversões.</p>
          </div>
          <button
            onClick={openPicker}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-xl bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Novo link
          </button>
        </div>

        {/* Realtime event toast in-page */}
        {realtimeEvent && (
          <div className={`fixed bottom-6 right-6 z-50 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl flex items-center gap-2 transition-all ${
            realtimeEvent.type === "conversion"
              ? "bg-emerald-500 text-zinc-950 border-emerald-400"
              : "bg-zinc-800 text-zinc-100 border-white/10"
          }`}>
            {realtimeEvent.type === "conversion" ? "🎉 Nova conversão!" : "👆 Novo clique!"}
            <span className="font-mono text-xs opacity-70">{realtimeEvent.code}</span>
          </div>
        )}

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Links ativos",   value: links.length },
            { label: "Cliques totais", value: totalClicks },
            { label: "Conversões",     value: totalConversions },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="text-2xl font-semibold text-zinc-100">{m.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Lista de links */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-zinc-500" />
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
              <Link2 size={32} className="text-zinc-700" />
              <p className="text-zinc-400 text-sm">Nenhum link criado ainda.</p>
              <button
                onClick={openPicker}
                className="rounded-xl border border-white/10 text-zinc-300 hover:text-white px-4 py-2 text-sm transition"
              >
                Criar primeiro link
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {links.map((l) => {
                const productName = (l.saas_products as {name?: string; slug?: string; logo_url?: string} | null)?.name ?? l.playbooks?.title ?? "Produto";
                const logoUrl     = l.saas_products?.logo_url ?? null;
                const url         = linkUrl(l.code);
                const cvr         = l.click_count > 0
                  ? ((l.conversion_count / l.click_count) * 100).toFixed(1)
                  : "0.0";

                return (
                  <div key={l.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    {/* Logo + nome */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                        {logoUrl
                          ? <img src={logoUrl} alt="" className="h-9 w-9 object-cover" />
                          : <Link2 size={14} className="text-zinc-500" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">{productName}</div>
                        <div className="text-xs text-zinc-500 font-mono truncate">{url}</div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-center shrink-0">
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{l.click_count ?? 0}</div>
                        <div className="text-[10px] text-zinc-500">cliques</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{l.conversion_count ?? 0}</div>
                        <div className="text-[10px] text-zinc-500">conversões</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{cvr}%</div>
                        <div className="text-[10px] text-zinc-500">taxa</div>
                      </div>
                    </div>

                    <CopyButton text={url} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
