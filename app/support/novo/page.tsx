"use client";
// app/support/novo/page.tsx — Abertura de ticket de suporte premium
import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, MessageCircle, Zap, AlertCircle,
  Package, CreditCard, Wrench, HelpCircle, ChevronRight,
} from "lucide-react";
import Link from "next/link";

const CATEGORIES = [
  { id: "acesso",        icon: Zap,          label: "Acesso ao produto",    desc: "Problemas para acessar após a compra" },
  { id: "cobranca",      icon: CreditCard,   label: "Cobrança / Pagamento", desc: "Dúvidas sobre faturas, reembolsos" },
  { id: "tecnico",       icon: Wrench,       label: "Problema técnico",     desc: "Bugs, erros, integrações" },
  { id: "produto",       icon: Package,      label: "Dúvida sobre produto", desc: "Como usar, funcionalidades" },
  { id: "conta",         icon: HelpCircle,   label: "Conta / Perfil",       desc: "Dados, senha, configurações" },
  { id: "outro",         icon: MessageCircle,label: "Outro assunto",        desc: "Qualquer outro tipo de solicitação" },
];

const PRIORITIES = [
  { id: "low",    label: "Baixa",   cls: "text-zinc-400 border-zinc-700 bg-zinc-800" },
  { id: "medium", label: "Média",   cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  { id: "high",   label: "Alta",    cls: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const supabase = createClient();

  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!category) { toast.error("Selecione uma categoria."); return; }
    if (!subject.trim()) { toast.error("Preencha o assunto."); return; }
    if (body.trim().length < 20) { toast.error("Descreva melhor o seu problema (mínimo 20 caracteres)."); return; }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, priority, subject: subject.trim(), body: body.trim() }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Erro ao abrir ticket.");
      setLoading(false);
      return;
    }

    const { ticket } = await res.json();
    toast.success("Ticket aberto com sucesso!");
    router.push(ticket?.id ? `/support/${ticket.id}` : "/support");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/support" className="w-8 h-8 rounded-xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all">
          <ArrowLeft size={14} />
        </Link>
        <div>
          <h1 className="text-xl font-black text-zinc-50 tracking-tight">Abrir novo ticket</h1>
          <p className="text-zinc-600 text-xs">Respondemos em até 24h úteis</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Categoria */}
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Categoria *</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map(c => {
              const Icon = c.icon;
              return (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`text-left p-3.5 rounded-xl border transition-all ${category === c.id
                    ? "border-emerald-500/40 bg-emerald-500/[0.06] shadow-sm shadow-emerald-500/10"
                    : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"}`}>
                  <Icon size={14} className={category === c.id ? "text-emerald-400" : "text-zinc-600"} />
                  <p className={`text-xs font-semibold mt-2 mb-0.5 ${category === c.id ? "text-zinc-100" : "text-zinc-400"}`}>{c.label}</p>
                  <p className="text-[10px] text-zinc-600 leading-snug">{c.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prioridade */}
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Prioridade</label>
          <div className="flex gap-2">
            {PRIORITIES.map(p => (
              <button key={p.id} onClick={() => setPriority(p.id)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${priority === p.id ? p.cls : "border-white/[0.07] bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Assunto */}
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Assunto *</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Não consigo acessar o produto após a compra"
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700" />
        </div>

        {/* Descrição */}
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Descrição *</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
            placeholder="Descreva o problema em detalhes. Inclua o que você fez, o que esperava e o que aconteceu..."
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700 resize-none" />
          <p className={`text-[10px] mt-1 ${body.length < 20 ? "text-zinc-700" : "text-emerald-600"}`}>
            {body.length} / mínimo 20 caracteres
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3 flex items-start gap-2.5">
          <AlertCircle size={13} className="text-sky-400 shrink-0 mt-0.5" />
          <p className="text-sky-300/80 text-[11px] leading-relaxed">
            Ao abrir o ticket, você receberá uma confirmação por email. Nossa equipe responde em até <span className="font-semibold">24 horas úteis</span> em ordem de prioridade.
          </p>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-70 text-zinc-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm">
          {loading ? <><Loader2 size={15} className="animate-spin" />Abrindo ticket...</> : <><MessageCircle size={14} />Abrir ticket</>}
        </button>
      </div>
    </div>
  );
}
