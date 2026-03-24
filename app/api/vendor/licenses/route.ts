// app/api/vendor/licenses/route.ts
// Gestão de licenças pelo vendor: listar, revogar, regenerar.
// GET    /api/vendor/licenses?product_id=&status=&limit=&offset=
// POST   /api/vendor/licenses/revoke   — revogar licença
// POST   /api/vendor/licenses/regenerate — regenerar licença do comprador

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listLicensesByProduct, revokeLicense, createLicenseKey } from "@/lib/licenses";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const productId = url.searchParams.get("product_id");
    const status    = url.searchParams.get("status") ?? undefined;
    const limit     = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
    const offset    = Number(url.searchParams.get("offset") ?? 0);

    if (!productId) return NextResponse.json({ error: "product_id obrigatório" }, { status: 400 });

    // Verificar que o produto pertence ao vendor
    const admin = createAdminClient();
    const { data: product } = await admin
      .from("saas_products")
      .select("id, name")
      .eq("id", productId)
      .eq("vendor_id", user.id)
      .maybeSingle();

    if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    const licenses = await listLicensesByProduct(productId, { limit, offset, status });

    // Mascarar license_key (mostrar parcial: XXX...XXXXX)
    const masked = licenses.map((l: Record<string, unknown>) => ({
      ...l,
      license_key_preview: maskKey(String(l.license_key ?? "")),
      license_key:         undefined, // não expor chave completa na listagem
    }));

    return NextResponse.json({ licenses: masked, product: product.name });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

// ─── Revogar licença ───────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    // Verificar que a licença é de um produto do vendor
    const admin = createAdminClient();
    const { data: lic } = await admin
      .from("license_keys")
      .select("id, product_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (!lic) return NextResponse.json({ error: "Licença não encontrada" }, { status: 404 });

    const { data: product } = await admin
      .from("saas_products")
      .select("id")
      .eq("id", lic.product_id)
      .eq("vendor_id", user.id)
      .maybeSingle();

    if (!product) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const ok = await revokeLicense(id);

    // Notificar comprador
    await admin.from("notifications").insert({
      user_id:    lic.user_id,
      type:       "license_revoked",
      title:      "Licença revogada",
      body:       "Sua licença foi revogada. Entre em contato com o suporte.",
      action_url: "/buyer/meus-acessos",
    }).then(undefined, (e: Record<string, unknown>) => console.error("[vendor/licenses]", getErrorMessage(e)));

    return NextResponse.json({ revoked: ok });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

function maskKey(key: string): string {
  const parts = key.split("-");
  if (parts.length < 2) return "****-****";
  return `${parts[0]}-****-****-****-${parts[parts.length - 1]}`;
}
