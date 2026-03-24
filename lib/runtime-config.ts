import { NEXT_PUBLIC_APP_URL } from "@/lib/env";

export const NEXT_PUBLIC_GA4_ID = process.env.NEXT_PUBLIC_GA4_ID;

export function getPublicAppUrl() {
  if (NEXT_PUBLIC_APP_URL) return NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function getPublicAppDomain() {
  return getPublicAppUrl().replace(/^https?:\/\//, "");
}
