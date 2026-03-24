import { getServerEnvOptional } from "@/lib/server-env";

// Optional signature providers
export const CLICKSIGN_ACCESS_TOKEN = getServerEnvOptional("CLICKSIGN_ACCESS_TOKEN");
export const CLICKSIGN_BASE_URL = getServerEnvOptional("CLICKSIGN_BASE_URL") || "https://sandbox.clicksign.com";
