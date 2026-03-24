// lib/fraud/detector.ts
// Motor de detecção de fraude interna.
// Complementa o Stripe Radar com regras próprias baseadas no histórico do DB.
//
// Uso no checkout:
//   const result = await detectFraud({ userId, ip, email, amount });
//   if (result.blocked) return NextResponse.json({ error: result.reason }, { status: 403 });
//   if (result.score >= 70) flagForReview(result);

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";

const supabase = createAdminClient();

export interface FraudCheckInput {
  userId:    string;
  ip:        string;
  email:     string;
  amount:    number;        // em BRL
  orderId?:  string;
  cardFingerprint?: string; // fingerprint do cartão Stripe (do webhook)
}

export interface FraudCheckResult {
  score:    number;         // 0-100 (0 = limpo, 100 = fraude certa)
  blocked:  boolean;        // bloquear imediatamente
  flagged:  boolean;        // marcar para revisão manual
  reason:   string | null;  // motivo legível
  signals:  string[];       // lista de sinais detectados
}

// Score mínimo para flagear para revisão (não bloquear)
const FLAG_THRESHOLD  = 50;
// Score mínimo para bloquear
const BLOCK_THRESHOLD = 80;

// Domínios de email descartável comuns
const DISPOSABLE_DOMAINS = [
  "mailinator.com", "tempmail.com", "10minutemail.com",
  "guerrillamail.com", "throwaway.email", "yopmail.com",
  "trashmail.com", "fakeinbox.com", "maildrop.cc",
  "sharklasers.com", "guerrillamailblock.com", "spam4.me",
];

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return DISPOSABLE_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
}

export async function detectFraud(input: FraudCheckInput): Promise<FraudCheckResult> {
  const { userId, ip, email, amount, orderId, cardFingerprint } = input;
  const signals: string[] = [];
  let score = 0;

  try {
    // ── 1. IP bloqueado ───────────────────────────────────────────────────────
    const { data: blockedIp } = await supabase
      .from("blocked_ips")
      .select("id, reason")
      .eq("ip", ip)
      .or("expires_at.is.null,expires_at.gt.now()")
      .maybeSingle();

    if (blockedIp) {
      await createSignal(userId, orderId, "velocity_ip", "critical",
        `IP ${ip} está na blocklist. Motivo: ${blockedIp.reason ?? "não informado"}`);
      return { score: 100, blocked: true, flagged: false,
        reason: "Acesso bloqueado. Entre em contato com o suporte.",
        signals: ["ip_blocked"] };
    }

    // ── 2. Score via RPC do DB (função SQL) ───────────────────────────────────
    const { data: dbScore } = await supabase.rpc("calculate_fraud_score", {
      p_user_id: userId,
      p_ip:      ip,
      p_email:   email,
      p_amount:  amount,
    });
    score = Number(dbScore ?? 0);

    // ── 3. Velocidade por IP (auditoria local) ────────────────────────────────
    const { count: ipCount } = await supabase
      .from("fraud_velocity_events")
      .select("id", { count: "exact", head: true })
      .eq("key", "checkout")
      .eq("ip", ip)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());

    if ((ipCount ?? 0) >= 5) {
      signals.push("velocity_ip_high");
      if (!signals.includes("velocity_ip_high")) {
        await createSignal(userId, orderId, "velocity_ip", "high",
          `${ipCount} checkouts do IP ${ip} na última hora`);
      }
    } else if ((ipCount ?? 0) >= 3) {
      signals.push("velocity_ip_medium");
    }

    // ── 4. Email descartável ──────────────────────────────────────────────────
    if (isDisposableEmail(email)) {
      signals.push("disposable_email");
      score = Math.min(score + 25, 100);
      await createSignal(userId, orderId, "disposable_email", "medium",
        `Email descartável: ${email}`);
    }

    // ── 5. Reutilização de cartão em contas diferentes ────────────────────────
    if (cardFingerprint) {
      const { data: cardUsers } = await supabase
        .from("orders")
        .select("user_id")
        .eq("stripe_card_fingerprint", cardFingerprint)
        .neq("user_id", userId)
        .limit(5);

      if ((cardUsers ?? []).length >= 2) {
        signals.push("card_reuse_multiple_accounts");
        score = Math.min(score + 35, 100);
        await createSignal(userId, orderId, "card_reuse", "high",
          `Cartão usado em ${(cardUsers ?? []).length} contas distintas`);
      }
    }

    // ── 6. Valor alto ─────────────────────────────────────────────────────────
    if (amount > 1000) {
      signals.push("high_amount");
    }

    // ── 7. Registrar evento de velocidade ─────────────────────────────────────
    await supabase.from("fraud_velocity_events").insert({
      key:     "checkout",
      ip,
      email,
      user_id: userId,
      metadata: { amount, orderId: orderId ?? null },
    });

    // ── 8. Resultado ──────────────────────────────────────────────────────────
    const blocked = score >= BLOCK_THRESHOLD;
    const flagged = !blocked && score >= FLAG_THRESHOLD;

    if (blocked || flagged) {
      void log.warn("fraud/detector", "fraud.detected", `Score ${score} para userId ${userId}`, {
        score, blocked, flagged, signals, ip, email, amount,
      });
    }

    if (blocked) {
      await createSignal(userId, orderId, "velocity_ip", "critical",
        `Score de fraude crítico: ${score}/100. Sinais: ${signals.join(", ")}`);
    }

    return {
      score,
      blocked,
      flagged,
      reason: blocked
        ? "Transação bloqueada por suspeita de fraude. Entre em contato com o suporte."
        : null,
      signals,
    };

  } catch (e: unknown) {
    // Fraude nunca bloqueia em caso de erro — fail open
    void log.error("fraud/detector", "fraud.check_error", getErrorMessage(e), { userId, ip });
    return { score: 0, blocked: false, flagged: false, reason: null, signals: [] };
  }
}

// ── Helper: criar sinal de fraude ────────────────────────────────────────────
async function createSignal(
  userId:      string,
  orderId:     string | undefined,
  signalType:  string,
  severity:    string,
  description: string
) {
  try {
    await supabase.from("fraud_signals").insert({
      user_id:     userId,
      order_id:    orderId ?? null,
      signal_type: signalType,
      severity,
      description,
    });
  } catch { /* não crítico */ }
}

// ── Bloquear IP manualmente ───────────────────────────────────────────────────
export async function blockIp(ip: string, reason: string, blockedBy: string, expiresInDays?: number) {
  return supabase.from("blocked_ips").upsert({
    ip,
    reason,
    blocked_by: blockedBy,
    expires_at: expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400_000).toISOString()
      : null,
  }, { onConflict: "ip" });
}

// ── Resolver sinal ─────────────────────────────────────────────────────────────
export async function resolveSignal(signalId: string, resolvedBy: string) {
  return supabase.from("fraud_signals").update({
    resolved: true, resolved_at: new Date().toISOString(), resolved_by: resolvedBy,
  }).eq("id", signalId);
}
