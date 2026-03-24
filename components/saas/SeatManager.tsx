"use client";
/**
 * SeatManager — Painel de gestão de assentos B2B.
 * Padrão Apple: skeleton, animações, feedback inline, acessibilidade WCAG.
 *
 * Usa as Server Actions de lib/actions/saas-seats.ts
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Users, UserPlus, Shield, Trash2, Mail, Loader2,
  AlertTriangle, ChevronRight, Crown, User, Check,
  ShoppingCart, X,
} from "lucide-react";
import {
  inviteTeamMember,
  removeTeamMember,
  buyExtraSeat,
} from "@/lib/actions/saas-seats";

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface TeamMember {
  id:      string;
  email:   string;
  name?:   string;
  role:    "owner" | "admin" | "member";
  status:  "active" | "invited";
}

interface SeatManagerProps {
  subscriptionId:    string;
  saasName:          string;
  totalSeats:        number;
  usedSeats:         number;
  members:           TeamMember[];
  pricePerExtraSeat: number;      // BRL
  onMembersChange?:  () => void;  // callback para refetch
}

// ── Formatador ─────────────────────────────────────────────────────────────────
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

// ── Barra de uso de assentos ───────────────────────────────────────────────────
function SeatUsageBar({ used, total }: { used: number; total: number }) {
  const pct     = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isFull  = used >= total;
  const color   = isFull ? "#f87171" : pct >= 80 ? "#fbbf24" : "var(--brand)";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span style={{ color: "var(--text-muted)" }}>Assentos em uso</span>
        <span className="font-semibold" style={{ color: isFull ? "#f87171" : "var(--text-secondary)" }}>
          {used} / {total}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

// ── Card de membro ─────────────────────────────────────────────────────────────
function MemberRow({ member, canRemove, onRemove, removing }: {
  member:   TeamMember;
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const ROLE_CFG = {
    owner:  { icon: Crown,  label: "Dono",   color: "#a78bfa" },
    admin:  { icon: Shield, label: "Admin",  color: "#fbbf24" },
    member: { icon: User,   label: "Membro", color: "#7dd3fc" },
  };
  const cfg     = ROLE_CFG[member.role];
  const RoleIcon = cfg.icon;
  const initials = (member.name ?? member.email).slice(0, 2).toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold"
        style={{ background: "var(--surface-3)", color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {member.name && (
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {member.name}
          </p>
        )}
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{member.email}</p>
      </div>

      {/* Role badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{
            color:            cfg.color,
            borderColor:      `${cfg.color}33`,
            background:       `${cfg.color}11`,
          }}
        >
          <RoleIcon size={9} />{cfg.label}
        </span>

        {/* Status */}
        {member.status === "invited" && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.2)" }}
          >
            Pendente
          </span>
        )}
      </div>

      {/* Remove button */}
      {canRemove && (
        <button
          onClick={onRemove}
          disabled={removing}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
          style={{ color: "var(--text-faint)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          aria-label={`Remover ${member.email}`}
        >
          {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      )}
    </motion.div>
  );
}

// ── Componente Principal ───────────────────────────────────────────────────────
export default function SeatManager({
  subscriptionId, saasName, totalSeats, usedSeats,
  members: initialMembers, pricePerExtraSeat, onMembersChange,
}: SeatManagerProps) {
  const [members,     setMembers]     = useState<TeamMember[]>(initialMembers);
  const [seats,       setSeats]       = useState({ total: totalSeats, used: usedSeats });
  const [email,       setEmail]       = useState("");
  const [inviting,    setInviting]    = useState(false);
  const [removingId,  setRemovingId]  = useState<string | null>(null);
  const [buyingExtra, setBuyingExtra] = useState(false);
  const [emailError,  setEmailError]  = useState<string | null>(null);

  const isFull = seats.used >= seats.total;

  // ── Convidar membro ──────────────────────────────────────────────────────────
  const handleInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    if (!email.trim()) { setEmailError("Digite um email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Email inválido."); return;
    }

    setInviting(true);
    try {
      const result = await inviteTeamMember(subscriptionId, email.trim());
      if (!result.success) {
        setEmailError(result.error ?? result.message);
        toast.error(result.message);
        return;
      }

      // Atualizar estado local otimistamente
      const newMember: TeamMember = {
        id:     crypto.randomUUID(),
        email:  email.trim().toLowerCase(),
        role:   "member",
        status: "invited",
      };
      setMembers(prev => [...prev, newMember]);
      setSeats(prev => ({ ...prev, used: prev.used + 1 }));
      setEmail("");
      toast.success(result.message);
      onMembersChange?.();
    } finally {
      setInviting(false);
    }
  }, [email, subscriptionId, onMembersChange]);

  // ── Remover membro ───────────────────────────────────────────────────────────
  const handleRemove = useCallback(async (member: TeamMember) => {
    setRemovingId(member.id);
    try {
      const result = await removeTeamMember(subscriptionId, member.id);
      if (!result.success) { toast.error(result.message); return; }
      setMembers(prev => prev.filter(m => m.id !== member.id));
      setSeats(prev => ({ ...prev, used: Math.max(0, prev.used - 1) }));
      toast.success(result.message);
      onMembersChange?.();
    } finally {
      setRemovingId(null);
    }
  }, [subscriptionId, onMembersChange]);

  // ── Comprar assento extra ────────────────────────────────────────────────────
  const handleBuyExtra = useCallback(async () => {
    setBuyingExtra(true);
    try {
      const result = await buyExtraSeat(subscriptionId);
      if (!result.success) { toast.error(result.message); return; }
      setSeats(prev => ({ ...prev, total: result.newQuantity ?? prev.total + 1 }));
      toast.success(result.message);
      onMembersChange?.();
    } finally {
      setBuyingExtra(false);
    }
  }, [subscriptionId, onMembersChange]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3
            className="text-base font-bold flex items-center gap-2"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            <Users size={16} style={{ color: "var(--brand)" }} />
            Equipa — {saasName}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Gerencie quem tem acesso ao produto.
          </p>
        </div>
      </div>

      {/* Seat usage bar */}
      <div className="card p-4 mb-4">
        <SeatUsageBar used={seats.used} total={seats.total} />
      </div>

      {/* Invite form / Full warning */}
      <AnimatePresence mode="wait">
        {isFull ? (
          <motion.div
            key="full"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border p-4 mb-4 flex items-start gap-3"
            style={{ background: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.25)" }}
          >
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300 mb-1">Limite atingido</p>
              <p className="text-xs text-amber-400/70 mb-3">
                Todos os {seats.total} assento(s) estão em uso. Adicione mais para convidar novos membros.
              </p>
              <button
                onClick={handleBuyExtra}
                disabled={buyingExtra}
                className="btn-primary text-xs px-4 py-2 gap-1.5"
                style={{ background: "#d97706" }}
              >
                {buyingExtra
                  ? <><Loader2 size={12} className="animate-spin" />Processando...</>
                  : <><ShoppingCart size={12} />+1 Assento — {fmtBRL(pricePerExtraSeat)}/mês</>
                }
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="invite"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onSubmit={handleInvite}
            className="mb-4"
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail
                  size={13}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(null); }}
                  placeholder="email@empresa.com"
                  className="input-base pl-9 pr-3"
                  disabled={inviting}
                  aria-label="Email do novo membro"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? "invite-error" : undefined}
                />
              </div>
              <button
                type="submit"
                disabled={inviting || !email.trim()}
                className="btn-primary px-4 py-2.5 text-xs gap-1.5 shrink-0"
              >
                {inviting
                  ? <Loader2 size={12} className="animate-spin" />
                  : <><UserPlus size={12} />Convidar</>
                }
              </button>
            </div>
            {emailError && (
              <p id="invite-error" className="text-xs mt-1.5 text-rose-400 flex items-center gap-1">
                <AlertTriangle size={10} />{emailError}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      {/* Members list */}
      <div className="card overflow-hidden">
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Membros ({members.length})
          </span>
          {!isFull && seats.total > 1 && (
            <button
              onClick={handleBuyExtra}
              disabled={buyingExtra}
              className="flex items-center gap-1 text-[10px] font-semibold transition-colors"
              style={{ color: "var(--brand)" }}
            >
              {buyingExtra ? <Loader2 size={10} className="animate-spin" /> : <>+Assento<ChevronRight size={10} /></>}
            </button>
          )}
        </div>

        {members.length === 0 ? (
          <div className="py-10 text-center">
            <Users size={20} className="mx-auto mb-2" style={{ color: "var(--text-faint)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum membro convidado ainda.</p>
          </div>
        ) : (
          <AnimatePresence>
            {members.map(m => (
              <MemberRow
                key={m.id}
                member={m}
                canRemove={m.role !== "owner"}
                onRemove={() => handleRemove(m)}
                removing={removingId === m.id}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
