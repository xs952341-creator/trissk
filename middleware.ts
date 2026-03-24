import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPublicAppDomain } from "@/lib/runtime-config";
import { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, IS_PROD } from "@/lib/env";
import { AFFILIATE_COOKIE_NAME, AFFILIATE_COOKIE_MAX_AGE, UTM_COOKIE_MAX_AGE, UTM_COOKIE_PREFIX } from "@/lib/config";

// ── Protected routes and the roles allowed to access them ────────────────────
const ROUTE_GUARDS: { prefix: string; roles: string[]; loginPath?: string }[] = [
  { prefix: "/admin",          roles: ["admin"],                                        loginPath: "/admin-login" },
  { prefix: "/vendor",         roles: ["vendor", "admin"] },
  { prefix: "/affiliate",      roles: ["affiliate", "admin"] },
  { prefix: "/buyer",          roles: ["buyer", "admin"] },
  { prefix: "/support",        roles: ["buyer", "vendor", "admin"] },
  { prefix: "/configuracoes",  roles: ["buyer", "vendor", "affiliate", "admin"] },
  { prefix: "/dashboard",      roles: ["buyer", "vendor", "affiliate", "admin"] },
  { prefix: "/carteira",       roles: ["buyer", "vendor", "affiliate", "admin"] },
];

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const response = NextResponse.next({ request: { headers: request.headers } });

  // ── 0. White-label: custom domain per vendor ──────────────────────────────
  // Se o host NÃO for o domínio principal da plataforma, verifica se é domínio
  // de um vendor. Se for, injeta o vendorId e productSlug via header para
  // as pages saberem qual produto exibir com o branding do vendor.
  const mainDomain = getPublicAppDomain();
  const isMainDomain = host === mainDomain || host.endsWith("localhost") || host.endsWith("vercel.app");

  if (!isMainDomain && !pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
    // Buscar vendor pelo custom_domain
    const supabaseWL = createServerClient(
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );

    const { data: vendorDomain } = await supabaseWL
      .from("vendor_custom_domains")
      .select("vendor_id, product_slug, verified")
      .eq("domain", host)
      .eq("verified", true)
      .maybeSingle();

    if (vendorDomain) {
      // Adiciona headers para as pages saberem o contexto white-label
      const wlHeaders = new Headers(request.headers);
      wlHeaders.set("x-white-label-vendor-id",   vendorDomain.vendor_id);
      wlHeaders.set("x-white-label-domain",       host);
      wlHeaders.set("x-white-label-product-slug", vendorDomain.product_slug ?? "");

      // Se a rota é "/" no domínio customizado → redirecionar para a página do produto
      if (pathname === "/" && vendorDomain.product_slug) {
        return NextResponse.rewrite(
          new URL(`/produtos/${vendorDomain.product_slug}`, request.url),
          { request: { headers: wlHeaders } }
        );
      }

      return NextResponse.next({ request: { headers: wlHeaders } });
    }
  }

  // ── 1. Last-Click affiliate cookie (httpOnly, 60 days) ────────────────────
  const ref = searchParams.get("ref");
  if (ref && /^[a-zA-Z0-9_-]{1,64}$/.test(ref)) {
    response.cookies.set(AFFILIATE_COOKIE_NAME, ref, {
      httpOnly: true,
      maxAge:   AFFILIATE_COOKIE_MAX_AGE,
      path:     "/",
      sameSite: "lax",
      secure:   IS_PROD,
    });
  }

  // ── 1b. UTM cookies (7 dias) ─────────────────────────────────────────────
  // Mantém tracking simples para marketing/afiliados sem depender de tools externas.
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
  for (const k of utmKeys) {
    const v = searchParams.get(k);
    if (v && v.length <= 120) {
      response.cookies.set(`${UTM_COOKIE_PREFIX}${k}`, v, {
        httpOnly: true,
        maxAge: UTM_COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax",
        secure: IS_PROD,
      });
    }
  }
  // Referrer (opcional)
  const referrer = request.headers.get("referer");
  if (referrer && referrer.length <= 500) {
    response.cookies.set(`${UTM_COOKIE_PREFIX}referrer`, referrer, {
      httpOnly: true,
      maxAge: UTM_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: IS_PROD,
    });
  }

  // ── 2. Find if this route needs protection ────────────────────────────────
  const guard = ROUTE_GUARDS.find((g) => pathname.startsWith(g.prefix));
  if (!guard) return response;   // Public route — let through

  // ── 3. Build Supabase server client with request cookies ──────────────────
  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get:    (name: string) => request.cookies.get(name)?.value,
        set:    (name: string, value: string, options: Record<string, unknown>) => response.cookies.set({ name, value, ...options }),
        remove: (name: string, options: Record<string, unknown>) => response.cookies.set({ name, value: "", ...options, maxAge: 0 }),
      },
    }
  );

  // ── 4. Validate session ───────────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginPath = guard.loginPath ?? "/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 5. Get role from profiles (with service_role for reliability) ─────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  const userRole = profile?.role ?? "buyer";

  if (!guard.roles.includes(userRole)) {
    // Admin trying to access non-admin area → their dashboard
    // Non-admin trying to access admin area → admin-login
    if (guard.prefix === "/admin") {
      return NextResponse.redirect(new URL("/admin-login", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/vendor/:path*",
    "/affiliate/:path*",
    "/buyer/:path*",
    "/support/:path*",
    "/configuracoes/:path*",
    "/dashboard/:path*",
    "/carteira/:path*",
    "/((?!_next/static|_next/image|favicon.ico|api|login|admin-login|termos|playbook).*)",
  ],
};
