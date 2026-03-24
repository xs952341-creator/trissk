"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import { getErrorMessage } from "@/lib/errors";
import {
  Loader2, Save, Webhook, Key, Zap, Globe, ShieldCheck,
  Copy, RefreshCw, ExternalLink, CheckCircle2, XCircle,
  Info, ChevronLeft, Eye, EyeOff,
} from "lucide-react";

type DeliveryMethod = "NATIVE_API" | "NO_CODE_ZAPIER" | "KEYS";
type DeliveryType = "saas" | "file" | "course" | "api" | "license";

interface Product {
  id: string;
  name: string;
  vendor_id: string;
  delivery_method: DeliveryMethod;
  delivery_type: DeliveryType | null;
  provisioning_webhook_url: string | null;
  revocation_webhook_url: string | null;
  zapier_webhook_url: string | null;
  webhook_signing_secret: string | null;
  magic_link_url: string | null;
  support_email: string | null;
  approval_status: string;
}

interface TestResult {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  http_status?: number;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25 transition-all ${readOnly ? "opacity-60 cursor-default" : ""}`}
    />
  );
}

function SectionCard({ title, subtitle, icon, children }: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <span className="text-violet-400">{icon}</span>
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  saas: "SaaS (Acesso a software)",
  api: "API (Chave de acesso)",
  license: "Licença de software",
  file: "Arquivo digital",
  course: "Curso / Conteúdo",
};

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  NATIVE_API: "API Nativa (Webhook próprio)",
  NO_CODE_ZAPIER: "No-Code (Zapier / Make)",
  KEYS: "Chaves manuais (sem integração)",
};

export default function IntegrationPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle", message: "" });
  const [testRevResult, setTestRevResult] = useState<TestResult>({ status: "idle", message: "" });

  // Form state
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("saas");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("NATIVE_API");
  const [provisionUrl, setProvisionUrl] = useState("");
  const [revocationUrl, setRevocationUrl] = useState("");
  const [zapierUrl, setZapierUrl] = useState("");
  const [magicLink, setMagicLink] = useState("");
  const [signingSecret, setSigningSecret] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.push("/login"); return; }

      const { data: p } = await supabase
        .from("saas_products")
        .select("id,name,vendor_id,delivery_method,delivery_type,provisioning_webhook_url,revocation_webhook_url,zapier_webhook_url,webhook_signing_secret,magic_link_url,support_email,approval_status")
        .eq("id", productId)
        .maybeSingle();

      if (!p || p.vendor_id !== session.session.user.id) {
        router.push("/vendor");
        return;
      }

      setProduct(p as Product);
      setDeliveryType((p.delivery_type as DeliveryType) ?? "saas");
      setDeliveryMethod((p.delivery_method as DeliveryMethod) ?? "NATIVE_API");
      setProvisionUrl(p.provisioning_webhook_url ?? "");
      setRevocationUrl(p.revocation_webhook_url ?? "");
      setZapierUrl(p.zapier_webhook_url ?? "");
      setMagicLink(p.magic_link_url ?? "");
      setSigningSecret(p.webhook_signing_secret ?? "");
      setLoading(false);
    };
    load();
  }, [productId]);

  const generateSecret = () => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setSigningSecret(Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(""));
  };

  const copySecret = () => {
    navigator.clipboard.writeText(signingSecret);
    toast.success("Segredo copiado!");
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("saas_products")
      .update({
        delivery_type: deliveryType,
        delivery_method: deliveryMethod,
        provisioning_webhook_url: provisionUrl || null,
        revocation_webhook_url: revocationUrl || null,
        zapier_webhook_url: zapierUrl || null,
        magic_link_url: magicLink || null,
        webhook_signing_secret: signingSecret || null,
      })
      .eq("id", productId);

    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar: " + getErrorMessage(error));
    } else {
      toast.success("Integração salva com sucesso!");
    }
  };

  const testWebhook = async (type: "provision" | "revoke") => {
    const url = type === "provision" ? provisionUrl : revocationUrl;
    if (!url) { toast.error("Informe a URL primeiro."); return; }

    const setter = type === "provision" ? setTestResult : setTestRevResult;
    setter({ status: "loading", message: "Enviando payload de teste..." });

    try {
      const res = await fetch("/api/provision/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          type,
          product_id: productId,
          signing_secret: signingSecret || undefined,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setter({ status: "success", message: `Sucesso! HTTP ${data.http_status}`, http_status: data.http_status });
      } else {
        setter({ status: "error", message: data.error ?? `HTTP ${data.http_status ?? res.status}` });
      }
    } catch (e: unknown) {
      setter({ status: "error", message: getErrorMessage(e) ?? "Erro de conexão" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-zinc-500" size={20} />
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="mx-auto max-w-3xl px-5 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/vendor" className="text-zinc-500 hover:text-zinc-300 transition">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <div className="text-xs text-zinc-500">Vendor / Produtos / Integração</div>
            <h1 className="text-xl font-semibold mt-0.5">{product.name}</h1>
          </div>
        </div>

        {/* Tipo de entrega */}
        <SectionCard
          title="Tipo de Produto"
          subtitle="Define como a entrega funciona após o pagamento"
          icon={<Globe size={15} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.entries(DELIVERY_TYPE_LABELS) as [DeliveryType, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDeliveryType(key)}
                className={`text-left rounded-xl px-4 py-3 border text-sm transition-all ${
                  deliveryType === key
                    ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                    : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Método de integração */}
        <SectionCard
          title="Método de Integração"
          subtitle="Como o acesso é provisionado automaticamente"
          icon={<Webhook size={15} />}
        >
          <div className="space-y-2">
            {(Object.entries(METHOD_LABELS) as [DeliveryMethod, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDeliveryMethod(key)}
                className={`w-full text-left rounded-xl px-4 py-3 border text-sm transition-all ${
                  deliveryMethod === key
                    ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                    : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Webhooks — API Nativa */}
        {deliveryMethod === "NATIVE_API" && (
          <SectionCard
            title="Webhooks de Provisionamento"
            subtitle="URLs chamadas automaticamente após compra e cancelamento"
            icon={<Zap size={15} />}
          >
            <div className="space-y-4">
              <div>
                <Label>URL de Provisionamento (POST)</Label>
                <p className="text-xs text-zinc-600 mb-2">Chamada quando uma compra é confirmada — crie o usuário no seu SaaS aqui.</p>
                <Input
                  value={provisionUrl}
                  onChange={setProvisionUrl}
                  placeholder="https://seu-saas.com/api/webhooks/provision"
                />
                <button
                  onClick={() => testWebhook("provision")}
                  disabled={testResult.status === "loading"}
                  className="mt-2 flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  {testResult.status === "loading" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : testResult.status === "success" ? (
                    <CheckCircle2 size={12} className="text-green-400" />
                  ) : testResult.status === "error" ? (
                    <XCircle size={12} className="text-red-400" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {testResult.status === "idle" ? "Testar webhook" : testResult.message}
                </button>
              </div>

              <div>
                <Label>URL de Revogação (POST)</Label>
                <p className="text-xs text-zinc-600 mb-2">Chamada quando assinatura é cancelada — remova o acesso do usuário aqui.</p>
                <Input
                  value={revocationUrl}
                  onChange={setRevocationUrl}
                  placeholder="https://seu-saas.com/api/webhooks/revoke"
                />
                <button
                  onClick={() => testWebhook("revoke")}
                  disabled={testRevResult.status === "loading"}
                  className="mt-2 flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  {testRevResult.status === "loading" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : testRevResult.status === "success" ? (
                    <CheckCircle2 size={12} className="text-green-400" />
                  ) : testRevResult.status === "error" ? (
                    <XCircle size={12} className="text-red-400" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {testRevResult.status === "idle" ? "Testar revogação" : testRevResult.message}
                </button>
              </div>

              {/* Magic link */}
              <div>
                <Label>Link de Acesso (Magic Link ou Login URL)</Label>
                <p className="text-xs text-zinc-600 mb-2">URL exibida para o comprador acessar o produto após a compra.</p>
                <Input
                  value={magicLink}
                  onChange={setMagicLink}
                  placeholder="https://app.seu-saas.com/login"
                />
              </div>
            </div>
          </SectionCard>
        )}

        {/* Zapier / No-code */}
        {deliveryMethod === "NO_CODE_ZAPIER" && (
          <SectionCard
            title="Zapier / Make Integration"
            subtitle="Dispara um webhook para automações no-code"
            icon={<Zap size={15} />}
          >
            <div className="space-y-4">
              <div>
                <Label>URL do Webhook Zapier / Make</Label>
                <p className="text-xs text-zinc-600 mb-2">Cole a URL do seu Zap ou Scenario aqui.</p>
                <Input
                  value={zapierUrl}
                  onChange={setZapierUrl}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                />
              </div>
              <div>
                <Label>Link de Acesso ao Produto</Label>
                <Input
                  value={magicLink}
                  onChange={setMagicLink}
                  placeholder="https://app.seu-saas.com/login"
                />
              </div>
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 text-xs text-amber-300/80 space-y-1">
                <p className="font-medium text-amber-300">Como configurar no Zapier:</p>
                <p>1. Crie um Zap com trigger "Catch Hook"</p>
                <p>2. Cole a URL gerada acima neste campo</p>
                <p>3. Adicione ações para criar o usuário no seu SaaS</p>
                <p>4. O payload incluirá: email, nome, product_id, tier_id, invoice_id</p>
                <p className="mt-2 font-medium text-amber-300">Passo 5 — Confirmar provisionamento (recomendado):</p>
                <p>Adicione um último passo no Zap chamando:</p>
                <p className="font-mono bg-black/30 p-1 rounded text-zinc-300 break-all">
                  POST {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/zapier-callback
                </p>
                <p>Com os campos: token (seu signing secret), product_id, user_email, external_id, status="success"</p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* KEYS — manual */}
        {deliveryMethod === "KEYS" && (
          <SectionCard
            title="Entrega por Chaves"
            subtitle="Você envia chaves/licenças manualmente por email"
            icon={<Key size={15} />}
          >
            <div className="rounded-xl bg-zinc-900 border border-white/10 p-4 text-xs text-zinc-400 space-y-2">
              <p>Neste modo, o sistema envia um email de confirmação ao comprador.</p>
              <p>Você receberá uma notificação e deverá enviar a chave/licença manualmente.</p>
              <p className="text-zinc-500">Para automatizar, mude para API Nativa ou Zapier.</p>
            </div>
            <div className="mt-2">
              <Label>Link de Acesso (opcional)</Label>
              <Input
                value={magicLink}
                onChange={setMagicLink}
                placeholder="https://app.seu-saas.com/login"
              />
            </div>
          </SectionCard>
        )}

        {/* Webhook Signing Secret */}
        {(deliveryMethod === "NATIVE_API") && (
          <SectionCard
            title="Segurança do Webhook"
            subtitle="Segredo para validar que os eventos vêm da plataforma"
            icon={<ShieldCheck size={15} />}
          >
            <div className="space-y-3">
              <Label>Webhook Signing Secret</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={signingSecret}
                    onChange={(e) => setSigningSecret(e.target.value)}
                    placeholder="whsec_..."
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-zinc-200 text-sm outline-none focus:border-white/25 transition-all"
                  />
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={copySecret}
                  disabled={!signingSecret}
                  className="px-3 rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-40"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={generateSecret}
                  className="px-3 rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-200 transition"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="rounded-xl bg-zinc-900 border border-white/10 p-4 text-xs text-zinc-500 space-y-1">
                <p className="font-medium text-zinc-400 flex items-center gap-1.5">
                  <Info size={11} /> Como validar no seu servidor:
                </p>
                <p>Verifique o header <span className="font-mono text-zinc-300">x-playbook-signature</span></p>
                <p>Valor: <span className="font-mono text-zinc-300">HMAC-SHA256(body, seu_secret)</span></p>
                <p>Rejeite requisições com assinatura inválida ou sem o header.</p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Payload Reference */}
        <SectionCard
          title="Referência de Payload"
          subtitle="JSON enviado para o seu webhook"
          icon={<ExternalLink size={15} />}
        >
          <pre className="text-xs text-zinc-400 bg-zinc-950 border border-white/10 rounded-xl p-4 overflow-x-auto leading-relaxed">
{`// Provisionamento (event: "user.provisioned")
{
  "event": "user.provisioned",
  "buyer": {
    "id": "uuid-do-usuario",
    "email": "comprador@email.com",
    "name": "Nome do Comprador"
  },
  "tier": {
    "id": "uuid-do-tier",
    "name": "Plano Pro"
  },
  "product_id": "uuid-do-produto",
  "invoice_id": "in_stripe_xxx",
  "timestamp": "2025-01-01T00:00:00Z"
}

// Revogação (event: "user.revoked")
{
  "event": "user.revoked",
  "reason": "subscription_canceled",
  "buyer": { "id": "...", "email": "...", "name": "..." },
  "timestamp": "..."
}`}
          </pre>
        </SectionCard>

        {/* Save button */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/vendor"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition"
          >
            ← Voltar ao painel
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2.5 rounded-full transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar integração
          </button>
        </div>
      </div>
    </div>
  );
}
