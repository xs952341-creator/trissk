"use client";
// app/pricing/page.tsx — Página de Preços Pública
import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, X, Zap, ArrowRight, HelpCircle } from "lucide-react";
import Link from "next/link";

const PLANS = [
  {
    id:"starter",name:"Starter",monthly:"Grátis",annual:"Grátis",
    tax:"5%",desc:"Para testar e validar seu produto no mercado.",
    highlight:false,badge:null,
    features:{
      products:"Até 3 produtos",checkout:true,pix:true,affiliates:"Básico (L1)",analytics:"Resumo simples",dunning:false,
      emailMarketing:false,checkoutBuilder:false,whiteLbl:false,workspaces:false,apiKeys:false,
      scim:false,webhooks:"5 endpoints",support:"Email",sla:null,
    },
  },
  {
    id:"pro",name:"Pro",monthly:"R$ 97",annual:"R$ 79",
    tax:"3%",desc:"Para criadores sérios que estão crescendo.",
    highlight:true,badge:"Mais popular",
    features:{
      products:"Ilimitados",checkout:true,pix:true,affiliates:"Multi-level L1/L2/L3",analytics:"MRR, LTV, Churn, Cohort",dunning:true,
      emailMarketing:true,checkoutBuilder:true,whiteLbl:true,workspaces:"Até 3 workspaces",apiKeys:true,
      scim:false,webhooks:"Ilimitados",support:"Prioritário",sla:"99,5%",
    },
  },
  {
    id:"scale",name:"Scale",monthly:"R$ 297",annual:"R$ 247",
    tax:"1,5%",desc:"Para operações de alto volume e times maiores.",
    highlight:false,badge:null,
    features:{
      products:"Ilimitados",checkout:true,pix:true,affiliates:"Multi-level + Marketplace público",analytics:"Tudo do Pro + A/B tests",dunning:true,
      emailMarketing:true,checkoutBuilder:true,whiteLbl:true,workspaces:"Ilimitados",apiKeys:true,
      scim:true,webhooks:"Ilimitados",support:"Gerente dedicado",sla:"99,9%",
    },
  },
];

const COMPARE_ROWS = [
  {section:"Produtos & Checkout",rows:[
    {label:"Número de produtos",starter:"Até 3",pro:"Ilimitados",scale:"Ilimitados"},
    {label:"Checkout nativo (sem redirect)",starter:true,pro:true,scale:true},
    {label:"Pagamento PIX",starter:true,pro:true,scale:true},
    {label:"Parcelamento",starter:"Até 3x",pro:"Até 12x",scale:"Até 12x"},
    {label:"Checkout Builder (customização visual)",starter:false,pro:true,scale:true},
    {label:"Multi-moeda (BRL/USD/EUR)",starter:false,pro:true,scale:true},
    {label:"Order Bump",starter:true,pro:true,scale:true},
    {label:"One-click Upsell",starter:false,pro:true,scale:true},
  ]},
  {section:"Afiliados",rows:[
    {label:"Programa de afiliados",starter:"Básico (L1)",pro:"Multi-level L1/L2/L3",scale:"L1/L2/L3 + Marketplace"},
    {label:"Relatório IR para afiliados",starter:false,pro:true,scale:true},
    {label:"Ranking público de afiliados",starter:false,pro:true,scale:true},
  ]},
  {section:"Analytics & Insights",rows:[
    {label:"Painel de vendas",starter:true,pro:true,scale:true},
    {label:"MRR / ARR",starter:false,pro:true,scale:true},
    {label:"LTV / Churn Rate",starter:false,pro:true,scale:true},
    {label:"Cohort Retention",starter:false,pro:true,scale:true},
    {label:"A/B Test Results",starter:false,pro:false,scale:true},
    {label:"Funil de conversão",starter:false,pro:true,scale:true},
  ]},
  {section:"Automação",rows:[
    {label:"Dunning automático (recuperar cobranças)",starter:false,pro:true,scale:true},
    {label:"Email marketing sequences",starter:false,pro:true,scale:true},
    {label:"SaaS auto-provisioning",starter:false,pro:true,scale:true},
    {label:"Cron jobs & Job Queue",starter:false,pro:true,scale:true},
  ]},
  {section:"Integrações",rows:[
    {label:"Webhooks outbound",starter:"5 endpoints",pro:"Ilimitados",scale:"Ilimitados"},
    {label:"API pública (REST)",starter:false,pro:true,scale:true},
    {label:"Zapier / Make / N8N",starter:true,pro:true,scale:true},
    {label:"SCIM / SSO Enterprise",starter:false,pro:false,scale:true},
    {label:"Nota Fiscal (eNotas)",starter:false,pro:true,scale:true},
  ]},
  {section:"Equipe & Segurança",rows:[
    {label:"Workspaces multi-usuário",starter:false,pro:"Até 3",scale:"Ilimitados"},
    {label:"Controle de roles (admin/member)",starter:false,pro:true,scale:true},
    {label:"Audit log",starter:false,pro:true,scale:true},
    {label:"KYC de vendedores",starter:true,pro:true,scale:true},
    {label:"Anti-fraude (Stripe Radar)",starter:true,pro:true,scale:true},
    {label:"LGPD / Solicitação de dados",starter:true,pro:true,scale:true},
  ]},
  {section:"Suporte & SLA",rows:[
    {label:"Suporte",starter:"Email",pro:"Prioritário",scale:"Gerente dedicado"},
    {label:"SLA de uptime",starter:"—",pro:"99,5%",scale:"99,9%"},
    {label:"Onboarding assistido",starter:false,pro:false,scale:true},
  ]},
];

