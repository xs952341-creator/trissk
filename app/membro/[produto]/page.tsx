
"use client";
// app/membro/[produto]/page.tsx
// Área do membro: comprador acessa o produto comprado.
// Mostra: chaves de API, magic links, histórico de faturas, status do acesso.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Key, ExternalLink, Copy, CheckCircle2, Clock, Receipt, Loader2,
  ShieldCheck, AlertTriangle, Zap, ArrowLeft, RefreshCw, Calendar,
} from "lucide-react";
import Link from "next/link";

interface Entitlement {
  id: string;
  status: "active" | "revoked" | "expired";
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  product_tiers: {
    id: string;
    tier_name: string;
    price_monthly: number | null;
    price_lifetime: number | null;
    has_consultancy: boolean;
    calendar_link: string | null;
    saas_products: {
      id: string;
      name: string;
      description: string;
      logo_url: string | null;
      delivery_method: string;
      magic_link_url: string | null;
      support_email: string | null;
      support_whatsapp: string | null;
      profiles: { full_name: string; avatar_url: string | null };
    };
  } | null;
  subscription_keys: { key_value: string; created_at: string } | null;
}

interface Invoice {
  id: string;
  created_at: string;
  amount_gross: number;
  status: string;
  stripe_invoice_id: string | null;
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
    <button onClick={copy} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors">
      {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:  { label: "Ativo",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    revoked: { label: "Revogado", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
    expired: { label: "Expirado", cls: "bg-zinc-800 text-zinc-500 border-zinc-700" },
  };
  const s = map[status] ?? map.expired;
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${s.cls}`}>{s.label}</span>
  );
}

export default function MemberAreaPage() {
  const { produto } = useParams() as { produto: string };
  const router      = useRouter();
  const supabase    = createClient();

  const [loading,      setLoading]      = useState(true);
  const [entitlement,  setEntitlement]  = useState<Entitlement | null>(null);
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [magicLoading, setMagicLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const uid = session.user.id;

      // Buscar entitlement ativo para este produto (produto = product_tier_id ou product_id)
      const { data: ent } = await supabase
        .from("entitlements")
        .select(`
          id, status, created_at, revoked_at, revoke_reason,
          product_tiers:product_tier_id (
            id, tier_name, price_monthly, price_lifetime, has_consultancy, calendar_link,
            saas_products:product_id (
              id, name, description, logo_url, delivery_method, magic_link_url,
              support_email, support_whatsapp,
              profiles:vendor_id (full_name, avatar_url)
            )
          ),
          subscription_keys:id (key_value, created_at)
        `)
        .eq("user_id", uid)
        .eq("product_tier_id", produto)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ent) {
        // Tentar como product_id direto
        const { data: ent2 } = await supabase
          .from("entitlements")
          .select(`
            id, status, created_at, revoked_at, revoke_reason,
            product_tiers:product_tier_id (
              id, tier_name, price_monthly, price_lifetime, has_consultancy, calendar_link,
              saas_products:product_id (
                id, name, description, logo_url, delivery_method, magic_link_url,
                support_email, support_whatsapp,
                profiles:vendor_id (full_name, avatar_url)
              )
            ),
            subscription_keys:id (key_value, created_at)
          `)
          .eq("user_id", uid)
          .eq("product_id", produto)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!ent2) {
          toast.error("Acesso não encontrado para este produto.");
          router.push("/dashboard");
          return;
        }
        setEntitlement(ent2 as unknown as Entitlement);
      } else {
        setEntitlement(ent as unknown as Entitlement);
      }

      // Histórico de faturas
      const { data: inv } = await supabase
        .from("orders")
        .select("id,created_at,amount_gross,status,stripe_invoice_id")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(10);

      setInvoices((inv ?? []) as Invoice[]);
      setLoading(false);
    })();
  }, [produto]);

  const requestMagicLink = async () => {
    const product = entitlement?.product_tiers?.saas_products;
    if (!product?.magic_link_url) {
      toast.error("Magic link não disponível para este produto.");
      return;
    }
    setMagicLoading(true);
    try {
      const res = await fetch(product.magic_link_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magic_link_request", timestamp: new Date().toISOString() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.link) {
          window.open(data.link, "_blank");
        } else {
          toast.success("Link enviado para o seu e-mail!");
        }
      } else {
        toast.error("Erro ao solicitar link de acesso.");
      }
    } catch {
      toast.error("Erro de conexão com o serviço.");
    } finally {
      setMagicLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-500" size={28} />
      </div>
    );
  }

  if (!entitlement) return null;

  const product = entitlement.product_tiers?.saas_products;
  const tier    = entitlement.product_tiers;
  const key     = entitlement.subscription_keys?.key_value;
  const isActive = entitlement.status === "active";

  const supportHref = product?.support_whatsapp
    ? `https://wa.me/${product.support_whatsapp.replace(/\D/g, "")}?text=Olá!%20Preciso%20de%20ajuda%20com%20${encodeURIComponent(product?.name ?? "")}`
    : product?.support_email ? `mailto:${product.support_email}` : null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

        {/* Back */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <span className="text-zinc-500 text-sm">Área do Membro</span>
        </div>

        {/* Header do produto */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-start gap-5">
            <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
              {product?.logo_url
                ? <img src={product.logo_url} alt="" className="h-full w-full object-cover" />
                : <Zap className="m-auto mt-5 text-emerald-400" size={24} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">{product?.name}</h1>
                <StatusBadge status={entitlement.status} />
              </div>
              <p className="text-zinc-500 text-sm mt-1">{tier?.tier_name} · por {(product?.profiles as {full_name?: string} | null)?.full_name}</p>
              <p className="text-zinc-600 text-sm mt-2 line-clamp-2">{product?.description}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-zinc-600" />
              Desde {new Date(String(entitlement.created_at ?? "")).toLocaleDateString("pt-BR")}
            </div>
            {isActive && (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <ShieldCheck size={12} />
                Acesso Ativo
              </div>
            )}
            {!isActive && (
              <div className="flex items-center gap-1.5 text-red-400">
                <AlertTriangle size={12} />
                {entitlement.revoke_reason ?? "Acesso encerrado"}
              </div>
            )}
          </div>
        </motion.div>

        {/* Acesso — chave e magic link */}
        {isActive && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
            <h2 className="font-semibold text-zinc-200 flex items-center gap-2">
              <Key size={16} className="text-emerald-400" /> Seu Acesso
            </h2>

            {/* Chave de API */}
            {key && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Chave de Acesso / API Key</p>
                <div className="flex items-center gap-2 bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                  <code className="flex-1 text-sm text-emerald-300 font-mono truncate">{key}</code>
                  <CopyButton text={key} />
                </div>
                <p className="text-xs text-zinc-700">Não compartilhe esta chave. Use-a para autenticar na plataforma.</p>
              </div>
            )}

            {/* Magic Link */}
            {product?.magic_link_url && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Acesso Rápido</p>
                <button
                  onClick={requestMagicLink}
                  disabled={magicLoading}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 transition-colors disabled:opacity-50">
                  {magicLoading
                    ? <Loader2 size={15} className="animate-spin" />
                    : <ExternalLink size={15} className="text-emerald-400" />}
                  {magicLoading ? "Gerando link..." : "Acessar Plataforma com Magic Link"}
                </button>
              </div>
            )}

            {/* Consultoria */}
            {tier?.has_consultancy && tier.calendar_link && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Consultoria Incluída</p>
                <a href={tier.calendar_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-300 transition-colors">
                  <Calendar size={15} />
                  Agendar Consultoria
                </a>
              </div>
            )}

            {/* Suporte */}
            {supportHref && (
              <div className="pt-2 border-t border-white/5">
                <a href={supportHref} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1.5">
                  <ExternalLink size={11} />
                  Precisa de ajuda? Fale com o suporte do produto
                </a>
              </div>
            )}
          </motion.div>
        )}

        {/* Histórico de Faturas */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <h2 className="font-semibold text-zinc-200 flex items-center gap-2">
            <Receipt size={16} className="text-zinc-400" /> Histórico de Faturas
          </h2>

          {invoices.length === 0 ? (
            <p className="text-zinc-600 text-sm">Nenhuma fatura encontrada.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Receipt size={14} className="text-zinc-600 shrink-0" />
                    <div>
                      <p className="text-zinc-300">R$ {Number(inv.amount_gross ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-zinc-600">{new Date(String(inv.created_at ?? "")).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${inv.status === "paid" || inv.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-500 border-zinc-700"}`}>
                      {inv.status === "paid" || inv.status === "completed" ? "Pago" : inv.status}
                    </span>
                    {inv.stripe_invoice_id && (
                      <a href={`https://dashboard.stripe.com/invoices/${inv.stripe_invoice_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-zinc-600 hover:text-zinc-400 transition-colors">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Acesso revogado — mensagem */}
        {!isActive && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6 flex items-start gap-4">
            <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium">Acesso não disponível</p>
              <p className="text-zinc-500 text-sm mt-1">
                {entitlement.revoke_reason ?? "Seu acesso foi encerrado. Verifique seu plano ou entre em contato com o suporte."}
              </p>
              <Link href="/explorar" className="text-emerald-400 text-sm mt-3 inline-flex items-center gap-1.5 hover:underline">
                Ver outros produtos <ExternalLink size={12} />
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
