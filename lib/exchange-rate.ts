// lib/exchange-rate.ts
// Utilitário server-side para taxa de câmbio BRL → USD / EUR.
// NÃO importar em "use client" — contém acesso a variáveis server.
//
// Hierarquia de fontes:
//   1. ExchangeRate-API v6 (requer EXCHANGE_RATE_API_KEY, 1500 req/mês grátis)
//   2. AwesomeAPI        (gratuita, sem chave, específica para BRL)
//   3. Valores fixos     (fallback de último recurso)

import { EXCHANGE_RATE_API_KEY } from "@/lib/env-server";

/** Cache em memória (por process/worker — reseta em cold start) */
let _cache: { rates: Record<string, number>; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

async function fetchAwesomeAPI(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL",
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const usd = parseFloat(data.USDBRL?.ask);
    const eur = parseFloat(data.EURBRL?.ask);
    if (!usd || !eur) return null;
    return { USD: usd, EUR: eur };
  } catch {
    return null;
  }
}

async function fetchExchangeRateAPI(): Promise<Record<string, number> | null> {
  if (!EXCHANGE_RATE_API_KEY) return null;
  try {
    const res = await fetch(
      `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/BRL`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result !== "success") return null;
    const usdPerBrl = data.conversion_rates?.USD;
    const eurPerBrl = data.conversion_rates?.EUR;
    if (!usdPerBrl || !eurPerBrl) return null;
    // Retornar: quantos BRL valem 1 USD/EUR (inverso)
    return { USD: 1 / usdPerBrl, EUR: 1 / eurPerBrl };
  } catch {
    return null;
  }
}

/**
 * Retorna taxas de câmbio: { USD: X, EUR: Y }
 * onde X/Y = quantos BRL valem 1 unidade da moeda.
 * Ex: { USD: 5.40, EUR: 5.90 }
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();

  if (_cache && now - _cache.ts < CACHE_TTL_MS) {
    return _cache.rates;
  }

  // Tentar ExchangeRate-API primeiro (mais confiável)
  let rates = await fetchExchangeRateAPI();

  // Fallback: AwesomeAPI
  if (!rates) {
    rates = await fetchAwesomeAPI();
  }

  // Fallback fixo de último recurso
  if (!rates) {
    rates = { USD: 5.50, EUR: 6.00 };
  }

  _cache = { rates, ts: now };
  return rates;
}

/**
 * Converte um valor de BRL para a moeda destino.
 * Ex: convertFromBRL(100, "USD", { USD: 5.40 }) → ~18.52
 */
export function convertFromBRL(
  brl: number,
  targetCurrency: string,
  rates: Record<string, number>
): number {
  const rate = rates[targetCurrency];
  if (!rate || rate === 0) return brl;
  return brl / rate;
}
