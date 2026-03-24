import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const DEVICE_COOKIE = "ph_device";

export async function getOrSetDeviceIdCookie(req: NextRequest): Promise<{ deviceId: string; setCookie?: string }> {
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  if (existing && existing.length >= 16) return { deviceId: existing };

  const deviceId = crypto.randomBytes(16).toString("hex");
  const maxAge = 60 * 60 * 24 * 365; // 1 ano
  const setCookie = `${DEVICE_COOKIE}=${deviceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  return { deviceId, setCookie };
}

/**
 * Advanced fraud guard:
 * - allowlists/blocklists
 * - velocity per device/IP
 * - vendor chargeback rate signal (best-effort)
 */
export async function recordCheckoutAttempt(args: {
  userId: string;
  vendorId?: string | null;
  deviceId: string;
  ip?: string | null;
}): Promise<{ blocked: boolean; reason?: string }> {
  const supabase = createAdminClient();
  const ip = args.ip ?? null;

  // Allowlist/Blocklist (best-effort)
  const { data: allow } = await supabase
    .from("fraud_allowlists")
    .select("id")
    .or([
      `user_id.eq.${args.userId}`,
      args.deviceId ? `device_id.eq.${args.deviceId}` : "",
      ip ? `ip.eq.${ip}` : "",
    ].filter(Boolean).join(","))
    .maybeSingle();

  if (allow?.id) {
    return { blocked: false };
  }

  const { data: block } = await supabase
    .from("fraud_blocklists")
    .select("id, reason")
    .or([
      `user_id.eq.${args.userId}`,
      args.deviceId ? `device_id.eq.${args.deviceId}` : "",
      ip ? `ip.eq.${ip}` : "",
    ].filter(Boolean).join(","))
    .maybeSingle();

  if (block?.id) return { blocked: true, reason: block.reason ?? "Transação bloqueada." };

  // Device record
  await supabase.from("fraud_devices").upsert({
    device_id: args.deviceId,
    last_ip: ip,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "device_id" });

  const now = new Date();
  const windowMs = 10 * 60_000; // 10 min
  const since = new Date(now.getTime() - windowMs).toISOString();

  // Log attempt
  await supabase.from("fraud_events").insert({
    kind: "checkout_attempt",
    user_id: args.userId,
    device_id: args.deviceId,
    ip,
    meta: { vendor_id: args.vendorId ?? null },
    created_at: new Date().toISOString(),
  });

  // Velocity counts
  const { count: deviceCount } = await supabase
    .from("fraud_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "checkout_attempt")
    .eq("device_id", args.deviceId)
    .gte("created_at", since);

  const { count: ipCount } = ip
    ? await supabase
        .from("fraud_events")
        .select("id", { count: "exact", head: true })
        .eq("kind", "checkout_attempt")
        .eq("ip", ip)
        .gte("created_at", since)
    : { count: 0 };

  // Vendor dispute signal (best-effort)
  let vendorRisk = 0;
  if (args.vendorId) {
    const { data: vr } = await supabase
      .from("fraud_vendor_risk")
      .select("risk_score")
      .eq("vendor_id", args.vendorId)
      .maybeSingle();
    vendorRisk = Number(vr?.risk_score ?? 0);
  }

  // Thresholds (progressive)
  if ((deviceCount ?? 0) > 25) return { blocked: true, reason: "Muitas tentativas neste dispositivo." };
  if ((ipCount ?? 0) > 40) return { blocked: true, reason: "Muitas tentativas neste IP." };
  if (vendorRisk >= 80 && (ipCount ?? 0) > 10) return { blocked: true, reason: "Risco elevado. Tente novamente mais tarde." };

  return { blocked: false };
}
