// app/api/oauth/callback/route.ts
// Callback OAuth 2.0 — recebe o authorization code após o vendor autorizar.
// Redireciona o browser de volta para a página de apps com feedback de sucesso.
//
// GET /api/oauth/callback?code=<code>&state=<state>

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp    = req.nextUrl.searchParams;
  const error = sp.get("error");

  if (error) {
    const url = new URL("/vendor/apps", req.nextUrl.origin);
    url.searchParams.set("oauth_error", error);
    return NextResponse.redirect(url.toString());
  }

  // Success — redirect back to apps page with success flag
  // (The actual token exchange happens server-to-server by the external app)
  const url = new URL("/vendor/apps", req.nextUrl.origin);
  url.searchParams.set("oauth_success", "1");
  return NextResponse.redirect(url.toString());
}
