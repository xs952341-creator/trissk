// app/api/vendor/analytics/churn/route.ts
// Retorna análise de Churn, LTV, MRR, ARR, Cohort Retention para o vendor.
// GET /api/vendor/analytics/churn?months=12&product_id=uuid

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVendorChurnAnalysis } from "@/lib/analytics/churn-ltv";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url       = new URL(req.url);
    const months    = Math.min(24, Math.max(1, Number(url.searchParams.get("months") ?? 12)));
    const productId = url.searchParams.get("product_id") ?? undefined;

    const analysis = await getVendorChurnAnalysis(user.id, months, productId);

    return NextResponse.json(analysis);
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
