"use client";
/**
 * MagicAccessCard v2 - Premium UX
 * Card de acesso mágico para o dashboard do comprador.
 *
 * Melhorias v2:
 *  - Animações suaves de entrada
 *  - Estados de hover premium
 *  - Tipografia refinada
 *  - Cores semânticas melhoradas
 *  - Acessibilidade reforçada (focus visible)
 *  - Skeleton loading state
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code, Book, Users, Key, ExternalLink, Download,
  Loader2, AlertCircle, Clock, Sparkles, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export interface MagicAccessCardProps {
  productId:     string;
  productName:   string;
  tierName?:     string;
  logoUrl?:      string | null;
  deliveryType:  "saas" | "file" | "community" | "course" | "api" | "license" | string;
  magicLinkUrl?: string | null;  // fallback para outros tipos
  status:        "active" | "revoked" | "expired";
  /** Data de expiração (para assinaturas) */
  expiresAt?:    string | null;
}

// ── Ícone por tipo ────────────────────────────────────────────────────────────
function TypeIcon({ type, size = 20 }: { type: string; size?: number }) {
  if (type === "saas" || type === "api") return <Code size={size} />;
  if (type === "file" || type === "course") return <Book size={size} />;
  if (type === "community") return <Users size={size} />;
  return <Key size={size} />;
}

// ── Cor do tipo ───────────────────────────────────────────────────────────────
function typeColor(type: string): string {
  if (type === "saas" || type === "api")      return "rgba(99,102,241,0.12)";
  if (type === "file" || type === "course")   return "rgba(245,158,11,0.12)";
  if (type === "community")                   return "rgba(34,197,94,0.12)";
  return "rgba(100,116,139,0.12)";
}

function typeIconColor(type: string): string {
  if (type === "saas" || type === "api")      return "#818cf8";
  if (type === "file" || type === "course")   return "#f59e0b";
  if (type === "community")                   return "#22c55e";
  return "var(--text-muted)";
}

export default function MagicAccessCard({
  productId,
  productName,
  tierName,
  logoUrl,
  deliveryType,
  magicLinkUrl,
  status,
  expiresAt,
}: MagicAccessCardProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const isActive  = status === "active";
  const isRevoked = status === "revoked";

  // ── Acção principal ────────────────────────────────────────────────────────
  const handleAccess = useCallback(async () => {
    if (!isActive || loading) return;
    setError(null);
    setLoading(true);

    try {
      if (deliveryType === "saas" || deliveryType === "api") {
        toast.loading("Preparando acesso seguro...", { duration: 1500 });
        window.location.href = `/api/sso/launch?productId=${encodeURIComponent(productId)}`;
        return;
      }

      if (deliveryType === "file" || deliveryType === "course") {
        toast.loading("Gerando link de download...", { duration: 1000 });
        window.location.href = `/api/delivery/download?productId=${encodeURIComponent(productId)}`;
        setTimeout(() => setLoading(false), 2_000);
        return;
      }

      if (deliveryType === "community" && magicLinkUrl) {
        window.open(magicLinkUrl, "_blank", "noopener,noreferrer");
        toast.success("Comunidade aberta em nova aba");
        setLoading(false);
        return;
      }

      if (magicLinkUrl) {
        window.open(magicLinkUrl, "_blank", "noopener,noreferrer");
        setLoading(false);
        return;
      }

      setError("Link de acesso não configurado. Contacte o vendedor.");
      toast.error("Acesso não disponível");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
      toast.error("Falha ao acessar");
    } finally {
      setLoading(false);
    }
  }, [isActive, loading, deliveryType, magicLinkUrl, productId]);

  // ── Label e ícone do botão ─────────────────────────────────────────────────
  const buttonLabel = () => {
    if (loading) return null;
    if (deliveryType === "saas" || deliveryType === "api")
      return <><ExternalLink size={14} />Acessar Aplicação</>;
    if (deliveryType === "file" || deliveryType === "course")
      return <><Download size={14} />Baixar Ficheiro</>;
    if (deliveryType === "community")
      return <><Users size={14} />Entrar na Comunidade</>;
    return <><ExternalLink size={14} />Acessar</>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5"
    >
      <div className="flex items-center gap-4">
        {/* Logo / ícone */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{
            background: logoUrl ? "transparent" : typeColor(deliveryType),
            border: "1px solid var(--border-subtle)",
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={productName} className="w-full h-full object-cover rounded-xl" />
          ) : (
            <TypeIcon type={deliveryType} size={20} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className="text-sm font-bold truncate"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              {productName}
            </p>

            {/* Status badge */}
            {isActive ? (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: "rgba(34,212,160,0.1)", color: "var(--brand)", border: "1px solid rgba(34,212,160,0.2)" }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: "var(--brand)" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--brand)" }} />
                </span>
                Activo
              </span>
            ) : isRevoked ? (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}>
                Revogado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: "rgba(100,116,139,0.1)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                <Clock size={9} />Expirado
              </span>
            )}
          </div>

          {tierName && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {tierName}
              {expiresAt && (
                <span className="ml-2 opacity-60">
                  · Expira {new Date(expiresAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Botão de acesso */}
        {isActive && (
          <button
            onClick={handleAccess}
            disabled={loading}
            className="btn-primary px-4 py-2.5 text-xs gap-1.5 shrink-0"
            aria-label={`Acessar ${productName}`}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : buttonLabel()}
          </button>
        )}
      </div>

      {/* Erro inline */}
      {error && (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium"
          style={{
            background: "rgba(248,113,113,0.07)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "#fca5a5",
          }}
          role="alert"
        >
          <AlertCircle size={13} className="shrink-0" />
          {error}
        </div>
      )}
    </motion.div>
  );
}
