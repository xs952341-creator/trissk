
"use client";
/**
 * Portal de Revendedores (Reseller / Agências)
 * Permite que agências comprem licenças em volume e distribuam para seus clientes.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { allocateLicenseToClient, revokeLicense } from "@/lib/actions/reseller";
import {
  Building2, UserPlus, Trash2, Loader2, Package,
  ChevronRight, Users, Zap, AlertTriangle, CheckCircle2,
} from "lucide-react";

interface Pool {
  id:             string;
  product_id:     string;
  total_licenses: number;
  used_licenses:  number;
  status:         string;
  product_name?:  string;
}

interface Allocation {
  id:           string;
  pool_id:      string;
  client_email: string;
  client_name?: string;
  status:       string;
  allocated_at: string;
}

function PoolCard({ pool, allocations, onAllocate, onRevoke }: {
  pool:        Pool;
  allocations: Allocation[];
  onAllocate:  (poolId: string, email: string, name?: string) => Promise<void>;
  onRevoke:    (id: string) => Promise<void>;
}) {
  const [email,       setEmail]       = useState("");
  const [name,        setName]        = useState("");
  const [allocating,  setAllocating]  = useState(false);
  const [revokingId,  setRevokingId]  = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);

  const remaining  = pool.total_licenses - pool.used_licenses;
  const pct        = pool.total_licenses > 0 ? (pool.used_licenses / pool.total_licenses) * 100 : 0;
  const poolAllocs = allocations.filter(a => a.pool_id === pool.id && a.status === "active");

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAllocating(true);
    try {
      await onAllocate(pool.id, email.trim(), name.trim() || undefined);
      setEmail(""); setName(""); setShowForm(false);
    } finally {
      setAllocating(false);
    }
  };

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)" }}>
          <Package size={16} style={{ color: "var(--brand)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            {pool.product_name ?? "Produto"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {remaining} de {pool.total_licenses} licenças disponíveis
          </p>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
          pool.status === "active" ? "badge-brand" : "badge"}`}>
          {pool.status}
        </span>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : "var(--brand)" }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7 }}
          />
        </div>
      </div>

      {/* Allocate form toggle */}
      {remaining > 0 && (
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-secondary w-full py-2 text-xs gap-2 mb-3"
        >
          <UserPlus size={12} />
          {showForm ? "Cancelar" : "Alocar para cliente"}
        </button>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.form
            key="form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAllocate}
            className="overflow-hidden mb-3"
          >
            <div className="space-y-2 pt-1">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome do cliente (opcional)"
                className="input-base text-xs py-2"
              />
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@cliente.com"
                  className="input-base text-xs py-2 flex-1"
                  required
                />
                <button type="submit" disabled={allocating || !email.trim()} className="btn-primary px-3 py-2 text-xs gap-1 shrink-0">
                  {allocating ? <Loader2 size={11} className="animate-spin" /> : <><CheckCircle2 size={11} />Alocar</>}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Allocations list */}
      {poolAllocs.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
          <div className="px-3 py-2 text-[9px] uppercase tracking-wider font-semibold"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
            Clientes ativos ({poolAllocs.length})
          </div>
          {poolAllocs.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div className="flex-1 min-w-0">
                {a.client_name && (
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{a.client_name}</p>
                )}
                <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{a.client_email}</p>
              </div>
              <button
                onClick={async () => { setRevokingId(a.id); await onRevoke(a.id); setRevokingId(null); }}
                disabled={revokingId === a.id}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0"
                style={{ color: "var(--text-faint)" }}
                aria-label={`Revogar licença de ${a.client_email}`}
              >
                {revokingId === a.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResellersPage() {
  const supabase = createClient();
  const [pools,       setPools]       = useState<Pool[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const [poolsRes, allocRes] = await Promise.all([
        supabase
          .from("reseller_pools")
          .select("id,product_id,total_licenses,used_licenses,status,saas_products!product_id(name)")
          .eq("reseller_id", session.user.id)
          .eq("status", "active"),
        supabase
          .from("reseller_allocations")
          .select("id,pool_id,client_email,client_name,status,allocated_at")
          .eq("reseller_id", session.user.id)
          .eq("status", "active"),
      ]);

      setPools((poolsRes.data ?? []) as unknown as Pool[]);
      setAllocations(allocRes.data ?? []);
    } catch {
      toast.error("Erro ao carregar pools de licenças.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAllocate = async (poolId: string, email: string, name?: string) => {
    const result = await allocateLicenseToClient(poolId, email, name);
    if (result.success) {
      toast.success(result.message);
      await load();
    } else {
      toast.error(result.message);
    }
  };

  const handleRevoke = async (id: string) => {
    const result = await revokeLicense(id);
    if (result.success) {
      toast.success(result.message);
      await load();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <span className="section-eyebrow mb-1 block">Partner Portal</span>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
          Portal de Revendedores
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Gerencie seus pools de licenças e distribua para clientes.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="card h-48" />)}
        </div>
      ) : pools.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
            <Building2 size={24} style={{ color: "var(--text-faint)" }} />
          </div>
          <h3 className="text-base font-semibold mb-2"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>
            Nenhum pool de licenças
          </h3>
          <p className="text-sm max-w-xs" style={{ color: "var(--text-muted)" }}>
            Compre licenças em volume de qualquer produto do catálogo para começar a revender.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pools.map(pool => (
            <PoolCard
              key={pool.id}
              pool={pool}
              allocations={allocations}
              onAllocate={handleAllocate}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}
    </div>
  );
}
