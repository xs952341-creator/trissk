"use client";
/**
 * components/vendor/SmartProductWizard.tsx
 * Wizard de configuração de entrega e afiliados para produtos do vendor.
 *
 * Suporta 3 tipos de produto (delivery_type):
 *  - "saas"      → campo SSO URL + SSO Secret
 *  - "file"      → upload de ficheiro para Supabase Storage (bucket secure_products)
 *  - "community" → campo de link para grupo privado (Discord, Telegram, etc.)
 *
 * Toggle de afiliados com slider de comissão (5–80%).
 *
 * Integra com:
 *  - /api/vendor/products/[id]/landing (PATCH) — guarda no Supabase
 *  - Supabase Storage (bucket: secure_products) — upload do ficheiro
 *
 * Não depende de dados mock — todos os campos vão para saas_products.
 */

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code, Book, Users, Link as LinkIcon, UploadCloud,
  DollarSign, ToggleLeft, ToggleRight, CheckCircle2,
  Eye, EyeOff, Loader2, AlertCircle, Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type DeliveryType = "saas" | "file" | "community";

interface SmartProductWizardProps {
  productId: string;
  /** Valores iniciais (vêm do banco via Server Component pai) */
  initial?: {
    deliveryType?:       DeliveryType;
    ssoUrl?:             string;
    ssoSecret?:          string;
    magicLinkUrl?:       string;
    affiliatesEnabled?:  boolean;
    commissionPercent?:  number;
    filePath?:           string;
  };
  onSaved?: () => void;
}

// ── Constante de tipos ─────────────────────────────────────────────────────────
const DELIVERY_OPTIONS: { value: DeliveryType; label: string; sub: string; icon: React.ReactNode }[] = [
  { value: "saas",      label: "Software (SaaS)",   sub: "Acesso via SSO",       icon: <Code  size={22} /> },
  { value: "file",      label: "E-book / Ficheiro", sub: "Download protegido",   icon: <Book  size={22} /> },
  { value: "community", label: "Comunidade",        sub: "Grupo privado",        icon: <Users size={22} /> },
];

