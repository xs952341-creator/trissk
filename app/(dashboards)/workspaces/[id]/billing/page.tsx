"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { getErrorMessage } from "@/lib/errors";

export default function WorkspaceBillingPage() {
  const params = useParams();
  const id = String((params as unknown as Record<string,unknown>).id);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  async function openPortal() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/billing/portal", { method:"POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha");
      window.location.href = d.url;
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Erro ao abrir portal de cobrança.");
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">Workspace: {id}</p>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-medium">Gerenciar assinatura</div>
        <p className="text-sm text-muted-foreground">Use o portal Stripe para upgrades, downgrades, addons e cancelamento.</p>
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading} onClick={openPortal}>
          Abrir portal
        </button>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </div>
  );
}
