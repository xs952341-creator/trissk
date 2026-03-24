"use client";
// Checkout Builder — personalização visual do checkout por produto
// Kiwify-level: cor, logo, banner, headline, garantia, countdown, social proof

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { 
  Palette, Image, Clock, Shield, Users, Type, 
  Save, Eye, Loader2, Check, Upload, RefreshCw,
  ChevronDown, ChevronRight, Star
} from "lucide-react";
import type { ComponentType } from "react";

interface CheckoutTheme {
  id?: string;
  product_id: string;
  headline?: string;
  subheadline?: string;
  brand_color: string;
  button_color: string;
  button_text: string;
  button_text_color: string;
  banner_url?: string;
  logo_url?: string;
  guarantee_text?: string;
  guarantee_days?: number;
  show_guarantee_seal: boolean;
  show_social_proof: boolean;
  social_proof_count?: number;
  show_countdown: boolean;
  countdown_minutes?: number;
  show_order_bump: boolean;
  order_bump_product_id?: string;
  order_bump_headline?: string;
  order_bump_description?: string;
  order_bump_price?: number;
  checkout_layout: "single" | "two-column";
  show_testimonials: boolean;
  custom_css?: string;
}

interface Product {
  id: string;
  name: string;
  logo_url?: string;
}

const DEFAULT_THEME: Omit<CheckoutTheme, "product_id"> = {
  brand_color: "#10b981",
  button_color: "#10b981",
  button_text: "Comprar agora",
  button_text_color: "#ffffff",
  show_guarantee_seal: true,
  show_social_proof: true,
  social_proof_count: 127,
  show_countdown: false,
  countdown_minutes: 15,
  show_order_bump: false,
  checkout_layout: "single",
  show_testimonials: false,
  guarantee_days: 7,
  guarantee_text: "Garantia de 7 dias ou seu dinheiro de volta",
};

