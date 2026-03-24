"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Server } from "lucide-react";

type Item = {
  instance_id: string;
  buyer_id: string;
  product_id: string;
  external_id: string | null;
  external_email: string | null;
  status: string;
  last_event_at: string | null;
  total_events: number;
  usage_period_qty: number;
  stripe_subscription_id?: string | null;
  stripe_subscription_item_id?: string | null;
};

export default function VendorInstancesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<string>("active");
  const [period, setPeriod] = useState<string>("30d");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        setError("Faça login como vendor.");
        setLoading(false);
        return;
      }

      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (period) qs.set("period", period);

      const res = await fetch(`/api/vendor/instances?${qs.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(j?.error ?? "Erro ao carregar instâncias");
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setItems(j.items ?? []);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, status, period]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Server className="w-5 h-5" />
        <h1 className="text-xl font-semibold">Instâncias SaaS (compradores)</h1>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <label className="text-sm">Status</label>
        <select className="border rounded px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">active</option>
          <option value="pending">pending</option>
          <option value="suspended">suspended</option>
          <option value="revoked">revoked</option>
          <option value="failed">failed</option>
          <option value="">(todos)</option>
        </select>

        <label className="text-sm ml-2">Uso</label>
        <select className="border rounded px-2 py-1 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="90d">90d</option>
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando...
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-2">external_id</th>
                <th className="p-2">email</th>
                <th className="p-2">status</th>
                <th className="p-2">last_event_at</th>
                <th className="p-2">total_events</th>
                <th className="p-2">uso ({period})</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.instance_id} className="border-t">
                  <td className="p-2 font-mono">{it.external_id ?? "-"}</td>
                  <td className="p-2">{it.external_email ?? "-"}</td>
                  <td className="p-2">{it.status}</td>
                  <td className="p-2">{it.last_event_at ? new Date(String(it.last_event_at ?? "")).toLocaleString() : "-"}</td>
                  <td className="p-2">{it.total_events ?? 0}</td>
                  <td className="p-2">{it.usage_period_qty ?? 0}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td className="p-4 text-gray-500" colSpan={6}>Nenhuma instância encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
