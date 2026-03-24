
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BlocksEditor } from "@/components/landing/BlocksEditor";
import type { LandingBlock } from "@/components/landing/BlocksRenderer";

export default async function LandingEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: product } = await supabase
    .from("saas_products")
    .select("id,vendor_id,name")
    .eq("id", params.id)
    .maybeSingle();

  if (!product || product.vendor_id !== auth.user.id) redirect("/vendor");

  let blocks: Record<string, unknown>[] = [];
  try {
    const { data } = await supabase.from("product_pages").select("blocks").eq("product_id", params.id).maybeSingle();
    blocks = (data?.blocks  as Record<string, unknown>[]) || [];
  } catch {
    blocks = [];
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <div className="text-xs text-white/60">Vendor / Produtos / Landing</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Landing page — {product.name}</h1>
        <p className="mt-2 text-sm text-white/70">
          Editor simples e seguro. Se você não criar a tabela <span className="font-mono">product_pages</span>, o projeto continua
          funcionando — apenas não salva.
        </p>
      </div>
      <BlocksEditor initial={blocks as LandingBlock[]} productId={params.id} />
    </div>
  );
}
