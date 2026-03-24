
"use client";

import { useState, useEffect, Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Package, Users, Clock, Shield, Info, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type AffiliateSession = {
  access_token: string;
  user: { id: string };
};

type AffiliateProduct = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  category: string | null;
  allows_affiliates: boolean;
  affiliate_commission_percent: number | null;
  affiliate_commission_type_v2: "fixed" | "percent" | null;
  affiliate_commission_fixed: number | null;
  affiliate_description: string | null;
  affiliate_cookie_days: number | null;
  affiliate_attribution_model: "first_click" | "last_click" | null;
  affiliate_approval_mode: "auto" | "manual" | null;
};

function SolicitarContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("produto");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [product, setProduct] = useState<AffiliateProduct | null>(null);
  const [existing, setExisting] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<AffiliateSession | null>(null);

  useEffect(() => {
    if (!productId) { setLoading(false); return; }
    load();
  }, [productId]);

  const load = async () => {
    setLoading(true);
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(s as AffiliateSession | null);

    // Load product info
    const { data: p } = await supabase
      .from("saas_products")
      .select("id, name, description, logo_url, category, allows_affiliates, affiliate_commission_percent, affiliate_commission_type_v2, affiliate_commission_fixed, affiliate_description, affiliate_cookie_days, affiliate_attribution_model, affiliate_approval_mode, affiliate_marketplace_visible")
      .eq("id", productId!)
      .eq("approval_status", "APPROVED")
      .maybeSingle();
    setProduct(p);

    // Check if user already has a request
    if (s) {
      const { data: req } = await supabase
        .from("affiliate_product_requests")
        .select("id, status")
        .eq("product_id", productId!)
        .eq("affiliate_id", s.user.id)
        .maybeSingle();
      setExisting(req);
    }

    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!session) { router.push(`/login?next=/affiliate/solicitar?produto=${productId}`); return; }
    if (!product) return;
    setSubmitting(true);

    const { error } = await supabase.from("affiliate_product_requests").upsert({
      affiliate_id: session.user.id,
      product_id: product.id,
      status: "pending",
      message: message.trim() || null,
    }, { onConflict: "affiliate_id,product_id" });

    if (error) {
      toast.error("Erro ao enviar solicitação. Tente novamente.");
      setSubmitting(false);
      return;
    }

    // If auto approval, also create affiliate link
    if (product.affiliate_approval_mode === "auto") {
      try {
        const linkRes = await fetch("/api/affiliate/create-link", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ product_id: product.id }),
        });
        if (!linkRes.ok) {
          // Solicitação criada com sucesso, mas link não foi gerado ainda
          console.warn("[affiliate/solicitar] link not created:", await linkRes.text());
          setSubmitted(true);
          setSubmitting(false);
          toast.success("Solicitação enviada com sucesso. O link ficará disponível após a validação do sistema.");
          return;
        }
      } catch (linkErr) {
        console.warn("[affiliate/solicitar] link creation failed:", linkErr);
        // Continue — solicitação foi criada, link pode ser tentado depois
      }
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  const commissionDisplay = () => {
    if (!product) return "";
    if (product.affiliate_commission_type_v2 === "fixed" && Number(product.affiliate_commission_fixed) > 0)
      return `R$ ${Number(product.affiliate_commission_fixed).toFixed(2)} por venda`;
    if (Number(product.affiliate_commission_percent) > 0)
      return `${product.affiliate_commission_percent}% por venda`;
    return "Consulte o produtor";
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-zinc-600" />
    </div>
  );

  if (!productId || !product) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-4">
      <div>
        <Package size={48} className="text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-400 text-lg font-medium">Produto não encontrado</p>
        <p className="text-zinc-600 text-sm mt-2">Este produto não existe ou não aceita afiliados.</p>
        <Link href="/affiliate" className="mt-4 inline-block text-emerald-500 text-sm hover:underline">
          ← Ver marketplace de afiliados
        </Link>
      </div>
    </div>
  );

  if (!product.allows_affiliates) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-4">
      <div>
        <Shield size={48} className="text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-400 text-lg font-medium">Programa de afiliados fechado</p>
        <p className="text-zinc-600 text-sm mt-2">Este produto não aceita afiliados no momento.</p>
      </div>
    </div>
  );

  if (submitted || existing?.status === "approved") return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-4">
      <div>
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-emerald-400" />
        </div>
        <p className="text-zinc-100 text-xl font-bold">
          {existing?.status === "approved" ? "Você já é afiliado!" : 
           product.affiliate_approval_mode === "auto" ? "Afiliação aprovada!" : "Solicitação enviada!"}
        </p>
        <p className="text-zinc-500 text-sm mt-2 max-w-sm">
          {product.affiliate_approval_mode === "auto"
            ? "Seu link de afiliado foi criado automaticamente. Acesse seu painel para ver."
            : "O produtor irá revisar sua solicitação em breve."}
        </p>
        <Link href="/affiliate/links" className="mt-6 inline-block bg-emerald-500 text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-400 transition-colors">
          Ver meus links de afiliado
        </Link>
      </div>
    </div>
  );

  if (existing?.status === "pending") return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-4">
      <div>
        <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock size={32} className="text-amber-400" />
        </div>
        <p className="text-zinc-100 text-xl font-bold">Solicitação pendente</p>
        <p className="text-zinc-500 text-sm mt-2">Você já solicitou afiliação a este produto. Aguarde a aprovação.</p>
      </div>
    </div>
  );

  if (existing?.status === "rejected") return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-4">
      <div>
        <p className="text-zinc-100 text-xl font-bold">Solicitação não aprovada</p>
        <p className="text-zinc-500 text-sm mt-2">O produtor não aprovou sua solicitação para este produto.</p>
        <Link href="/affiliate" className="mt-4 inline-block text-emerald-500 text-sm hover:underline">← Ver outros produtos</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <Link href="/affiliate" className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 text-sm mb-6 transition-colors">
          <ArrowLeft size={14} /> Voltar ao marketplace
        </Link>

        {/* Produto */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            {product.logo_url
              ? <img src={String(product.logo_url ?? "")} alt={product.name} className="w-14 h-14 rounded-2xl object-cover" />
              : <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center"><Package size={24} className="text-zinc-600" /></div>}
            <div>
              <h1 className="text-zinc-100 font-bold text-xl">{product.name}</h1>
              {product.category && <p className="text-zinc-500 text-xs-0.5">{product.category}</p>}
            </div>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">{product.description}</p>
        </div>

        {/* Detalhes do programa */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-zinc-600 text-xs mb-1">Comissão</p>
            <p className="text-emerald-400 font-bold">{commissionDisplay() as ReactNode}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-zinc-600 text-xs mb-1">Cookie de rastreamento</p>
            <p className="text-zinc-200 font-semibold">
              {product.affiliate_cookie_days === 0 ? "Eterno" : `${product.affiliate_cookie_days} dias`}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-zinc-600 text-xs mb-1">Aprovação</p>
            <p className="text-zinc-200 font-semibold">
              {product.affiliate_approval_mode === "auto" ? "Automática" : "Manual"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-zinc-600 text-xs mb-1">Atribuição</p>
            <p className="text-zinc-200 font-semibold">
              {product.affiliate_attribution_model === "first_click" ? "Primeiro clique" : "Último clique"}
            </p>
          </div>
        </div>

        {/* Descrição/regras do programa */}
        {product.affiliate_description && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-blue-400" />
              <p className="text-zinc-300 text-sm font-medium">Regras e Materiais</p>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{String(product.affiliate_description ?? "")}</p>
          </div>
        )}

        {/* Form de solicitação */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2">
            <Users size={16} className="text-emerald-400" />
            Solicitar Afiliação
          </h2>

          {product.affiliate_approval_mode === "manual" && (
            <div className="mb-4">
              <label className="text-zinc-400 text-xs font-medium mb-1.5 block">
                Mensagem para o produtor <span className="text-zinc-600">(opcional)</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="Apresente-se: como você vai divulgar o produto, qual seu público, etc."
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 resize-none placeholder:text-zinc-700"
              />
            </div>
          )}

          {!session ? (
            <button
              onClick={() => router.push(`/login?next=/affiliate/solicitar?produto=${productId}`)}
              className="w-full bg-emerald-500 text-zinc-950 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all text-sm"
            >
              Fazer login para se afiliar
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-emerald-500 text-zinc-950 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {submitting ? "Enviando..." :
               product.affiliate_approval_mode === "auto" ? "Tornar-me afiliado agora" : "Enviar solicitação"}
            </button>
          )}

          {product.affiliate_approval_mode === "auto" && (
            <p className="text-zinc-600 text-xs text-center mt-3">
              ✓ Aprovação automática — você receberá seu link imediatamente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SolicitarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-600" />
      </div>
    }>
      <SolicitarContent />
    </Suspense>
  );
}
