// app/api/sitemap/route.ts — Sitemap dinâmico para SEO
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1h

const BASE_URL = getPublicAppUrl();

// Local types
interface SitemapPage {
  url: string;
  lastmod?: string | null;
  changefreq: string;
  priority: string;
}

interface ProductRow {
  slug?: string | null;
  id: string;
  updated_at?: string | null;
}

export async function GET() {
  const admin = createAdminClient();

  // Static pages
  const staticPages: SitemapPage[] = [
    { url: "/", changefreq: "daily", priority: "1.0" },
    { url: "/explorar", changefreq: "hourly", priority: "0.9" },
    { url: "/pricing", changefreq: "weekly", priority: "0.8" },
    { url: "/login", changefreq: "monthly", priority: "0.5" },
    { url: "/termos", changefreq: "monthly", priority: "0.3" },
    { url: "/privacidade", changefreq: "monthly", priority: "0.3" },
  ];

  // Dynamic product pages
  const { data: products } = await admin
    .from("saas_products")
    .select("slug, id, updated_at")
    .eq("approval_status", "APPROVED")
    .order("trending_score", { ascending: false })
    .limit(500);

  const productPages = (products ?? [] as ProductRow[]).map((p) => ({
    url: `/produtos/${p.slug ?? p.id}`,
    lastmod: p.updated_at,
    changefreq: "weekly",
    priority: "0.7",
  }));

  const allPages = [...staticPages, ...productPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map((p: SitemapPage) => `  <url>
    <loc>${BASE_URL}${p.url}</loc>
    ${p.lastmod ? `<lastmod>${new Date(p.lastmod).toISOString().split("T")[0]}</lastmod>` : ""}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
