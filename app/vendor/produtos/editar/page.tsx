
"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Wand2 } from "lucide-react";
import SmartProductWizard from "@/components/vendor/SmartProductWizard";
import TagsInput          from "@/components/vendor/TagsInput";
import { getErrorMessage } from "@/lib/errors";

function EditarProdutoPageInner() {
  const supabase     = createClient();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const productId    = searchParams.get("id");

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [slug,        setSlug]        = useState("");
  const [supportEmail,setSupportEmail] = useState("");
  const [loading,     setLoading]     = useState(true);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [tags,        setTags]        = useState<string[]>([]);
  interface EditableSaasProduct {
    id: string;
    name: string | null;
    description: string | null;
    slug: string | null;
    category: string | null;
    logo_url: string | null;
    support_email: string | null;
    tags: string[] | null;
    approval_status?: string | null;
    delivery_type?: string | null;
    sso_url?: string | null;
    sso_secret?: string | null;
    magic_link_url?: string | null;
    affiliates_enabled?: boolean | null;
    affiliate_commission_percent?: number | null;
    file_path?: string | null;
  }

  const [initialProduct, setInitialProduct] = useState<EditableSaasProduct | null>(null);

  useEffect(() => {
    if (!productId) { router.push("/vendor/produtos"); return; }
    supabase.from("saas_products").select("*").eq("id", productId).single()
      .then(({ data, error }) => {
        if (error || !data) { toast.error("Produto não encontrado."); router.push("/vendor/produtos"); return; }
        setName(data.name ?? "");
        setDescription(data.description ?? "");
        setSlug(data.slug ?? "");
        setSupportEmail(data.support_email ?? "");
        setTags(Array.isArray(data.tags) ? data.tags : []);
        setInitialProduct(data);
        setLoading(false);
      });
  }, [productId]);

  const handleSave = async () => {
    if (!name || !description || !slug) { toast.error("Preencha todos os campos obrigatórios."); return; }
    setSaving(true);
    const { error } = await supabase.from("saas_products").update({
      name, description, slug, support_email: supportEmail, tags, updated_at: new Date().toISOString(),
    }).eq("id", productId);

    if (error) toast.error("Erro ao salvar alterações.");
    else { toast.success("Produto atualizado!"); router.push("/vendor/produtos"); }
    setSaving(false);
  };


async function handleGenerateDescription() {
  if (!productId) return;
  try {
    setAiLoading(true);
    const res = await fetch("/api/vendor/ai/generate-description", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, apply: false }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Falha ao gerar");
    const copy = json.copy;
    if (copy?.short) setDescription(copy.short);
    toast.success("Descrição gerada (IA leve). Você pode editar antes de salvar.");
  } catch (e: unknown) {
    toast.error(getErrorMessage(e, "Erro ao gerar descrição"));
  } finally {
    setAiLoading(false);
  }
}

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-zinc-600" />
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Editar Produto</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Alterações salvas precisam de nova revisão.</p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-5">
        {[
          { label: "Nome do Produto *", value: name, setter: setName, placeholder: "Meu SaaS Incrível" },
          { label: "Slug (URL) *", value: slug, setter: setSlug, placeholder: "meu-saas-incrivel" },
          { label: "E-mail de Suporte", value: supportEmail, setter: setSupportEmail, placeholder: "suporte@seusaas.com" },
        ].map((f, i) => (
          <div key={i} className="space-y-1">
            <label className="text-xs text-zinc-500">{f.label}</label>
            <input value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors placeholder:text-zinc-700" />
          </div>
        ))}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
  <label className="text-xs text-zinc-500">Descrição *</label>
  <button
    type="button"
    onClick={handleGenerateDescription}
    disabled={aiLoading}
    className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60"
  >
    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
    Gerar (IA)
  </button>
</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="Descreva seu produto em detalhes..."
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors placeholder:text-zinc-700 resize-none" />
          <p className="text-xs text-zinc-700">{description.length}/2000 caracteres</p>
        </div>

        {/* Tags / Keywords */}
        <div className="space-y-1">
          <TagsInput
            value={tags}
            onChange={setTags}
            suggestions={["crm", "automação", "b2b", "marketing", "vendas", "saas", "api", "ia"]}
          />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-emerald-500 text-zinc-950 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Salvar alterações</>}
        </button>
      </motion.div>

      {/* Configuração de Entrega e Afiliados */}
      {productId && (
        <SmartProductWizard
          productId={productId}
          initial={{
            deliveryType:      (initialProduct?.delivery_type as "saas" | "file" | "community" | null) ?? "saas",
            ssoUrl:            initialProduct?.sso_url        ?? "",
            ssoSecret:         initialProduct?.sso_secret     ?? "",
            magicLinkUrl:      initialProduct?.magic_link_url ?? "",
            affiliatesEnabled: initialProduct?.affiliates_enabled ?? false,
            commissionPercent: initialProduct?.affiliate_commission_percent ?? 30,
            filePath:          initialProduct?.file_path      ?? "",
          }}
          onSaved={() => { /* toast already shown inside wizard */ }}
        />
      )}
    </div>
  );
}

export default function EditarProdutoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <EditarProdutoPageInner />
    </Suspense>
  );
}
