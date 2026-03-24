import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PLATFORM_FEE_PCT } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const supabase = createAdminClient();

// POST /api/vendor/referrals/accept  { code, referred_vendor_id }

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = (body?.code ?? "").toString().trim().toUpperCase();
    const referredVendorId = (body?.referred_vendor_id ?? "").toString().trim();
  
    if (!code || !referredVendorId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  
    // valida code
    const { data: ref, error: rErr } = await supabase
      .from("vendor_referral_codes")
      .select("id,referrer_id,code,active")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();
  
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (!ref) return NextResponse.json({ error: "invalid_code" }, { status: 404 });
    if (ref.referrer_id === referredVendorId) return NextResponse.json({ error: "self_referral" }, { status: 400 });
  
    // cria reward (6 meses)
    const until = new Date();
    until.setMonth(until.getMonth() + 6);
  
    // evita duplicar reward para mesmo referred
    const { data: existing } = await supabase
      .from("vendor_referral_rewards")
      .select("id")
      .eq("referrer_id", ref.referrer_id)
      .eq("referred_vendor_id", referredVendorId)
      .maybeSingle();
  
    if (existing) return NextResponse.json({ ok: true, already: true });
  
    // calcula fee reduzida (ex: -2pp, mínimo 0)
    const { data: prof } = await supabase
      .from("profiles")
      .select("custom_platform_fee_pct")
      .eq("id", ref.referrer_id)
      .maybeSingle();
  
    const current = Number((prof as Record<string, unknown>)?.custom_platform_fee_pct ?? DEFAULT_PLATFORM_FEE_PCT);
    const reduced = Math.max(0, current - 2);
  
    const { error: iErr } = await supabase.from("vendor_referral_rewards").insert({
      referrer_id: ref.referrer_id,
      referred_vendor_id: referredVendorId,
      code,
      previous_fee_pct: current,
      discounted_fee_pct: reduced,
      discount_until: until.toISOString(),
      active: true,
    });
  
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  
    // aplica fee reduzida (sem quebrar se campo não existir)
    await supabase.from("profiles").update({ custom_platform_fee_pct: reduced }).eq("id", ref.referrer_id);
  
    return NextResponse.json({ ok: true, discounted_fee_pct: reduced, discount_until: until.toISOString() });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
