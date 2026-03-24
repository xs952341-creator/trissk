
"use client";
// app/(dashboards)/admin/dlq/page.tsx
// Dead-Letter Queue — deliveries permanentemente falhos.
// Admin pode inspecionar, re-tentar (replay) ou descartar itens.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, RefreshCw, RotateCcw, Trash2, AlertTriangle, CheckCircle2, XCircle, Play, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

interface DLQItem {
  id: string;
  user_id: string;
  product_id: string | null;
  vendor_id: string | null;
  url: string | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  last_retried_at: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
}

export default function DLQPage() {
  const router = useRouter();
  const [loading, setLoading]     = useState(true);
  const [items, setItems]         = useState<DLQItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [acting, setActing]       = useState<string | null>(null);

  const LIMIT = 20;

  // Admin guard
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      createClient().from("profiles").select("role").eq("id", user.id).single().then(({ data }) => {
        if (data?.role !== "admin") router.push("/dashboard");
      });
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dlq?page=${page}&limit=${LIMIT}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Erro ao carregar DLQ");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, id?: string) {
    setActing(id ?? action);
    try {
      const res = await fetch("/api/dlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(action === "replay" ? "Re-enfileirado ✓" : action === "replay_all" ? "Todos re-enfileirados ✓" : "Descartado ✓");
      await load();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setActing(null);
    }
  }

  async function batchDismiss() {
    if (selected.size === 0) return;
    setActing("batch");
    try {
      const res = await fetch("/api/dlq", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${data.dismissed} itens descartados`);
      setSelected(new Set());
      await load();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setActing(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i: DLQItem) => String(i.id))));
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              Dead-Letter Queue
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Deliveries permanentemente falhos após 5 tentativas. Faça replay para re-tentar ou descarte.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <button
                onClick={() => doAction("replay_all")}
                disabled={acting !== null}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {acting === "replay_all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Replay All ({total})
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-1">Total na DLQ</p>
            <p className="text-2xl font-bold text-red-400">{total}</p>
          </div>
          <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-1">Selecionados</p>
            <p className="text-2xl font-bold text-amber-400">{selected.size}</p>
          </div>
          <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-1">Página</p>
            <p className="text-2xl font-bold text-zinc-300">{page + 1} / {Math.max(pages, 1)}</p>
          </div>
        </div>

        {/* Batch actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <span className="text-sm text-amber-300">{selected.size} selecionados</span>
            <button
              onClick={batchDismiss}
              disabled={acting !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Descartar selecionados
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-500/50" />
              <p className="text-sm font-medium">DLQ limpa — nenhum item permanentemente falho</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs text-zinc-500">
                    <th className="p-4 text-left">
                      <input
                        type="checkbox"
                        checked={selected.size === items.length && items.length > 0}
                        onChange={toggleAll}
                        className="accent-emerald-500"
                      />
                    </th>
                    <th className="p-4 text-left">Buyer</th>
                    <th className="p-4 text-left">Webhook URL</th>
                    <th className="p-4 text-left">Último erro</th>
                    <th className="p-4 text-left">Tentativas</th>
                    <th className="p-4 text-left">Última tentativa</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="accent-emerald-500"
                        />
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-zinc-200">{item.profiles?.full_name ?? "—"}</p>
                        <p className="text-xs text-zinc-500">{item.profiles?.email ?? item.user_id}</p>
                      </td>
                      <td className="p-4 max-w-[220px]">
                        <p className="text-xs text-zinc-400 truncate font-mono">{item.url ?? "—"}</p>
                      </td>
                      <td className="p-4 max-w-[200px]">
                        <p className="text-xs text-red-400/80 truncate">{item.error_message ?? "—"}</p>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-mono">
                          {item.retry_count}x
                        </span>
                      </td>
                      <td className="p-4 text-xs text-zinc-500">
                        {item.last_retried_at ? new Date(String(item.last_retried_at ?? "")).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => doAction("replay", item.id)}
                            disabled={acting !== null}
                            title="Replay (re-tenta entrega)"
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors disabled:opacity-50"
                          >
                            {acting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => doAction("dismiss", item.id)}
                            disabled={acting !== null}
                            title="Descartar permanentemente"
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm disabled:opacity-30 transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-sm text-zinc-500">{page + 1} / {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm disabled:opacity-30 transition-colors"
            >
              Próxima →
            </button>
          </div>
        )}

        {/* How it works */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 text-sm text-zinc-500">
          <p className="font-medium text-zinc-300 mb-2">Como funciona o retry automático:</p>
          <p>1ª falha → retry em 15 min → 1h → 4h → 12h → <span className="text-red-400">DLQ (5ª falha)</span></p>
          <p className="mt-1">Replay move o item de volta para "failed" com retry_count=0, e o cron pega na próxima execução (a cada 2h).</p>
        </div>
      </div>
    </div>
  );
}
