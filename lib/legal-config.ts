import { APP_NAME } from "@/lib/app-version";

export const legalConfig = {
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? APP_NAME,
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? `${APP_NAME} Tecnologia Ltda.`,
  cnpj: process.env.NEXT_PUBLIC_COMPANY_CNPJ ?? "",
  legalEmail: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? "",
  dpoEmail: process.env.NEXT_PUBLIC_DPO_EMAIL ?? process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
  headquarters: process.env.NEXT_PUBLIC_COMPANY_HEADQUARTERS ?? "São Paulo, SP",
  forum: process.env.NEXT_PUBLIC_COMPANY_FORUM ?? "Comarca de São Paulo, SP",
} as const;

export function isLegalConfigReady(): boolean {
  return Boolean(legalConfig.cnpj && legalConfig.legalEmail && legalConfig.privacyEmail);
}
