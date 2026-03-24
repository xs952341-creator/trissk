// app/api/exchange-rate/route.ts
// Taxa de câmbio real-time BRL → USD / EUR.
// Fonte de verdade: lib/exchange-rate.ts (lógica e cache centralizados).
// Cache HTTP: 1h para reduzir chamadas externas.

import { NextRequest, NextResponse } from "next/server";
import { getExchangeRates } from "@/lib/exchange-rate";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const rates = await getExchangeRates();
    return NextResponse.json(
      { rates, fetched_at: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
    );
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
