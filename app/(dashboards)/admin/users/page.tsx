// app/(dashboards)/admin/users/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Shield, ShieldOff, Search, UserCheck } from "lucide-react";
import { toast } from "sonner";

type Role = "buyer" | "vendor" | "affiliate" | "admin";

interface User {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  is_verified_vendor: boolean;
  created_at: string;
}

const ROLE_COLORS: Record<Role, string> = {
  admin:     "text-red-400 bg-red-500/10 border-red-500/20",
  vendor:    "text-violet-400 bg-violet-500/10 border-violet-500/20",
  affiliate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  buyer:     "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
};

export default function AdminUsers() {
  const supabase   = createClient();
  const [users,    setUsers]    = useState<User[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [q,        setQ]        = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, is_verified_vendor, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setUsers((data as User[]) ?? []);
    setLoading(false);
  }

  async function setRole(userId: string, role: Role) {
    setUpdating(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) toast.error("Erro ao atualizar role.");
    else {
      toast.success("Role atualizado!");
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
    }
    setUpdating(null);
  }

  async function toggleVerified(userId: string, current: boolean) {
    setUpdating(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ is_verified_vendor: !current, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) toast.error("Erro ao atualizar verificação.");
    else {
      toast.success(!current ? "Vendor verificado!" : "Verificação removida.");
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_verified_vendor: !current } : u));
    }
    setUpdating(null);
  }

  const filtered = users.filter((u) => {
    const s = q.toLowerCase();
    return !s || (u.full_name ?? "").toLowerCase().includes(s) || (u.email ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Gestão de Usuários</h1>
          <p className="text-zinc-400 text-sm">{users.length} usuários cadastrados</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm outline-none focus:border-white/25 placeholder:text-zinc-600 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
          <div className="divide-y divide-white/10">
            {filtered.map((u) => (
              <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100 truncate">
                      {u.full_name ?? "Sem nome"}
                    </span>
                    {u.is_verified_vendor && (
                      <span className="text-[10px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 flex items-center gap-1">
                        <UserCheck size={10} /> Verificado
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">
                    Desde {new Date(String(u.created_at ?? "")).toLocaleDateString("pt-BR")}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {/* Role badge + select */}
                  <span className={`text-xs border rounded-full px-2.5 py-1 font-medium ${ROLE_COLORS[u.role]}`}>
                    {u.role}
                  </span>
                  <select
                    value={u.role}
                    disabled={updating === u.id}
                    onChange={(e) => setRole(u.id, e.target.value as Role)}
                    className="rounded-xl bg-zinc-900 border border-white/10 text-xs px-3 py-1.5 outline-none text-zinc-300 disabled:opacity-50"
                  >
                    <option value="buyer">buyer</option>
                    <option value="vendor">vendor</option>
                    <option value="affiliate">affiliate</option>
                    <option value="admin">admin</option>
                  </select>

                  {/* Verificar vendor */}
                  {(u.role === "vendor" || u.role === "admin") && (
                    <button
                      onClick={() => toggleVerified(u.id, u.is_verified_vendor)}
                      disabled={updating === u.id}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition disabled:opacity-50"
                      title={u.is_verified_vendor ? "Remover verificação" : "Verificar vendor"}
                    >
                      {updating === u.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : u.is_verified_vendor
                          ? <><ShieldOff size={12} /> Revogar</>
                          : <><Shield size={12} /> Verificar</>
                      }
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-zinc-500 text-sm">
                {q ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
