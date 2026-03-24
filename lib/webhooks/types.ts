// lib/webhooks/types.ts
// Tipos do domínio de webhooks Stripe.
// v52: tipagem premium total no handler principal.

// ── Payout hold days ──────────────────────────────────────────────────────────
export interface VendorProfileWithHold {
  id: string;
  payout_hold_days: number | null;
  email?: string | null;
  full_name?: string | null;
}

// ── Affiliate / commission ────────────────────────────────────────────────────
export interface AffiliateCommissionProduct {
  id: string;
  allows_affiliates: boolean | null;
  affiliate_commission_type_v2: "fixed" | "percent" | null;
  affiliate_commission_percent: number | null;
  affiliate_commission_fixed:   number | null;
  affiliate_first_month_pct:    number | null;
  affiliate_recurring_pct:      number | null;
  affiliate_l2_commission_pct:  number | null;
}

export interface AffiliateProfileWithUpline {
  id: string;
  user_id: string;
  referred_by_affiliate_id: string | null;
}

// ── Invoice metadata ─────────────────────────────────────────────────────────
// Note: does NOT extend Stripe.Metadata (Record<string,string>) to avoid index conflict
export interface InvoiceMetadata {
  [key: string]: string;
  checkout_session_id: string;
  referrer: string;
  affiliate_code: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}
export type InvoiceMetadataPartial = Partial<InvoiceMetadata>;

// ── Webhook event storage ─────────────────────────────────────────────────────
export interface WebhookEventRow {
  id: string;
  event_type: string;
  processed_at: string;
  payload: Record<string, unknown>;
}

// ── Idempotency error code ────────────────────────────────────────────────────
export interface SupabaseErrorWithCode {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export function isSupabaseError(e: unknown): e is SupabaseErrorWithCode {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

export function isDuplicateKey(e: unknown): boolean {
  return isSupabaseError(e) && e.code === "23505";
}
