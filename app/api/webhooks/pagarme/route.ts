// app/api/webhooks/pagarme/route.ts
// Webhook completo do Pagar.me com idempotência real por provider_event_id,
// tipagem completa, provisionamento automático de SaaS, entitlements,
// ordens, ledger e notificações.
// Compatível com Pagar.me v5 (core API) e payment links.
// Nunca quebra o app — todos os erros são capturados e logados.

import { NextRequest, NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/runtime-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailQueued, emailPurchaseReceipt, emailVendorNewSale } from "@/lib/email";
import { DEFAULT_PLATFORM_FEE_PCT } from "@/lib/config";
import { verifyPagarmePostbackSignature } from "@/lib/payments/pagarme-webhook";
import { getErrorMessage } from "@/lib/errors";
import type { TierRowResponse, VendorProfileMinimal, AffiliateLinkResponse } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase   = createAdminClient();
const APP_URL = getPublicAppUrl();
const DEFAULT_FEE_PCT = DEFAULT_PLATFORM_FEE_PCT;

// ── Local types ────────────────────────────────────────────────────────────────
type PagarmeMetadata = Record<string, string | null | undefined>;

type TierProduct = {
  id:                        string;
  name:                      string;
  vendor_id:                 string | null;
  provisioning_webhook_url:  string | null;
  magic_link_url:            string | null;
  webhook_signing_secret:    string | null;
};

type TierRow = {
  id:           string;
  tier_name:    string;
  product_id:   string | null;
  saas_products: TierProduct | TierProduct[] | null;
};