function Check(){return<CheckCircle2 size={14} className="text-emerald-400 mx-auto"/>;}
function Cross(){return<X size={14} className="text-zinc-700 mx-auto"/>;}
type PricingCellValue = boolean | string | number | null | undefined;

function Val({ v }: { v: PricingCellValue }) {
  if(v===true)return<Check/>;
  if(v===false)return<Cross/>;
  return<span className="text-zinc-400 text-xs">{v}</span>;
}

export default function PricingPage(){
  const[annual,setAnnual]=useState(false);

  return(
    <div className="min-h-screen bg-[#09090b] text-zinc-50">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[600px] h-[400px] bg-emerald-500/[0.04] blur-[120px] rounded-full"/>
      </div>

      {/* Nav simples */}
      <nav className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center"><Zap size={13} className="text-zinc-950" fill="currentColor"/></div>
            <span className="font-bold text-zinc-50 tracking-tight">Playbook<span className="text-emerald-400">Hub</span></span>
          </Link>
          <Link href="/login?next=/onboarding" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-4 py-2 rounded-xl text-xs transition-all">Começar grátis</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-3">Preços transparentes</p>
          <h1 className="text-5xl font-black tracking-tight text-zinc-50 mb-4">Comece grátis.<br/>Escale sem limites.</h1>
          <p className="text-zinc-500 text-sm max-w-lg mx-auto mb-8">Sem surpresas. Pague apenas quando vender. Cancele a qualquer momento.</p>

          {/* Toggle anual */}
          <div className="inline-flex items-center gap-3 bg-zinc-900 border border-white/[0.07] rounded-2xl p-1.5">
            <button onClick={()=>setAnnual(false)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${!annual?"bg-white text-zinc-950":"text-zinc-500 hover:text-zinc-300"}`}>Mensal</button>
            <button onClick={()=>setAnnual(true)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${annual?"bg-white text-zinc-950":"text-zinc-500 hover:text-zinc-300"}`}>
              Anual
              <span className="bg-emerald-500 text-zinc-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full">-20%</span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-20">
          {PLANS.map((p)=>(
            <motion.div key={p.id} whileHover={{y:-4}} transition={{duration:0.18}}
              className={`relative rounded-2xl p-7 flex flex-col gap-5 ${p.highlight?"bg-emerald-500/[0.06] border-2 border-emerald-500/40 shadow-2xl shadow-emerald-500/10":"border border-white/[0.07] bg-white/[0.02]"}`}>
              {p.badge&&(<div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="bg-emerald-500 text-zinc-950 text-xs font-bold px-3 py-1 rounded-full shadow-lg">{p.badge}</span></div>)}
              <div>
                <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">{p.name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-black text-zinc-50 tracking-tight">{annual?p.annual:p.monthly}</span>
                  {p.monthly!=="Grátis"&&<span className="text-zinc-600 text-sm">/mês</span>}
                </div>
                <p className="text-zinc-600 text-xs mb-3">{p.desc}</p>
                <div className="inline-flex items-center gap-1 bg-zinc-800/80 rounded-full px-2.5 py-1">
                  <span className="text-[10px] text-zinc-500">Taxa sobre vendas: <span className="text-emerald-400 font-bold">{p.tax}</span></span>
                </div>
              </div>

              <ul className="flex flex-col gap-2.5">
                {[
                  p.features.products,
                  p.features.checkout&&"Checkout nativo (sem redirect)",
                  p.features.pix&&"PIX e cartão de crédito",
                  `Afiliados: ${p.features.affiliates}`,
                  `Analytics: ${p.features.analytics}`,
                  p.features.dunning&&"Dunning automático",
                  p.features.emailMarketing&&"Email marketing sequences",
                  p.features.checkoutBuilder&&"Checkout builder visual",
                  p.features.whiteLbl&&"White-label (seu domínio)",
                  p.features.workspaces&&(typeof p.features.workspaces==="string"?`Workspaces: ${p.features.workspaces}`:"Workspaces ilimitados"),
                  p.features.scim&&"SCIM / SSO Enterprise",
                  `Suporte ${p.features.support}`,
                ].filter(Boolean).map((f,i)=>(
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5"/>
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/login?next=/onboarding"
                className={`mt-auto py-3 rounded-xl text-sm font-bold text-center transition-all flex items-center justify-center gap-2 ${p.highlight?"bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20":"bg-white/[0.05] text-zinc-300 hover:bg-white/[0.08] border border-white/10"}`}>
                {p.monthly==="Grátis"?"Começar grátis":"Assinar agora"} <ArrowRight size={13}/>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Tabela de comparação */}
        <div className="mb-20">
          <h2 className="text-2xl font-black text-zinc-50 tracking-tight text-center mb-10">Comparativo completo</h2>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-4 bg-zinc-900/60 border-b border-white/[0.07]">
              <div className="p-4 text-xs text-zinc-600 font-semibold">Recurso</div>
              {PLANS.map(p=>(
                <div key={p.id} className={`p-4 text-center ${p.highlight?"bg-emerald-500/[0.05]":""}`}>
                  <p className="text-zinc-200 text-xs font-bold">{p.name}</p>
                  <p className="text-emerald-400 text-[10px] font-bold">{annual?p.annual:p.monthly}</p>
                </div>
              ))}
            </div>

            {COMPARE_ROWS.map((section)=>(
              <div key={section.section}>
                <div className="px-4 py-2.5 bg-zinc-900/30 border-b border-white/[0.05]">
                  <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{section.section}</p>
                </div>
                {section.rows.map((row,i)=>(
                  <div key={i} className={`grid grid-cols-4 border-b border-white/[0.04] ${i%2===0?"bg-white/[0.01]":""}`}>
                    <div className="p-3.5 text-zinc-500 text-xs">{row.label}</div>
                    <div className="p-3.5 text-center"><Val v={row.starter}/></div>
                    <div className={`p-3.5 text-center ${PLANS[1].highlight?"bg-emerald-500/[0.03]":""}`}><Val v={row.pro}/></div>
                    <div className="p-3.5 text-center"><Val v={row.scale}/></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mb-20">
          <h2 className="text-2xl font-black text-zinc-50 tracking-tight text-center mb-10">Perguntas frequentes</h2>
          <div className="flex flex-col gap-4">
            {[
              ["O que é a taxa por venda?","Além da mensalidade do plano, cobramos um percentual sobre cada venda processada. Starter: 5%, Pro: 3%, Scale: 1,5%. Sem taxas ocultas."],
              ["Posso mudar de plano a qualquer momento?","Sim. Upgrade e downgrade são instantâneos. No downgrade, você mantém os recursos até o fim do período pago."],
              ["O Starter é realmente grátis para sempre?","Sim! Você paga apenas a taxa de 5% sobre cada venda. Ideal para quem está validando um produto."],
              ["Como funciona o White-label?","No plano Pro e Scale, você pode conectar seu próprio domínio. Compradores veem apenas sua marca, sem menção ao Playbook Hub."],
              ["Há limite de volume de vendas?","Não. Não há limite de GMV em nenhum plano. Quanto mais você vende, mais faz sentido subir de plano pela taxa menor."],
            ].map(([q,a])=>(
              <div key={q} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="flex items-start gap-3">
                  <HelpCircle size={15} className="text-emerald-400 shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-zinc-100 text-sm font-semibold mb-1.5">{q}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">{a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] p-12">
          <h2 className="text-3xl font-black tracking-tight text-zinc-50 mb-3">Comece agora. É grátis.</h2>
          <p className="text-zinc-500 text-sm mb-8">Sem cartão de crédito. Sem burocracia. Seu produto vendendo em minutos.</p>
          <Link href="/login?next=/onboarding"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-8 py-4 rounded-2xl text-sm transition-all shadow-xl shadow-emerald-500/25 hover:-translate-y-0.5">
            <Zap size={15} fill="currentColor"/>Criar conta grátis
          </Link>
        </div>
      </div>
    </div>
  );
}
