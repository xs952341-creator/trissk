// lib/webhooks/constants.ts
export const WEBHOOK_EVENT_TYPES = [
  "sale.created",
  "sale.refunded",
  "subscription.created",
  "subscription.canceled",
  "subscription.payment_failed",
  "subscription.renewed",
  "chargeback.opened",
  "chargeback.resolved",
  "license.created",
  "license.revoked",
  "instance.provisioned",
  "instance.suspended",
  "instance.resumed",
  "*",
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];
