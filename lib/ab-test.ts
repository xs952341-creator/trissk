// lib/ab-test.ts
// ✅ A/B TEST NATIVO — Checkout
// Atribui variante por userId (determinístico — mesmo usuário sempre vê a mesma variante)
// Registra a variante vista e a conversão na tabela ab_test_events.
// Para adicionar um novo experimento: adicione em EXPERIMENTS e implemente no componente.

export interface Variant {
  id:          string;
  cta:         string;    // texto do botão de compra
  priceAnchor: boolean;   // mostrar preço riscado (price anchoring)
  urgency:     boolean;   // mostrar contador de urgência "X pessoas viram hoje"
  layout:      "standard" | "compact"; // layout do pricing table
}

export interface Experiment {
  id:       string;
  name:     string;
  variants: Variant[];
  active:   boolean;
}

export const EXPERIMENTS: Experiment[] = [
  {
    id:     "checkout-cta-v1",
    name:   "CTA Button Text Test",
    active: true,
    variants: [
      {
        id:          "control",
        cta:         "Começar agora",
        priceAnchor: false,
        urgency:     false,
        layout:      "standard",
      },
      {
        id:          "variant-a",
        cta:         "Quero acesso imediato →",
        priceAnchor: true,
        urgency:     false,
        layout:      "standard",
      },
      {
        id:          "variant-b",
        cta:         "Testar por 7 dias grátis",
        priceAnchor: true,
        urgency:     true,
        layout:      "compact",
      },
    ],
  },
];

/**
 * Retorna a variante determinística para um userId.
 * Mesmo usuário sempre cai na mesma variante dentro de um experimento.
 */
export function getVariant(experimentId: string, userId: string): Variant | null {
  const exp = EXPERIMENTS.find(e => e.id === experimentId && e.active);
  if (!exp || exp.variants.length === 0) return null;

  // Hash do userId para índice determinístico
  let hash = 0;
  const key = `${experimentId}:${userId}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit int
  }
  const idx = Math.abs(hash) % exp.variants.length;
  return exp.variants[idx];
}

/**
 * Registra um evento A/B (impression ou conversion) na tabela ab_test_events.
 * Chame do client ou de uma API route.
 */

interface SupabaseInsertClient {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: unknown | null; data?: unknown }>;
  };
}


export async function trackABEvent(params: {
  supabase: { from: (table: string) => { insert: (payload: unknown) => Promise<{ error: unknown | null }> } };
  experimentId: string;
  variantId:    string;
  userId:       string;
  event:        "impression" | "conversion";
  metadata?:    Record<string, string>;
}) {
  try {
    await params.supabase.from("ab_test_events").insert({
      experiment_id: params.experimentId,
      variant_id:    params.variantId,
      user_id:       params.userId,
      event:         params.event,
      metadata:      params.metadata ?? {},
    });
  } catch {
    // não crítico
  }
}
