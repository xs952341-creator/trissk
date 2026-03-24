/**
 * lib/ai/light.ts
 * "IA leve" gratuita: heurísticas + templates (sem dependência externa).
 * Objetivo: gerar descrições e bullets de produto consistentes para storefront.
 */

export type AIGeneratedCopy = {
  short: string;
  long: string;
  bullets: string[];
  tags: string[];
};

function clean(s: string) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

export function generateProductCopy(input: {
  name: string;
  category?: string | null;
  audience?: string | null;
  features?: string | null;
  outcome?: string | null;
  pricingHint?: string | null;
}): AIGeneratedCopy {
  const name = clean(input.name);
  const category = clean(input.category ?? "");
  const audience = clean(input.audience ?? "");
  const features = clean(input.features ?? "");
  const outcome = clean(input.outcome ?? "");
  const pricingHint = clean(input.pricingHint ?? "");

  const tags: string[] = [];
  if (category) tags.push(category);
  if (audience) tags.push(audience);
  if (pricingHint) tags.push(pricingHint);

  const featureBullets = features
    ? features
        .split(/\n|\,|\;|\.|\|/g)
        .map((x) => clean(x))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const bullets = [
    ...(featureBullets.length ? featureBullets : []),
    ...(outcome ? [outcome] : []),
  ].slice(0, 6);

  const baseShort =
    outcome
      ? `${name}: ${outcome}`
      : category
        ? `${name}: ${category} pronto para vender`
        : `${name}: SaaS pronto para escalar`;

  const short = clean(baseShort).slice(0, 160);

  const longParts: string[] = [];

  longParts.push(`**${name}** é um produto SaaS publicado no seu marketplace, pensado para converter com clareza e prova social.`);

  if (category) longParts.push(`Categoria: **${category}**.`);
  if (audience) longParts.push(`Ideal para: **${audience}**.`);
  if (outcome) longParts.push(`Resultado esperado: **${outcome}**.`);

  if (bullets.length) {
    longParts.push(`\n### O que você ganha\n${bullets.map((b) => `- ${b}`).join("\n")}`);
  }

  longParts.push(`\n### Como funciona\n- Compra via checkout seguro\n- Acesso liberado automaticamente\n- Suporte e atualizações conforme o plano`);

  const long = clean(longParts.join("\n"));

  return { short, long, bullets, tags: tags.filter(Boolean).slice(0, 6) };
}
