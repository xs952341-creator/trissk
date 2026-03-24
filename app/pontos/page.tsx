"use client";
// app/pontos/page.tsx — Programa de pontos/fidelidade premium
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Star, Gift, TrendingUp, Award, Zap, CheckCircle2,
  Loader2, Trophy, ChevronRight, Package,
} from "lucide-react";
import Link from "next/link";

interface PointsData {
  balance: number;
  total_earned: number;
  total_spent: number;
  tier: "bronze" | "silver" | "gold" | "diamond";
  transactions: { id: string; type: string; points: number; description: string; created_at: string }[];
}

const TIERS = {
  bronze:  { label: "Bronze",  min: 0,    max: 499,  cls: "text-orange-400 border-orange-500/30 bg-orange-500/10",  next: "Prata" },
  silver:  { label: "Prata",   min: 500,  max: 1999, cls: "text-zinc-300 border-zinc-400/30 bg-zinc-400/10",        next: "Ouro" },
  gold:    { label: "Ouro",    min: 2000, max: 4999, cls: "text-amber-400 border-amber-500/30 bg-amber-500/10",     next: "Diamante" },
  diamond: { label: "Diamante",min: 5000, max: Infinity, cls: "text-sky-400 border-sky-500/30 bg-sky-500/10",       next: null },
};

const REWARDS = [
  { points: 100, label: "R$ 5 de crédito",    icon: "💰", desc: "Abate em qualquer compra" },
  { points: 250, label: "R$ 15 de crédito",   icon: "💸", desc: "Economize na próxima assinatura" },
  { points: 500, label: "R$ 35 de crédito",   icon: "🎁", desc: "Melhor custo-benefício" },
  { points: 1000,label: "1 mês grátis",        icon: "⚡", desc: "Em qualquer produto ativo" },
];

function getTier(points: number): keyof typeof TIERS {
  if (points >= 5000) return "diamond";
  if (points >= 2000) return "gold";
  if (points >= 500)  return "silver";
  return "bronze";
}

