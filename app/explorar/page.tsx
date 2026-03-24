import Link from "next/link";
import AffiliateTracker from "@/components/AffiliateTracker";
import { getPublicAppUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

async function getDiscovery(params: {
  days?: number; limit?: number; category?: string; q?: string;
  minPrice?: number; maxPrice?: number; sort?: string; affiliates?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.days)       qs.set("days",       String(params.days));
  if (params.limit)      qs.set("limit",       String(params.limit));
  if (params.category)   qs.set("category",    params.category);
  if (params.q)          qs.set("q",           params.q);
  if (params.minPrice)   qs.set("min_price",   String(params.minPrice));
  if (params.maxPrice)   qs.set("max_price",   String(params.maxPrice));
  if (params.sort)       qs.set("sort",        params.sort);
  if (params.affiliates) qs.set("affiliates",  "true");

  const base = getPublicAppUrl();

  const res = await fetch(`${base}/api/discovery?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function getRecommendations() {
  const base = getPublicAppUrl();
  const res = await fetch(`${base}/api/recommendations`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function StarRating({ rating }: { rating: number | string }) {
  const numRating = typeof rating === "string" ? Number(rating) : rating;
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <svg key={s} width="11" height="11" viewBox="0 0 24 24" fill={s <= Math.round(numRating) ? "#f59e0b" : "none"}
          stroke={s <= Math.round(numRating) ? "#f59e0b" : "#52525b"} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

function Card({ p }: { p: Record<string, unknown> }) {
  const minPrice = p.min_price ?? null;

  return (
    <Link
      href={`/produtos/${p.id}`}
      className="group block rounded-2xl border border-white/10 bg-zinc-950/60 p-4 hover:bg-zinc-900/80 transition"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
          {p.logo_url ? (
            <img src={String(p.logo_url ?? "")} alt={String(p.name ?? "")} className="h-10 w-10 object-cover" />
          ) : (
            <div className="text-xs text-zinc-400">SaaS</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-zinc-100 truncate">{String(p.name ?? "")}</div>
          <div className="text-xs text-zinc-400 truncate">{String(p.category ?? "") ?? "Geral"}</div>
        </div>
        {minPrice != null && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-zinc-500">a partir de</p>
            <p className="text-sm font-bold text-emerald-400">
              R$ {Number(minPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 text-sm text-zinc-300 line-clamp-2">{String(p.description ?? "") ?? "—"}</div>
      <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          {typeof p.avg_rating === "number" && p.avg_rating > 0 ? (
            <div className="flex items-center gap-1.5">
              <StarRating rating={p.avg_rating} />
              <span className="text-zinc-500">{Number(p.avg_rating).toFixed(1)}</span>
            </div>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 group-hover:border-emerald-500/30 group-hover:text-emerald-400 transition">
              Ver detalhes →
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {typeof p.units_30d === "number" && (
            <span className="text-zinc-500">{p.units_30d} vendas</span>
          )}
          {p.allows_affiliates === true && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 px-2 py-1">
              Afiliados
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

const CATEGORIES = ["Marketing", "Vendas", "Operações", "Finanças", "IA", "Dev"];
const SORT_OPTIONS = [
  { value: "trending",   label: "Trending" },
  { value: "sales",      label: "Mais vendidos" },
  { value: "rating",     label: "Melhor avaliados" },
  { value: "price_asc",  label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "newest",     label: "Mais recentes" },
];
const PRICE_RANGES = [
  { label: "Todos os preços", min: undefined, max: undefined },
  { label: "Até R$ 50",       min: undefined, max: 50 },
  { label: "R$ 50–100",       min: 50, max: 100 },
  { label: "R$ 100–300",      min: 100, max: 300 },
  { label: "Acima de R$ 300", min: 300, max: undefined },
];

export default async function Explorar({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const category   = (searchParams?.category   ?? "") as string;
  const q          = (searchParams?.q          ?? "") as string;
  const ref        = (searchParams?.ref        ?? "") as string;
  const sort       = (searchParams?.sort       ?? "trending") as string;
  const minPriceRaw = searchParams?.min_price ? Number(searchParams.min_price) : undefined;
  const maxPriceRaw = searchParams?.max_price ? Number(searchParams.max_price) : undefined;
  const affiliates  = searchParams?.affiliates === "true";

  const data     = await getDiscovery({
    days: 7, limit: 24,
    category:  category  || undefined,
    q:         q         || undefined,
    sort,
    minPrice:  minPriceRaw,
    maxPrice:  maxPriceRaw,
    affiliates: affiliates || undefined,
  });
  const trending = data?.trending     ?? [];
  const best     = data?.best_sellers ?? [];

  const recData = await getRecommendations();
  const recommended = recData?.recommended ?? [];

  // Deduplicate trending + best when filtered/sorted
  const showSingle = sort !== "trending" || q || category;

  return (
    <div className="min-h-screen bg-black text-white">
      <AffiliateTracker code={ref || null} />

      <div className="mx-auto max-w-6xl px-5 py-10 space-y-8">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Explorar</h1>
            <p className="text-zinc-400">Descubra SaaS prontos para vender, crescer e escalar.</p>
          </div>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition">
            ← Voltar
          </Link>
        </div>

        {/* ── Recomendações "IA" (gratuita, heurística) ───────────────── */}
        {Array.isArray(recommended) && recommended.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recomendado para você</h2>
              <span className="text-xs text-zinc-500">(IA leve)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommended.slice(0, 6).map((p: Record<string, unknown>) => (
                <Card key={String(p.id)} p={{
                  id: p.id,
                  name: p.name,
                  logo_url: p.logo_url,
                  description: p.short_description,
                  category: p.category_id ? "" : "",
                  min_price: p.min_price,
                  avg_rating: null,
                  units_30d: null,
                  allows_affiliates: false,
                }} />
              ))}
            </div>
          </section>
        )}

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <form className="space-y-3">
          {/* Linha 1: busca + categoria + submit */}
          <div className="flex flex-col md:flex-row gap-3">
            <input
              name="q" defaultValue={q}
              placeholder="Buscar por nome, categoria…"
              className="flex-1 rounded-xl bg-zinc-950 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/25 placeholder:text-zinc-600"
            />
            <select
              name="category" defaultValue={category}
              className="w-full md:w-52 rounded-xl bg-zinc-950 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/25 text-zinc-300"
            >
              <option value="">Todas as categorias</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit"
              className="rounded-xl bg-white text-black px-6 py-3 text-sm font-medium hover:bg-zinc-200 transition shrink-0">
              Filtrar
            </button>
            {(q || category || minPriceRaw || maxPriceRaw || affiliates || sort !== "trending") && (
              <Link href="/explorar"
                className="rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-200 px-5 py-3 text-sm font-medium transition shrink-0 flex items-center">
                Limpar
              </Link>
            )}
          </div>

          {/* Linha 2: ordenação + faixa de preço + afiliados */}
          <div className="flex flex-wrap gap-3">
            <select name="sort" defaultValue={sort}
              className="rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-xs text-zinc-300 outline-none">
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Faixa de preço como select */}
            <select
              name="min_price"
              defaultValue={minPriceRaw !== undefined ? String(minPriceRaw) : ""}
              className="rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-xs text-zinc-300 outline-none">
              {PRICE_RANGES.map((r) => (
                <option key={r.label} value={r.min !== undefined ? String(r.min) : ""}>
                  {r.label}
                </option>
              ))}
            </select>
            {/* max_price hidden — preenchido via JS se necessário; por ora o select controla apenas min */}

            {/* Toggle afiliados */}
            <label className="flex items-center gap-2 rounded-xl bg-zinc-900 border border-white/10 px-3 py-2 text-xs text-zinc-300 cursor-pointer hover:border-white/20">
              <input type="checkbox" name="affiliates" value="true"
                defaultChecked={affiliates}
                className="accent-emerald-500 w-3.5 h-3.5" />
              Só com programa de afiliados
            </label>
          </div>
        </form>

        {/* ── Resultados ──────────────────────────────────────────────────── */}
        {showSingle ? (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">
                {sort === "sales" ? "⭐ Mais vendidos" :
                 sort === "rating" ? "🌟 Melhor avaliados" :
                 sort === "price_asc" ? "💰 Menor preço" :
                 sort === "price_desc" ? "💎 Maior preço" :
                 sort === "newest" ? "🆕 Mais recentes" : "🔍 Resultados"}
              </h2>
              {trending.length > 0 && (
                <span className="text-xs text-zinc-500 border border-white/10 rounded-full px-2 py-0.5">
                  {trending.length} produto{trending.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {trending.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trending.map((p: Record<string, unknown>) => <Card key={String(p.id)} p={p} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-8 text-center text-zinc-500 text-sm">
                Nenhum produto encontrado com esses filtros.
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">🔥 Trending (7 dias)</h2>
                {trending.length > 0 && (
                  <span className="text-xs text-zinc-500 border border-white/10 rounded-full px-2 py-0.5">
                    {trending.length} produtos
                  </span>
                )}
              </div>
              {trending.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trending.map((p: Record<string, unknown>) => <Card key={String(p.id)} p={p} />)}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-8 text-center text-zinc-500 text-sm">
                  Ainda não há dados de trending. Volte em breve!
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">⭐ Mais vendidos (geral)</h2>
              </div>
              {best.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {best.map((p: Record<string, unknown>) => <Card key={String(p.id)} p={p} />)}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-8 text-center text-zinc-500 text-sm">
                  Nenhum produto para exibir ainda.
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
