import { log } from "@/lib/logger";

export type SupportedFxCurrency = "USD" | "EUR";

export type FxSnapshot = {
  rates: Record<SupportedFxCurrency, number>;
  source: "provider" | "cache" | "fallback";
  updatedAt: string;
};

const FALLBACK_RATES: Record<SupportedFxCurrency, number> = {
  USD: 5.5,
  EUR: 6.0,
};

let cachedSnapshot: FxSnapshot | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

function fallbackSnapshot(): FxSnapshot {
  const snapshot: FxSnapshot = {
    rates: FALLBACK_RATES,
    source: "fallback",
    updatedAt: new Date().toISOString(),
  };
  void log.warn("fx", "fallback_rates", "Usando fallback de câmbio", {
    rates: snapshot.rates,
  });
  return snapshot;
}

export async function fetchExchangeRateSnapshot(): Promise<FxSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cacheTimestamp < CACHE_TTL_MS) {
    return { ...cachedSnapshot, source: "cache" };
  }

  try {
    const res = await fetch("/api/exchange-rate", { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return fallbackSnapshot();

    const data = (await res.json()) as Partial<FxSnapshot> & { rates?: Partial<Record<SupportedFxCurrency, number>> };
    const rates = {
      USD: Number(data.rates?.USD ?? FALLBACK_RATES.USD),
      EUR: Number(data.rates?.EUR ?? FALLBACK_RATES.EUR),
    };

    cachedSnapshot = {
      rates,
      source: "provider",
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    };
    cacheTimestamp = now;
    return cachedSnapshot;
  } catch (error) {
    void log.warn("fx", "fetch_failed", "Falha ao buscar taxa de câmbio; usando fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackSnapshot();
  }
}
