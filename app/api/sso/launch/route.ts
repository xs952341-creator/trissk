// app/api/sso/launch/route.ts
// Single Sign-On (SSO) — Acesso mágico ao SaaS do Vendedor.
//
// GET /api/sso/launch?productId=<uuid>
//
// Fluxo:
//  1. Verifica autenticação do comprador na plataforma
//  2. Verifica que o utilizador tem entitlement activo para o produto
//  3. Lê sso_url + sso_secret do produto (configurado pelo vendor)
//  4. Assina JWT com email/userId/productId (expira em 5 min)
//  5. Redireciona para sso_url?token=<jwt>
//
// O vendor recebe o token, valida com o sso_secret, lê o email e faz login.
// Padrão idêntico ao "Login with Google" — JWT HS256, expiry curto.
//
// Segurança:
//  - Token expira em 5 minutos (evita reutilização de links)
//  - sso_secret nunca é exposto ao browser
//  - Rate limit: 10 launches por utilizador por minuto

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

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const rl = await rateLimit(`sso:${getIP(req)}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um momento." }, { status: 429 });
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
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>Acesso não encontrado</h2>
        <p>Não encontrámos uma compra activa para este produto na sua conta.</p>
        <a href="/buyer/meus-acessos" style="color:#6366f1">Ver os meus produtos</a>
      </body></html>`,
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }

  // ── 3. Buscar configuração SSO do produto ──────────────────────────────────
  const { data: product } = await admin
    .from("saas_products")
    .select("name, sso_url, sso_secret")
    .eq("id", productId)
    .single();

  if (!product?.sso_url || !product?.sso_secret) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>SSO não configurado</h2>
        <p>O vendedor de <strong>${product?.name ?? "este produto"}</strong> ainda não configurou o acesso automático.</p>
        <p style="color:#6b7280">Por favor, contacte o vendedor para obter as suas credenciais de acesso.</p>
        <a href="/support/novo" style="color:#6366f1">Abrir ticket de suporte</a>
      </body></html>`,
      { status: 422, headers: { "Content-Type": "text/html" } }
    );
  }

  // ── 4. Guardar segurança do secret antes de gerar JWT ───────────────────────
  // HS256 exige exactamente 256 bits (32 bytes). Se o vendor configurou uma
  // chave curta, devolve erro claro em vez de um Internal Server Error opaco.
  if (product.sso_secret.length < 32) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#080b0e;color:#f0f4f8">
        <h2 style="color:#fbbf24">Configuração de Segurança Incompleta</h2>
        <p style="color:#8fa3b8;margin-top:12px">
          O vendedor precisa de configurar uma Chave Secreta SSO com pelo menos 32 caracteres.<br>
          Por favor, contacte o suporte.
        </p>
      </body></html>`,
      { status: 422, headers: { "Content-Type": "text/html" } }
    );
  }

  // ── 5. Gerar JWT (HS256, expira em 5 minutos) ──────────────────────────────
  try {
    // Usar jose (edge-compatible JWT library — já incluída no Next.js runtime)
    const jose = await import("jose");
    const secret = new TextEncoder().encode(product.sso_secret);

    const jwt = await new jose.SignJWT({
      email:     user.email ?? "",
      userId:    user.id,
      productId,
      name:      user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("playbook-hub")
      .setAudience(productId)
      .setExpirationTime("5m")
      .sign(secret);

    // ── 5. Redirecionar para o SaaS do vendor ─────────────────────────────────
    const redirectUrl = new URL(product.sso_url);
    redirectUrl.searchParams.set("token", jwt);

    // Log de auditoria (best-effort)
    await admin.from("audit_logs").insert({
      user_id:    user.id,
      event:      "sso.launch",
      resource:   productId,
      metadata:   JSON.stringify({ product_name: product.name, ip: getIP(req) }),
    }).then(undefined, () => {});

    return NextResponse.redirect(redirectUrl.toString());

  } catch (err: unknown) {
    console.error("[SSO launch]", getErrorMessage(err));
    return NextResponse.json({ error: "Erro ao gerar token de acesso." }, { status: 500 });
  }
}
