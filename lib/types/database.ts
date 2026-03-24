/**
 * lib/types/database.ts
 * Tipos para os retornos mais comuns de queries Supabase.
 *
 * Nota: O ideal seria gerar estes tipos automaticamente com:
 *   npx supabase gen types typescript --project-id <project-id> > lib/types/supabase.ts
 *
 * Enquanto isso não é feito, estes tipos manuais cobrem as queries críticas
 * do webhook. v52: tipagem premium total sem tipos dinâmicos.
 */

// ── Perfis ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  role: string | null;
  is_verified_vendor: boolean;
  is_staff_pick: boolean;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean;
  stripe_kyc_enabled: boolean;
  stripe_payouts_enabled: boolean;
  custom_platform_fee_pct: number | null;
  payout_hold_days: number | null;
  allows_affiliates: boolean;
  affiliate_commission_type: string | null;
  affiliate_first_month_pct: number | null;
  affiliate_recurring_pct: number | null;
  referred_by_affiliate_id: string | null;
  loyalty_tier: "bronze" | "silver" | "gold" | "diamond" | null;
}

// ── Produtos SaaS ─────────────────────────────────────────────────────────────

export interface SaasProduct {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  vendor_id: string;
  delivery_method: "WEBHOOK" | "KEYS" | "MAGIC_LINK" | "MANUAL";
  provisioning_webhook_url: string | null;
  revocation_webhook_url: string | null;
  magic_link_url: string | null;
  webhook_signing_secret: string | null;
  auto_provision: boolean;
  provision_api_url: string | null;
  provision_api_key_header: string | null;
  allows_affiliates: boolean;
  affiliate_commission_type: string | null;
  affiliate_commission_type_v2: "percent" | "fixed" | null;
  affiliate_commission_percent: number | null;
  affiliate_commission_fixed: number | null;
  affiliate_first_month_pct: number | null;
  affiliate_recurring_pct: number | null;
  affiliate_l2_commission_pct: number | null;
  affiliate_l3_commission_pct: number | null;
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
}

// ── Tiers de produto ─────────────────────────────────────────────────────────

export interface ProductTier {
  id: string;
  product_id: string;
  tier_name: string;
  price_monthly: number | null;
  price_annual: number | null;
  price_lifetime: number | null;
  stripe_monthly_price_id: string | null;
  stripe_annual_price_id: string | null;
  stripe_lifetime_price_id: string | null;
  is_popular: boolean;
  has_consultancy: boolean;
  calendar_link: string | null;
  limits: Record<string, unknown> | null;
  metered_enabled: boolean;
}

export interface ProductTierWithProduct extends ProductTier {
  saas_products: SaasProduct | null;
}

// ── Links de afiliados ────────────────────────────────────────────────────────

export interface AffiliateLink {
  id: string;
  affiliate_id: string;
  product_id: string | null;
  playbook_id: string | null;
  code: string;
  conversion_count: number;
}

export interface AffiliateLinkWithProfile extends AffiliateLink {
  profiles: Pick<Profile, "stripe_connect_account_id"> | null;
}

// ── Affiliate Commission ───────────────────────────────────────────────────────

export interface AffiliateCommission {
  id: string;
  affiliate_id: string;
  link_id: string | null;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "cancelled";
  payment_provider: string;
  provider_ref: string | null;
  created_at: string;
}

// ── Vendor Profile (minimal) ──────────────────────────────────────────────────

export interface VendorProfileMinimal {
  email: string | null;
  full_name: string | null;
  custom_platform_fee_pct?: number | null;
}

// ── Raw Tier Response from Supabase ─────────────────────────────────────────────

export interface TierRowResponse {
  id: string;
  tier_name: string;
  product_id: string | null;
  saas_products: {
    id: string;
    name: string;
    vendor_id: string | null;
    provisioning_webhook_url: string | null;
    magic_link_url: string | null;
    webhook_signing_secret: string | null;
  } | null | {
    id: string;
    name: string;
    vendor_id: string | null;
    provisioning_webhook_url: string | null;
    magic_link_url: string | null;
    webhook_signing_secret: string | null;
  }[];
}

