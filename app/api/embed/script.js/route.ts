// app/api/embed/script.js/route.ts
// Widget JS injetável para sites externos (WordPress, Webflow, HTML puro).
//
// O vendor inclui no seu site:
//   <script src="https://seudominio.com/api/embed/script.js"></script>
//   <button onclick="PlaybookCheckout('slug-do-produto')">Comprar</button>
//
// Funcionalidades:
//  - Abre modal com backdrop desfocado (Padrão Apple)
//  - Carrega o checkout em iframe sandboxed via /checkout/embed/[slug]
//  - Fecha ao clicar no fundo ou pressionar ESC
//  - Animações de entrada/saída suaves
//  - Cache de 1h para carregamento instantâneo
//  - Totalmente sem dependências externas (Vanilla JS puro)
//
// Segurança:
//  - Não lê nem escreve cookies do domínio pai
//  - O iframe tem sandbox="allow-same-origin allow-scripts allow-forms allow-top-navigation"
//  - postMessage para comunicar sucesso entre iframe e parent

import { NextRequest, NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = getPublicAppUrl() || `https://${req.headers.get("host") ?? "localhost:3000"}`;

  // ── JavaScript do widget ─────────────────────────────────────────────────
  const js = /* js */`
(function (w, d) {
  'use strict';

  var MODAL_ID   = '__pb_modal_overlay';
  var BASE_URL   = '${baseUrl}';
  var isOpen     = false;

  // ── Estilos do modal (injetados uma vez) ─────────────────────────────────
  function injectStyles() {
    if (d.getElementById('__pb_styles')) return;
    var s = d.createElement('style');
    s.id = '__pb_styles';
    s.textContent = [
      '#' + MODAL_ID + '{',
        'position:fixed;inset:0;',
        'background:rgba(0,0,0,0.65);',
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
        'z-index:2147483647;',
        'display:flex;align-items:center;justify-content:center;',
        'padding:16px;box-sizing:border-box;',
        'opacity:0;transition:opacity 0.28s ease;',
      '}',
      '#' + MODAL_ID + '.pb-visible{opacity:1;}',
      '#__pb_modal_box{',
        'position:relative;',
        'width:100%;max-width:480px;',
        'height:min(92vh,800px);',
        'background:#0d1117;',
        'border-radius:20px;',
        'overflow:hidden;',
        'box-shadow:0 32px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.06);',
        'transform:translateY(20px) scale(0.97);',
        'transition:transform 0.28s cubic-bezier(0.16,1,0.3,1);',
      '}',
      '#' + MODAL_ID + '.pb-visible #__pb_modal_box{',
        'transform:translateY(0) scale(1);',
      '}',
      '#__pb_close_btn{',
        'position:absolute;top:12px;right:12px;',
        'width:30px;height:30px;',
        'border-radius:50%;',
        'background:rgba(255,255,255,0.08);',
        'border:1px solid rgba(255,255,255,0.1);',
        'color:#f0f4f8;font-size:14px;font-weight:700;',
        'cursor:pointer;',
        'display:flex;align-items:center;justify-content:center;',
        'z-index:10;',
        'transition:background 0.15s;',
        'font-family:ui-sans-serif,system-ui,sans-serif;',
        'line-height:1;',
      '}',
      '#__pb_close_btn:hover{background:rgba(255,255,255,0.14);}',
      '#__pb_iframe{',
        'width:100%;height:100%;',
        'border:none;display:block;',
        'border-radius:20px;',
      '}',
      '#__pb_loading{',
        'position:absolute;inset:0;',
        'display:flex;align-items:center;justify-content:center;',
        'background:#0d1117;border-radius:20px;',
        'color:#4e6275;font-size:13px;',
        'font-family:ui-sans-serif,system-ui,sans-serif;',
        'gap:8px;',
        'transition:opacity 0.2s;',
      '}',
      '@media(max-width:540px){',
        '#__pb_modal_box{height:100vh;max-width:100%;border-radius:0;}',
        '#' + MODAL_ID + '{padding:0;}',
      '}',
    ].join('');
    d.head.appendChild(s);
  }

  // ── Fechar modal ─────────────────────────────────────────────────────────
  function close() {
    var overlay = d.getElementById(MODAL_ID);
    if (!overlay) return;
    overlay.classList.remove('pb-visible');
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      isOpen = false;
    }, 300);
  }

  // ── Abrir modal com checkout ─────────────────────────────────────────────
  function open(slug) {
    if (isOpen) return;
    if (!slug) { console.warn('[PlaybookCheckout] slug é obrigatório'); return; }
    isOpen = true;

    injectStyles();

    // Overlay
    var overlay = d.createElement('div');
    overlay.id = MODAL_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Checkout');

    // Fechar ao clicar fora
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    // Modal box
    var box = d.createElement('div');
    box.id = '__pb_modal_box';

    // Botão fechar
    var closeBtn = d.createElement('button');
    closeBtn.id = '__pb_close_btn';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.setAttribute('aria-label', 'Fechar checkout');
    closeBtn.addEventListener('click', close);

    // Loading state
    var loading = d.createElement('div');
    loading.id = '__pb_loading';
    loading.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:pb_spin 0.8s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> A carregar...';

    // Injetar animação de spin
    if (!d.getElementById('__pb_keyframes')) {
      var kf = d.createElement('style');
      kf.id = '__pb_keyframes';
      kf.textContent = '@keyframes pb_spin{to{transform:rotate(360deg)}}';
      d.head.appendChild(kf);
    }

    // Iframe
    var iframe = d.createElement('iframe');
    iframe.id = '__pb_iframe';
    iframe.src = BASE_URL + '/checkout/embed/' + encodeURIComponent(slug);
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-top-navigation allow-popups');
    iframe.setAttribute('allow', 'payment');
    iframe.setAttribute('title', 'Checkout seguro');
    iframe.style.opacity = '0';
    iframe.style.transition = 'opacity 0.2s';

    iframe.addEventListener('load', function () {
      loading.style.opacity = '0';
      setTimeout(function () { loading.style.display = 'none'; }, 200);
      iframe.style.opacity = '1';
    });

    box.appendChild(closeBtn);
    box.appendChild(loading);
    box.appendChild(iframe);
    overlay.appendChild(box);
    d.body.appendChild(overlay);

    // Animar entrada
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('pb-visible');
      });
    });

    // Fechar com ESC
    var onKeyDown = function (e) {
      if (e.key === 'Escape') { close(); d.removeEventListener('keydown', onKeyDown); }
    };
    d.addEventListener('keydown', onKeyDown);

    // Ouvir mensagem de sucesso do iframe
    var onMessage = function (e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'PB_CHECKOUT_SUCCESS') {
        w.removeEventListener('message', onMessage);
        setTimeout(close, 1800); // Fecha após animação de sucesso
      }
    };
    w.addEventListener('message', onMessage);
  }

  // ── API pública ──────────────────────────────────────────────────────────
  w.PlaybookCheckout = open;

  // Delegação de eventos para data-pb-slug (sem JS extra)
  d.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== d.body) {
      var slug = el.getAttribute && el.getAttribute('data-pb-slug');
      if (slug) { e.preventDefault(); open(slug); return; }
      el = el.parentNode;
    }
  });

}(window, document));
`;

  return new NextResponse(js, {
    headers: {
      "Content-Type":  "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
