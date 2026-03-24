import { fetchExchangeRateSnapshot, type FxSnapshot } from "@/lib/fx/service";

// lib/currency.ts
// Suporte multi-moeda: BRL (padrão), USD, EUR
// Para adicionar nova moeda: adicione aqui + crie o Price no Stripe via /api/vendor/stripe-prices

export type Currency = "BRL" | "USD" | "EUR";

export interface CurrencyTier {
  price_monthly?:             number | null;
  price_annual?:              number | null;
  price_yearly?:              number | null;
  price_lifetime?:            number | null;
  price_usd_monthly?:         number | null;
  price_usd_annual?:          number | null;
  price_usd_yearly?:          number | null;
  price_usd_lifetime?:        number | null;
  price_eur_monthly?:         number | null;
  price_eur_annual?:          number | null;
  price_eur_yearly?:          number | null;
  price_eur_lifetime?:        number | null;
  stripe_monthly_price_id?:   string | null;
  stripe_annual_price_id?:    string | null;
  stripe_yearly_price_id?:    string | null;
  stripe_lifetime_price_id?:  string | null;
  stripe_usd_monthly_price_id?:  string | null;
  stripe_usd_annual_price_id?:   string | null;
  stripe_usd_lifetime_price_id?: string | null;
  stripe_eur_monthly_price_id?:  string | null;
  stripe_eur_annual_price_id?:   string | null;
  stripe_eur_lifetime_price_id?: string | null;
}



export const CURRENCY_CONFIG: Record<Currency, {
  symbol:    string;
  label:     string;
  locale:    string;
  flag:      string;
  stripePriceField: "stripe_monthly_price_id" | "stripe_usd_monthly_price_id" | "stripe_eur_monthly_price_id";
  stripePriceFieldLifetime: "stripe_lifetime_price_id" | "stripe_usd_lifetime_price_id" | "stripe_eur_lifetime_price_id";
  priceField: "price_monthly" | "price_usd_monthly" | "price_eur_monthly";
  priceFieldLifetime: "price_lifetime" | "price_usd_lifetime" | "price_eur_lifetime";
}> = {
  BRL: {
    symbol: "R$",
    label:  "Real Brasileiro",
    locale: "pt-BR",
    flag:   "🇧🇷",
    stripePriceField:         "stripe_monthly_price_id",
    stripePriceFieldLifetime: "stripe_lifetime_price_id",
    priceField:               "price_monthly",
    priceFieldLifetime:       "price_lifetime",
  },
  USD: {
    symbol: "US$",
    label:  "Dólar Americano",
    locale: "en-US",
    flag:   "🇺🇸",
    stripePriceField:         "stripe_usd_monthly_price_id",
    stripePriceFieldLifetime: "stripe_usd_lifetime_price_id",
    priceField:               "price_usd_monthly",
    priceFieldLifetime:       "price_usd_lifetime",
  },
  EUR: {
    symbol: "€",
    label:  "Euro",
    locale: "de-DE",
    flag:   "🇪🇺",
    stripePriceField:         "stripe_eur_monthly_price_id",
    stripePriceFieldLifetime: "stripe_eur_lifetime_price_id",
    priceField:               "price_eur_monthly",
    priceFieldLifetime:       "price_eur_lifetime",
  },
};

/** Formata valor para exibição na moeda selecionada */
export function formatCurrency(value: number, currency: Currency): string {
  const cfg = CURRENCY_CONFIG[currency];
  return value.toLocaleString(cfg.locale, { style: "currency", currency });
}

/** Retorna o price_id e price corretos para a moeda + billing cycle */
export function getPriceForCurrency(
  tier: CurrencyTier,
  currency: Currency,
  billing: "monthly" | "annual" | "lifetime"
): { priceId: string | null; price: number } {
  const cfg = CURRENCY_CONFIG[currency];
  const priceField  = billing === "lifetime" ? cfg.priceFieldLifetime  : cfg.priceField;
  const idField     = billing === "lifetime" ? cfg.stripePriceFieldLifetime : cfg.stripePriceField;

  // Fallback para BRL se moeda selecionada não tiver price configurado
  const priceId = tier[idField] ?? tier[
    billing === "lifetime" ? "stripe_lifetime_price_id" : "stripe_monthly_price_id"
  ] ?? null;

  const price = Number(tier[priceField] ?? tier[
    billing === "lifetime" ? "price_lifetime" : "price_monthly"
  ] ?? 0);

  return { priceId, price };
}

