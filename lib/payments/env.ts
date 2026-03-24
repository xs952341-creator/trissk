import { getServerEnvOptional } from "@/lib/server-env";

export const PAYMENTS_PROVIDER = getServerEnvOptional("PAYMENTS_PROVIDER") || "stripe"; // stripe | pagarme | efi

export const PAGARME_API_KEY = getServerEnvOptional("PAGARME_API_KEY");
export const PAGARME_ENCRYPTION_KEY = getServerEnvOptional("PAGARME_ENCRYPTION_KEY");

export const EFI_CLIENT_ID = getServerEnvOptional("EFI_CLIENT_ID");
export const EFI_CLIENT_SECRET = getServerEnvOptional("EFI_CLIENT_SECRET");
