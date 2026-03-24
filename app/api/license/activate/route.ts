// app/api/license/activate/route.ts
// Ativa uma license key para uma máquina/device específico.
// Chamado pelo software do vendor no computador do comprador.
// POST /api/license/activate
// { product_id, license_key, hardware_id, user_agent? }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateLicense } from "@/lib/licenses";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId  = String(body.product_id  ?? "").trim();
    const licenseKey = String(body.license_key ?? "").trim();
    const hardwareId = String(body.hardware_id ?? "").trim();

    if (!productId || !licenseKey) {
      return NextResponse.json({ error: "product_id e license_key são obrigatórios" }, { status: 400 });
    }

    // Verificar API key do produto (vendor autentica com webhook_signing_secret)
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "x-api-key header obrigatório" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: product } = await admin
      .from("saas_products")
      .select("id, name, webhook_signing_secret")
      .eq("id", productId)
      .maybeSingle();

    if (!product || product.webhook_signing_secret !== apiKey) {
      return NextResponse.json({ error: "API key inválida" }, { status: 401 });
    }

    // Validar e ativar
    const result = await validateLicense(
      productId,
      licenseKey,
      hardwareId || undefined
    );

    if (!result.valid) {
      return NextResponse.json(
        { valid: false, reason: result.reason },
        { status: 422 }
      );
    }

    return NextResponse.json({
      valid:          true,
      product_name:   product.name,
      activations:    result.activationsUsed,
      machine_limit:  result.machineLimit,
      expires_at:     result.expiresAt,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
