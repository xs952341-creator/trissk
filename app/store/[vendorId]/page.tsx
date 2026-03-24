
// app/store/[vendorId]/page.tsx — Loja pública do vendor
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Package, Star, Globe } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────
interface VendorProfile {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  website?: string | null;
  is_verified_vendor: boolean;
  created_at: string;
}

interface VendorProduct {
  id: string;
  name?: string | null;
  description?: string | null;
  logo_url?: string | null;
  price_monthly?: number | null;
  price_lifetime?: number | null;
  slug?: string | null;
  sales_count?: number | null;
  trending_score?: number | null;
}

export const revalidate = 300;

interface Props { params: { vendorId: string } }

async function getVendorData(vendorId: string) {
  const admin = createAdminClient();
  const [{ data: profile }, { data: products }] = await Promise.all([
    admin.from("profiles").select("id,full_name,avatar_url,bio,website,is_verified_vendor,created_at").eq("id", vendorId).maybeSingle(),
    admin.from("saas_products").select("id,name,description,logo_url,price_monthly,price_lifetime,slug,sales_count,trending_score").eq("vendor_id", vendorId).eq("approval_status", "APPROVED").order("trending_score", { ascending: false }).limit(20),
  ]);
  return { profile: profile as VendorProfile | null, products: products as VendorProduct[] ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profile } = await getVendorData(params.vendorId);
  if (!profile) return { title: "Loja não encontrada" };
  return {
    title: `${profile.full_name} — Playbook Hub`,
    description: profile.bio ?? `Produtos de ${profile.full_name} no Playbook Hub.`,
  };
}

export default async function StorePage({ params }: Props) {
  const { profile, products } = await getVendorData(params.vendorId);
  if (!profile) notFound();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-zinc-600 text-xs hover:text-zinc-300 transition-colors">← Playbook Hub</Link>
          <Link href="/explorar" className="text-zinc-600 text-xs hover:text-zinc-300 transition-colors">Explorar todos</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Vendor profile */}
        <div className="flex items-start gap-5 mb-12">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-white/[0.07] overflow-hidden flex items-center justify-center text-zinc-500 font-bold text-xl shrink-0">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt={profile.full_name} /> : profile.full_name?.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-zinc-50 tracking-tight">{profile.full_name}</h1>
              {profile.is_verified_vendor && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">
                  <ShieldCheck size={9} />Verificado
                </span>
              )}
            </div>
            {profile.bio && <p className="text-zinc-500 text-sm mt-1 max-w-lg">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-2 text-zinc-700 text-xs">
              <span className="flex items-center gap-1"><Package size={10} />{products.length} produto{products.length !== 1 ? "s" : ""}</span>
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-zinc-400 transition-colors">
                  <Globe size={10} />Site
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Products */}
        {products.length === 0 ? (
          <div className="text-center py-16 text-zinc-700">
            <Package size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum produto publicado ainda.</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-zinc-200 mb-5">Produtos disponíveis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p: VendorProduct) => {
                const price = p.price_monthly ?? p.price_lifetime;
                const isLife = !p.price_monthly && !!p.price_lifetime;
                return (
                  <Link key={String(p.id)} href={`/produtos/${p.slug ?? p.id}`}
                    className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 hover:border-white/[0.15] hover:-translate-y-0.5 transition-all flex flex-col gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/[0.07] overflow-hidden flex items-center justify-center text-zinc-600 font-bold text-xs shrink-0">
                      {String(p.logo_url ?? "") ? <img src={p.logo_url!} className="w-full h-full object-cover" alt={p.name ?? "Produto"} /> : (p.name ?? "Produto").slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-zinc-100 font-semibold text-sm group-hover:text-emerald-400 transition-colors">{p.name}</h3>
                      <p className="text-zinc-600 text-[11px] mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      {price ? (
                        <span className="text-zinc-50 font-bold text-sm">
                          R$ {Number(price).toLocaleString("pt-BR")}<span className="text-zinc-600 font-normal text-[10px] ml-0.5">{isLife ? " único" : "/mês"}</span>
                        </span>
                      ) : <span className="text-emerald-400 font-semibold text-sm">Grátis</span>}
                      <span className="text-zinc-700 text-[10px]">{String(p.sales_count ?? "") || 0} vendas</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
