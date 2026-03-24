// app/api/oauth/authorize/route.ts
// Gateway OAuth 2.0 — Tela de autorização para Apps de terceiros.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local types
interface OAuthApp {
  client_id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  redirect_uris: string[];
  scopes: string[];
  status: string;
}

interface OAuthStateRow {
  id: string;
  expires_at: string;
  used_at?: string | null;
}

// Scope labels
const SCOPE_LABELS: Record<string, string> = {
  "read:sales": "Ver dados de vendas e receita",
  "read:products": "Ver os seus produtos",
  "read:buyers": "Ver lista de compradores",
  "write:products": "Criar e editar produtos",
  "read:analytics": "Ver relatórios e métricas",
  "write:webhooks": "Configurar webhooks",
};

// ── GET: Mostra a tela de consentimento ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const sp           = req.nextUrl.searchParams;
  const clientId     = sp.get("client_id")    ?? "";
  const redirectUri  = sp.get("redirect_uri") ?? "";
  const scope        = sp.get("scope")        ?? "";
  const state        = sp.get("state")        ?? "";
  const codeChallenge= sp.get("code_challenge") ?? "";

  if (!clientId) {
    return errorPage("client_id é obrigatório.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Se não autenticado → redirecionar para login
  if (!user) {
    const next = encodeURIComponent(req.nextUrl.pathname + "?" + req.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.nextUrl.origin));
  }

  const admin = createAdminClient();

  // Verificar que a App existe e está activa
  const { data: app, error: appErr } = await admin
    .from("oauth_applications")
    .select("client_id, name, description, logo_url, redirect_uris, scopes, status")
    .eq("client_id", clientId)
    .eq("status",    "active")
    .single();

  if (appErr || !app) {
    return errorPage("Aplicação não encontrada ou inativa.");
  }

  // Validar redirect_uri contra lista autorizada
  const cleanRedirect = redirectUri || app.redirect_uris[0];
  const isRedirectValid = app.redirect_uris.includes(cleanRedirect);
  if (!isRedirectValid) {
    return errorPage("redirect_uri não autorizada para esta aplicação.");
  }

  // Traduzir scopes para texto legível
  const requestedScopes: string[] = scope
    ? scope.split(",").map((s: string) => s.trim()).filter((s: string) => Boolean(s))
    : app.scopes;
  const scopeLabels: string[] = requestedScopes.map((s: string) => SCOPE_LABELS[s] ?? s);

  // ── Store state server-side for CSRF protection ─────────────────────────────
  if (state) {
    await admin.from("oauth_states").insert({
      state,
      vendor_id: user.id,
      client_id: clientId,
    }).then(undefined, () => {}); // best-effort — non-fatal
  }

  // Renderizar tela de consentimento em HTML (server-side, sem JS extra)
  const html = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${app.name} — Solicita Acesso</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080b0e;color:#f0f4f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:rgba(13,17,23,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:40px;max-width:420px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.5)}
    .logo{width:64px;height:64px;border-radius:16px;object-fit:cover;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 20px;border:1px solid rgba(255,255,255,0.08)}
    h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:8px}
    .subtitle{text-align:center;color:#8fa3b8;font-size:14px;margin-bottom:28px}
    .scopes{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:24px}
    .scopes p{font-size:12px;color:#4e6275;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:10px}
    .scope-item{display:flex;align-items:center;gap:8px;font-size:13px;color:#8fa3b8;padding:4px 0}
    .scope-item::before{content:"✓";color:#22d4a0;font-size:11px;font-weight:700}
    .buttons{display:flex;gap:12px}
    .btn{flex:1;padding:13px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;border:none;transition:all .2s}
    .btn-deny{background:rgba(255,255,255,0.05);color:#8fa3b8;border:1px solid rgba(255,255,255,0.08)}
    .btn-deny:hover{background:rgba(255,255,255,0.08);color:#f0f4f8}
    .btn-allow{background:#22d4a0;color:#041a12}
    .btn-allow:hover{background:#30e6b0;box-shadow:0 0 24px rgba(34,212,160,0.3)}
    .security{display:flex;align-items:center;gap:8px;font-size:11px;color:#2d3f4f;margin-top:20px;justify-content:center}
  </style>
</head>
<body>
<div class="card">
  ${app.logo_url
    ? `<img src="${app.logo_url}" alt="${app.name}" class="logo" />`
    : `<div class="logo">${app.name.charAt(0).toUpperCase()}</div>`}
  <h1>${app.name} solicita acesso</h1>
  <p class="subtitle">${app.description ?? `${app.name} quer aceder ao seu Workspace.`}</p>

  <div class="scopes">
    <p>Esta aplicação poderá:</p>
    ${scopeLabels.map((l: string) => `<div class="scope-item">${l}</div>`).join("")}
  </div>

  <form method="POST">
    <input type="hidden" name="client_id"      value="${clientId}">
    <input type="hidden" name="redirect_uri"   value="${cleanRedirect}">
    <input type="hidden" name="scope"          value="${requestedScopes.join(",")}">
    <input type="hidden" name="state"          value="${state}">
    <input type="hidden" name="code_challenge" value="${codeChallenge}">
    <div class="buttons">
      <button type="submit" name="decision" value="deny"  class="btn btn-deny">Recusar</button>
      <button type="submit" name="decision" value="allow" class="btn btn-allow">Autorizar</button>
    </div>
  </form>

  <p class="security">🔒 Ligação segura · Pode revogar o acesso a qualquer momento</p>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

// ── POST: Processar a decisão do vendor ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`oauth:${getIP(req)}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit atingido." }, { status: 429 });
  }

  const form        = await req.formData();
  const decision    = form.get("decision")     as string;
  const clientId    = form.get("client_id")    as string;
  const redirectUri = form.get("redirect_uri") as string;
  const scope       = form.get("scope")        as string;
  const state       = form.get("state")        as string;
  const codeChallenge = form.get("code_challenge") as string;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  // ── Declarar admin client primeiro (usado em state check e code generation) ──
  const admin = createAdminClient();

  // ── Re-validar client_id e redirect_uri contra a DB (nunca confiar em form fields) ──
  // Um atacante pode fabricar um form POST com client_id/redirect_uri falsos.
  // A validação no GET não protege o POST — campos hidden do form são editáveis.
  const { data: appCheck } = await admin
    .from("oauth_applications")
    .select("client_id, redirect_uris, status, scopes")
    .eq("client_id", clientId)
    .eq("status", "active")
    .maybeSingle();

  if (!appCheck) {
    return NextResponse.json({ error: "invalid_client", description: "Aplicação não encontrada." }, { status: 400 });
  }
  if (!appCheck.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri", description: "redirect_uri não autorizado." }, { status: 400 });
  }

  if (scope) {
    const requestedScopes = scope.split(",").map((s: string) => s.trim()).filter(Boolean);
    const allowedScopes = (appCheck as unknown as Record<string, unknown>).scopes as string[] ?? [];
    const invalidScopes = requestedScopes.filter((s: string) => !allowedScopes.includes(s));
    if (invalidScopes.length > 0 && allowedScopes.length > 0) {
      return NextResponse.json(
        { error: "invalid_scope", description: `Scopes não permitidos: ${invalidScopes.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // ── Verificar state (CSRF protection) ──────────────────────────────────────
  if (state) {
    const now = new Date().toISOString();
    const { data: storedState } = await admin
      .from("oauth_states")
      .select("id, expires_at, used_at")
      .eq("state", state)
      .eq("vendor_id", user.id)
      .maybeSingle();

    const typedState = storedState as unknown as OAuthStateRow;
    if (typedState.used_at || typedState.expires_at < now) {
      return NextResponse.json(
        { error: "invalid_state", description: "Estado OAuth inválido, expirado ou já utilizado." },
        { status: 400 }
      );
    }

    // Mark state as used (single-use)
    await admin.from("oauth_states").update({ used_at: now }).eq("state", state);
  }

  // ── Vendor recusou ───────────────────────────────────────────────────────
  if (decision === "deny") {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url.toString());
  }

  // ── Gerar authorization code ─────────────────────────────────────────────
  const code      = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  await admin.from("oauth_codes").insert({
    code,
    client_id:      clientId,
    vendor_id:      user.id,
    scope,
    redirect_uri:   redirectUri,
    code_challenge: codeChallenge || null,
    expires_at:     expiresAt,
  }).throwOnError();

  // ── Redirecionar de volta com o code ─────────────────────────────────────
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function errorPage(message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#080b0e;color:#f0f4f8">
      <h2 style="color:#f87171">Erro de Autorização</h2>
      <p style="color:#8fa3b8;margin-top:12px">${message}</p>
    </body></html>`,
    { status: 400, headers: { "Content-Type": "text/html" } }
  );
}
