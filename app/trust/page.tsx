// app/trust/page.tsx
// Trust Center — segurança, compliance e práticas operacionais.
// Aumenta confiança de compradores enterprise e investidores.

import {
  Shield, Lock, Eye, RefreshCw, FileText, Users,
  CreditCard, Server, CheckCircle, Globe, Zap, KeyRound,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

interface TrustItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge?: string;
}

const SECURITY_ITEMS: TrustItem[] = [
  {
    icon: CreditCard,
    title: "Stripe Secure Payments",
    description: "Todos os pagamentos processados via Stripe com certificação PCI DSS Level 1. Dados de cartão nunca passam pelos nossos servidores.",
    badge: "PCI DSS L1",
  },
  {
    icon: Lock,
    title: "Encriptação em trânsito e repouso",
    description: "TLS 1.3 em todas as conexões. Dados em repouso encriptados no Supabase com AES-256.",
    badge: "TLS 1.3 + AES-256",
  },
  {
    icon: KeyRound,
    title: "OAuth 2.0 + PKCE",
    description: "Autenticação via authorization code flow com PKCE. Tokens com expiração e refresh automático.",
    badge: "OAuth 2.0",
  },
  {
    icon: Shield,
    title: "Row Level Security (RLS)",
    description: "Políticas de acesso no nível do banco de dados. Cada vendor acessa apenas os próprios dados.",
    badge: "PostgreSQL RLS",
  },
  {
    icon: Eye,
    title: "Audit Logs completo",
    description: "Registro imutável de todas as ações administrativas, com timestamp, IP e usuário responsável.",
  },
  {
    icon: FileText,
    title: "LGPD Compliant",
    description: "Portabilidade e exclusão de dados a pedido do usuário. Exportação em JSON/CSV. Política de privacidade clara.",
    badge: "LGPD",
  },
];

const RELIABILITY_ITEMS: TrustItem[] = [
  {
    icon: Server,
    title: "Infraestrutura Vercel + Supabase",
    description: "Deploy na edge global Vercel com SLA de 99.99%. Banco de dados Supabase com replicação automática.",
    badge: "99.99% SLA",
  },
  {
    icon: RefreshCw,
    title: "Idempotência de webhooks",
    description: "Todos os eventos Stripe são processados exatamente uma vez. Sistema de deduplicação com constraint único.",
  },
  {
    icon: Zap,
    title: "Fila de jobs resiliente",
    description: "Background jobs com retry automático exponencial. DLQ para eventos não processados.",
  },
  {
    icon: CheckCircle,
    title: "Anti-fraude nativo",
    description: "Stripe Radar + fingerprint de cartão + velocity check + blacklist de emails. Disputas com submissão automática de evidências.",
  },
];

const COMPLIANCE_ITEMS: TrustItem[] = [
  {
    icon: Globe,
    title: "Multi-jurisdição fiscal",
    description: "Motor de tributação para VAT/GST (Europa), ISS (Brasil), CBS/IBS (reforma fiscal 2025). Suporte a reverse charge B2B.",
  },
  {
    icon: FileText,
    title: "Nota Fiscal automática (NF-e)",
    description: "Emissão automática via eNotas para vendas no Brasil. Fila de emissão com retry e status tracking.",
    badge: "NF-e",
  },
  {
    icon: Users,
    title: "KYC via Stripe Identity",
    description: "Verificação de identidade de vendors via Stripe Identity. Onboarding Connect Express compliant.",
  },
  {
    icon: Shield,
    title: "SCIM / SSO Enterprise",
    description: "Provisionamento automático de usuários via SCIM 2.0. SSO para planos enterprise.",
    badge: "SCIM 2.0",
  },
];

function TrustCard({ item }: { item: TrustItem }) {
  const Icon = item.icon;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        {item.badge && (
          <span className="text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
      </div>
      <h3 className="text-sm font-semibold text-zinc-200 mb-2">{item.title}</h3>
      <p className="text-xs text-zinc-500 leading-relaxed">{item.description}</p>
    </div>
  );
}

function Section({ title, subtitle, items }: { title: string; subtitle: string; items: TrustItem[] }) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => <TrustCard key={item.title} item={item} />)}
      </div>
    </section>
  );
}

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold">Trust Center</h1>
          </div>
          <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
            Práticas de segurança, confiabilidade e compliance do Playbook Hub.
            Construído para operar como negócio sério desde o primeiro dia.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-3 mt-6">
            {["PCI DSS L1", "LGPD Compliant", "NF-e", "OAuth 2.0", "SCIM 2.0", "TLS 1.3"].map(badge => (
              <span key={badge} className="flex items-center gap-1.5 text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        <Section
          title="Segurança"
          subtitle="Proteção de dados e autenticação de nível enterprise"
          items={SECURITY_ITEMS}
        />
        <Section
          title="Confiabilidade"
          subtitle="Infraestrutura resiliente e operação contínua"
          items={RELIABILITY_ITEMS}
        />
        <Section
          title="Compliance"
          subtitle="Adequação fiscal e regulatória em múltiplas jurisdições"
          items={COMPLIANCE_ITEMS}
        />

        {/* CTA */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Alguma dúvida sobre segurança?</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Entre em contato com nossa equipe para um assessment técnico completo.
          </p>
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
          >
            <Shield className="w-4 h-4" />
            {BRAND.supportEmail}
          </a>
        </div>
      </div>
    </div>
  );
}
