"use client";
// app/onboarding/page.tsx — Onboarding Premium v2 (5 steps)
import { Suspense, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  ShoppingBag, Package, Link2, Loader2, ArrowRight, ArrowLeft,
  CheckCircle2, Zap, User, Globe, CreditCard, Shield,
  Building2, ChevronRight, Sparkles,
} from "lucide-react";

const ROLES=[
  {id:"buyer",icon:ShoppingBag,title:"Quero Comprar",desc:"Acesse ferramentas e SaaS de outros criadores.",color:"sky"},
  {id:"vendor",icon:Package,title:"Quero Vender",desc:"Distribua seu produto ou SaaS na plataforma.",color:"emerald"},
  {id:"affiliate",icon:Link2,title:"Quero ser Afiliado",desc:"Promova produtos e ganhe comissão por venda.",color:"violet"},
];

const CATEGORIES_VENDOR=["Automação com IA","Ferramentas de conteúdo","CRM & Vendas","Marketing Digital","Produtividade","WhatsApp & Comunicação","Dashboards & Analytics","Outro"];
const CATEGORIES_BUYER=["Automação","Conteúdo","Marketing","Produtividade","CRM","Design","Dev Tools","Outro"];

function RoleCard({role,selected,onSelect}:{role:typeof ROLES[0];selected:boolean;onSelect:()=>void}){
  const Icon=role.icon;
  const colors:Record<string,string>={sky:"border-sky-500/40 bg-sky-500/[0.06] shadow-sky-500/10",emerald:"border-emerald-500/40 bg-emerald-500/[0.06] shadow-emerald-500/10",violet:"border-violet-500/40 bg-violet-500/[0.06] shadow-violet-500/10"};
  const iconColors:Record<string,string>={sky:"bg-sky-500/10 text-sky-400 border-sky-500/20",emerald:"bg-emerald-500/10 text-emerald-400 border-emerald-500/20",violet:"bg-violet-500/10 text-violet-400 border-violet-500/20"};
  return(
    <motion.button whileHover={{y:-2}} whileTap={{scale:0.98}} onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 p-5 transition-all ${selected?colors[String(role.color)]+" border-opacity-100 shadow-lg":"border-white/[0.07] bg-white/[0.02] hover:border-white/15"}`}>
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${selected?iconColors[String(role.color)]:"bg-zinc-800 text-zinc-500 border-zinc-700"}`}><Icon size={18}/></div>
      <p className="text-zinc-100 font-bold text-sm mb-1">{role.title}</p>
      <p className="text-zinc-500 text-xs leading-relaxed">{role.desc}</p>
      {selected&&<div className="flex items-center gap-1 mt-3 text-xs font-semibold" style={{color:role.color==="sky"?"#38bdf8":role.color==="emerald"?"#34d399":"#a78bfa"}}><CheckCircle2 size={12}/>Selecionado</div>}
    </motion.button>
  );
}

