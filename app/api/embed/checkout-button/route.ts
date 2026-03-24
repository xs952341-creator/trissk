import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";

// JS embeddável para sites externos.
// Renderiza um botão e abre o checkout do marketplace.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const appUrl = url.searchParams.get("appUrl") || url.origin;

  const js = `(() => {
  const script = document.currentScript;
  const rootId = script?.getAttribute('data-root') || 'ph-checkout';
  const root = document.getElementById(rootId) || (() => {
    const el = document.createElement('div');
    el.id = rootId;
    script?.parentNode?.insertBefore(el, script.nextSibling);
    return el;
  })();

  const label = script?.getAttribute('data-label') || 'Comprar';
  const priceId = script?.getAttribute('data-price-id');
  const productTierId = script?.getAttribute('data-tier-id');
  const type = script?.getAttribute('data-type') || 'subscription';
  const customAmount = script?.getAttribute('data-custom-amount');

  if (!priceId || !productTierId) {
    root.innerHTML = '<div style="font-family: ui-sans-serif; color:#b91c1c">Config inválida: data-price-id e data-tier-id são obrigatórios.</div>';
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.cssText = 'cursor:pointer;padding:12px 18px;border-radius:12px;border:1px solid rgba(0,0,0,.1);background:#111827;color:#fff;font-family: ui-sans-serif;font-weight:600;';

  const err = document.createElement('div');
  err.style.cssText = 'margin-top:8px;font-family: ui-sans-serif; font-size:12px; color:#b91c1c;';

  btn.onclick = async () => {
    err.textContent = '';

    // O embed não faz autenticação. Se não houver sessão, o checkout ainda abre,
    // e o app pode pedir login no fluxo normal.
    // userId é resolvido no backend via sessão quando aplicável.

    try {
      const res = await fetch(appUrl + '/api/embed/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, productTierId, type, customAmount: customAmount ? Number(customAmount) : null, ref: document.referrer })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Erro');
      window.location.href = j.checkoutUrl;
    } catch (e) {
      err.textContent = (e && getErrorMessage(e)) ? e.message : 'Erro ao abrir checkout';
    }
  };

  root.innerHTML = '';
  root.appendChild(btn);
  root.appendChild(err);
})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