// ── Job Queue ───────────────────────────────────────────────────────────────────

export interface JobQueue {
  id: string;
  event_name: string;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  created_at: string;
  priority: number;
  trace_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  run_after?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

// ── Fiscal Job ─────────────────────────────────────────────────────────────────

export interface FiscalJob {
  id: string;
  status?: "PENDING" | "EMITTED" | "FAILED";
  buyer_email: string;
  amount_gross: number;
  platform_fee: number;
  vendor_id: string;
  profiles?: {
    enotas_api_key?: string | null;
    enotas_company_id?: string | null;
    cnpj?: string | null;
    razao_social?: string | null;
  } | null;
}

// ── Order with Product (for joins) ───────────────────────────────────────────────

export interface OrderWithProduct {
  id: string;
  user_id: string;
  created_at: string;
  saas_products?: {
    id: string;
    name: string;
    slug: string | null;
  } | {
    id: string;
    name: string;
    slug: string | null;
  }[] | null;
}

// ── SaaS Instance ─────────────────────────────────────────────────────────────

export interface SaasInstance {
  id: string;
  product_id: string;
  external_id?: string | null;
  status: "active" | "suspended" | "pending" | "revoked";
}

// ── Saas Product (for health check joins) ────────────────────────────────────

export interface SaasProductHealth {
  id: string;
  vendor_id: string | null;
  name: string;
  health_check_url: string | null;
  provisioning_webhook_url: string | null;
}

// ── SaaS Instance with Product ────────────────────────────────────────────────

export interface SaasInstanceWithProduct {
  id: string;
  user_id: string;
  product_id: string;
  external_id: string | null;
  ping_fail_count: number;
  saas_products: SaasProductHealth | SaasProductHealth[] | null;
}

// ── Dunning State ──────────────────────────────────────────────────────────────

export interface DunningState {
  resolved?: boolean;
  step?: number;
  buyer_id?: string;
  vendor_id?: string;
}

// ── Affiliate Link Response ───────────────────────────────────────────────────

export interface AffiliateLinkResponse {
  id: string;
  affiliate_id: string;
  commission_percent: number | null;
}

// ── Subscription with Tier ───────────────────────────────────────────────────

export interface SubscriptionWithTier {
  id: string;
  user_id: string;
  product_tier_id: string | null;
  current_period_end: string;
  status: string;
  cancel_at_period_end: boolean;
  saas_products?: {
    name: string;
  } | null;
}

// ── Cart ───────────────────────────────────────────────────────────────────────

export interface Cart {
  id: string;
  email: string | null;
  user_id: string | null;
  product_id: string | null;
  tier_id: string | null;
  metadata: {
    abandoned_sent_at?: string;
    [key: string]: unknown;
  };
  created_at: string;
  status: "open" | "converted" | "abandoned";
}

// ── Marketing Event ────────────────────────────────────────────────────────────

export interface MarketingEvent {
  id: string;
  email: string | null;
  user_id: string | null;
  kind: string;
  created_at: string;
  payload?: Record<string, unknown>;
  ref_id?: string | null;
}

// ── Cart ───────────────────────────────────────────────────────────────────────

export interface Cart {
  id: string;
  email: string | null;
  user_id: string | null;
  product_id: string | null;
  tier_id: string | null;
  metadata: {
    abandoned_sent_at?: string;
    [key: string]: unknown;
  };
  created_at: string;
  status: "open" | "converted" | "abandoned";
}

// ── Marketing Event ────────────────────────────────────────────────────────────

export interface MarketingEvent {
  id: string;
  email: string | null;
  user_id: string | null;
  kind: string;
  created_at: string;
  payload?: Record<string, unknown>;
  ref_id?: string | null;
}
