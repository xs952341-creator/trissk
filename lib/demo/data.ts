/**
 * lib/demo/data.ts
 * Fonte de verdade canônica dos dados de demonstração.
 *
 * Consumido por:
 *   - app/demo/page.tsx  (interface visual sem autenticação)
 *   - scripts/seed-demo.ts  (popula o banco com os mesmos dados)
 *
 * Garantia: a demo visual e os dados seeded são SEMPRE consistentes.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DemoVendor {
  id: string;
  email: string;
  fullName: string;
  isVerified: boolean;
  mrr: number;       // centavos
  totalRevenue: number; // centavos
}

export interface DemoProduct {
  id: string;
  vendorId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceMonthlyCents: number;
  totalOrders: number;
  totalRevenueCents: number;
  status: "published" | "draft";
}

export interface DemoTier {
  id: string;
  productId: string;
  tierName: string;
  priceMonthlyCents: number;
  features: string[];
  isPopular: boolean;
}

export interface DemoOrder {
  id: string;
  vendorId: string;
  productId: string;
  tierId: string;
  buyerName: string;
  buyerEmail: string;
  grossCents: number;
  platformFeePct: number;
  currency: string;
  daysAgo: number; // used to compute created_at
}

export interface DemoLedgerEntry {
  id: string;
  vendorId: string;
  type: "sale" | "platform_fee" | "affiliate_commission" | "refund";
  amountCents: number;
  direction: "credit" | "debit";
  description: string;
  reconciled: boolean;
  daysAgo: number;
}

export interface DemoAffiliate {
  id: string;
  vendorId: string;
  productId: string;
  code: string;
  affiliateName: string;
  commissionPct: number;
  totalSales: number;
  totalCommissionCents: number;
}

export interface DemoCertificate {
  id: string;
  code: string;
  buyerName: string;
  productName: string;
  vendorName: string;
  isValid: boolean;
  daysAgo: number;
}

export interface DemoRecentSale {
  buyerInitial: string;
  buyerName: string;
  productName: string;
  amountCents: number;
  minutesAgo: number;
}

// ─── Dados canônicos ─────────────────────────────────────────────────────────

export const DEMO_VENDORS: DemoVendor[] = [
  {
    id: "demo-vendor-001",
    email: "vendor1@demo.local",
    fullName: "TechCo Demo",
    isVerified: true,
    mrr: 2_730_000,       // R$ 27.300
    totalRevenue: 48_320_00, // R$ 48.320
  },
  {
    id: "demo-vendor-002",
    email: "vendor2@demo.local",
    fullName: "AI Tools Demo",
    isVerified: true,
    mrr: 1_250_000,       // R$ 12.500
    totalRevenue: 21_450_00, // R$ 21.450
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "demo-prod-001",
    vendorId: "demo-vendor-001",
    name: "IA Marketing Suite",
    slug: "ia-marketing-suite",
    description: "Suite completa de marketing com IA para criação de copies, emails e anúncios de alta conversão.",
    category: "marketing",
    priceMonthlyCents: 19_700,
    totalOrders: 142,
    totalRevenueCents: 27_000_00,
    status: "published",
  },
  {
    id: "demo-prod-002",
    vendorId: "demo-vendor-001",
    name: "AutomaPro CRM",
    slug: "automapro-crm",
    description: "CRM com automação inteligente para times de vendas B2B.",
    category: "crm",
    priceMonthlyCents: 14_900,
    totalOrders: 89,
    totalRevenueCents: 13_350_00,
    status: "published",
  },
  {
    id: "demo-prod-003",
    vendorId: "demo-vendor-002",
    name: "FinanceOS Dashboard",
    slug: "financeos-dashboard",
    description: "Dashboard financeiro com IA para análise de fluxo de caixa e projeções.",
    category: "finance",
    priceMonthlyCents: 9_700,
    totalOrders: 67,
    totalRevenueCents: 6_700_00,
    status: "published",
  },
  {
    id: "demo-prod-004",
    vendorId: "demo-vendor-002",
    name: "DevOps Toolkit",
    slug: "devops-toolkit",
    description: "Ferramentas de DevOps e infraestrutura para times de engenharia.",
    category: "devops",
    priceMonthlyCents: 4_900,
    totalOrders: 49,
    totalRevenueCents: 2_450_00,
    status: "published",
  },
];

export const DEMO_TIERS: DemoTier[] = [
  {
    id: "demo-tier-001",
    productId: "demo-prod-001",
    tierName: "Starter",
    priceMonthlyCents: 9_700,
    features: ["5 projetos", "10k tokens/mês", "Suporte email"],
    isPopular: false,
  },
  {
    id: "demo-tier-002",
    productId: "demo-prod-001",
    tierName: "Pro",
    priceMonthlyCents: 19_700,
    features: ["Projetos ilimitados", "100k tokens/mês", "Suporte prioritário", "API access"],
    isPopular: true,
  },
  {
    id: "demo-tier-003",
    productId: "demo-prod-002",
    tierName: "Business",
    priceMonthlyCents: 14_900,
    features: ["3 usuários", "5k contatos", "Automações ilimitadas"],
    isPopular: true,
  },
  {
    id: "demo-tier-004",
    productId: "demo-prod-003",
    tierName: "Finance Pro",
    priceMonthlyCents: 9_700,
    features: ["Relatórios ilimitados", "Integração bancária", "Exportação PDF"],
    isPopular: true,
  },
];

export const DEMO_ORDERS: DemoOrder[] = [
  { id: "demo-order-001", vendorId: "demo-vendor-001", productId: "demo-prod-001", tierId: "demo-tier-002", buyerName: "Maria Silva", buyerEmail: "maria@exemplo.com", grossCents: 19_700, platformFeePct: 10, currency: "BRL", daysAgo: 0 },
  { id: "demo-order-002", vendorId: "demo-vendor-001", productId: "demo-prod-002", tierId: "demo-tier-003", buyerName: "João Pereira", buyerEmail: "joao@exemplo.com", grossCents: 14_900, platformFeePct: 10, currency: "BRL", daysAgo: 0 },
  { id: "demo-order-003", vendorId: "demo-vendor-002", productId: "demo-prod-003", tierId: "demo-tier-004", buyerName: "Ana Lima", buyerEmail: "ana@exemplo.com", grossCents: 9_700, platformFeePct: 10, currency: "BRL", daysAgo: 0 },
  { id: "demo-order-004", vendorId: "demo-vendor-001", productId: "demo-prod-001", tierId: "demo-tier-002", buyerName: "Carlos Mendes", buyerEmail: "carlos@exemplo.com", grossCents: 19_700, platformFeePct: 10, currency: "BRL", daysAgo: 1 },
  { id: "demo-order-005", vendorId: "demo-vendor-002", productId: "demo-prod-004", tierId: "demo-tier-004", buyerName: "Beatriz Ferreira", buyerEmail: "beatriz@exemplo.com", grossCents: 4_900, platformFeePct: 10, currency: "BRL", daysAgo: 2 },
];

/** Gera 20 orders distribuídos nos últimos 90 dias */
export function generateDemoOrders(count = 20): DemoOrder[] {
  const results: DemoOrder[] = [...DEMO_ORDERS];
  const tiers = DEMO_TIERS;
  for (let i = results.length; i < count; i++) {
    const tier = tiers[i % tiers.length];
    const product = DEMO_PRODUCTS.find(p => p.id === tier.productId)!;
    results.push({
      id: `demo-order-${String(i + 1).padStart(3, "0")}`,
      vendorId: product.vendorId,
      productId: product.id,
      tierId: tier.id,
      buyerName: `Comprador ${i + 1}`,
      buyerEmail: `buyer${i + 1}@demo.com`,
      grossCents: tier.priceMonthlyCents,
      platformFeePct: 10,
      currency: "BRL",
      daysAgo: Math.floor(Math.random() * 90),
    });
  }
  return results;
}

