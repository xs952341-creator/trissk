// lib/env-server.ts
// 🔐 Variáveis server-only (NUNCA importe em "use client").
// Fonte única de verdade para todas as chaves de API do servidor.
// Para adicionar nova variável: adicione aqui e importe nos módulos que usam.

function getServerEnv(name: string, required = true): string | undefined {
  const value = process.env[name];
  if (!value && required) {
    // Build-time: don't throw (no env vars available during static generation)
    if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
    if (process.env.NODE_ENV === "test") return undefined;
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value || undefined;
}

// ══════════════════════════════════════════════════════════════════════════════
// 🔴 OBRIGATÓRIAS — app não inicia sem estas
// ══════════════════════════════════════════════════════════════════════════════

/** Chave secreta do Stripe. Ex: sk_live_xxxx */
export const STRIPE_SECRET_KEY = getServerEnv("STRIPE_SECRET_KEY")!;

/** Segredo para validar assinaturas de webhook Stripe. Ex: whsec_xxxx */
export const STRIPE_WEBHOOK_SECRET = getServerEnv("STRIPE_WEBHOOK_SECRET")!;

/** Service Role Key do Supabase (acesso admin ao DB). */
export const SUPABASE_SERVICE_ROLE_KEY = getServerEnv("SUPABASE_SERVICE_ROLE_KEY")!;

// ══════════════════════════════════════════════════════════════════════════════
// 🟡 OPCIONAIS — features degradam silenciosamente sem estas
// ══════════════════════════════════════════════════════════════════════════════

// ── CRON ──────────────────────────────────────────────────────────────────────
/** Bearer token para autenticar chamadas de cron. Vercel Cron usa automaticamente. */
export const CRON_SECRET = getServerEnv("CRON_SECRET", false);

/**
 * Verifica se uma requisição cron está autenticada
 * @param authHeader Header Authorization da requisição
 * @returns true se autenticado, false caso contrário
 */
export function verifyCronAuth(authHeader: string | null): boolean {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET não configurado');
    return false;
  }
  
  return authHeader === `Bearer ${CRON_SECRET}`;
}

// ── EMAIL (Resend) ────────────────────────────────────────────────────────────
/** API key do Resend para envio de emails transacionais. */
export const RESEND_API_KEY = getServerEnv("RESEND_API_KEY", false);
/** Endereço "from" dos emails. Default: onboarding@resend.dev (apenas Resend sandbox). */
export const RESEND_FROM_EMAIL =
  getServerEnv("RESEND_FROM_EMAIL", false) || "onboarding@resend.dev";

// ── NOTA FISCAL (eNotas) ──────────────────────────────────────────────────────
/** API Key da plataforma no eNotas para emissão de NF-e. */
export const ENOTAS_API_KEY_PLATFORM = getServerEnv("ENOTAS_API_KEY_PLATFORM", false);
/** ID da empresa cadastrada no eNotas. */
export const ENOTAS_COMPANY_ID_PLATFORM = getServerEnv("ENOTAS_COMPANY_ID_PLATFORM", false);

// ── PUSH NOTIFICATIONS (VAPID) ────────────────────────────────────────────────
/** Chave privada VAPID para push notifications PWA. Gere com: npx web-push generate-vapid-keys */
export const VAPID_PRIVATE_KEY = getServerEnv("VAPID_PRIVATE_KEY", false);
/** Identificador VAPID. Ex: mailto:suporte@seudominio.com */
export const VAPID_SUBJECT     = getServerEnv("VAPID_SUBJECT", false);

// ── SMS / WHATSAPP (Twilio) ───────────────────────────────────────────────────
// Sem estas variáveis, SMS e WhatsApp são ignorados silenciosamente.
// Não há erro em produção — apenas log de "Twilio não configurado".
/** Account SID do Twilio. Ex: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx */
export const TWILIO_ACCOUNT_SID   = getServerEnv("TWILIO_ACCOUNT_SID",   false);
/** Auth Token do Twilio. */
export const TWILIO_AUTH_TOKEN    = getServerEnv("TWILIO_AUTH_TOKEN",    false);
/** Número remetente SMS com código de país. Ex: +5511999999999 */
export const TWILIO_FROM_NUMBER   = getServerEnv("TWILIO_FROM_NUMBER",   false);
/** Número remetente WhatsApp Business. Ex: whatsapp:+14155238886 (sandbox) */
export const TWILIO_WHATSAPP_FROM = getServerEnv("TWILIO_WHATSAPP_FROM", false);

// ── INNGEST (Fila de Eventos) ─────────────────────────────────────────────────
// Se não configurado, o sistema usa a fila DB nativa (job_queue).
// Com estas variáveis, os eventos são roteados para o Inngest Cloud.
/** Event Key do Inngest. Ex: evt_xxxxxxxxxxxxxx */
export const INNGEST_EVENT_KEY   = getServerEnv("INNGEST_EVENT_KEY",   false);
/** Signing Key do Inngest para validar webhooks. Ex: signkey_xxxxxxxxxxxxxx */
export const INNGEST_SIGNING_KEY = getServerEnv("INNGEST_SIGNING_KEY", false);

// ── REDIS QUEUE (Upstash REST) ──────────────────────────────────────────────
// Opcional. Se configurado, eventos podem ser enfileirados em Redis.
export const UPSTASH_REDIS_REST_URL   = getServerEnv("UPSTASH_REDIS_REST_URL", false);
export const UPSTASH_REDIS_REST_TOKEN = getServerEnv("UPSTASH_REDIS_REST_TOKEN", false);

// ── TAXA DE CÂMBIO ────────────────────────────────────────────────────────────
// Sem esta variável, usa AwesomeAPI (gratuita, específica para BRL) como fallback.
/** API Key do ExchangeRate-API (v6). https://app.exchangerate-api.com */
export const EXCHANGE_RATE_API_KEY = getServerEnv("EXCHANGE_RATE_API_KEY", false);

// ── VERCEL API (White-Label Domains) ─────────────────────────────────────────
/** Bearer token da API da Vercel para provisionar domínios personalizados. */
export const VERCEL_API_TOKEN  = getServerEnv("VERCEL_API_TOKEN",  false);
/** ID do projecto na Vercel. Ex: prj_xxxxxxxxxxxx */
export const VERCEL_PROJECT_ID = getServerEnv("VERCEL_PROJECT_ID", false);

// ── OPENAI (IA Generativa) ────────────────────────────────────────────────────
/** API Key da OpenAI para geração de conteúdo e emails de reengajamento. */
export const OPENAI_API_KEY = getServerEnv("OPENAI_API_KEY", false);

// ── CLICKSIGN (Contratos Digitais) ───────────────────────────────────────────
/** Access Token da Clicksign para assinatura de contratos. */
export const CLICKSIGN_ACCESS_TOKEN = getServerEnv("CLICKSIGN_ACCESS_TOKEN", false);
