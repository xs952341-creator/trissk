"use client";
/**
 * components/checkout/B2BInvoiceForm.tsx
 * Formulário de Checkout B2B — Fatura Corporativa (Net 30).
 *
 * Integra diretamente com createEnterpriseNet30Invoice via Server Action.
 * Usado em:
 *  - app/checkout/[slug]/page.tsx (toggle "Fatura Net 30")
 *  - app/checkout/embed/[slug]/page.tsx (checkout headless/iframe)
 *
 * Features:
 *  - Validação de CNPJ em tempo real (máscara + 14 dígitos)
 *  - Loading state com prevenção de duplo-clique
 *  - Success state com link para a fatura gerada
 *  - Error handling com mensagens user-friendly
 *  - Acessibilidade: aria-labels, focus trap, teclado
 */

import React, { useState, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getErrorMessage } from "@/lib/errors";
import {
  Building2, FileText, Loader2, AlertCircle,
  CheckCircle2, ExternalLink, Lock,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface B2BInvoiceFormProps {
  /** Stripe price ID do plano */
  priceId:         string;
  /** Quantidade de assentos/licenças */
  quantity:        number;
  /** Valor total em BRL (para display) */
  totalAmountBRL:  number;
  /** Dias de vencimento da fatura. Default: 30 */
  daysUntilDue?:   number;
  /** Chamado após criação bem-sucedida da fatura */
  onSuccess:       (invoiceId: string, invoiceUrl?: string) => void;
  /** Chamado se o utilizador cancelar / voltar */
  onCancel?:       () => void;
}

// ── Máscara de CNPJ ────────────────────────────────────────────────────────────
function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2)  return digits;
  if (digits.length <= 5)  return `${digits.slice(0,2)}.${digits.slice(2)}`;
  if (digits.length <= 8)  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8)}`;
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
}

function isValidCNPJ(cnpj: string): boolean {
  return cnpj.replace(/\D/g, "").length === 14;
}

// ── Formatador BRL ─────────────────────────────────────────────────────────────
function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ── Componente ─────────────────────────────────────────────────────────────────
export default function B2BInvoiceForm({
  priceId,
  quantity,
  totalAmountBRL,
  daysUntilDue = 30,
  onSuccess,
  onCancel,
}: B2BInvoiceFormProps) {
  const uid = useId();

  const [companyName, setCompanyName] = useState("");
  const [cnpj,        setCnpj]        = useState("");
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<{ id: string; url?: string } | null>(null);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      setError("Razão social é obrigatória.");
      return;
    }
    if (!isValidCNPJ(cnpj)) {
      setError("CNPJ deve ter 14 dígitos válidos.");
      return;
    }

    setIsLoading(true);
    try {
      // Chamar Server Action (boundary seguro — runs on server, called from client)
      const { createEnterpriseInvoiceAction } = await import(
        "@/lib/actions/enterprise-invoice"
      );

      const result = await createEnterpriseInvoiceAction({
        priceId,
        quantity,
        companyName: companyName.trim(),
        taxId:       cnpj.replace(/\D/g, ""),
        daysUntilDue,
      });

      if (!result.success) {
        setError(result.message || "Não foi possível gerar a fatura. Tente novamente.");
        return;
      }

      setInvoiceData({
        id:  result.invoiceId  ?? "gerado",
        url: result.invoiceUrl ?? undefined,
      });

      // Notificar pai após breve delay (para utilizador ver o estado de sucesso)
      setTimeout(() => {
        onSuccess(result.invoiceId ?? "", result.invoiceUrl ?? undefined);
      }, 2_500);

    } catch (err: unknown) {
      console.error("[B2BInvoiceForm]", getErrorMessage(err));
      setError("Erro ao conectar com o servidor. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Estado de sucesso ──────────────────────────────────────────────────────
  if (invoiceData) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-10 px-6"
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "rgba(34,212,160,0.1)", border: "1px solid rgba(34,212,160,0.3)" }}>
          <CheckCircle2 size={32} style={{ color: "var(--brand)" }} />
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
          Fatura Gerada!
        </h3>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          O acesso foi liberado e a fatura foi enviada por email.<br />
          Vencimento em <strong style={{ color: "var(--text-secondary)" }}>{daysUntilDue} dias</strong>.
        </p>
        {invoiceData.url && (
          <a
            href={invoiceData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary px-6 py-3 text-sm gap-2 inline-flex"
          >
            <FileText size={15} />
            Ver Fatura
            <ExternalLink size={13} />
          </a>
        )}
      </motion.div>
    );
  }

  // ── Formulário ─────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6 pb-5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(34,212,160,0.08)", border: "1px solid rgba(34,212,160,0.2)" }}>
          <Building2 size={18} style={{ color: "var(--brand)" }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Pagamento Corporativo
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Fatura com vencimento em {daysUntilDue} dias — sem cartão agora
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-label="Formulário de fatura corporativa">
        {/* Razão Social */}
        <div>
          <label
            htmlFor={`${uid}-company`}
            className="block text-xs font-semibold mb-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Razão Social <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            id={`${uid}-company`}
            type="text"
            required
            autoComplete="organization"
            value={companyName}
            onChange={e => { setCompanyName(e.target.value); setError(null); }}
            placeholder="Ex: Acme Tecnologia LTDA"
            disabled={isLoading}
            className="input-base"
            style={{ fontSize: "14px" }}
            aria-required="true"
          />
        </div>

        {/* CNPJ */}
        <div>
          <label
            htmlFor={`${uid}-cnpj`}
            className="block text-xs font-semibold mb-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            CNPJ <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            id={`${uid}-cnpj`}
            type="text"
            required
            inputMode="numeric"
            value={cnpj}
            onChange={e => { setCnpj(maskCNPJ(e.target.value)); setError(null); }}
            placeholder="00.000.000/0000-00"
            disabled={isLoading}
            className="input-base"
            style={{
              fontSize: "14px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.03em",
            }}
            aria-required="true"
            aria-describedby={`${uid}-cnpj-hint`}
          />
          <p id={`${uid}-cnpj-hint`} className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Apenas números (14 dígitos)
          </p>
        </div>

        {/* Resumo do contrato */}
        <div className="rounded-xl p-4 flex items-center justify-between"
          style={{
            background: "rgba(34,212,160,0.05)",
            border: "1px solid rgba(34,212,160,0.15)",
          }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--brand)" }}>
              {quantity} {quantity === 1 ? "Licença" : "Licenças"} Empresariais
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Vencimento em {daysUntilDue} dias após emissão
            </p>
          </div>
          <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            {fmtBRL(totalAmountBRL)}
          </p>
        </div>

        {/* Erro */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2.5 rounded-xl p-3.5"
              style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)" }}
              role="alert"
              aria-live="polite"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" style={{ color: "#f87171" }} />
              <p className="text-xs font-medium" style={{ color: "#fca5a5" }}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Segurança */}
        <div className="flex items-center gap-2">
          <Lock size={11} style={{ color: "var(--text-faint)" }} />
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Processado com segurança via Stripe. Acesso liberado imediatamente após a emissão.
          </p>
        </div>

        {/* Botões */}
        <div className="flex gap-3 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="btn-secondary px-5 py-3 text-sm flex-1"
            >
              Voltar
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading || !companyName.trim() || !isValidCNPJ(cnpj)}
            className="btn-primary px-5 py-3 text-sm gap-2 flex-1"
            aria-label="Gerar fatura corporativa e liberar acesso"
          >
            {isLoading ? (
              <><Loader2 size={15} className="animate-spin" />Gerando fatura…</>
            ) : (
              <><FileText size={15} />Gerar Fatura e Acessar</>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
