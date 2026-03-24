import type { JsonValue } from "@/lib/types/json";
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from "@/lib/env-server";

const KEY = "ph_jobs";

function enabled() {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

async function cmd(args: (string | number | boolean | null)[]) {
  const res = await fetch(UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error ?? `Upstash error ${res.status}`);
  return j?.result;
}

export async function redisEnqueue(job: Record<string, unknown>): Promise<boolean> {
  if (!enabled()) return false;
  try {
    await cmd(["LPUSH", KEY, JSON.stringify(job)]);
    return true;
  } catch {
    return false;
  }
}

export async function redisDequeueBatch(limit = 20): Promise<JsonValue[]> {
  if (!enabled()) return [];
  const out: JsonValue[] = [];
  for (let i = 0; i < limit; i++) {
    try {
      const v = await cmd(["RPOP", KEY]);
      if (!v) break;
      out.push(JSON.parse(v));
    } catch {
      break;
    }
  }
  return out;
}
