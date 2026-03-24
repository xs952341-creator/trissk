// app/api/health/route.ts — Health check endpoint para monitoramento
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { APP_NAME, APP_VERSION } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; latency?: number; error?: string }> = {};

  // ── 1. DB ping ────────────────────────────────────────────────────────────
  try {
    const dbStart = Date.now();
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1).maybeSingle();
    checks.database = { ok: !error, latency: Date.now() - dbStart, ...(error ? { error: getErrorMessage(error) } : {}) };
  } catch (e: unknown) {
    checks.database = { ok: false, error: getErrorMessage(e, "unknown") };
  }

  // ── 2. Env vars ───────────────────────────────────────────────────────────
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
  ];
  const missingEnv = requiredEnv.filter(k => !process.env[k]);
  checks.env_vars = { ok: missingEnv.length === 0, ...(missingEnv.length ? { error: `Missing: ${missingEnv.join(", ")}` } : {}) };

  // ── 3. Stripe key format ───────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  checks.stripe_key = { ok: stripeKey.startsWith("sk_") };

  const allOk = Object.values(checks).every(c => c.ok);
  const totalLatency = Date.now() - start;

  return NextResponse.json({
    ok: allOk,
    app: APP_NAME,
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    latency_ms: totalLatency,
    checks,
  }, {
    status: allOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
