"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Upload, Check, Loader2,
  Key, Zap, Webhook, ToggleLeft, ToggleRight, Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";


// ── Zod schema ────────────────────────────────────────────────
const schema = z.object({
  name:              z.string().min(3, "Nome deve ter ao menos 3 caracteres.").max(80),
  description:       z.string().min(20, "Descreva o produto em pelo menos 20 caracteres.").max(2000),
  category:          z.string().min(1, "Selecione uma categoria."),
  delivery_method:   z.enum(["KEYS", "NO_CODE_ZAPIER", "NATIVE_API"]),
  provisioning_webhook_url: z.string().url("URL inválida.").optional().or(z.literal("")),
  revocation_webhook_url:   z.string().url("URL inválida.").optional().or(z.literal("")),
  zapier_webhook_url:       z.string().url("URL inválida.").optional().or(z.literal("")),
  support_email:     z.string().email("E-mail de suporte obrigatório e deve ser válido.").min(1, "E-mail de suporte é obrigatório."),
  support_whatsapp:  z.string().optional(),
  allows_affiliates: z.boolean().default(false),
  affiliate_commission_type: z.enum(["ONE_TIME", "RECURRING"]).optional(),
  affiliate_first_month_pct: z.number().min(0).max(80).optional(),
  affiliate_recurring_pct:   z.number().min(0).max(80).optional(),
  fb_pixel_id:       z.string().optional(),
  tiktok_pixel_id:   z.string().optional(),
  // Step 2 price (simplified)
  monthly_price:     z.number().min(1, "Preço mínimo R$ 1.").optional(),
  lifetime_price:    z.number().min(1).optional(),
}).superRefine((v, ctx) => {
  if (!v.monthly_price && !v.lifetime_price) {
    ctx.addIssue({ code: "custom", path: ["monthly_price"], message: "Informe pelo menos um preço (mensal ou vitalício)." });
  }
  if (v.delivery_method === "NATIVE_API" && !v.provisioning_webhook_url) {
    ctx.addIssue({ code: "custom", path: ["provisioning_webhook_url"], message: "URL obrigatória para integração NATIVE_API." });
  }
  if (v.allows_affiliates && v.affiliate_commission_type === "RECURRING" && !v.affiliate_first_month_pct) {
    ctx.addIssue({ code: "custom", path: ["affiliate_first_month_pct"], message: "Informe a comissão do 1º mês." });
  }
});

type FormData = z.infer<typeof schema>;

const CATEGORIES = ["IAs de Conteúdo", "Automação", "Vendas e CRM", "Financeiro", "Produtividade", "Design", "Analytics", "Atendimento"];

const STEPS = [
  { label: "Info Básica",    icon: "1" },
  { label: "Preços",         icon: "2" },
  { label: "Integrações",    icon: "3" },
];

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-red-400 text-xs mt-1.5">⚠ {msg}</p> : null;
}