export default function SmartProductWizard({
  productId,
  initial = {},
  onSaved,
}: SmartProductWizardProps) {
  const supabase = createClient();

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [deliveryType,      setDeliveryType]      = useState<DeliveryType>(initial.deliveryType ?? "saas");
  const [ssoUrl,            setSsoUrl]            = useState(initial.ssoUrl ?? "");
  const [ssoSecret,         setSsoSecret]         = useState(initial.ssoSecret ?? "");
  const [showSecret,        setShowSecret]        = useState(false);
  const [magicLinkUrl,      setMagicLinkUrl]      = useState(initial.magicLinkUrl ?? "");
  const [affiliatesEnabled, setAffiliatesEnabled] = useState(initial.affiliatesEnabled ?? false);
  const [commission,        setCommission]        = useState(initial.commissionPercent ?? 30);
  const [saving,            setSaving]            = useState(false);
  const [uploading,         setUploading]         = useState(false);
  const [uploadedPath,      setUploadedPath]      = useState(initial.filePath ?? "");
  const [error,             setError]             = useState<string | null>(null);
  const [success,           setSuccess]           = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Upload de ficheiro ──────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_MB = 50;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Ficheiro demasiado grande. Máximo: ${MAX_MB}MB.`);
      return;
    }

    setUploading(true);
    setError(null);

    const ext      = file.name.split(".").pop() ?? "pdf";
    const filePath = `${productId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("secure_products")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setError(`Erro no upload: ${uploadErr.message}`);
      setUploading(false);
      return;
    }

    setUploadedPath(filePath);
    setUploading(false);
  };

  // ── Guardar ──────────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validações
    if (deliveryType === "saas" && !ssoUrl.startsWith("https://")) {
      setError("A URL de SSO deve começar com https://");
      return;
    }
    if (deliveryType === "saas" && ssoSecret.length < 32) {
      setError("O SSO Secret deve ter no mínimo 32 caracteres (256 bits) para o algoritmo criptográfico HS256.");
      return;
    }
    if (deliveryType === "file" && !uploadedPath) {
      setError("Faça o upload do ficheiro antes de guardar.");
      return;
    }
    if (deliveryType === "community" && !magicLinkUrl.startsWith("https://")) {
      setError("O link da comunidade deve começar com https://");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      delivery_type:                deliveryType,
      affiliates_enabled:           affiliatesEnabled,
      affiliate_commission_percent: affiliatesEnabled ? commission : 0,
    };

    if (deliveryType === "saas") {
      payload.sso_url    = ssoUrl.trim();
      payload.sso_secret = ssoSecret.trim();
    } else if (deliveryType === "file") {
      payload.file_path = uploadedPath;
    } else if (deliveryType === "community") {
      payload.magic_link_url = magicLinkUrl.trim();
    }

    const { error: saveErr } = await supabase
      .from("saas_products")
      .update(payload)
      .eq("id", productId);

    setSaving(false);

    if (saveErr) {
      setError(`Erro ao guardar: ${saveErr.message}`);
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3_000);
    onSaved?.();
  };

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
        <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
          Configuração de Entrega
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          O Playbook Hub garante a entrega automaticamente ao comprador.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-8">

        {/* 1. Tipo de produto */}
        <section>
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            O que está a vender?
          </p>
          <div className="grid grid-cols-3 gap-3">
            {DELIVERY_OPTIONS.map(opt => {
              const active = deliveryType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setDeliveryType(opt.value); setError(null); }}
                  className="flex flex-col items-center text-center rounded-xl p-4 transition-all"
                  style={{
                    background:  active ? "rgba(34,212,160,0.08)" : "var(--surface-2)",
                    border:      `1px solid ${active ? "rgba(34,212,160,0.35)" : "var(--border-subtle)"}`,
                    color:       active ? "var(--brand)" : "var(--text-muted)",
                  }}
                >
                  <span className="mb-2">{opt.icon}</span>
                  <span className="text-xs font-bold leading-tight">{opt.label}</span>
                  <span className="text-[10px] mt-0.5 opacity-70">{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Configuração de entrega (dinâmica) */}
        <AnimatePresence mode="wait">
          <motion.section
            key={deliveryType}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} style={{ color: "var(--brand)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--brand)" }}>
                Entrega Garantida pela Plataforma
              </span>
            </div>

            {/* SaaS — SSO */}
            {deliveryType === "saas" && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    URL de Login SSO *
                  </label>
                  <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
                    <span className="flex items-center px-3" style={{ background: "var(--surface-3)", color: "var(--text-faint)" }}>
                      <LinkIcon size={13} />
                    </span>
                    <input
                      type="url"
                      required
                      value={ssoUrl}
                      onChange={e => setSsoUrl(e.target.value)}
                      placeholder="https://app.seusaas.com/auth/sso"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                    O comprador será redirecionado para este URL com um token JWT seguro (expira em 5 min).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    SSO Secret (mínimo 16 caracteres) *
                  </label>
                  <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
                    <input
                      type={showSecret ? "text" : "password"}
                      required
                      minLength={32}
                      value={ssoSecret}
                      onChange={e => setSsoSecret(e.target.value)}
                      placeholder="Segredo partilhado para validar o token"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none font-mono"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(v => !v)}
                      className="px-3 transition-colors"
                      style={{ color: "var(--text-faint)", background: "var(--surface-3)" }}
                    >
                      {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                    Use esta chave no lado do seu servidor para validar o JWT com HS256. Nunca partilhe.
                  </p>
                </div>
              </>
            )}

            {/* File — Upload */}
            {deliveryType === "file" && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.zip,.epub,.mp4,.mp3"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onClick={() => !uploading && fileRef.current?.click()}
                  className="rounded-xl p-8 text-center cursor-pointer transition-all"
                  style={{
                    border:     `2px dashed ${uploadedPath ? "rgba(34,212,160,0.4)" : "var(--border-default)"}`,
                    background: uploadedPath ? "rgba(34,212,160,0.04)" : "var(--surface-3)",
                  }}
                >
                  {uploading ? (
                    <Loader2 size={28} className="animate-spin mx-auto mb-2" style={{ color: "var(--brand)" }} />
                  ) : uploadedPath ? (
                    <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: "var(--brand)" }} />
                  ) : (
                    <UploadCloud size={28} className="mx-auto mb-2" style={{ color: "var(--text-faint)" }} />
                  )}
                  <p className="text-sm font-semibold" style={{ color: uploadedPath ? "var(--brand)" : "var(--text-secondary)" }}>
                    {uploading  ? "A carregar…" :
                     uploadedPath ? "Ficheiro carregado com sucesso!" :
                     "Clique para carregar o ficheiro"}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                    PDF, ZIP, EPUB, MP4, MP3 — máx. 50MB. O comprador recebe um link seguro que expira em 60s.
                  </p>
                </div>
              </div>
            )}

            {/* Community — Link */}
            {deliveryType === "community" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Link da Comunidade *
                </label>
                <input
                  type="url"
                  required
                  value={magicLinkUrl}
                  onChange={e => setMagicLinkUrl(e.target.value)}
                  placeholder="https://discord.gg/seu-servidor"
                  className="input-base text-sm"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                  Discord, Telegram, Slack, Skool, etc. O link só fica visível após pagamento confirmado.
                </p>
              </div>
            )}
          </motion.section>
        </AnimatePresence>

        {/* 3. Programa de afiliados */}
        <section className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-bold flex items-center gap-2"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                <DollarSign size={15} style={{ color: "#22c55e" }} />
                Programa de Afiliados
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Permitir que outros vendam e ganhem comissão.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAffiliatesEnabled(v => !v)}
              className="transition-transform hover:scale-105"
              aria-checked={affiliatesEnabled}
              role="switch"
            >
              {affiliatesEnabled
                ? <ToggleRight size={36} style={{ color: "#22c55e" }} />
                : <ToggleLeft  size={36} style={{ color: "var(--text-faint)" }} />}
            </button>
          </div>

          <AnimatePresence>
            {affiliatesEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl p-4 mt-2"
                  style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                      Comissão do Afiliado
                    </span>
                    <span className="text-xl font-black" style={{ fontFamily: "var(--font-display)", color: "#22c55e" }}>
                      {commission}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    step={5}
                    value={commission}
                    onChange={e => setCommission(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: "#22c55e" }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>5%</span>
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>80%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Erro / Sucesso */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium"
              style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", color: "#fca5a5" }}
              role="alert"
            >
              <AlertCircle size={13} className="shrink-0" />{error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium"
              style={{ background: "rgba(34,212,160,0.07)", border: "1px solid rgba(34,212,160,0.2)", color: "var(--brand)" }}
            >
              <CheckCircle2 size={13} className="shrink-0" />Configuração guardada com sucesso!
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={saving || uploading}
          className="btn-primary w-full py-3.5 text-sm gap-2"
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" />A guardar…</>
            : <><CheckCircle2 size={14} />Guardar Configuração de Entrega</>}
        </button>
      </form>
    </div>
  );
}