type VendorProfile = {
  email:      string | null;
  full_name:  string | null;
  custom_platform_fee_pct: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalises saas_products regardless of whether Supabase returns object or array. */
function extractProduct(tier: TierRow): TierProduct | null {
  if (!tier.saas_products) return null;
  if (Array.isArray(tier.saas_products)) return tier.saas_products[0] ?? null;
  return tier.saas_products;
}

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(v: unknown): string {
  return v != null ? String(v) : "";
}

// ── Route ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => "");
  if (!rawBody) return NextResponse.json({ error: "empty body" }, { status: 400 });

  // ── CRITICAL: validate postback signature ──────────────────────────────────
  const sigOk = verifyPagarmePostbackSignature({
    rawBody,
    signatureHeader: req.headers.get("x-hub-signature"),
  });
  if (!sigOk) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // ── Extract event + data ───────────────────────────────────────────────────
  const event      = safeStr(payload?.type ?? payload?.event ?? payload?.event_type);
  const data       = (payload?.data ?? payload) as Record<string, unknown>;
  const chargeData = (data?.charge ?? {}) as Record<string, unknown>;
  const linkData   = (data?.payment_link ?? {}) as Record<string, unknown>;

  const providerEventId = safeStr(
    data?.id ?? chargeData?.id ?? linkData?.id ?? data?.payment_link_id ?? null
  ) || null;

  // ── Idempotency by provider_event_id ──────────────────────────────────────
  if (providerEventId) {
    try {
      const { data: existing } = await supabase
        .from("webhook_events")
        .select("id, status")
        .eq("provider", "pagarme")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

      if (existing?.status === "processed") {
        return NextResponse.json({ received: true, duplicate: true });
      }

      // Upsert to mark as processing
      await supabase.from("webhook_events").upsert(
        {
          provider:          "pagarme",
          provider_event_id: providerEventId,
          type:              event || "unknown",
          status:            "processing",
          payload,
          attempts:          (existing ? 1 : 1), // increment handled by DB trigger if present
          last_error:        null,
          processed_at:      null,
        },
        { onConflict: "provider,provider_event_id" }
      );
    } catch {
      // webhook_events table is optional — continue without idempotency
    }
  }

  // ── Best-effort raw event persistence ─────────────────────────────────────
  try {
    await supabase.from("alt_payment_events").insert({
      provider:     "pagarme",
      provider_ref: providerEventId,
      event,
      payload,
    });
  } catch { /* optional table */ }

  // ── Extract metadata ───────────────────────────────────────────────────────
  const metadata = (
    data?.metadata ??
    linkData?.metadata ??
    chargeData?.metadata ??
    {}
  ) as PagarmeMetadata;

  const userId        = safeStr(metadata?.userId     ?? metadata?.user_id)     || null;
  const tierId        = safeStr(metadata?.tierId      ?? metadata?.tier_id ?? metadata?.productTierId) || null;
  const vendorId      = safeStr(metadata?.vendorId    ?? metadata?.vendor_id)  || null;
  const affiliateCode = safeStr(metadata?.affiliateCode)                        || null;

  // ── Check if this is a confirmed payment event ─────────────────────────────
  const isPaid =
    event === "charge.paid"   ||
    event === "payment.paid"  ||
    event === "order.paid"    ||
    event.includes("paid")    ||
    safeStr(data?.status) === "paid" ||
    safeStr(chargeData?.status) === "paid";

  if (!isPaid || !userId || !tierId) {
    await markWebhookEvent(providerEventId, "processed");
    return NextResponse.json({ received: true, skipped: "not_paid_or_missing_metadata" });
  }

  try {
    // ── Load tier ────────────────────────────────────────────────────────────
    const { data: rawTier } = await supabase
      .from("product_tiers")
      .select("id, tier_name, product_id, saas_products(id, name, vendor_id, provisioning_webhook_url, magic_link_url, webhook_signing_secret)")
      .eq("id", tierId)
      .maybeSingle();

    if (!rawTier) {
      console.error("[pagarme] tier not found:", tierId);
      await markWebhookEvent(providerEventId, "failed", "tier_not_found");
      return NextResponse.json({ received: true, error: "tier_not_found" });
    }

    const tier: TierRowResponse = rawTier;
    const product         = extractProduct(tier);
    const productId       = tier.product_id ?? null;
    const effectiveVendor = vendorId ?? product?.vendor_id ?? null;

    // ── Load buyer ───────────────────────────────────────────────────────────
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser.user?.email ?? "";
    const name  = authUser.user?.user_metadata?.full_name ?? "";

    // ── Amount ───────────────────────────────────────────────────────────────
    const amountCents = safeNum(
      data?.amount ?? chargeData?.amount ?? linkData?.amount ?? 0
    );
    const amountBRL = amountCents / 100;

    // ── Provision SaaS access ────────────────────────────────────────────────
    await provisionTierPagarme({ tierId, userId, email, name, product, productId });

    // ── Create Order (idempotent) ────────────────────────────────────────────
    await supabase.from("orders").upsert(
      {
        user_id:                  userId,
        vendor_id:                effectiveVendor,
        product_id:               productId,
        product_tier_id:          tierId,
        stripe_invoice_id:        null,
        stripe_payment_intent_id: null,
        amount_gross:             amountBRL,
        currency:                 "brl",
        status:                   "paid",
        payment_provider:         "pagarme",
        provider_ref:             providerEventId,
      },
      { onConflict: "provider_ref" }
    );

    // ── Entitlement ──────────────────────────────────────────────────────────
    await supabase.from("entitlements").upsert(
      {
        user_id:         userId,
        product_id:      productId,
        product_tier_id: tierId,
        status:          "active",
        source_type:     "pagarme",
      },
      { onConflict: "user_id,product_id,product_tier_id,playbook_id" }
    );

    // ── Platform revenue + vendor notifications ───────────────────────────────
    if (effectiveVendor && amountBRL > 0) {
      let feePct = DEFAULT_FEE_PCT;
      try {
        const { data: vp } = await supabase
          .from("profiles")
          .select("custom_platform_fee_pct")
          .eq("id", effectiveVendor)
          .maybeSingle();
        const override = Number(vp?.custom_platform_fee_pct ?? DEFAULT_FEE_PCT);
        if (Number.isFinite(override) && override > 0) feePct = override;
      } catch { /* use default */ }

      const feeBRL    = amountBRL * (feePct / 100);
      const payoutBRL = amountBRL - feeBRL;

      await supabase
        .from("platform_revenue")
        .insert({
          vendor_id:        effectiveVendor,
          gross_amount:     amountBRL,
          platform_fee:     feeBRL,
          vendor_payouts:   payoutBRL,
          currency:         "brl",
          payment_provider: "pagarme",
        })
        .then(undefined, (e: unknown) =>
          console.error("[webhooks/pagarme] platform_revenue:", getErrorMessage(e))
        );

      await supabase
        .from("notifications")
        .insert({
          user_id:    effectiveVendor,
          type:       "new_sale",
          title:      "💰 Nova Venda! (Pagar.me)",
          body:       `Você recebeu R$ ${amountBRL.toFixed(2)} via Pagar.me.`,
          action_url: "/vendor/sales",
        })
        .then(undefined, (e: unknown) =>
          console.error("[webhooks/pagarme] notification:", getErrorMessage(e))
        );

      // Vendor sale email
      try {
        const { data: vProf } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", effectiveVendor)
          .single();
        const vp: VendorProfileMinimal | null = vProf;
        if (vp?.email) {
          const tpl = emailVendorNewSale({
            vendorName: vp.full_name ?? undefined,
            buyerEmail: email || "Comprador",
            amountBRL:  `R$ ${payoutBRL.toFixed(2)}`,
            dashUrl:    `${APP_URL}/vendor/sales`,
          });
          await sendEmailQueued({ to: vp.email, ...tpl });
        }
      } catch { /* best-effort */ }
    }

    // ── Cashback points ──────────────────────────────────────────────────────
    try {
      const pts = Math.max(1, Math.floor(amountBRL * 2));
      await supabase.rpc("upsert_points", {
        p_user_id: userId,
        p_pts:     pts,
        p_desc:    "Pontos por compra (Pagar.me)",
      }).maybeSingle();
    } catch { /* best-effort */ }

    // ── Buyer confirmation email ─────────────────────────────────────────────
    try {
      if (email) {
        const productName = product?.name ?? tier.tier_name ?? "produto";
        const tpl = emailPurchaseReceipt({
          name,
          amountBRL:   `R$ ${amountBRL.toFixed(2)}`,
          productName,
          accessUrl:   `${APP_URL}/buyer`,
        });
        await sendEmailQueued({ to: email, subject: tpl.subject, html: tpl.html });
      }
    } catch { /* best-effort */ }

    // ── SaaS instance provisioning via RPC ───────────────────────────────────
    if (productId) {
      await supabase
        .rpc("provision_saas_instance", {
          p_user_id:         userId,
          p_product_id:      productId,
          p_product_tier_id: tierId,
          p_invoice_id:      providerEventId ?? null,
          p_external_id:     null,
          p_access_url:      product?.magic_link_url ?? null,
        })
        .then(undefined, (e: unknown) =>
          console.error("[webhooks/pagarme] saas_instance:", getErrorMessage(e))
        );
    }

    // ── Affiliate commission (best-effort) ───────────────────────────────────
    if (affiliateCode && amountBRL > 0) {
      try {
        const { data: affiliate } = await supabase
          .from("affiliate_links")
          .select("id, affiliate_id, commission_percent")
          .eq("code", affiliateCode)
          .maybeSingle<AffiliateLinkResponse>();

        if (affiliate) {
          const commPct = Number(affiliate.commission_percent ?? 20);
          const commBRL = amountBRL * (commPct / 100);
          await supabase.from("affiliate_commissions").insert({
            affiliate_id:   affiliate.affiliate_id,
            link_id:        affiliate.id,
            order_id:       null,
            amount:         commBRL,
            currency:       "brl",
            status:         "pending",
            payment_provider: "pagarme",
            provider_ref:   providerEventId,
          });
        }
      } catch { /* best-effort */ }
    }

    // ── Mark event as processed ──────────────────────────────────────────────
    await markWebhookEvent(providerEventId, "processed");

    console.log(`[pagarme] paid: user=${userId} tier=${tierId} amount=${amountBRL}`);
    return NextResponse.json({ received: true, provisioned: true });

  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    console.error("[pagarme] processing error:", msg);
    await markWebhookEvent(providerEventId, "failed", msg);
    return NextResponse.json({ received: true, error: msg });
  }
}