function Label({ children }: { children?: React.ReactNode }) {
  return <label className="text-zinc-400 text-xs mb-1.5 block tracking-wide">{children}</label>;
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25 transition-all ${className}`}
    />
  );
}

function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props}
      className={`w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25 transition-all resize-none ${className}`}
    />
  );
}

export default function SaaSProductBuilder() {
  const supabase  = createClient();
  const [step,    setStep]    = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [screenshots, setScreenshots]   = useState<string[]>([]);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors, isValid },
    trigger,
  } = useForm<FormData>({
    resolver:      zodResolver(schema),
    mode:          "onChange",
    defaultValues: {
      delivery_method:           "NATIVE_API",
      allows_affiliates:         false,
      affiliate_commission_type: "ONE_TIME",
    },
  });

  const deliveryMethod     = watch("delivery_method");
  const allowsAffiliates   = watch("allows_affiliates");
  const commissionType     = watch("affiliate_commission_type");
  const productType        = watch("monthly_price") ? "subscription" : "lifetime";

  // ── Upload logo to Supabase Storage ─────────────────────
  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    const ext  = file.name.split(".").pop();
    const path = `logos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao fazer upload do logo."); setUploadingLogo(false); return; }
    const { data: url } = supabase.storage.from("product-assets").getPublicUrl(path);
    setLogoUrl(url.publicUrl);
    setUploadingLogo(false);
    toast.success("Logo enviado!");
  };

  // ── Upload screenshot (até 5 imagens) ───────────────────
  const uploadScreenshot = async (file: File) => {
    if (screenshots.length >= 5) { toast.error("Máximo de 5 screenshots."); return; }
    setUploadingScreenshot(true);
    const ext  = file.name.split(".").pop();
    const path = `screenshots/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao fazer upload da screenshot."); setUploadingScreenshot(false); return; }
    const { data: url } = supabase.storage.from("product-assets").getPublicUrl(path);
    setScreenshots(prev => [...prev, url.publicUrl]);
    setUploadingScreenshot(false);
    toast.success("Screenshot adicionada!");
  };

  const removeScreenshot = (idx: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ────────────────────────────────────────────────
  const onSubmit = async (data: FormData) => {
    if (!logoUrl) {
      toast.error("Faça o upload do logo do produto antes de continuar.");
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado.");

      // ── KYC check: Stripe Connect deve estar conectado ──────────────────────
      const { data: prof } = await supabase
        .from("profiles")
        .select("stripe_connect_onboarded, fiscal_mode, fiscal_terms_accepted_at")
        .eq("id", session.user.id)
        .single();

      if (!prof?.stripe_connect_onboarded) {
        toast.error("Conecte sua conta Stripe antes de publicar um produto.", { description: "Acesse Configurações → Stripe Connect." });
        setSaving(false);
        return;
      }

      // ── Fiscal check: deve ter configurado o modo fiscal ───────────────────
      if (!prof?.fiscal_terms_accepted_at) {
        toast.error("Configure sua emissão fiscal antes de publicar.", { description: "Acesse Fiscal → Configuração para definir como emitirá NF-e." });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("saas_products").insert({
        vendor_id:                session.user.id,
        name:                     data.name,
        description:              data.description,
        category:                 data.category,
        logo_url:                 logoUrl,
        screenshots:              screenshots,
        delivery_method:          data.delivery_method,
        provisioning_webhook_url: data.provisioning_webhook_url || null,
        revocation_webhook_url:   data.revocation_webhook_url   || null,
        zapier_webhook_url:       data.zapier_webhook_url       || null,
        support_email:            data.support_email            || null,
        support_whatsapp:         data.support_whatsapp         || null,
        allows_affiliates:        data.allows_affiliates,
        affiliate_commission_type: data.allows_affiliates ? data.affiliate_commission_type : null,
        affiliate_first_month_pct: data.allows_affiliates ? (data.affiliate_first_month_pct ?? 0) : 0,
        affiliate_recurring_pct:   data.allows_affiliates && data.affiliate_commission_type === "RECURRING" ? (data.affiliate_recurring_pct ?? 0) : 0,
        fb_pixel_id:              data.fb_pixel_id || null,
        tiktok_pixel_id:          data.tiktok_pixel_id || null,
        approval_status:          "PENDING_REVIEW",
      });

      if (error) throw error;
      toast.success("Produto enviado para revisão! 🎉");
      setTimeout(() => window.location.href = "/vendor/products", 2000);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? "Erro ao salvar produto.");
    } finally { setSaving(false); }
  };

  const nextStep = async () => {
    const fieldsPerStep: (keyof FormData)[][] = [
      ["name", "description", "category", "support_email"],
      ["monthly_price"],
      ["delivery_method"],
    ];
    const valid = await trigger(fieldsPerStep[step] as Parameters<typeof trigger>[0]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold tracking-tight">Cadastrar Produto</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Preencha as informações do seu SaaS</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                i < step ? "bg-emerald-500 text-zinc-950" :
                i === step ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-600"
              }`}>
                {i < step ? <Check size={12} strokeWidth={3} /> : s.icon}
              </div>
              <span className={`text-xs hidden sm:block transition-colors ${i === step ? "text-zinc-100" : "text-zinc-600"}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-white/10 ml-2" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <AnimatePresence mode="wait">

            {/* ── Step 0: Info Básica ── */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">

                {/* Logo upload */}
                <div>
                  <Label>Logo do Produto</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {logoUrl ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" /> : <Upload size={20} className="text-zinc-600" />}
                    </div>
                    <div>
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                        <span className="inline-flex items-center gap-1.5 text-sm bg-zinc-800 border border-white/10 rounded-full px-4 py-2 hover:bg-zinc-700 transition-colors">
                          {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                          {uploadingLogo ? "Enviando..." : "Escolher Imagem"}
                        </span>
                      </label>
                      <p className="text-zinc-700 text-xs mt-1.5">PNG, JPG até 2MB</p>
                    </div>
                  </div>
                </div>

                {/* Screenshots */}
                <div>
                  <Label>Screenshots do Produto <span className="text-zinc-600 font-normal">(até 5 imagens)</span></Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {screenshots.map((url, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/10 aspect-video bg-zinc-900">
                        <img src={url} alt={`screenshot ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(idx)}
                          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-red-400 text-xs font-medium">Remover</span>
                        </button>
                      </div>
                    ))}
                    {screenshots.length < 5 && (
                      <label className="cursor-pointer rounded-xl border border-dashed border-white/20 aspect-video bg-zinc-900/40 flex flex-col items-center justify-center hover:border-zinc-500 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && uploadScreenshot(e.target.files[0])}
                        />
                        {uploadingScreenshot
                          ? <Loader2 size={16} className="animate-spin text-zinc-500" />
                          : <><Upload size={16} className="text-zinc-600 mb-1" /><span className="text-zinc-600 text-xs">Adicionar</span></>
                        }
                      </label>
                    )}
                  </div>
                  <p className="text-zinc-700 text-xs mt-1.5">Screenshots aumentam a taxa de conversão. PNG/JPG, aspect 16:9 recomendado.</p>
                </div>

                <div>
                  <Label>Nome do Produto *</Label>
                  <Input {...register("name")} placeholder="Ex: AI Script Writer Pro" />
                  <FieldError msg={errors.name?.message} />
                </div>

                <div>
                  <Label>Descrição *</Label>
                  <Textarea {...register("description")} rows={4} placeholder="Descreva o que seu software faz, para quem é e quais problemas resolve..." />
                  <FieldError msg={errors.description?.message} />
                </div>

                <div>
                  <Label>Categoria *</Label>
                  <select {...register("category")}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-zinc-200 text-sm outline-none focus:border-white/25">
                    <option value="">Selecione...</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <FieldError msg={errors.category?.message} />
                </div>

                <div>
                  <Label>E-mail de Suporte *</Label>
                  <Input {...register("support_email")} type="email" placeholder="suporte@seusite.com" />
                  <FieldError msg={errors.support_email?.message} />
                </div>

                <div>
                  <Label>WhatsApp de Suporte</Label>
                  <Input {...register("support_whatsapp")} placeholder="+55 11 99999-9999" />
                </div>
              </motion.div>
            )}

            {/* ── Step 1: Preços ── */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">

                <div>
                  <Label>Preço Mensal (R$)</Label>
                  <Input {...register("monthly_price", { valueAsNumber: true })} type="number" min="1" step="0.01" placeholder="97" />
                  <p className="text-zinc-700 text-xs mt-1">Deixe em branco para não oferecer plano mensal</p>
                </div>

                <div>
                  <Label>Preço Vitalício (R$)</Label>
                  <Input {...register("lifetime_price", { valueAsNumber: true })} type="number" min="1" step="0.01" placeholder="297" />
                  <p className="text-zinc-700 text-xs mt-1">Opcional — pagamento único com acesso permanente</p>
                </div>

                {/* Tracking pixels */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
                  <p className="text-zinc-400 text-xs font-medium flex items-center gap-1.5"><Zap size={11} /> Pixels de Rastreamento (Opcional)</p>
                  <div>
                    <Label>ID do Meta/Facebook Pixel</Label>
                    <Input {...register("fb_pixel_id")} placeholder="123456789012345" />
                  </div>
                  <div>
                    <Label>ID do TikTok Pixel</Label>
                    <Input {...register("tiktok_pixel_id")} placeholder="CXXXXXXXXXXXXXXXXXX" />
                  </div>
                </div>

                {/* Affiliate section */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-zinc-200 text-sm font-medium">Programa de Afiliados</p>
                      <p className="text-zinc-600 text-xs mt-0.5">Permita que afiliados vendam este produto</p>
                    </div>
                    <Controller name="allows_affiliates" control={control} render={({ field }) => (
                      <button type="button" onClick={() => field.onChange(!field.value)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${field.value ? "bg-emerald-500" : "bg-zinc-700"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${field.value ? "translate-x-5" : ""}`} />
                      </button>
                    )} />
                  </div>

                  <AnimatePresence>
                    {allowsAffiliates && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="space-y-4 pt-2">
                          {/* Commission type — only for subscription products */}
                          <div>
                            <Label>Tipo de Comissão</Label>
                            <div className="flex gap-2">
                              {(["ONE_TIME", "RECURRING"] as const).map((type) => (
                                <button key={type} type="button"
                                  onClick={() => setValue("affiliate_commission_type", type)}
                                  className={`flex-1 rounded-xl border py-2.5 text-xs font-medium transition-all ${
                                    commissionType === type ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-zinc-600 hover:text-zinc-400"
                                  }`}>
                                  {type === "ONE_TIME" ? "Só na 1ª Mensalidade" : "Recorrente (todo mês)"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>Comissão 1º Mês (%)</Label>
                              <Input {...register("affiliate_first_month_pct", { valueAsNumber: true })} type="number" min="0" max="80" placeholder="50" />
                              <FieldError msg={errors.affiliate_first_month_pct?.message} />
                            </div>
                            {commissionType === "RECURRING" && (
                              <div>
                                <Label>Comissão Renovações (%)</Label>
                                <Input {...register("affiliate_recurring_pct", { valueAsNumber: true })} type="number" min="0" max="80" placeholder="10" />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Integrações ── */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">

                <div>
                  <Label>Método de Entrega *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "KEYS",           icon: <Key size={16} />,     color: "amber",  label: "Chaves",  desc: "Entrega chaves manuais" },
                      { value: "NO_CODE_ZAPIER", icon: <Zap size={16} />,     color: "violet", label: "Zapier",  desc: "Automação no-code" },
                      { value: "NATIVE_API",     icon: <Webhook size={16} />, color: "emerald",label: "API",     desc: "Webhook nativo" },
                    ] as const).map((opt) => (
                      <button key={opt.value} type="button"
                        onClick={() => setValue("delivery_method", opt.value)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          deliveryMethod === opt.value
                            ? opt.color === "amber"   ? "border-amber-500/50 bg-amber-500/10"
                            : opt.color === "violet"  ? "border-violet-500/50 bg-violet-500/10"
                            :                           "border-emerald-500/50 bg-emerald-500/10"
                            : "border-white/10 hover:border-white/20"
                        }`}>
                        <div className={`mb-2 ${
                          deliveryMethod === opt.value
                            ? opt.color === "amber" ? "text-amber-400" : opt.color === "violet" ? "text-violet-400" : "text-emerald-400"
                            : "text-zinc-600"
                        }`}>{opt.icon}</div>
                        <p className="text-zinc-200 text-xs font-medium">{opt.label}</p>
                        <p className="text-zinc-600 text-[10px] mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {deliveryMethod === "NATIVE_API" && (
                  <div className="space-y-4">
                    <div>
                      <Label>URL de Provisionamento *</Label>
                      <Input {...register("provisioning_webhook_url")} placeholder="https://seusite.com/webhooks/provision" />
                      <FieldError msg={errors.provisioning_webhook_url?.message} />
                    </div>
                    <div>
                      <Label>URL de Revogação</Label>
                      <Input {...register("revocation_webhook_url")} placeholder="https://seusite.com/webhooks/revoke" />
                      <FieldError msg={errors.revocation_webhook_url?.message} />
                    </div>
                    <p className="text-zinc-600 text-xs flex items-center gap-1.5"><Info size={11} /> Ambas as URLs devem retornar status 200 para serem aprovadas.</p>
                  </div>
                )}

                {deliveryMethod === "NO_CODE_ZAPIER" && (
                  <div>
                    <Label>URL do Zapier / Make *</Label>
                    <Input {...register("zapier_webhook_url")} placeholder="https://hooks.zapier.com/hooks/catch/..." />
                    <FieldError msg={errors.zapier_webhook_url?.message} />
                  </div>
                )}

                {/* Terms reminder */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    Ao enviar, você confirma que leu e concorda com nossos{" "}
                    <a href="/termos" target="_blank" className="text-emerald-500 hover:underline">Termos de Uso</a>
                    {" "}e assume integral responsabilidade fiscal pela emissão de Notas Fiscais ao consumidor final.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            <button type="button" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-0">
              <ChevronLeft size={16} /> Voltar
            </button>

            {step < STEPS.length - 1 ? (
              <button type="button" onClick={nextStep}
                className="flex items-center gap-1.5 bg-white text-zinc-950 rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-zinc-200 transition-colors">
                Próximo <ChevronRight size={16} />
              </button>
            ) : (
              <button type="submit" disabled={saving}
                className="flex items-center gap-1.5 bg-emerald-500 text-zinc-950 rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                {saving ? "Enviando..." : "Enviar para Revisão"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
