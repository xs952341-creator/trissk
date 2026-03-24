// app/auth/callback/route.ts
// Sem este arquivo, OAuth do Google não funciona
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, emailWelcome } from "@/lib/email";
import { getErrorMessage } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] error:", getErrorMessage(error));
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(getErrorMessage(error))}`);
  }

  // Garante que o redirect é relativo (segurança)
  const redirectTo = next.startsWith("/") ? `${origin}${next}` : `${origin}/dashboard`;
  return NextResponse.redirect(redirectTo);
}
