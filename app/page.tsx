
"use client";
// app/page.tsx — Landing Page Premium v4
import { useState, useEffect } from "react";
import type { ComponentType } from "react";

import { motion, AnimatePresence } from "framer-motion";
import {
  Search, TrendingUp, Zap, Diamond, Bot, Gift,
  CheckCircle2, Star, ArrowRight, ShieldCheck,
  BarChart2, Users, DollarSign, Globe, Sparkles,
  Package, Link2, CreditCard, Webhook, FileText,
  Award, Building2, Bell, ChevronRight, Menu, X,
  RefreshCw, Layers,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const supabase = createClient();
interface Product { id:string;name:string;description:string;logo_url?:string;price_monthly?:number;price_lifetime?:number;trending_score:number;sales_count:number;is_staff_pick:boolean;profiles:{is_verified_vendor:boolean;full_name:string}; }
const PHRASES=["automação com IA...","CRM personalizado...","ferramentas de conteúdo...","bots para WhatsApp...","dashboards para clientes..."];

function useTypewriter(phrases:string[],speed=65,pause=2200){
  const[text,setText]=useState("");const[pi,setPi]=useState(0);const[ci,setCi]=useState(0);const[del,setDel]=useState(false);
  useEffect(()=>{const cur=phrases[pi];const delay=del?speed/2:ci===cur.length?pause:speed;const t=setTimeout(()=>{if(!del&&ci<cur.length){setText(cur.slice(0,ci+1));setCi(c=>c+1);}else if(!del&&ci===cur.length){setDel(true);}else if(del&&ci>0){setText(cur.slice(0,ci-1));setCi(c=>c-1);}else{setDel(false);setPi(p=>(p+1)%phrases.length);}},delay);return()=>clearTimeout(t);},[ci,del,pi,phrases,speed,pause]);
  return text;
}

function Nav(){
  const[scrolled,setScrolled]=useState(false);const[open,setOpen]=useState(false);
  useEffect(()=>{const fn=()=>setScrolled(window.scrollY>20);window.addEventListener("scroll",fn,{passive:true});return()=>window.removeEventListener("scroll",fn);},[]);
  return(
    <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled?"bg-zinc-950/95 backdrop-blur-xl border-b border-white/[0.06] shadow-xl shadow-black/20":""}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand to-emerald-600 flex items-center justify-center shadow-lg shadow-brand-dim/30">
            <Zap size={16} className="text-zinc-950" fill="currentColor"/>
          </div>
          <span className="font-bold text-zinc-50 tracking-tight text-lg">Playbook<span className="text-brand">Hub</span></span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-500">
          <Link href="/explorar" className="hover:text-zinc-200 transition-colors">Explorar</Link>
          <Link href="/pricing" className="hover:text-zinc-200 transition-colors">Preços</Link>
          <Link href="/vendor/produtos" className="hover:text-zinc-200 transition-colors">Vender</Link>
          <Link href="/login" className="hover:text-zinc-200 transition-colors">Entrar</Link>
          <Link href="/login?next=/onboarding" className="bg-brand-dim hover:bg-brand text-zinc-950 font-semibold px-4 py-2 rounded-xl transition-all text-xs shadow-lg shadow-brand-dim/20">Começar grátis →</Link>
        </div>
        <button className="md:hidden text-zinc-400" onClick={()=>setOpen(v=>!v)}>{open?<X size={20}/>:<Menu size={20}/>}</button>
      </div>
      <AnimatePresence>
        {open&&(<motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}
          className="md:hidden bg-zinc-950/98 border-b border-white/10 px-4 pb-5 pt-2 flex flex-col gap-3 text-sm">
          {[["Explorar","/explorar"],["Preços","/pricing"],["Vender","/vendor/produtos"],["Entrar","/login"]].map(([l,h])=>(
            <Link key={h} href={h} className="text-zinc-400 hover:text-zinc-100 py-1 transition-colors" onClick={()=>setOpen(false)}>{l}</Link>
          ))}
          <Link href="/login?next=/onboarding" className="bg-brand-dim text-zinc-950 font-semibold text-center py-2.5 rounded-xl mt-1" onClick={()=>setOpen(false)}>Começar grátis →</Link>
        </motion.div>)}
      </AnimatePresence>
    </nav>
  );
}

