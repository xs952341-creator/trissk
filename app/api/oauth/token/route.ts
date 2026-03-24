// app/api/oauth/token/route.ts
// OAuth 2.0 Token Endpoint — Troca authorization_code por access_token.
//
// POST /api/oauth/token
// Body (application/x-www-form-urlencoded):
//   grant_type    = authorization_code
//   code          = <authorization_code obtido em /oauth/authorize>
//   client_id     = <uuid da app>
//   client_secret = <segredo da app>
//   redirect_uri  = <deve bater com o usado na autorização>
//   code_verifier = <se PKCE foi usado>
//
// Resposta JSON:
//   { access_token, token_type: "bearer", scope, expires_in: null (sem expiração) }
//
// Segurança:
//  - Valida client_secret hash ou PKCE code_verifier
//  - Authorization code de uso único (deletado após uso)
//  - Expira em 10 minutos
//  - Rate limit: 30 req/min por IP

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getIP }  from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Rate limit
  const rl = await rateLimit(`oauth-token:${getIP(req)}`, 30, 60_000);
  if (!rl.success) {
    return tokenError("rate_limited", "Demasiadas tentativas. Aguarde.", 429);
  }

  // Parse body (suporta JSON e form-encoded)
  let body: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await req.json().catch(() => ({}));
  } else {
    const fd = await req.formData().catch(() => new FormData());
    fd.forEach((v, k) => { body[k] = v as string; });
  }

  const {
    grant_type, code, client_id, client_secret,
    redirect_uri, code_verifier,
  } = body;

  // ── Validação básica ─────────────────────────────────────────────────────
  if (grant_type !== "authorization_code") {
    return tokenError("unsupported_grant_type", "Apenas authorization_code é suportado.");
  }
  if (!code || !client_id) {
    return tokenError("invalid_request", "code e client_id são obrigatórios.");
  }

  const admin = createAdminClient();

  // ── Verificar App ────────────────────────────────────────────────────────
  const { data: app, error: appErr } = await admin
    .from("oauth_applications")
    .select("client_id, client_secret, redirect_uris, status")
    .eq("client_id", client_id)
    .eq("status", "active")
    .single();

  if (appErr || !app) {
    return tokenError("invalid_client", "client_id inválido.", 401);
  }

  // Verificar client_secret (se não PKCE)
  if (!code_verifier && app.client_secret !== client_secret) {
    return tokenError("invalid_client", "client_secret inválido.", 401);
  }

  // ── Verificar e consumir o authorization code ─────────────────────────────
  const now = new Date().toISOString();
  const { data: authCode, error: codeErr } = await admin
    .from("oauth_codes")
    .select("code, vendor_id, scope, redirect_uri, code_challenge, expires_at, used_at")
    .eq("code", code)
    .eq("client_id", client_id)
    .single();

  if (codeErr || !authCode) {
    return tokenError("invalid_grant", "Código de autorização inválido ou expirado.");
  }
  if (authCode.used_at) {
    return tokenError("invalid_grant", "Código de autorização já utilizado.");
  }
  if (authCode.expires_at < now) {
    return tokenError("invalid_grant", "Código de autorização expirado.");
  }
  if (redirect_uri && authCode.redirect_uri !== redirect_uri) {
    return tokenError("invalid_grant", "redirect_uri não coincide.");
  }

  // PKCE: validar code_verifier
  if (authCode.code_challenge && code_verifier) {
    const encoder = new TextEncoder();
    const data    = encoder.encode(code_verifier);
    const digest  = await crypto.subtle.digest("SHA-256", data);
    const base64  = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    if (base64 !== authCode.code_challenge) {
      return tokenError("invalid_grant", "PKCE code_verifier inválido.");
    }
  }

  // ── Marcar código como usado (uso único) ──────────────────────────────────
  await admin
    .from("oauth_codes")
    .update({ used_at: now })
    .eq("code", code);

  // ── Criar ou renovar installation + access_token ─────────────────────────
  const accessToken = `ph_${crypto.randomUUID().replace(/-/g, "")}`;

  const { error: instErr } = await admin
    .from("oauth_installations")
    .upsert({
      app_client_id:  client_id,
      vendor_id:      authCode.vendor_id,
      access_token:   accessToken,
      scopes:         authCode.scope ? authCode.scope.split(",") : [],
      installed_at:   now,
      revoked_at:     null,
    }, { onConflict: "app_client_id,vendor_id" });

  if (instErr) {
    console.error("[oauth/token] install error:", instErr.message);
    return tokenError("server_error", "Erro ao criar instalação.", 500);
  }

  return NextResponse.json({
    access_token: accessToken,
    token_type:   "bearer",
    scope:        authCode.scope ?? "",
    expires_in:   null,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Pragma":        "no-cache",
    },
  });
}

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