export default function PontosPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PointsData | null>(null);
  const [redeeming, setRedeeming] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: pts } = await supabase
        .from("user_points")
        .select("balance,total_earned,total_spent,transactions:points_transactions(id,type,points,description,created_at)")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (pts) {
        const balance = pts.balance ?? 0;
        setData({
          balance,
          total_earned: pts.total_earned ?? 0,
          total_spent: pts.total_spent ?? 0,
          tier: getTier(balance),
          transactions: ((pts.transactions ?? []) as { id: string; type: string; points: number; description: string; created_at: string }[]).sort((a, b) => {
            const aTime = new Date(String(a.created_at ?? "")).getTime();
            const bTime = new Date(String(b.created_at ?? "")).getTime();
            return bTime - aTime;
          }).slice(0, 20),
        });
      } else {
        setData({ balance: 0, total_earned: 0, total_spent: 0, tier: "bronze", transactions: [] });
      }
      setLoading(false);
    })();
  }, []);

  const handleRedeem = async (points: number, label: string) => {
    if (!data || data.balance < points) { toast.error("Pontos insuficientes."); return; }
    setRedeeming(points);
    const res = await fetch("/api/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", points, description: label }),
    });
    if (!res.ok) { toast.error("Erro ao resgatar."); setRedeeming(null); return; }
    toast.success(`${label} resgatado com sucesso!`);
    setData(d => d ? { ...d, balance: d.balance - points, total_spent: d.total_spent + points } : d);
    setRedeeming(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-zinc-700">
      <Loader2 size={20} className="animate-spin mr-2" />Carregando pontos...
    </div>
  );

  const tier = TIERS[data?.tier ?? "bronze"];
  const nextTierMin = TIERS[data?.tier ?? "bronze"].max;
  const progress = nextTierMin === Infinity ? 100 : Math.min(100, ((data?.balance ?? 0) / nextTierMin) * 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-1">Meus Pontos</h1>
        <p className="text-zinc-600 text-sm">Ganhe pontos em cada compra e troque por recompensas.</p>
      </div>

      {/* Balance + tier */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-6">
          <div className="flex items-center gap-2 mb-3">
            <Star size={15} className="text-emerald-400" fill="currentColor" />
            <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Saldo atual</span>
          </div>
          <p className="text-5xl font-black text-zinc-50 tracking-tight mb-1">{(data?.balance ?? 0).toLocaleString("pt-BR")}</p>
          <p className="text-zinc-500 text-sm">pontos disponíveis</p>
          <div className="mt-4 flex gap-4 text-xs text-zinc-600">
            <span>✅ {(data?.total_earned ?? 0).toLocaleString()} ganhos</span>
            <span>🎁 {(data?.total_spent ?? 0).toLocaleString()} resgatados</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-6 ${tier.cls}`}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} />
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Nível atual</span>
          </div>
          <p className="text-4xl font-black tracking-tight mb-1">{tier.label}</p>
          {tier.next && (
            <>
              <p className="text-xs opacity-70 mb-3">Próximo: {tier.next} ({nextTierMin.toLocaleString()} pts)</p>
              <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1, delay: 0.3 }}
                  className="h-full rounded-full bg-current" />
              </div>
              <p className="text-[10px] opacity-60 mt-1">{Math.round(progress)}% para {tier.next}</p>
            </>
          )}
          {!tier.next && <p className="text-xs opacity-70">Você atingiu o nível máximo! 🏆</p>}
        </div>
      </div>

      {/* Rewards */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-zinc-50 mb-4">Resgatar pontos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REWARDS.map(r => {
            const canRedeem = (data?.balance ?? 0) >= r.points;
            return (
              <motion.div key={r.points} whileHover={canRedeem ? { y: -2 } : {}} transition={{ duration: 0.15 }}
                className={`rounded-2xl border p-4 flex flex-col gap-3 ${canRedeem ? "border-white/[0.07] bg-white/[0.02]" : "border-white/[0.04] bg-white/[0.01] opacity-60"}`}>
                <span className="text-2xl">{r.icon}</span>
                <div className="flex-1">
                  <p className="text-zinc-100 text-xs font-bold">{r.label}</p>
                  <p className="text-zinc-600 text-[10px] mt-0.5">{r.desc}</p>
                </div>
                <div>
                  <p className="text-emerald-400 text-[10px] font-semibold mb-2">{r.points.toLocaleString()} pts</p>
                  <button onClick={() => handleRedeem(r.points, r.label)}
                    disabled={!canRedeem || redeeming !== null}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${canRedeem
                      ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-500/20"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"}`}>
                    {redeeming === r.points ? <Loader2 size={11} className="animate-spin mx-auto" /> : canRedeem ? "Resgatar" : "Pts insuf."}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Como ganhar */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 mb-8">
        <h2 className="text-sm font-bold text-zinc-200 mb-4">Como ganhar pontos</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { icon: Package, label: "Compra de produto", pts: "+50 pts", desc: "A cada produto adquirido" },
            { icon: Star, label: "Avaliar produto", pts: "+10 pts", desc: "Após publicar uma avaliação" },
            { icon: Award, label: "Indicar amigo", pts: "+100 pts", desc: "Quando o amigo faz a 1ª compra" },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-white/[0.07] flex items-center justify-center shrink-0">
                <item.icon size={13} className="text-zinc-500" />
              </div>
              <div>
                <p className="text-zinc-200 text-xs font-semibold">{item.label}</p>
                <p className="text-zinc-600 text-[10px]">{item.desc}</p>
                <p className="text-emerald-400 text-[10px] font-bold mt-1">{item.pts}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico */}
      {data && data.transactions.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07]">
            <h2 className="text-zinc-200 text-sm font-bold">Histórico de pontos</h2>
          </div>
          <div className="flex flex-col">
            {data.transactions.map((t, i) => (
              <div key={t.id} className={`px-5 py-3 flex items-center gap-3 ${i < data.transactions.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${t.points > 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
                  {t.points > 0 ? <TrendingUp size={10} className="text-emerald-400" /> : <Gift size={10} className="text-rose-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-300 text-xs truncate">{t.description}</p>
                  <p className="text-zinc-700 text-[10px]">{new Date(String(t.created_at ?? "")).toLocaleDateString("pt-BR")}</p>
                </div>
                <span className={`text-xs font-bold ${t.points > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {t.points > 0 ? "+" : ""}{t.points.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