type FeatureAccent = "emerald" | "violet" | "amber" | "sky" | "rose" | "orange";

interface FeatureCardProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
  accent?: FeatureAccent;
}

function FeatureCard({ icon: Icon, title, desc, accent = "emerald" }: FeatureCardProps) {
  const colors:Record<string,string>={emerald:"bg-brand-dim/10 text-brand border-brand-dim/20",violet:"bg-violet-500/10 text-violet-400 border-violet-500/20",amber:"bg-amber-500/10 text-amber-400 border-amber-500/20",sky:"bg-sky-500/10 text-sky-400 border-sky-500/20",rose:"bg-rose-500/10 text-rose-400 border-rose-500/20",orange:"bg-orange-500/10 text-orange-400 border-orange-500/20"};
  return(
    <motion.div whileHover={{y:-3}} transition={{duration:0.18}} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 flex flex-col gap-4">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colors[accent]}`}><Icon size={18}/></div>
      <div><h3 className="text-zinc-100 font-semibold text-sm mb-1.5">{title}</h3><p className="text-zinc-500 text-xs leading-relaxed">{desc}</p></div>
    </motion.div>
  );
}

function ProductCardMini({product}:{product:Product}){
  const price=product.price_monthly??product.price_lifetime;const isLife=!product.price_monthly&&!!product.price_lifetime;
  return(
    <motion.div whileHover={{y:-3,boxShadow:"0 16px 40px rgba(0,0,0,0.5)"}} transition={{duration:0.18}}
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden flex items-center justify-center text-zinc-500 font-bold text-xs shrink-0">
          {product.logo_url?<img src={product.logo_url} className="w-full h-full object-cover" alt={product.name}/>:product.name.slice(0,2)}
        </div>
        <div className="min-w-0">
          <p className="text-zinc-100 font-semibold text-xs leading-tight truncate">{product.name}</p>
          {product.profiles?.is_verified_vendor&&(<span className="text-[10px] text-brand flex items-center gap-0.5 mt-0.5"><ShieldCheck size={9}/>Verificado</span>)}
        </div>
        {product.is_staff_pick&&(<span className="ml-auto shrink-0 text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full px-2 py-0.5 flex items-center gap-0.5"><Star size={7} fill="currentColor"/>Pick</span>)}
      </div>
      <p className="text-zinc-600 text-[11px] leading-relaxed line-clamp-2">{product.description}</p>
      <div className="flex items-center justify-between mt-auto">
        {price!==undefined&&price>0?(<span className="text-zinc-50 font-bold text-sm">R$ {price.toLocaleString("pt-BR")}<span className="text-zinc-600 font-normal text-[10px] ml-0.5">{isLife?" único":"/mês"}</span></span>):<span className="text-brand text-sm font-semibold">Grátis</span>}
        <Link href={`/produtos/${product.id}`} className="text-[11px] text-zinc-400 hover:text-brand transition-colors flex items-center gap-0.5">Ver<ChevronRight size={10}/></Link>
      </div>
    </motion.div>
  );
}

function TestimonialCard({quote,name,role}:{quote:string;name:string;role:string}){
  return(
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 flex flex-col gap-4">
      <div className="flex gap-0.5">{[1,2,3,4,5].map(s=><Star key={s} size={12} className="text-amber-400" fill="#f59e0b"/>)}</div>
      <p className="text-zinc-400 text-sm leading-relaxed">"{quote}"</p>
      <div className="flex items-center gap-3 mt-auto">
        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 font-bold text-xs">{name.charAt(0)}</div>
        <div><p className="text-zinc-200 text-xs font-semibold">{name}</p><p className="text-zinc-600 text-[10px]">{role}</p></div>
      </div>
    </div>
  );
}

function StepCard({n,title,desc}:{n:string;title:string;desc:string}){
  return(
    <div className="flex gap-5">
      <div className="w-10 h-10 rounded-2xl bg-brand-dim/10 border border-brand-dim/20 flex items-center justify-center text-brand font-black text-sm shrink-0">{n}</div>
      <div><h3 className="text-zinc-100 font-semibold text-sm mb-1">{title}</h3><p className="text-zinc-500 text-xs leading-relaxed">{desc}</p></div>
    </div>
  );
}