/** Valida se uma moeda está disponível para um tier */
export function isCurrencyAvailable(tier: CurrencyTier, currency: Currency, billing: "monthly" | "annual" | "lifetime"): boolean {
  if (currency === "BRL") return true; // BRL sempre disponível
  const cfg = CURRENCY_CONFIG[currency];
  const idField = billing === "lifetime" ? cfg.stripePriceFieldLifetime : cfg.stripePriceField;
  return !!tier[idField];
}

// ─── Conversão dinâmica com taxa real-time ───────────────────────────────────

/** Cache client-side das taxas de câmbio (evita múltiplas chamadas na mesma sessão) */
/**
 * Busca snapshot das taxas de câmbio com origem e timestamp para auditoria.
 */
export async function fetchExchangeRatesSnapshot(): Promise<FxSnapshot> {
  return fetchExchangeRateSnapshot();
}

/**
 * Mantém compatibilidade com o restante do app retornando apenas o mapa de rates.
 */
export async function fetchExchangeRates(): Promise<Record<string, number>> {
  const snapshot = await fetchExchangeRatesSnapshot();
  return snapshot.rates;
}

/**
 * Converte um valor em BRL para outra moeda usando taxa de câmbio dinâmica.
 * Exemplo: convertFromBRL(100, "USD", { USD: 5.50 }) → 18.18
 */
export function convertFromBRL(
  valueBRL: number,
  targetCurrency: Currency,
  rates: Record<string, number>
): number {
  if (targetCurrency === "BRL") return valueBRL;
  const rate = rates[targetCurrency] ?? 1;
  return valueBRL / rate;
}

/**
 * Retorna o preço exibido para o usuário:
 *   1. Se o tier tem price_usd_monthly/price_eur_monthly configurado → usa esse
 *   2. Caso contrário → converte dinamicamente de BRL usando taxa real-time
 */
export function getDynamicPrice(
  tier: CurrencyTier,
  currency: Currency,
  billing: "monthly" | "annual" | "lifetime" | "annual",
  rates: Record<string, number>
): { price: number; priceId: string | null; isDynamic: boolean } {
  const cfg = CURRENCY_CONFIG[currency];

  if (currency === "BRL") {
    const priceField = billing === "lifetime" ? "price_lifetime"
      : billing === "annual" ? "price_annual"
      : "price_monthly";
    const idField    = billing === "lifetime" ? "stripe_lifetime_price_id"
      : billing === "annual" ? "stripe_annual_price_id"
      : "stripe_monthly_price_id";
    return {
      price:     Number(tier[priceField] ?? 0),
      priceId:   tier[idField] ?? null,
      isDynamic: false,
    };
  }

  // Verificar se tem preço fixo configurado para a moeda
  const priceField    = billing === "lifetime" ? cfg.priceFieldLifetime : cfg.priceField;
  const idField       = billing === "lifetime" ? cfg.stripePriceFieldLifetime : cfg.stripePriceField;
  const fixedPrice    = tier[priceField];
  const fixedPriceId  = tier[idField];

  if (fixedPrice && fixedPriceId) {
    // Tem preço + price_id fixo → usa como está
    return { price: Number(fixedPrice), priceId: fixedPriceId, isDynamic: false };
  }

  // Sem preço fixo → converte dinamicamente de BRL
  const brlPriceField = billing === "lifetime" ? "price_lifetime"
    : billing === "annual" ? "price_annual"
    : "price_monthly";
  const brlPrice      = Number(tier[brlPriceField] ?? 0);
  const converted     = convertFromBRL(brlPrice, currency, rates);

  return {
    price:     Math.ceil(converted * 100) / 100, // arredondar para cima (2 decimais)
    priceId:   fixedPriceId ?? null, // sem price_id → vai usar checkout-intl dinâmico
    isDynamic: true,
  };
}
