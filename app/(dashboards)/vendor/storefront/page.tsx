"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getErrorMessage } from "@/lib/errors";
import type { CSSProperties } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type BlockType = "hero" | "text" | "products" | "cta";

type HeroBlockProps = { title?: string; subtitle?: string };
type TextBlockProps = { text?: string };
type ProductsBlockProps = { title?: string; limit?: number };
type CtaBlockProps = { title?: string; buttonLabel?: string; buttonHref?: string };

type StorefrontBlock =
  | { type: "hero"; props: HeroBlockProps }
  | { type: "text"; props: TextBlockProps }
  | { type: "products"; props: ProductsBlockProps }
  | { type: "cta"; props: CtaBlockProps };

type Block = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
};

function uid() {
  return `b_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function SortableRow({ block, onChange, onRemove }: {
  block: Block;
  onChange: (b: Block) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  } as unknown;

  const set = (k: string, v: Record<string, unknown> | string | number | boolean) => onChange({ ...block, props: { ...block.props, [k]: v } });

  return (
    <div ref={setNodeRef} style={style as CSSProperties} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300"
            title="Arrastar"
          >
            ⠿
          </button>
          <div className="text-sm font-semibold text-zinc-100 capitalize">{block.type}</div>
        </div>
        <button
          onClick={onRemove}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:text-red-300"
        >
          Remover
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {block.type === "hero" && (
          <>
            <input
              value={(block.props as HeroBlockProps)?.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
              placeholder="Título do hero"
            />
            <input
              value={(block.props as HeroBlockProps)?.subtitle ?? ""}
              onChange={(e) => set("subtitle", e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
              placeholder="Subtítulo"
            />
          </>
        )}

        {block.type === "text" && (
          <textarea
            value={(block.props as TextBlockProps)?.text ?? ""}
            onChange={(e) => set("text", e.target.value)}
            className="w-full min-h-[120px] rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
            placeholder="Texto"
          />
        )}

        {block.type === "products" && (
          <>
            <input
              value={(block.props as ProductsBlockProps)?.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
              placeholder="Título da seção (ex: Produtos)"
            />
            <select
              value={String(block.props.limit ?? 6)}
              onChange={(e) => set("limit", Number(e.target.value))}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
            >
              {[3, 6, 9, 12].map((n) => (
                <option key={n} value={n}>{n} itens</option>
              ))}
            </select>
          </>
        )}

        {block.type === "cta" && (
          <>
            <input
              value={(block.props as CtaBlockProps)?.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
              placeholder="Título"
            />
            <input
              value={(block.props as CtaBlockProps)?.buttonLabel ?? ""}
              onChange={(e) => set("buttonLabel", e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
              placeholder="Texto do botão"
            />
            <input
              value={(block.props as CtaBlockProps)?.buttonHref ?? ""}
              onChange={(e) => set("buttonHref", e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
              placeholder="Link do botão (ex: /explorar)"
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function VendorStorefrontEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const [theme, setTheme] = useState<Record<string, unknown>>({ primary: "#10b981", background: "#09090b" });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [blocksJson, setBlocksJson] = useState("[]");
  const [themeJson, setThemeJson] = useState("{}");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/vendor/storefront");
        const j = await res.json();
        if (res.ok && j.storefront) {
          const b = Array.isArray(j.storefront.blocks) ? j.storefront.blocks : [];
          const t = j.storefront.theme && typeof j.storefront.theme === "object" ? j.storefront.theme : { primary: "#10b981", background: "#09090b" };
          setCustomDomain(j.storefront.custom_domain ?? "");
          setTheme(t);
          // normaliza blocks
          const normalized: Block[] = b.map((x: Record<string, unknown>) => ({
            id: String(x.id ?? uid()),
            type: (x.type ?? "text") as BlockType,
            props: x.props ?? {},
          }));
          setBlocks(normalized);
          setBlocksJson(JSON.stringify(normalized, null, 2));
          setThemeJson(JSON.stringify(t, null, 2));
        } else {
          setBlocks([
            { id: uid(), type: "hero", props: { title: "Sua loja", subtitle: "Descreva seu SaaS" } },
            { id: uid(), type: "products", props: { title: "Produtos", limit: 6 } },
            { id: uid(), type: "cta", props: { title: "Fale com a gente", buttonLabel: "Explorar", buttonHref: "/explorar" } },
          ]);
        }
      } catch {
        // noop
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const blockIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const addBlock = (type: BlockType) => {
    const defaults: Record<BlockType, Block> = {
      hero: { id: uid(), type: "hero", props: { title: "Título", subtitle: "Subtítulo" } },
      text: { id: uid(), type: "text", props: { text: "Escreva aqui…" } },
      products: { id: uid(), type: "products", props: { title: "Produtos", limit: 6 } },
      cta: { id: uid(), type: "cta", props: { title: "CTA", buttonLabel: "Começar", buttonHref: "/explorar" } },
    };
    setBlocks((prev) => [...prev, defaults[type]]);
  };

  const syncJson = useCallback((nextBlocks = blocks, nextTheme = theme) => {
    setBlocksJson(JSON.stringify(nextBlocks, null, 2));
    setThemeJson(JSON.stringify(nextTheme, null, 2));
  }, [blocks, theme]);

  useEffect(() => {
    if (!advanced) syncJson(blocks, theme);
  }, [blocks, theme, advanced, syncJson]);

  const save = async () => {
    setSaving(true);
    try {
      let blocksToSave = blocks;
      let themeToSave = theme;
      if (advanced) {
        blocksToSave = JSON.parse(blocksJson);
        themeToSave = JSON.parse(themeJson);
      }

      const res = await fetch("/api/vendor/storefront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: blocksToSave, theme: themeToSave, custom_domain: customDomain || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      toast.success("Storefront salvo!");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Erro"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-zinc-400">Carregando…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Storefront (Page Builder)</h1>
          <p className="text-sm text-zinc-400">
            Editor drag-and-drop simples. A URL pública fica em <code className="text-zinc-200">/store/&lt;seu_vendor_id&gt;</code>.
          </p>
        </div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200"
        >
          {advanced ? "Modo visual" : "Modo avançado (JSON)"}
        </button>
      </div>

      <div className="mt-6 grid gap-4">
        <div>
          <label className="text-sm text-zinc-300">Custom domain (opcional)</label>
          <input
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            className="mt-1 w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2"
            placeholder="ex: loja.suamarca.com"
          />
        </div>

        {!advanced ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-zinc-100">Tema</div>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400">Primary</label>
                  <input
                    value={String(theme.primary ?? "") ?? ""}
                    onChange={(e) => setTheme((t: Record<string, unknown>) => ({ ...t, primary: e.target.value }))}
                    className="mt-1 w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Background</label>
                  <input
                    value={String(theme.background ?? "") ?? ""}
                    onChange={(e) => setTheme((t: Record<string, unknown>) => ({ ...t, background: e.target.value }))}
                    className="mt-1 w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => addBlock("hero")} className="rounded-xl bg-white text-black px-4 py-2 text-sm font-medium">+ Hero</button>
              <button onClick={() => addBlock("text")} className="rounded-xl bg-white/10 text-white px-4 py-2 text-sm">+ Texto</button>
              <button onClick={() => addBlock("products")} className="rounded-xl bg-white/10 text-white px-4 py-2 text-sm">+ Produtos</button>
              <button onClick={() => addBlock("cta")} className="rounded-xl bg-white/10 text-white px-4 py-2 text-sm">+ CTA</button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => {
              const { active, over } = ev;
              if (!over || active.id === over.id) return;
              const oldIndex = blocks.findIndex((b) => b.id === active.id);
              const newIndex = blocks.findIndex((b) => b.id === over.id);
              setBlocks((prev) => arrayMove(prev, oldIndex, newIndex));
            }}>
              <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                <div className="grid gap-3">
                  {blocks.map((b, idx) => (
                    <SortableRow
                      key={b.id}
                      block={b}
                      onChange={(nb) => setBlocks((prev) => prev.map((x) => (x.id === nb.id ? nb : x)))}
                      onRemove={() => setBlocks((prev) => prev.filter((x) => x.id !== b.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        ) : (
          <>
            <div>
              <label className="text-sm text-zinc-300">Theme (JSON)</label>
              <textarea
                value={themeJson}
                onChange={(e) => setThemeJson(e.target.value)}
                className="mt-1 w-full min-h-[120px] rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-300">Blocks (JSON)</label>
              <textarea
                value={blocksJson}
                onChange={(e) => setBlocksJson(e.target.value)}
                className="mt-1 w-full min-h-[320px] rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 font-mono text-xs"
              />
            </div>
          </>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 font-semibold"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
