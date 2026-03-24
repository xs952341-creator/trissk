"use client";

import { useState, useEffect } from "react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

export default function PlaybookBuilder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("");
  interface ProductOption {
    id: string;
    name: string;
  }
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ id: string; name: string; split: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("saas_products").select("id, name").eq("approval_status", "APPROVED")
      .then(({ data }) => { if (data) setProducts(data); });
  }, []);

  const handleSave = async () => {
    if (!name || !slug || !price || selectedItems.length === 0) {
      return toast.error("Preencha todos os campos e adicione produtos.");
    }
    
    const totalSplit = selectedItems.reduce((acc, curr) => acc + curr.split, 0);
    if (totalSplit > 85) return toast.error("O repasse total aos produtores não pode passar de 85%.");

    setLoading(true);
    
    const { data: playbook, error: pbError } = await supabase.from("playbooks").insert({
      name, slug, bundle_price_monthly: parseFloat(price)
    }).select().single();

    if (pbError) {
      setLoading(false);
      return toast.error("Erro ao criar Playbook: " + pbError.message);
    }

    const itemsToInsert = selectedItems.map((item, index) => ({
      playbook_id: playbook.id,
      product_id: item.id,
      vendor_split_pct: item.split,
      sort_order: index
    }));

    await supabase.from("playbook_items").insert(itemsToInsert);
    
    toast.success("Playbook criado com sucesso!");
    router.push("/dashboard");
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <h1 className="text-2xl font-bold mb-8">Criar Novo Playbook (Bundle)</h1>
      
      <div className="space-y-6 bg-zinc-900 border border-white/10 p-6 rounded-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Nome do Playbook</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Slug (URL)</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none" placeholder="ex: viral-video-bundle" />
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Preço Final do Pacote (R$)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none" />
        </div>

        <div className="pt-4 border-t border-white/10">
          <label className="text-xs text-zinc-500 mb-3 block">Adicionar Ferramentas ao Pacote e Definir Repasse (%)</label>
          
          <select 
            onChange={(e) => {
              const p = products.find(x => x.id === e.target.value);
              if (p && !selectedItems.find(x => x.id === p.id)) {
                setSelectedItems([...selectedItems, { id: p.id, name: p.name, split: 20 }]);
              }
            }}
            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none mb-4"
          >
            <option value="">+ Selecionar SaaS...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div className="space-y-2">
            {selectedItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-zinc-950 p-3 rounded-lg border border-white/5">
                <span className="flex-1 text-sm text-zinc-300">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Repasse (%):</span>
                  <input type="number" value={item.split} onChange={e => setSelectedItems(prev => prev.map(x => x.id === item.id ? { ...x, split: Number(e.target.value) } : x))} className="w-16 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm text-center outline-none" />
                </div>
                <button onClick={() => setSelectedItems(prev => prev.filter(x => x.id !== item.id))} className="text-red-400 hover:text-red-300"><Trash2 size={16}/></button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={loading} className="w-full bg-emerald-500 text-zinc-950 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors flex justify-center items-center mt-6">
          {loading ? <Loader2 className="animate-spin" /> : "Salvar Playbook"}
        </button>
      </div>
    </div>
  );
}
