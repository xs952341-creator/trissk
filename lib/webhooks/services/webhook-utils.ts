// lib/webhooks/services/webhook-utils.ts
// Utilitários partilhados pelos handlers do webhook Stripe.

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { inngest } from "@/lib/inngest";
import { log } from "@/lib/logger";
import { randomBytes } from "crypto";

const supabase = createAdminClient();
const stripe   = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

/** Gera string hexadecimal aleatória de n bytes */
function cryptoRandom(bytes: number): string {
  return randomBytes(bytes).toString("hex").toUpperCase().slice(0, bytes * 2);
}

export { getChargeId, ensureDefaultWorkspace, maybeIssueLicenseKey, sendPushToUser, logDeliveryEvent };

async function getChargeId(paymentIntentId: string): Promise<string | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = (pi as Stripe.PaymentIntent & { latest_charge?: string | Stripe.Charge }).latest_charge;
    if (typeof charge === "string") return charge;
    return charge?.id ?? null;
  } catch {
    return null;
  }
}

async function ensureDefaultWorkspace(ownerId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: ws } = await supabase
    .from("workspaces")
    .insert({ owner_id: ownerId, name: "Meu time" })
    .select("id")
    .single();

  const workspaceId = (ws as { id?: string } | null)?.id;
  if (!workspaceId) {
    throw new Error("Falha ao criar workspace padrão");
  }

  await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: ownerId, role: "owner", status: "active" });
  return workspaceId;
}

async function maybeIssueLicenseKey(userId: string, productId: string, invoiceId: string) {
  try {
    const { data: p } = await supabase
      .from("saas_products")
      .select("delivery_method, name")
      .eq("id", productId)
      .maybeSingle();
    const method = (p as Record<string, unknown> | null)?.delivery_method as string | undefined;
    if (method !== "KEYS") return;

    const key = `LIC-${cryptoRandom(4)}-${cryptoRandom(4)}-${cryptoRandom(4)}`;

    await supabase.from("license_keys").insert({
      user_id: userId,
      product_id: productId,
      license_key: key,
      source_invoice_id: invoiceId,
      status: "active",
    });
  } catch {
    // silently ignore (feature is optional)
  }
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }) {
  const { VAPID_PRIVATE_KEY, VAPID_SUBJECT } = await import("@/lib/env-server");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!VAPID_PRIVATE_KEY || !VAPID_SUBJECT || !publicKey) return;

  const webPush = await import("web-push");
  webPush.default.setVapidDetails(VAPID_SUBJECT, publicKey, VAPID_PRIVATE_KEY);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;

  await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webPush.default.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
    )
  );
}

async function logDeliveryEvent(evt: {
  user_id: string;
  product_id: string | null;
  vendor_id: string | null;
  playbook_id: string | null;
  stripe_invoice_id: string | null;
  url: string;
  status: "success" | "failed";
  http_status: number | null;
  error_message: string | null;
}) {
  await supabase.from("delivery_events").insert({
    user_id:          evt.user_id,
    product_id:       evt.product_id,
    vendor_id:        evt.vendor_id,
    playbook_id:      evt.playbook_id,
    stripe_invoice_id: evt.stripe_invoice_id,
    url:              evt.url,
    status:           evt.status,
    http_status:      evt.http_status,
    error_message:    evt.error_message,
  });
}