// ── Mark webhook_events row with final status ──────────────────────────────────
async function markWebhookEvent(
  providerEventId: string | null,
  status:          "processed" | "failed",
  errorMsg?:       string
): Promise<void> {
  if (!providerEventId) return;
  try {
    await supabase
      .from("webhook_events")
      .update({
        status,
        processed_at: new Date().toISOString(),
        last_error:   errorMsg ?? null,
      })
      .eq("provider", "pagarme")
      .eq("provider_event_id", providerEventId);
  } catch { /* optional */ }
}

// ── SaaS provisioning via webhook ─────────────────────────────────────────────
async function provisionTierPagarme(opts: {
  tierId:     string;
  userId:     string;
  email:      string;
  name:       string;
  product:    TierProduct | null;
  productId:  string | null;
}): Promise<void> {
  const { tierId, userId, email, name, product, productId } = opts;

  const url = product?.provisioning_webhook_url ?? product?.magic_link_url ?? null;
  if (!url) return;

  const body = {
    event:            "user.provisioned",
    buyer:            { id: userId, email, name },
    tier:             { id: tierId, name: product?.name ?? "" },
    product_id:       productId,
    payment_provider: "pagarme",
    timestamp:        new Date().toISOString(),
  };

  const bodyStr = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Sign if signing secret is configured
  const secret = product?.webhook_signing_secret;
  if (secret) {
    const { createHmac } = await import("crypto");
    const sig = createHmac("sha256", secret).update(bodyStr).digest("hex");
    headers["x-playbook-signature"] = `sha256=${sig}`;
    headers["x-playbook-event"]     = "user.provisioned";
  }

  let httpStatus: number | null = null;
  let errorMsg: string | null   = null;

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers,
      body:    bodyStr,
      signal:  AbortSignal.timeout(10_000),
    });
    httpStatus = res.status;
    if (!res.ok) errorMsg = `HTTP ${res.status}`;
  } catch (e: unknown) {
    errorMsg = getErrorMessage(e, "fetch_failed");
  }

  // Persist delivery event
  await supabase
    .from("delivery_events")
    .insert({
      user_id:           userId,
      product_id:        productId,
      vendor_id:         null,
      playbook_id:       null,
      stripe_invoice_id: null,
      url,
      status:            errorMsg ? "failed" : "success",
      http_status:       httpStatus,
      error_message:     errorMsg,
    })
    .then(undefined, (e: unknown) =>
      console.error("[webhooks/pagarme] delivery_events:", getErrorMessage(e))
    );
}
