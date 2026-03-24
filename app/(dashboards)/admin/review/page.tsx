
// app/(dashboards)/admin/review/page.tsx
// Fila de aprovação v18 — checklist, feedback, presets de rejeição, email automático
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import {
  Loader2, CheckCircle2, XCircle, Package, ExternalLink,
  ChevronDown, ChevronUp, AlertTriangle, MessageSquare, ClipboardList,
} from "lucide-react";

interface PendingProduct {
  id: string; name: string; description: string | null;
  created_at: string; delivery_method: string | null;
  provisioning_webhook_url: string | null; logo_url: string | null;
  slug: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
}

const CHECKLIST_ITEMS = [
  { key: "terms_ok",   label: "Termos de serviço aceitáveis" },
  { key: "content_ok", label: "Conteúdo adequado e não enganoso" },
  { key: "webhook_ok", label: "Webhook de provisionamento testado" },
  { key: "pricing_ok", label: "Preços razoáveis e claros" },
  { key: "support_ok", label: "Canal de suporte ao cliente informado" },
  { key: "legal_ok",   label: "Sem violações legais aparentes" },
];

const REJECTION_PRESETS = [
  "Conteúdo inadequado ou enganoso para compradores.",
  "Webhook de provisionamento não responde corretamente.",
  "Preços ou condições não estão claros na página do produto.",
  "Produto duplicado já existe no marketplace.",
  "Violação dos termos de uso da plataforma.",
  "Informações incompletas — favor completar descrição e mídia.",
];

function ReviewPanel({ product, onDone }: { product: PendingProduct; onDone: () => void }) {
  const [expanded,  setExpanded]  = useState(false);
  const [acting,    setActing]    = useState(false);
  const [mode,      setMode]      = useState<"approve" | "reject" | null>(null);
  const [reason,    setReason]    = useState("");
  const [feedback,  setFeedback]  = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const allChecked = CHECKLIST_ITEMS.every(i => checklist[i.key]);

  const toggle = (key: string) => setChecklist(p => ({ ...p, [key]: !p[key] }));

  async function submit(action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) {
      toast.error("Informe o motivo da rejeição.");
      return;
    }
    setActing(true);
    try {
      const res = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, action, reason: reason || undefined, feedback: feedback || undefined, checklist }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro" }));
        throw new Error(err.error);
      }
      toast.success(action === "approve" ? "✅ Aprovado! Email enviado." : "❌ Rejeitado. Email enviado.");
      onDone();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
    setActing(false);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
      {/* Card header */}
      <div className="p-5 flex flex-col md:flex-row md:items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
          {product.logo_url
            ? <img src={product.logo_url} alt="" className="h-12 w-12 object-cover" />
            : <Package size={20} className="text-zinc-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-zinc-100">{product.name}</span>
            {product.delivery_method && (
              <span className="text-[10px] border border-white/10 bg-white/5 text-zinc-400 rounded-full px-2 py-0.5">{product.delivery_method}</span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{product.description ?? "Sem descrição."}</p>
          <div className="text-xs text-zinc-600 flex flex-wrap gap-3 mt-1">
            <span>{product.profiles?.full_name ?? "—"} · {product.profiles?.email ?? "—"}</span>
            <span>Enviado: {new Date(String(product.created_at ?? "")).toLocaleDateString("pt-BR")}</span>
            {product.provisioning_webhook_url && (
              <a href={product.provisioning_webhook_url} target="_blank" rel="noopener" className="text-emerald-500 hover:underline flex items-center gap-1">
                Webhook <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs transition shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Fechar" : "Revisar"}
        </button>
      </div>

      {/* Review panel */}
      {expanded && (
        <div className="border-t border-white/10 p-5 space-y-5">
          {/* Checklist */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={14} className="text-zinc-500" />
              <p className="text-zinc-300 text-sm font-medium">Checklist de Revisão</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CHECKLIST_ITEMS.map(item => (
                <label key={item.key} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                  checklist[item.key] ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}>
                  <input type="checkbox" checked={!!checklist[item.key]} onChange={() => toggle(item.key)} className="accent-emerald-500" />
                  <span className={`text-xs ${checklist[item.key] ? "text-emerald-400" : "text-zinc-400"}`}>{item.label}</span>
                </label>
              ))}
            </div>
            {!allChecked && (
              <p className="text-amber-400 text-xs mt-2 flex items-center gap-1.5">
                <AlertTriangle size={11} /> Complete o checklist para aprovar
              </p>
            )}
          </div>

          {/* Feedback */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={14} className="text-zinc-500" />
              <p className="text-zinc-300 text-sm font-medium">Feedback <span className="text-zinc-600 font-normal">(opcional — enviado por email)</span></p>
            </div>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3}
              placeholder="Sugestões, pontos positivos, o que melhorar..."
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 resize-none placeholder:text-zinc-700" />
          </div>

          {/* Rejeição: motivo */}
          {mode === "reject" && (
            <div>
              <p className="text-zinc-300 text-sm font-medium mb-2">Motivo da Rejeição <span className="text-red-400">*</span></p>
              <div className="flex flex-wrap gap-2 mb-3">
                {REJECTION_PRESETS.map((p, i) => (
                  <button key={i} onClick={() => setReason(p)}
                    className="text-xs border border-white/10 bg-white/[0.02] hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-300 text-zinc-500 rounded-lg px-3 py-1.5 transition-all text-left">
                    {p.slice(0, 48)}…
                  </button>
                ))}
              </div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="Descreva o motivo detalhado..."
                className="w-full bg-zinc-900 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-red-500/60 resize-none placeholder:text-zinc-700" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            {mode !== "reject" && (
              <button onClick={() => mode === "approve" ? submit("approve") : setMode("approve")}
                disabled={acting || (mode === "approve" && !allChecked)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 px-5 py-2.5 text-sm transition disabled:opacity-40">
                {acting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {mode === "approve" ? "Confirmar Aprovação" : "Aprovar"}
              </button>
            )}
            <button onClick={() => mode === "reject" ? submit("reject") : setMode("reject")}
              disabled={acting}
              className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 px-5 py-2.5 text-sm transition disabled:opacity-40">
              {acting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {mode === "reject" ? "Confirmar Rejeição" : "Rejeitar"}
            </button>
            {mode && (
              <button onClick={() => { setMode(null); setReason(""); }}
                className="text-zinc-600 hover:text-zinc-400 text-sm px-3 py-2 transition">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminReview() {
  const supabase = createClient();
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading,  setLoading]  = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("saas_products")
      .select("id, name, description, created_at, delivery_method, provisioning_webhook_url, logo_url, slug, profiles!vendor_id(full_name, email)")
      .eq("approval_status", "PENDING_REVIEW")
      .order("created_at", { ascending: true });
    setProducts((data as unknown as PendingProduct[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Aprovação de Produtos</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {loading ? "Carregando…" : `${products.length} produto${products.length !== 1 ? "s" : ""} aguardando revisão`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-12 text-center">
          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Nenhum produto pendente. Tudo em dia! 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(p => (
            <ReviewPanel key={p.id} product={p} onDone={() => setProducts(prev => prev.filter(x => x.id !== p.id))} />
          ))}
        </div>
      )}
    </div>
  );
}
