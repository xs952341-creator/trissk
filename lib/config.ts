// lib/config.ts
// ✅ Constantes de negócio centralizadas.
// Para alterar qualquer regra da plataforma, mude aqui — reflete em todo o projeto.

// ============================
// 💰 PLATAFORMA
// ============================

/** Taxa padrão da plataforma em % (15 = 15%). Pode ser sobrescrita por vendor em profiles.custom_platform_fee_pct */
export const DEFAULT_PLATFORM_FEE_PCT = 15;

/** Dia do mês para emissão de notas fiscais (D+8 após pagamento) */
export const FISCAL_EMIT_DELAY_DAYS = 8;

// ============================
// 🍪 AFILIADOS
// ============================

/** Duração do cookie de afiliado em segundos (60 dias) */
export const AFFILIATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

/** Nome do cookie de afiliado */
export const AFFILIATE_COOKIE_NAME = "playbook_affiliate_id";

// ============================
// 🍪 UTM TRACKING
// ============================

/** Duração dos cookies UTM em segundos (7 dias) */
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Prefixo dos cookies UTM */
export const UTM_COOKIE_PREFIX = "ph_utm_";

// ============================
// 🧾 eNOTAS / NF-e
// ============================

/** Base URL da API eNotas */
export const ENOTAS_BASE_URL = "https://app.enotas.com.br/api";

/** Código de serviço padrão — "Licenciamento de Software" (LC 116/2003 item 1.07) */
export const ENOTAS_CODIGO_SERVICO = "01.07";

/** Discriminação padrão do serviço nas NFs emitidas pela plataforma */
export const ENOTAS_DESCRICAO_SERVICO =
  "Licenciamento de uso de software. Intermediação tecnológica.";

/** Timeout em ms para chamadas à API eNotas */
export const ENOTAS_API_TIMEOUT_MS = 15_000;

// ============================
// 🗄️ STORAGE
// ============================

/** Nome do bucket de assets de produtos no Supabase Storage */
export const STORAGE_BUCKET = "product-assets";

// ============================
// 🛡️ ROLES
// ============================
export type UserRole = "buyer" | "vendor" | "affiliate" | "admin";

export const ALL_ROLES: UserRole[] = ["buyer", "vendor", "affiliate", "admin"];