export default function CheckoutBuilderPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [theme, setTheme] = useState<Omit<CheckoutTheme, "product_id">>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("visual");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("saas_products")
        .select("id, name, logo_url")
        .eq("vendor_id", user.id)
        .eq("approval_status", "APPROVED");
      setProducts((data ?? []) as Product[]);
      if (data?.length) setSelected(data[0].id);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const load = async () => {
      const { data } = await supabase
        .from("checkout_themes")
        .select("*")
        .eq("product_id", selected)
        .maybeSingle();
      if (data) {
        const { product_id: _, id: __, ...rest } = data as CheckoutTheme;
        setTheme({ ...DEFAULT_THEME, ...rest });
      } else {
        setTheme(DEFAULT_THEME);
      }
    };
    load();
  }, [selected]);

  const save = async () => {
    if (!selected) { toast.error("Selecione um produto"); return; }
    setSaving(true);
    const res = await fetch("/api/vendor/checkout-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: selected, ...theme }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Erro ao salvar"); }
    else { setSaved(true); toast.success("Tema salvo!"); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  const upd = (key: keyof typeof theme, val: Record<string, unknown> | string | number | boolean) =>
    setTheme(t => ({ ...t, [key]: typeof val === 'string' ? val : val }));

  const previewUrl = selected ? `/checkout/${products.find(p => p.id === selected)?.name?.toLowerCase().replace(/\s+/g, "-") ?? "preview"}?preview=1` : null;

  const sections = [
    { id: "visual",    icon: <Palette size={14} />,  label: "Visual & Cores" },
    { id: "copy",      icon: <Type size={14} />,      label: "Textos & Headline" },
    { id: "trust",     icon: <Shield size={14} />,    label: "Elementos de Confiança" },
    { id: "urgency",   icon: <Clock size={14} />,     label: "Urgência & Countdown" },
    { id: "bump",      icon: <Star size={14} />,      label: "Order Bump" },
    { id: "social",    icon: <Users size={14} />,     label: "Prova Social" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-50">Checkout Builder</h1>
          <p className="text-xs text-zinc-500">Personalize o checkout do seu produto</p>
        </div>
        <div className="flex items-center gap-3">
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 border border-white/10 px-3 py-2 rounded-xl transition">
              <Eye size={14} /> Preview
            </a>
          )}
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold text-sm px-5 py-2 rounded-xl hover:bg-emerald-400 transition disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "Salvo!" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-white/10 flex flex-col">
          {/* Product selector */}
          <div className="p-4 border-b border-white/10">
            <label className="text-xs text-zinc-500 mb-1.5 block">Produto</label>
            <div className="relative">
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 outline-none appearance-none"
              >
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Sections */}
          <nav className="flex-1 overflow-y-auto py-2">
            {sections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  activeSection === s.id
                    ? "bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}>
                {s.icon} {s.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main editor */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeSection === "visual" && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">Visual & Cores</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Cor da marca</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={theme.brand_color} onChange={e => upd("brand_color", e.target.value)}
                      className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                    <input value={theme.brand_color} onChange={e => upd("brand_color", e.target.value)}
                      className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none font-mono uppercase" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Cor do botão</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={theme.button_color} onChange={e => upd("button_color", e.target.value)}
                      className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                    <input value={theme.button_color} onChange={e => upd("button_color", e.target.value)}
                      className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none font-mono uppercase" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Layout do checkout</label>
                <div className="flex gap-3">
                  {(["single", "two-column"] as const).map(l => (
                    <button key={l} onClick={() => upd("checkout_layout", l)}
                      className={`flex-1 border rounded-xl py-3 text-sm font-medium transition ${
                        theme.checkout_layout === l
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-white/10 text-zinc-400 hover:border-white/20"
                      }`}>
                      {l === "single" ? "Coluna única" : "Duas colunas"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">CSS personalizado (avançado)</label>
                <textarea
                  value={theme.custom_css ?? ""}
                  onChange={e => upd("custom_css", e.target.value)}
                  placeholder="/* Seu CSS aqui */"
                  rows={6}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none font-mono resize-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          )}

          {activeSection === "copy" && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">Textos & Headline</h2>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Headline principal</label>
                <input value={theme.headline ?? ""} onChange={e => upd("headline", e.target.value)}
                  placeholder="Ex: Transforme seu conhecimento em receita recorrente"
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Subtítulo</label>
                <textarea value={theme.subheadline ?? ""} onChange={e => upd("subheadline", e.target.value)}
                  placeholder="Ex: Já são +1.200 vendedores que usam nossa plataforma..."
                  rows={3}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none resize-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Texto do botão de compra</label>
                <input value={theme.button_text} onChange={e => upd("button_text", e.target.value)}
                  placeholder="Ex: Quero acesso agora →"
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50" />
              </div>

              {/* Preview do botão */}
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">Preview do botão</label>
                <button style={{ background: theme.button_color, color: theme.button_text_color }}
                  className="px-6 py-3 rounded-xl font-bold text-sm">
                  {theme.button_text}
                </button>
              </div>
            </div>
          )}

          {activeSection === "trust" && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">Elementos de Confiança</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={theme.show_guarantee_seal} onChange={e => upd("show_guarantee_seal", e.target.checked as boolean)} className="accent-emerald-500 w-4 h-4" />
                <span className="text-sm text-zinc-300">Mostrar selo de garantia</span>
              </label>
              {theme.show_guarantee_seal && (
                <div className="pl-7 space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Dias de garantia</label>
                    <input type="number" value={theme.guarantee_days ?? 7} onChange={e => upd("guarantee_days", Number(e.target.value))}
                      className="w-24 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Texto da garantia</label>
                    <input value={theme.guarantee_text ?? ""} onChange={e => upd("guarantee_text", e.target.value)}
                      placeholder="Ex: Garantia de 7 dias ou seu dinheiro de volta"
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50" />
                  </div>
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={theme.show_testimonials} onChange={e => upd("show_testimonials", e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                <span className="text-sm text-zinc-300">Mostrar depoimentos na página de checkout</span>
              </label>
            </div>
          )}

          {activeSection === "urgency" && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">Urgência & Countdown</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={theme.show_countdown} onChange={e => upd("show_countdown", e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                <span className="text-sm text-zinc-300">Ativar cronômetro de urgência</span>
              </label>
              {theme.show_countdown && (
                <div className="pl-7">
                  <label className="text-xs text-zinc-500 mb-1.5 block">Duração do timer (minutos)</label>
                  <input type="number" min={1} max={60} value={theme.countdown_minutes ?? 15} onChange={e => upd("countdown_minutes", Number(e.target.value))}
                    className="w-24 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none" />
                  <p className="text-xs text-zinc-600 mt-1">Timer reseta a cada visita. Cria senso de urgência.</p>
                </div>
              )}
            </div>
          )}

          {activeSection === "bump" && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">Order Bump</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={theme.show_order_bump} onChange={e => upd("show_order_bump", e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                <span className="text-sm text-zinc-300">Ativar order bump no checkout</span>
              </label>
              {theme.show_order_bump && (
                <div className="pl-7 space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Headline do bump</label>
                    <input value={theme.order_bump_headline ?? ""} onChange={e => upd("order_bump_headline", e.target.value)}
                      placeholder="Ex: ⚡ Adicione também: Módulo Bônus"
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Descrição do bump</label>
                    <textarea value={theme.order_bump_description ?? ""} onChange={e => upd("order_bump_description", e.target.value)}
                      placeholder="Ex: Acesso vitalício ao módulo avançado + templates exclusivos por apenas..."
                      rows={3}
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-200 outline-none resize-none focus:border-emerald-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Preço do bump (R$)</label>
                    <input type="number" min={0} step={0.01} value={theme.order_bump_price ?? 0} onChange={e => upd("order_bump_price", Number(e.target.value))}
                      className="w-32 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none" />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "social" && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">Prova Social</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={theme.show_social_proof} onChange={e => upd("show_social_proof", e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                <span className="text-sm text-zinc-300">Mostrar contador de compradores</span>
              </label>
              {theme.show_social_proof && (
                <div className="pl-7">
                  <label className="text-xs text-zinc-500 mb-1.5 block">Número inicial de compradores</label>
                  <input type="number" min={1} value={theme.social_proof_count ?? 100} onChange={e => upd("social_proof_count", Number(e.target.value))}
                    className="w-32 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none" />
                  <p className="text-xs text-zinc-600 mt-1">Número exibido mais as compras reais.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