function StepIndicator({step,total,labels}:{step:number;total:number;labels:string[]}){
  return(
    <div className="flex items-center gap-1 mb-8">
      {Array.from({length:total}).map((_,i)=>(
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${i<step?"bg-emerald-500 text-zinc-950":i===step?"bg-white text-zinc-950 shadow-lg":"bg-zinc-800 text-zinc-600"}`}>
            {i<step?<CheckCircle2 size={13}/>:i+1}
          </div>
          {i<total-1&&<div className={`h-px w-8 sm:w-14 transition-all ${i<step?"bg-emerald-500":"bg-zinc-800"}`}/>}
        </div>
      ))}
    </div>
  );
}

function OnboardingContent(){
  const supabase=createClient();
  const router=useRouter();
  const searchParams=useSearchParams();
  const vref=searchParams.get("vref");

  const[step,setStep]=useState(0);
  const[role,setRole]=useState<string|null>(null);
  const[categories,setCategories]=useState<string[]>([]);
  const[fullName,setFullName]=useState("");
  const[username,setUsername]=useState("");
  const[website,setWebsite]=useState("");
  const[bio,setBio]=useState("");
  const[loading,setLoading]=useState(false);

  const steps=["Papel","Interesses","Perfil","Finalizar"];

  const handleFinish=async()=>{
    if(!role){toast.error("Selecione como quer usar a plataforma.");return;}
    setLoading(true);
    const{data:{session}}=await supabase.auth.getSession();
    if(!session){router.push("/login");return;}

    interface ProfileUpdatePayload {
      role: string;
      onboarded: boolean;
      interests: string[];
      full_name?: string;
      username?: string;
      website?: string;
      bio?: string;
    }

    const update: ProfileUpdatePayload = { role, onboarded: true, interests: categories };
    if(fullName.trim())update.full_name=fullName.trim();
    if(username.trim())update.username=username.trim().toLowerCase().replace(/[^a-z0-9_]/g,"");
    if(website.trim())update.website=website.trim();
    if(bio.trim())update.bio=bio.trim();

    const{error}=await supabase.from("profiles").update(update).eq("id",session.user.id);
    if(error){toast.error("Erro ao salvar. Tente novamente.");setLoading(false);return;}

    if(vref&&role==="vendor"){
      await fetch("/api/vendor/referrals/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({referral_code:vref})}).catch(()=>{});
    }

    const redirects:Record<string,string>={vendor:"/vendor/produtos",affiliate:"/affiliate/links",buyer:"/explorar"};
    toast.success("Conta configurada! Bem-vindo ao Playbook Hub 🚀");
    router.push(redirects[role]||"/dashboard");
  };

  const catList=role==="vendor"?CATEGORIES_VENDOR:CATEGORIES_BUYER;

  return(
    <div className="min-h-screen bg-[#09090b] text-zinc-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[400px] bg-emerald-500/[0.04] blur-[120px] rounded-full"/>
      </div>

      <div className="w-full max-w-lg relative">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Zap size={18} className="text-zinc-950" fill="currentColor"/>
          </div>
          <span className="font-bold text-zinc-50 text-xl tracking-tight">Playbook<span className="text-emerald-400">Hub</span></span>
        </div>

        <StepIndicator step={step} total={steps.length} labels={steps}/>

        <AnimatePresence mode="wait">
          {/* STEP 0: Papel */}
          {step===0&&(
            <motion.div key="step0" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:0.2}}>
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-4"><Sparkles size={10}/>Passo 1 de 4</div>
                <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-2">Como você vai usar o Playbook Hub?</h1>
                <p className="text-zinc-500 text-sm">Isso define a experiência que vamos preparar para você.</p>
              </div>
              <div className="flex flex-col gap-3 mb-8">
                {ROLES.map(r=>(<RoleCard key={r.id} role={r} selected={role===r.id} onSelect={()=>setRole(r.id)}/>))}
              </div>
              <button onClick={()=>{if(!role){toast.error("Selecione uma opção.");return;}setStep(1);}}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                Continuar<ArrowRight size={15}/>
              </button>
            </motion.div>
          )}

          {/* STEP 1: Interesses */}
          {step===1&&(
            <motion.div key="step1" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:0.2}}>
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-4"><Sparkles size={10}/>Passo 2 de 4</div>
                <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-2">
                  {role==="vendor"?"Em que categoria seu produto se encaixa?":"Quais categorias te interessam?"}
                </h1>
                <p className="text-zinc-500 text-sm">Selecione todas que se aplicam. Pode mudar depois.</p>
              </div>
              <div className="flex flex-wrap gap-2 mb-8">
                {catList.map(c=>(
                  <button key={c} onClick={()=>setCategories(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c])}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${categories.includes(c)?"border-emerald-500/40 bg-emerald-500/10 text-emerald-400":"border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:border-white/15"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setStep(0)} className="px-5 py-3.5 rounded-2xl border border-white/[0.07] text-zinc-500 hover:text-zinc-300 transition-all flex items-center gap-1.5 text-sm"><ArrowLeft size={14}/>Voltar</button>
                <button onClick={()=>setStep(2)} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm">
                  Continuar<ArrowRight size={14}/>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Perfil */}
          {step===2&&(
            <motion.div key="step2" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:0.2}}>
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-4"><Sparkles size={10}/>Passo 3 de 4</div>
                <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-2">Conte um pouco sobre você</h1>
                <p className="text-zinc-500 text-sm">Essas informações ficam visíveis no seu perfil público.</p>
              </div>
              <div className="flex flex-col gap-4 mb-8">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Nome completo *</label>
                  <input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Ex: João da Silva"
                    className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 focus:bg-zinc-900/80 transition-all placeholder:text-zinc-700"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Nome de usuário</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">@</span>
                    <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="joaosilva"
                      className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl pl-8 pr-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700"/>
                  </div>
                </div>
                {(role==="vendor"||role==="affiliate")&&(
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Website ou redes sociais</label>
                    <input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://seusite.com"
                      className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700"/>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Bio (opcional)</label>
                  <textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Uma breve descrição sobre você..." rows={3}
                    className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-emerald-500/40 transition-all placeholder:text-zinc-700 resize-none"/>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setStep(1)} className="px-5 py-3.5 rounded-2xl border border-white/[0.07] text-zinc-500 hover:text-zinc-300 transition-all flex items-center gap-1.5 text-sm"><ArrowLeft size={14}/>Voltar</button>
                <button onClick={()=>{if(!fullName.trim()){toast.error("Nome é obrigatório.");return;}setStep(3);}}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm">
                  Continuar<ArrowRight size={14}/>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Review & Finalizar */}
          {step===3&&(
            <motion.div key="step3" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:0.2}}>
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-4"><Sparkles size={10}/>Passo 4 de 4</div>
                <h1 className="text-2xl font-black text-zinc-50 tracking-tight mb-2">Tudo pronto! 🚀</h1>
                <p className="text-zinc-500 text-sm">Confirme seus dados antes de finalizar.</p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6 flex flex-col gap-3">
                {([
                  { Icon: (ROLES.find(r=>r.id===role)?.icon ?? User), label: "Papel", value: ROLES.find(r=>r.id===role)?.title ?? "—" },
                  { Icon: User, label: "Nome", value: fullName || "(não informado)" },
                  { Icon: (categories.length>0?Globe:Building2), label: "Interesses", value: (categories.slice(0,3).join(", ") + (categories.length>3?"...":"")) || "(nenhum)" },
                ] as Array<{ Icon: LucideIcon; label: string; value: string }>).map(({ Icon, label, value }, i)=>(
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/[0.07] flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-zinc-400"/>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
                      <p className="text-zinc-200 text-xs font-semibold truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {role==="vendor"&&(
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 mb-6">
                  <p className="text-emerald-400 text-xs font-semibold mb-1 flex items-center gap-1.5"><CheckCircle2 size={11}/>Próximos passos para vendedores</p>
                  <ul className="flex flex-col gap-1 text-xs text-zinc-500">
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-500"/>Cadastrar seu primeiro produto</li>
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-500"/>Conectar conta Stripe para receber</li>
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-500"/>Configurar KYC (verificação de identidade)</li>
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={()=>setStep(2)} className="px-5 py-3.5 rounded-2xl border border-white/[0.07] text-zinc-500 hover:text-zinc-300 transition-all flex items-center gap-1.5 text-sm"><ArrowLeft size={14}/>Voltar</button>
                <button onClick={handleFinish} disabled={loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-70 text-zinc-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm">
                  {loading?<><Loader2 size={15} className="animate-spin"/>Salvando...</>:<><Zap size={15} fill="currentColor"/>Entrar na plataforma</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function OnboardingPage(){
  return(<Suspense><OnboardingContent/></Suspense>);
}
