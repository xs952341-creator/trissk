// app/api/delivery/download/route.ts
// Entrega segura de ficheiros (PDF, ZIP, etc.) com Signed URL anti-pirataria.
//
// GET /api/delivery/download?productId=<uuid>
//
// Fluxo:
//  1. Autentica o utilizador
//  2. Verifica entitlement activo para o produto
//  3. Lê file_path do produto na tabela saas_products
//  4. Gera Signed URL (expira em 60s) no bucket privado "secure_products"
//  5. Redireciona → browser inicia download imediatamente
//
// Anti-pirataria:
//  - URL expira em 60 segundos — inutilizável se partilhada
//  - Bucket é PRIVADO — impossível aceder directamente
//  - Registo de auditoria para cada download
//
// Rate limit: 5 downloads por utilizador por hora (evita abuso)

import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { rateLimit, getIP }   from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const productId = searchParams.get("productId");

  if (!productId) {
    return NextResponse.json({ error: "productId é obrigatório." }, { status: 400 });
  }

  // ── Rate limit: 5 downloads por hora por IP/user ────────────────────────────
  const rl = await rateLimit(`download:${getIP(req)}`, 5, 3_600_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Limite de downloads atingido. Aguarde antes de tentar novamente." },
      { status: 429 }
    );
  }

  const supabase = createClient();

  // ── 1. Autenticação ────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const admin = createAdminClient();

  // ── 2. Verificar entitlement activo ────────────────────────────────────────
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("id, status")
    .eq("user_id",    user.id)
    .eq("product_id", productId)
    .eq("status",     "active")
    .maybeSingle();

  if (!entitlement) {
    return NextResponse.json(
      { error: "Não encontrámos uma compra activa para este produto na sua conta." },
      { status: 403 }
    );
  }

  // ── 3. Buscar file_path do produto ─────────────────────────────────────────
  const { data: product, error: prodErr } = await admin
    .from("saas_products")
    .select("name, file_path, delivery_type")
    .eq("id", productId)
    .single();

  if (prodErr || !product) {
    return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  }

  if (!product.file_path) {
    return NextResponse.json(
      { error: "Este produto não tem um ficheiro de download configurado pelo vendedor." },
      { status: 422 }
    );
  }

  // ── 4. Gerar Signed URL (expira em 60s) ────────────────────────────────────
  const { data: signed, error: signErr } = await admin.storage
    .from("secure_products")
    .createSignedUrl(product.file_path, 60, {
      download: product.name ?? true,  // força o nome do ficheiro no download
    });

  if (signErr || !signed?.signedUrl) {
    console.error("[delivery/download] Signed URL error:", getErrorMessage(signErr));
    return NextResponse.json(
      { error: "Erro ao preparar o ficheiro para download. Tente novamente." },
      { status: 500 }
    );
  }

  // ── 5. Auditoria (best-effort) ─────────────────────────────────────────────
  await admin.from("audit_logs").insert({
    user_id:  user.id,
    event:    "file.download",
    resource: productId,
    metadata: JSON.stringify({
      product_name: product.name,
      file_path:    product.file_path,
      ip:           getIP(req),
    }),
  }).then(undefined, () => {});

  // ── 6. Redirecionar para download ─────────────────────────────────────────
  return NextResponse.redirect(signed.signedUrl);
}
