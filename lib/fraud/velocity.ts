import { createAdminClient } from "@/lib/supabase/admin";

export type VelocityCheckInput = {
  ip?: string;
  email?: string;
  key: string;
  windowMinutes: number;
  max: number;
};

export async function enforceVelocityLimit(input: VelocityCheckInput): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - input.windowMinutes * 60 * 1000).toISOString();

  try {
    const orParts = [
      input.ip ? `ip.eq.${input.ip}` : null,
      input.email ? `email.eq.${input.email}` : null,
    ].filter(Boolean);

    const q = supabase
      .from("fraud_velocity_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("key", input.key);

    const { count, error } = orParts.length ? await q.or(orParts.join(",")) : await q;

    if (error) return { allowed: true };

    if ((count || 0) >= input.max) {
      return { allowed: false, reason: "Muitas tentativas em pouco tempo. Tente novamente mais tarde." };
    }

    await supabase.from("fraud_velocity_events").insert({
      key: input.key,
      ip: input.ip || null,
      email: input.email || null,
    });

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
