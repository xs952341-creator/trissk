"use client";
// components/PWARegister.tsx
// Registra o Service Worker e solicita permissão para notificações push.
// Salva a PushSubscription no servidor via /api/notifications/subscribe.

import { useEffect } from "react";
import { NEXT_PUBLIC_VAPID_PUBLIC_KEY } from "@/lib/env";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const run = async () => {
      try {
        // 1. Registrar SW
        const registration = await navigator.serviceWorker.register("/sw.js");

        // 2. Pedir permissão de push (só se VAPID key estiver configurada)
        if (!NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
        if (!("PushManager" in window)) return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // 3. Checar se já tem subscription válida
        const existing = await registration.pushManager.getSubscription();

        // 4. Se não tem ou expirou, criar nova
        const subscription = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY),
        });

        // 5. Salvar no servidor
        const { endpoint, keys } = subscription.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        if (!keys?.p256dh || !keys?.auth) return;

        await fetch("/api/notifications/subscribe", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ endpoint, keys }),
        });

      } catch {
        // Falha silenciosa — push é opcional
      }
    };

    run();
  }, []);

  return null;
}
