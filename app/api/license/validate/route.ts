import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admin = createAdminClient();

// Local types
interface LicenseKeyRow {
  user_id: string;
  status: string;
  expires_at?: string | null;
}

interface EntitlementRow {
  status: string;
  ends_at?: string | null;
  product_tier_id?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return failure("MISSING_API_KEY", 401, "x-api-key header obrigatório");

    const body = await req.json().catch(() => ({})) as { product_id?: string; license_key?: string };
    const product_id = String(body.product_id ?? "");
    const license_key = String(body.license_key ?? "");

    if (!product_id || !license_key) {
      return failure("MISSING_PARAMS", 400, "product_id e license_key são obrigatórios");
    }

    const { data: product } = await admin
      .from("saas_products")
      .select("id, webhook_signing_secret")
      .eq("id", product_id)
      .maybeSingle();

    if (!product?.webhook_signing_secret || product.webhook_signing_secret !== apiKey) {
      return failure("INVALID_API_KEY", 401, "API key inválida");
    }

    const { data: keyRow } = await admin
      .from("license_keys")
      .select("user_id, status, expires_at")
      .eq("product_id", product_id)
      .eq("license_key", license_key)
      .maybeSingle();

    if (!keyRow) {
      return success({ valid: false, reason: "not_found" });
    }

    const typedKey = keyRow as LicenseKeyRow;
    if (typedKey.status !== "active") {
      return success({ valid: false, reason: "inactive" });
    }

    const exp = typedKey.expires_at ? new Date(typedKey.expires_at).getTime() : null;
    if (exp && exp < Date.now()) {
      return success({ valid: false, reason: "expired" });
    }

    // valida entitlement (fonte única)
    const { data: ent } = await admin
      .from("entitlements")
      .select("status, ends_at, product_tier_id")
      .eq("user_id", typedKey.user_id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (!ent) {
      return success({ valid: false, reason: "no_entitlement" });
    }

    const typedEnt = ent as EntitlementRow;
    if (typedEnt.status !== "active") {
      return success({ valid: false, reason: "no_entitlement" });
    }
    const ends = typedEnt.ends_at ? new Date(typedEnt.ends_at).getTime() : null;
    if (ends && ends < Date.now()) {
      return success({ valid: false, reason: "entitlement_ended" });
    }

    return success({ valid: true, user_id: typedKey.user_id, product_tier_id: typedEnt.product_tier_id });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
