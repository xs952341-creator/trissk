/**
 * lib/types/stripe-extended.ts
 * Extensões de tipos do Stripe para campos não tipados no SDK oficial.
 * Usa type casting (não extends) para evitar conflitos de interface.
 */

import type Stripe from "stripe";

// ── Invoice extras ────────────────────────────────────────────────────────────

export interface InvoiceExtraFields {
  billing_reason?: string | null;
  customer_details?: {
    address?: {
      country?: string | null;
      city?: string | null;
      line1?: string | null;
      postal_code?: string | null;
    } | null;
    email?: string | null;
    name?: string | null;
  } | null;
  customer_country?: string | null;
  customer_address?: { country?: string | null } | null;
  total_tax_amounts?: Array<{
    amount: number;
    inclusive: boolean;
    tax_rate: string | Stripe.TaxRate;
  }> | null;
  tax?: number | null;
}

export type InvoiceExtended = Stripe.Invoice & InvoiceExtraFields;

// ── Charge extras ─────────────────────────────────────────────────────────────

export interface CardDetails {
  fingerprint?: string | null;
  first6?: string | null;
  iin?: string | null;
  country?: string | null;
  brand?: string | null;
  last4?: string | null;
}

export interface ChargeExtraFields {
  payment_method_details?: {
    card?: CardDetails | null;
  } | null;
}

export type ChargeExtended = Stripe.Charge & ChargeExtraFields;

// ── Helper functions ──────────────────────────────────────────────────────────

/** Extrai o ID de um campo que pode ser string ou objeto expandido */
export function extractStripeId(
  field: string | { id: string } | null | undefined
): string | null {
  if (!field) return null;
  if (typeof field === "string") return field;
  return field.id ?? null;
}

/** Extrai billing_reason da invoice de forma segura */
export function getInvoiceBillingReason(invoice: Stripe.Invoice): string {
  return (invoice as InvoiceExtended).billing_reason ?? "";
}

/** Extrai o total de impostos de uma invoice (Stripe Tax ou legado) */
export function getInvoiceTaxCents(invoice: Stripe.Invoice): number {
  const inv = invoice as InvoiceExtended;
  if (Array.isArray(inv.total_tax_amounts) && inv.total_tax_amounts.length > 0) {
    return inv.total_tax_amounts.reduce((sum, t) => sum + (t.amount ?? 0), 0);
  }
  return inv.tax ?? 0;
}

/** Extrai país do comprador da invoice */
export function getInvoiceBuyerCountry(invoice: Stripe.Invoice): string {
  const inv = invoice as InvoiceExtended;
  return (
    inv.customer_address?.country ??
    inv.customer_details?.address?.country ??
    inv.customer_country ??
    "XX"
  );
}

/** Extrai dados do cartão de uma charge de forma tipada */
export function getChargeCardData(charge: Stripe.Charge): CardDetails | null {
  return (charge as ChargeExtended).payment_method_details?.card ?? null;
}