export default function LandingPage(){
  const[products,setProducts]=useState<Product[]>([]);
  const[loading,setLoading]=useState(true);
  const[tab,setTab]=useState<"comprador"|"vendedor">("vendedor");
  const typewriterText=useTypewriter(PHRASES);

  useEffect(()=>{
    (async()=>{
      const{data}=await supabase.from("saas_products").select("id,name,description,logo_url,price_monthly,price_lifetime,trending_score,sales_count,is_staff_pick,profiles!vendor_id(is_verified_vendor,full_name)").eq("approval_status","APPROVED").order("trending_score",{ascending:false}).limit(6);
      setProducts((data??[])  as unknown as Product[]);setLoading(false);
    })();
  },[]);

  const VENDOR_FEATURES=[
    {icon:CreditCard,title:"Checkout nativo com PIX",desc:"Stripe Elements inline no seu domínio. PIX via Pagar.me. Sem redirect, sem fricção.",accent:"emerald"},
    {icon:Users,title:"Afiliados Multi-level L1/L2/L3",desc:"Programa automático com cookie, atribuição last-click e aprovação manual ou automática.",accent:"violet"},
    {icon:Webhook,title:"Webhooks & Integrações",desc:"Zapier, Make, N8N ou endpoint próprio. Assinatura HMAC-SHA256 para segurança total.",accent:"sky"},
    {icon:BarChart2,title:"Analytics: MRR / LTV / Churn",desc:"Painel cohort, funil de conversão, ARPU. O que investidores e founders precisam ver.",accent:"amber"},
    {icon:RefreshCw,title:"Dunning Automático",desc:"Recuperação de cobranças falhas em 3 etapas via email, SMS e push. Não perca receita.",accent:"rose"},
    {icon:Globe,title:"White-label & Multi-moeda",desc:"Seu domínio próprio, preços em BRL/USD/EUR e nota fiscal automática via eNotas.",accent:"orange"},
    {icon:Layers,title:"SaaS Auto-Provisioning",desc:"Instâncias criadas e revogadas automaticamente via webhook, API REST ou magic link.",accent:"violet"},
    {icon:FileText,title:"Relatório IR em PDF",desc:"Declaração de IR para produtores e afiliados com todos os lançamentos do ano.",accent:"sky"},
  ];
  const BUYER_FEATURES=[
    {icon:Zap,title:"Acesso imediato",desc:"Após o pagamento, acesso liberado em segundos. License key, SaaS ou download automático.",accent:"emerald"},
    {icon:ShieldCheck,title:"Pagamento seguro",desc:"Checkout criptografado, anti-fraude Stripe Radar, dados protegidos por RLS.",accent:"sky"},
    {icon:Award,title:"Certificados digitais",desc:"Conclusão de cursos gera certificado verificável com QR Code e código único.",accent:"amber"},
    {icon:DollarSign,title:"Carteira de créditos",desc:"Acumule créditos, use pontos de fidelidade, parcele em até 12x.",accent:"violet"},
    {icon:Building2,title:"Workspaces de equipe",desc:"Compartilhe acessos com membros da empresa. Multi-usuário com controle de roles.",accent:"rose"},
    {icon:Bell,title:"Notificações push (PWA)",desc:"App instalável no celular com push nativo. Alertas de renovação, entregas e suporte.",accent:"orange"},
  ];

  return(
    <div className="min-h-screen bg-[#09090b] text-zinc-50 overflow-x-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[600px] h-[500px] bg-brand-dim/[0.04] blur-[120px] rounded-full"/>
        <div className="absolute top-[30%] right-[-5%] w-[400px] h-[400px] bg-violet-500/[0.03] blur-[100px] rounded-full"/>
        <div className="absolute bottom-[10%] left-[-5%] w-[300px] h-[300px] bg-brand-dim/[0.03] blur-[80px] rounded-full"/>
      </div>

      <Nav/>

      {/* HERO */}
      <section className="relative pt-28 pb-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>
            <div className="inline-flex items-center gap-2 border border-brand-dim/20 bg-brand-dim/[0.06] rounded-full px-4 py-1.5 text-xs text-brand mb-8 shadow-lg shadow-brand-dim/10">
              <Sparkles size={11}/>A plataforma de marketplace SaaS do Brasil
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[-0.04em] text-zinc-50 mb-6 leading-[0.92]">
              Venda ou compre<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-emerald-300">
                {typewriterText}<span className="animate-pulse">|</span>
              </span>
            </h1>
            <p className="text-zinc-500 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
              Marketplace completo para criadores de IA. Checkout nativo, afiliados multi-level, SaaS provisioning e analytics — tudo incluso.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
              <Link href="/login?next=/onboarding"
                className="bg-brand-dim hover:bg-brand text-zinc-950 font-bold px-8 py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-brand-dim/25 hover:-translate-y-0.5">
                <Zap size={15} fill="currentColor"/>Começar grátis agora
              </Link>
              <Link href="/explorar"
                className="border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-zinc-300 font-semibold px-8 py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5">
                <Search size={14}/>Explorar produtos
              </Link>
            </div>
          </motion.div>

          {/* Stats bar */}
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3,duration:0.5}}
            className="inline-flex flex-wrap justify-center items-center gap-6 sm:gap-10 border border-white/[0.07] bg-white/[0.02] rounded-2xl px-6 sm:px-10 py-5">
            {[["R$ 0","Custo para começar"],["116+","APIs e rotas"],["PIX","Pagamento nativo"],["V28","Versão atual"]].map(([n,l],i)=>(
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-zinc-50 tracking-tight">{n}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">{l}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* PRODUTOS */}
      <section className="px-4 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-zinc-50 tracking-tight">Em alta esta semana</h2>
              <p className="text-zinc-600 text-sm mt-1">Produtos mais vendidos da plataforma</p>
            </div>
            <Link href="/explorar" className="text-sm text-brand hover:text-emerald-300 flex items-center gap-1 transition-colors">Ver todos<ArrowRight size={13}/></Link>
          </div>
          {loading?(
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i=>(
                <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3 animate-pulse">
                  <div className="h-10 w-10 bg-zinc-800 rounded-xl"/>
                  <div className="h-3 bg-zinc-800 rounded w-2/3"/>
                  <div className="h-2 bg-zinc-800 rounded w-full"/>
                  <div className="h-2 bg-zinc-800 rounded w-4/5"/>
                </div>
              ))}
            </div>
          ):(
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p,i)=>(
                <motion.div key={p.id} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:i*0.07}}>
                  <ProductCardMini product={p}/>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FEATURES TABS */}
      <section className="px-4 py-24 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-brand text-xs font-semibold uppercase tracking-widest mb-3">Infraestrutura completa</p>
            <h2 className="text-4xl font-black tracking-tight text-zinc-50 mb-4">
              Tudo que você precisa.<br/><span className="text-zinc-500">Nada que você não precisa.</span>
            </h2>
            <p className="text-zinc-500 max-w-lg mx-auto text-sm">De checkout a analytics, de afiliados a nota fiscal. A base completa para escalar sua operação.</p>
          </div>
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-zinc-900/80 border border-white/[0.07] rounded-2xl p-1 gap-1">
              {(["vendedor","comprador"] as const).map(t=>(
                <button key={t} onClick={()=>setTab(t)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab===t?"bg-white text-zinc-950 shadow-lg":"text-zinc-500 hover:text-zinc-300"}`}>
                  {t==="vendedor"?"Para Vendedores":"Para Compradores"}
                </button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(tab==="vendedor"?VENDOR_FEATURES:BUYER_FEATURES).map((f,i)=>(
                <motion.div key={f.title} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}}>
                  <FeatureCard {...f as FeatureCardProps}/>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="px-4 py-24 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-brand text-xs font-semibold uppercase tracking-widest mb-4">Como funciona</p>
            <h2 className="text-3xl font-black tracking-tight text-zinc-50 mb-6">Da ideia às vendas<br/>em minutos.</h2>
            <p className="text-zinc-500 text-sm mb-10">Sem setup complicado. Crie seu produto, configure o checkout e comece a vender.</p>
            <div className="flex flex-col gap-7">
              <StepCard n="01" title="Crie sua conta grátis" desc="Cadastro em 30 segundos. Escolha ser comprador, vendedor ou afiliado."/>
              <StepCard n="02" title="Cadastre seu produto" desc="Preencha nome, descrição, preços e configure a entrega (webhook, API, arquivo ou key)."/>
              <StepCard n="03" title="Ative o checkout" desc="Link de venda gerado na hora. PIX e cartão prontos. Stripe Connect para receber automaticamente."/>
              <StepCard n="04" title="Acompanhe em tempo real" desc="MRR, Churn, LTV e cohort no dashboard. Webhooks notificam seu sistema a cada venda."/>
            </div>
          </div>
          <div className="rounded-3xl border border-white/[0.07] bg-zinc-900/40 p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.07]">
              <div className="w-8 h-8 rounded-xl bg-brand-dim/10 border border-brand-dim/20 flex items-center justify-center"><BarChart2 size={15} className="text-brand"/></div>
              <div><p className="text-zinc-200 text-xs font-semibold">Visão geral do mês</p><p className="text-zinc-600 text-[10px]">Atualizado em tempo real</p></div>
            </div>
            {[["MRR","+R$ 14.820","↑ 23% vs mês anterior","emerald"],["Assinantes ativos","342","↑ 18 novos esta semana","emerald"],["Churn Rate","1,4%","↓ Melhor do que 94% dos pares","emerald"],["LTV médio","R$ 1.247","Baseado nos últimos 6 meses","zinc"]].map(([l,v,s,c])=>(
              <div key={l} className="flex items-center justify-between py-2">
                <div><p className="text-zinc-500 text-[10px]">{l}</p><p className="text-zinc-100 font-bold text-sm">{v}</p></div>
                <span className={`text-[10px] ${c==="emerald"?"text-brand":"text-zinc-500"}`}>{s}</span>
              </div>
            ))}
            <div className="pt-3 border-t border-white/[0.07]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1.5 flex-1 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full w-[78%] bg-gradient-to-r from-brand-dim to-brand rounded-full"/></div>
                <span className="text-zinc-600 text-[10px]">78% meta</span>
              </div>
              <p className="text-zinc-600 text-[10px]">Meta mensal: R$ 19.000</p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="px-4 py-24 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black tracking-tight text-zinc-50 mb-3">Quem já usa o Playbook Hub</h2>
            <p className="text-zinc-500 text-sm">Criadores e compradores que confiam na plataforma</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TestimonialCard quote="Em 3 dias já tinha meu SaaS sendo vendido com checkout PIX e afiliados configurados. A infraestrutura é absurdamente completa." name="Rafael M." role="Fundador, AutomateAI"/>
            <TestimonialCard quote="O dunning automático sozinho já recuperou mais de R$ 3.200 que teriam sido perdidos. Vale cada centavo." name="Camila S." role="Criadora de conteúdo de IA"/>
            <TestimonialCard quote="O melhor que já vi no Brasil. Analytics de MRR e Churn prontos, webhooks confiáveis e suporte nota 10." name="Thiago A." role="Desenvolvedor SaaS"/>
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section className="px-4 py-24 border-t border-white/[0.05]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-brand text-xs font-semibold uppercase tracking-widest mb-3">Planos</p>
          <h2 className="text-3xl font-black tracking-tight text-zinc-50 mb-3">Comece grátis.<br/>Escale sem limites.</h2>
          <p className="text-zinc-500 text-sm mb-12">Cobramos uma taxa sobre as vendas, não uma assinatura cara. Você só paga quando vende.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            {[
              {name:"Starter",price:"Grátis",desc:"Para testar e validar seu produto",tax:"5% por venda",features:["Checkout com PIX e cartão","Até 3 produtos","Afiliados básicos","Suporte por email"],highlight:false},
              {name:"Pro",price:"R$ 97",desc:"Para quem está crescendo sério",tax:"3% por venda",features:["Produtos ilimitados","Analytics avançado (MRR/LTV)","Dunning automático","Email marketing sequences","Checkout builder","White-label"],highlight:true,badge:"Mais popular"},
              {name:"Scale",price:"R$ 297",desc:"Para operações de alto volume",tax:"1,5% por venda",features:["Tudo do Pro","Workspaces multi-usuário","SCIM / SSO Enterprise","API pública completa","Suporte prioritário","Gerente de conta dedicado"],highlight:false},
            ].map((p)=>(
              <div key={p.name} className={`relative rounded-2xl p-6 flex flex-col gap-4 ${p.highlight?"bg-brand-dim/[0.06] border-2 border-brand-dim/40 shadow-2xl shadow-brand-dim/10":"border border-white/[0.07] bg-white/[0.02]"}`}>
                {p.badge&&(<div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="bg-brand-dim text-zinc-950 text-xs font-bold px-3 py-1 rounded-full">{p.badge}</span></div>)}
                <div>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">{p.name}</p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-black text-zinc-50 tracking-tight">{p.price}</span>
                    {p.price!=="Grátis"&&<span className="text-zinc-600 text-xs">/mês</span>}
                  </div>
                  <p className="text-zinc-500 text-[10px]">{p.desc}</p>
                  <div className="mt-2 inline-flex items-center gap-1 bg-zinc-800 rounded-full px-2 py-0.5">
                    <span className="text-[10px] text-zinc-400">Taxa: <span className="text-brand font-semibold">{p.tax}</span></span>
                  </div>
                </div>
                <ul className="flex flex-col gap-2">
                  {p.features.map((f,i)=>(<li key={i} className="flex items-start gap-2 text-[11px] text-zinc-400"><CheckCircle2 size={11} className="text-brand shrink-0 mt-0.5"/>{f}</li>))}
                </ul>
                <Link href="/login?next=/onboarding"
                  className={`mt-auto py-2.5 rounded-xl text-sm font-semibold text-center transition-all ${p.highlight?"bg-brand-dim text-zinc-950 hover:bg-brand shadow-lg shadow-brand-dim/20":"bg-white/[0.05] text-zinc-300 hover:bg-white/[0.08] border border-white/10"}`}>
                  Começar agora
                </Link>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Ver comparativo completo de planos →</Link>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-4 py-24 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl border border-brand-dim/20 bg-brand-dim/[0.04] p-12">
            <div className="w-14 h-14 rounded-2xl bg-brand-dim/10 border border-brand-dim/20 flex items-center justify-center mx-auto mb-6">
              <Zap size={26} className="text-brand" fill="currentColor"/>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-50 mb-4">Pronto para começar?</h2>
            <p className="text-zinc-500 text-sm mb-8">Crie sua conta grátis e tenha seu produto sendo vendido ainda hoje.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login?next=/onboarding"
                className="bg-brand-dim hover:bg-brand text-zinc-950 font-bold px-8 py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-brand-dim/25 hover:-translate-y-0.5">
                <Zap size={15} fill="currentColor"/>Criar conta grátis
              </Link>
              <Link href="/explorar"
                className="border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-zinc-300 font-semibold px-8 py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5">
                Explorar produtos
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.05] px-4 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-emerald-600 flex items-center justify-center"><Zap size={13} className="text-zinc-950" fill="currentColor"/></div>
                <span className="font-bold text-zinc-50 text-sm">Playbook<span className="text-brand">Hub</span></span>
              </div>
              <p className="text-zinc-600 text-xs leading-relaxed">O marketplace de SaaS e ferramentas de IA do Brasil.</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wider">Plataforma</p>
              <div className="flex flex-col gap-2">
                {[["Explorar","/explorar"],["Preços","/pricing"],["Para Vendors","/vendor/produtos"]].map(([l,h])=>(
                  <Link key={h} href={h} className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">{l}</Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wider">Legal</p>
              <div className="flex flex-col gap-2">
                {[["Termos de Uso","/termos"],["Privacidade","/privacidade"],["LGPD","/solicitar-dados"]].map(([l,h])=>(
                  <Link key={h} href={h} className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">{l}</Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-zinc-400 text-xs font-semibold mb-3 uppercase tracking-wider">Conta</p>
              <div className="flex flex-col gap-2">
                {[["Entrar","/login"],["Cadastrar","/login"],["Suporte","/support"]].map(([l,h])=>(
                  <Link key={h} href={h} className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">{l}</Link>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-700">
            <span>© {new Date().getFullYear()} Playbook Hub · Todos os direitos reservados</span>
            <span>Feito com ❤️ no Brasil · Powered by Stripe + Supabase</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
