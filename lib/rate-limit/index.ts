// lib/rate-limit/index.ts
// Sliding-window rate limiter.
// Se UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN estiverem definidos,
// usa Upstash Redis (compatível com multi-instância na Vercel).
// Caso contrário, cai de volta para Map em memória (dev/single-instance).

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

// ── In-memory fallback ───────────────────────────────────────────────────────
interface Entry { count: number; resetAt: number; }
const store = new Map<string, Entry>();
setInterval(() => {
  const now = Date.now();
  store.forEach((v, k) => { if (v.resetAt < now) store.delete(k); });
}, 5 * 60_000);

function inMemoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  entry.count++;
  return { success: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

// ── Upstash Redis (INCR + EXPIRE via REST API) ────────────────────────────────
async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const base  = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const rKey  = `rl:${key}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    const incrRes = await fetch(`${base}/incr/${rKey}`, { method: "POST", headers });
    const { result: count } = await incrRes.json() as { result: number };
    if (count === 1) {
      await fetch(`${base}/pexpire/${rKey}/${windowMs}`, { method: "POST", headers });
    }
    const ttlRes = await fetch(`${base}/pttl/${rKey}`, { method: "POST", headers });
    const { result: pttl } = await ttlRes.json() as { result: number };
    return {
      success:   count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt:   Date.now() + (pttl > 0 ? pttl : windowMs),
    };
  } catch (e) {
    console.error("[rate-limit] Redis error, allowing request:", e);
    return { success: true, remaining: limit, resetAt: Date.now() + windowMs };
  }
}

const hasRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

/**
 * @param key      Identificador único (ex: IP, user_id)
 * @param limit    Máximo de requisições por janela
 * @param windowMs Duração da janela em milissegundos
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (hasRedis) return redisRateLimit(key, limit, windowMs);
  return inMemoryRateLimit(key, limit, windowMs);
}

/** Helper para extrair IP do request do Next.js */
export function getIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
