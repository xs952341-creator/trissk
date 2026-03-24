"use client";

import React, { useMemo, useState } from "react";
import type { LandingBlock } from "@/components/landing/BlocksRenderer";

const starter: LandingBlock[] = [
  { type: "hero", title: "Landing premium", subtitle: "Edite blocos e publique uma página com visual clean." },
  { type: "benefits", title: "Benefícios", items: ["Conversão maior", "Visual premium", "Sem quebrar o app"] },
  { type: "cta", title: "Pronto para vender?", subtitle: "Ative sua landing por produto.", buttonText: "Comprar" }
];

export function BlocksEditor({ initial, productId }: { initial?: LandingBlock[]; productId: string }) {
  const [blocks, setBlocks] = useState<LandingBlock[]>(initial?.length ? initial : starter);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const json = useMemo(() => JSON.stringify(blocks, null, 2), [blocks]);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/vendor/products/${productId}/landing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.saved) setMsg("Salvo.");
    else setMsg("Não salvou (tabela ausente ou RLS)." );
    setSaving(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Editor (JSON de blocos)</div>
            <div className="text-xs text-white/60">Seguro: se faltar tabela, nada quebra.</div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        {msg ? <div className="mt-3 text-xs text-white/70">{msg}</div> : null}
        <textarea
          className="mt-4 h-[520px] w-full rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs text-white/90 outline-none"
          value={json}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              if (Array.isArray(parsed)) setBlocks(parsed);
            } catch {}
          }}
        />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-semibold">Preview (JSON)</div>
        <pre className="mt-4 max-h-[560px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">{json}</pre>
      </div>
    </div>
  );
}