export const DEMO_AFFILIATES: DemoAffiliate[] = [
  {
    id: "demo-aff-001",
    vendorId: "demo-vendor-001",
    productId: "demo-prod-001",
    code: "MARINA2024",
    affiliateName: "Marina Costa",
    commissionPct: 30,
    totalSales: 28,
    totalCommissionCents: 165_480,
  },
  {
    id: "demo-aff-002",
    vendorId: "demo-vendor-001",
    productId: "demo-prod-002",
    code: "JOAOPRO",
    affiliateName: "João Carvalho",
    commissionPct: 25,
    totalSales: 14,
    totalCommissionCents: 52_150,
  },
];

export const DEMO_CERTIFICATES: DemoCertificate[] = [
  { id: "demo-cert-001", code: "CERT-1A2B-3C4D-5E6F", buyerName: "Maria Silva", productName: "IA Marketing Suite", vendorName: "TechCo Demo", isValid: true, daysAgo: 5 },
  { id: "demo-cert-002", code: "CERT-7G8H-9I0J-KLMN", buyerName: "João Pereira", productName: "AutomaPro CRM", vendorName: "TechCo Demo", isValid: true, daysAgo: 12 },
];

export const DEMO_RECENT_SALES: DemoRecentSale[] = [
  { buyerInitial: "M", buyerName: "Maria S.", productName: "IA Marketing Suite", amountCents: 19_700, minutesAgo: 2 },
  { buyerInitial: "J", buyerName: "João P.", productName: "AutomaPro CRM", amountCents: 14_900, minutesAgo: 15 },
  { buyerInitial: "A", buyerName: "Ana L.", productName: "FinanceOS Dashboard", amountCents: 9_700, minutesAgo: 31 },
  { buyerInitial: "C", buyerName: "Carlos M.", productName: "IA Marketing Suite", amountCents: 19_700, minutesAgo: 60 },
  { buyerInitial: "B", buyerName: "Beatriz F.", productName: "DevOps Toolkit", amountCents: 4_900, minutesAgo: 120 },
];

// ─── Aggregados calculados ────────────────────────────────────────────────────

/** MRR total da plataforma (soma de todos os vendors) */
export const DEMO_PLATFORM_MRR = DEMO_VENDORS.reduce((s, v) => s + v.mrr, 0);

/** GMV total da plataforma */
export const DEMO_PLATFORM_GMV = DEMO_VENDORS.reduce((s, v) => s + v.totalRevenue, 0);

/** Formata centavos para BRL */
export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

/** Calcula net após fee */
export function calcNet(grossCents: number, feePct: number): number {
  return Math.round(grossCents * (1 - feePct / 100));
}

/** Calcula plataforma fee */
export function calcPlatformFee(grossCents: number, feePct: number): number {
  return Math.round(grossCents * feePct / 100);
}
