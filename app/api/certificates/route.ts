// app/api/certificates/route.ts
// Geração e validação de certificados de conclusão digitais
// Kiwify/Hotmart-level: nome, produto, data, código de validação, PDF

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CertificateRow {
  id: string;
  code: string;
  is_valid: boolean;
  buyer_name: string;
  product_name: string;
  issued_at: string;
}

interface ProfileInfo {
  full_name?: string | null;
}

interface ProductWithVendor {
  id: string;
  name: string;
  vendor_id: string;
  profiles?: ProfileInfo | ProfileInfo[] | null;
}

interface EntitlementCheck {
  id: string;
  product_tiers?: {
    saas_products?: {
      id: string;
      name: string;
      vendor_id: string;
      profiles?: ProfileInfo | ProfileInfo[] | null;
    } | {
      id: string;
      name: string;
      vendor_id: string;
      profiles?: ProfileInfo | ProfileInfo[] | null;
    }[] | null;
  } | null;
}

// GET — buscar certificado por ID ou validar código
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");

    const admin = createAdminClient();

    if (code) {
      // Validação pública de certificado
      const { data } = await admin
        .from("certificates")
        .select("id, code, buyer_name, product_name, issued_at, is_valid")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (!data) return failure("CERTIFICATE_NOT_FOUND", 404, "Certificado não encontrado.");
      const cert = data as CertificateRow;
      return success({ valid: cert.is_valid, certificate: data });
    }

    // Listar certificados do usuário
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Não autenticado.");

    const { data } = await admin
      .from("certificates")
      .select("id, code, product_name, vendor_name, issued_at, is_valid, product_id")
      .eq("user_id", user.id)
      .order("issued_at", { ascending: false });

    return success({ certificates: data ?? [] });
  } catch (e: unknown) {
    const msg = getErrorMessage(e, "Erro interno.");
    return failure("INTERNAL_ERROR", 500, msg);
  }
}

// POST — emitir certificado (chamado após completar produto/curso)
export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Não autenticado.");

    const { product_id } = await req.json();
    if (!product_id) return failure("MISSING_PRODUCT_ID", 400, "product_id é obrigatório.");

    const admin = createAdminClient();

    // Verificar entitlement ativo
    const { data: entitlement } = await admin
      .from("entitlements")
      .select("id, product_tiers(saas_products(id, name, vendor_id, profiles(full_name)))")
      .eq("user_id", user.id)
      .eq("status", "active")
      .contains("product_tiers", { saas_products: { id: product_id } })
      .maybeSingle();

    // Buscar dados do produto diretamente
    const { data: product } = await admin
      .from("saas_products")
      .select("id, name, vendor_id, profiles(full_name)")
      .eq("id", product_id)
      .single();

    if (!product) return failure("PRODUCT_NOT_FOUND", 404, "Produto não encontrado.");

    // ── Bloquear emissão sem entitlement activo ──────────────────────────────
    if (!entitlement) {
      return failure("NO_ACTIVE_ENTITLEMENT", 403, "Acesso não encontrado. É necessário ter o produto ativo para emitir certificado.");
    }

    // Verificar se já emitiu
    const { data: existing } = await admin
      .from("certificates")
      .select("id, code")
      .eq("user_id", user.id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (existing) return success({ certificate: existing, already_issued: true });

    // Buscar nome do comprador
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    // Gerar código único de validação: XXXX-XXXX-XXXX-XXXX
    const code = Array.from({ length: 4 }, () =>
      crypto.randomBytes(2).toString("hex").toUpperCase()
    ).join("-");

    const typedProduct = product as ProductWithVendor;
    const rawProfiles = typedProduct.profiles;
    const vendorName = Array.isArray(rawProfiles)
      ? rawProfiles[0]?.full_name ?? "Vendor"
      : rawProfiles?.full_name ?? "Vendor";

    const { data: cert, error } = await admin
      .from("certificates")
      .insert({
        user_id: user.id,
        product_id: product_id,
        code,
        buyer_name: (profile as ProfileInfo | null)?.full_name ?? user.email ?? "Participante",
        product_name: typedProduct.name,
        vendor_name: vendorName,
        vendor_id: typedProduct.vendor_id,
        issued_at: new Date().toISOString(),
        is_valid: true,
      })
      .select()
      .single();

    if (error) return failure("INSERT_FAILED", 500, getErrorMessage(error));
    return success({ certificate: cert, just_issued: true });
  } catch (e: unknown) {
    const msg = getErrorMessage(e, "Erro interno.");
    return failure("INTERNAL_ERROR", 500, msg);
  }
}
