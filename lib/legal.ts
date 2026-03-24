import { legalConfig, isLegalConfigReady } from "@/lib/legal-config";

// lib/legal.ts
// ✅ CENTRAL DE CONFIGURAÇÃO JURÍDICA E LGPD
// ============================================================
// Mude APENAS aqui para atualizar termos, datas, percentuais,
// nomes jurídicos e políticas que aparecem em todo o sistema.
// ============================================================

export const LEGAL = {
  // ── Identificação da Empresa ─────────────────────────────
  EMPRESA: {
    NOME_FANTASIA:     legalConfig.companyName,
    RAZAO_SOCIAL:      legalConfig.legalName,
    CNPJ:              legalConfig.cnpj || "CONFIGURAR_CNPJ",
    SEDE:              legalConfig.headquarters,
    FORO:              legalConfig.forum,
    EMAIL_JURIDICO:    legalConfig.legalEmail || "configurar@empresa.com",
    EMAIL_PRIVACIDADE: legalConfig.privacyEmail || "configurar@empresa.com",
    SITE:              legalConfig.siteUrl || "https://seu-dominio.com",
  },

  // ── Datas ─────────────────────────────────────────────────
  DATAS: {
    TERMOS_VERSAO:            "1.2",
    TERMOS_ULTIMA_ATUALIZACAO: "Fevereiro de 2026",
    PRIVACIDADE_VERSAO:        "1.1",
    PRIVACIDADE_ULTIMA_ATUALIZACAO: "Fevereiro de 2026",
  },

  // ── Regras de Negócio ─────────────────────────────────────
  NEGOCIOS: {
    TAXA_PLATAFORMA_PCT:       15,        // % cobrado sobre cada venda
    DIAS_GARANTIA_REEMBOLSO:   7,         // Art. 49 CDC
    DIAS_COOKIE_AFILIADO:      60,        // duração do tracking de afiliado
    CHARGEBACK_LIMITE_PCT:     1,         // máximo aceitável antes de banimento
    DIAS_RETENCAO_FISCAL:      5 * 365,   // 5 anos (obrigação legal)
    DIAS_D_MAIS_REPASSE:       8,         // D+8 para emitir NF
    REPASSE_CICLO:             "D+30",    // ciclo de repasse ao vendor
  },

  // ── Dados Coletados (LGPD) ───────────────────────────────
  LGPD: {
    DADOS_COLETADOS: [
      "Nome completo",
      "Endereço de e-mail",
      "CPF/CNPJ (para emissão de nota fiscal)",
      "Dados de navegação e cookies (para prevenção de fraude e afiliados)",
      "Dados de pagamento (tokenizados pelo Stripe — nunca armazenados em nossos servidores)",
    ],
    BASES_LEGAIS: [
      "Execução de Contrato (Art. 7º, V — LGPD): para processar pagamentos e entregar o produto",
      "Legítimo Interesse (Art. 7º, IX — LGPD): para prevenção de fraude e segurança da plataforma",
      "Obrigação Legal (Art. 7º, II — LGPD): para retenção de documentos fiscais pelo prazo legal",
      "Consentimento (Art. 7º, I — LGPD): para envio de comunicações de marketing",
    ],
    PRAZO_EXCLUSAO:           "Até 72 horas úteis após solicitação formal",
    EXCECAO_EXCLUSAO:         "Dados com obrigação fiscal (5 anos conforme Lei 9.394/96 e regulamentação SEFAZ)",
    TRANSFERENCIA_INTERNACIONAL: [
      "Stripe Inc. (EUA) — processamento de pagamentos",
      "Amazon Web Services (EUA/BR) — infraestrutura de servidores",
      "Resend Inc. (EUA) — disparo de e-mails transacionais",
    ],
    CONTATO_DPO:              legalConfig.dpoEmail || legalConfig.privacyEmail || "configurar@empresa.com",
    CANAL_SOLICITACAO:        "/solicitar-dados",       // rota para página de solicitação
  },

  // ── Proibições (Afiliados e Vendors) ─────────────────────
  PROIBICOES: [
    "SPAM ou mensagens não solicitadas em qualquer canal",
    "Publicidade enganosa ou deceptiva sobre as funcionalidades do produto",
    "Brand Bidding — anunciar para termos de marca do produtor sem autorização",
    "Uso de bots, cliques artificiais ou tráfego inválido para inflar comissões",
    "Revenda de acesso não autorizada ou compartilhamento de credenciais",
    "Oferta de conteúdo ilícito, pornográfico, difamatório ou que viole direitos de terceiros",
  ],

  // ── Motivos de Banimento Imediato ─────────────────────────
  MOTIVOS_BANIMENTO: [
    `Índice de chargeback acima de 1% do volume mensal`,
    "Suspeita fundada de fraude, lavagem de dinheiro ou uso de cartões clonados",
    "Violação comprovada de direitos de propriedade intelectual",
    "Duas ou mais violações das regras de afiliados ou vendedores",
    "Fornecimento de dados fiscais falsos ou inválidos",
  ],

  // ── Cookies ───────────────────────────────────────────────
  COOKIES: {
    TIPOS: [
      { nome: "Sessão Supabase",  finalidade: "Manter o usuário autenticado",                 duracao: "Sessão do navegador" },
      { nome: "Afiliado (ref)",   finalidade: "Rastrear origem de cliques para comissões",     duracao: "60 dias" },
      { nome: "Preferências UI",  finalidade: "Lembrar configurações de interface",            duracao: "1 ano" },
    ],
    NAO_USA: "Não utilizamos cookies de rastreamento de terceiros para publicidade.",
  },
} as const;

// Helpers tipados para uso nos componentes
export type LegalConfig = typeof LEGAL;


if (process.env.NODE_ENV === "production" && !isLegalConfigReady()) {
  console.warn("[legal] Configuração institucional incompleta para produção.");
}
