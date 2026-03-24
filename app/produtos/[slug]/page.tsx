
// app/produtos/[slug]/page.tsx
// Página pública do produto — suporta busca por UUID (id) OU por slug
import { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import ProductPageClient, { type Product } from "./ProductPageClient";
import type { LandingBlock } from "@/components/landing/BlocksRenderer";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type ProductReview = {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verified_purchase?: boolean | null;
  created_at?: string | null;
};

// ISR: revalidar a cada 5 minutos (bom para páginas de produto com reviews e vendas)
export const revalidate = 300;

const supabase = createAdminClient();

// Pre-renderiza os produtos mais visitados no build
export async function generateStaticParams() {
  const { data } = await supabase
    .from("saas_products")
    .select("slug")
    .eq("approval_status", "APPROVED")
    .order("trending_score", { ascending: false })
    .limit(50);
  return (data ?? []).map((p: { slug: string }) => ({ slug: p.slug }));
}

interface Props { params: { slug: string } }

// UUID regex para detectar se o param é um id ou slug textual
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchProduct(slugOrId: string) {
  const isUuid = UUID_RE.test(slugOrId);
  const query  = supabase
    .from("saas_products")
    .select(`
      id, name, description, logo_url, category, screenshots,
      price_monthly, price_lifetime, delivery_method,
      trending_score, sales_count, is_staff_pick,
      support_email, support_whatsapp,
      order_bump_active, order_bump_title, order_bump_price, order_bump_stripe_price_id,
      profiles!vendor_id (
        id, full_name, is_verified_vendor, avatar_url, stripe_connect_account_id
      ),
      product_tiers (
        id, tier_name, price_monthly, price_lifetime,
        stripe_monthly_price_id, stripe_lifetime_price_id,
        features, is_popular, has_consultancy, calendar_link
      )
    `)
    .eq("approval_status", "APPROVED");

  const { data } = isUuid
    ? await query.eq("id",   slugOrId).single()
    : await query.eq("slug", slugOrId).single();

  return data;
}

// ── generateMetadata ─────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await fetchProduct(params.slug);
  if (!product) return { title: "Produto não encontrado" };

  const price    = (product as unknown as Record<string,unknown>).price_monthly ?? (product as unknown as Record<string,unknown>).price_lifetime;
  const priceStr = price
    ? `R$ ${Number(price).toLocaleString("pt-BR")}${(product as unknown as Record<string,unknown>).price_monthly ? "/mês" : " único"}`
    : "Grátis";

  return {
    title:       `${product.name} — Playbook Hub`,
    description: product.description?.slice(0, 160) ?? `Assine ${product.name} no Playbook Hub`,
    openGraph: {
      title:       `${product.name} — ${priceStr}`,
      description: product.description?.slice(0, 200),
      images:      product.logo_url ? [{ url: product.logo_url, width: 1200, height: 630 }] : [],
      type:        "website",
      siteName:    "Playbook Hub",
    },
    twitter: {
      card:        "summary_large_image",
      title:       `${product.name} — ${priceStr}`,
      description: product.description?.slice(0, 200),
      images:      product.logo_url ? [String(product.logo_url)] : [],
    },
  };
}

// ── Server Component ──────────────────────────────────────────────────────────
export default async function ProductPage({ params }: Props) {
  const product = await fetchProduct(params.slug);
  if (!product) notFound();

  // Landing builder blocks (optional)
  let landingBlocks: LandingBlock[] | null = null;
  try {
    const { data } = await supabase
      .from("product_pages")
      .select("blocks")
      .eq("product_id", (product as unknown as Record<string,unknown>).id)
      .maybeSingle();
    if (data?.blocks && Array.isArray((data as unknown as Record<string,unknown>).blocks)) {
      landingBlocks = (data as unknown as Record<string,unknown>).blocks as LandingBlock[];
    }
  } catch {
    // If table doesn't exist yet (older schema), do nothing.
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, body, created_at, user_id")
    .eq("product_id", (product as unknown as Record<string,unknown>).id)
    .order("created_at", { ascending: false })
    .limit(50) as { data: ProductReview[] | null };

  const avg = reviews?.length
    ? Math.round((reviews.reduce((s, r: ProductReview) => s + Number(r.rating ?? 0), 0) / reviews.length) * 10) / 10
    : 0;

  // JSON-LD structured data for Google
  const price = (product as unknown as Record<string,unknown>).price_monthly ?? (product as unknown as Record<string,unknown>).price_lifetime;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.name,
    description: product.description,
    image: (product as unknown as Record<string,unknown>).logo_url,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    ...(price ? {
      offers: {
        "@type": "Offer",
        price: price,
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
      }
    } : {}),
    ...(reviews?.length && avg > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: avg,
        reviewCount: reviews.length,
        bestRating: 5,
        worstRating: 1,
      }
    } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductPageClient
        product={product as unknown as Product}
        reviews={(reviews as ProductReview[]) ?? []}
        reviewStats={{ avg, count: (reviews ?? []).length }}
        landingBlocks={landingBlocks}
      />
    </>
  );
}
