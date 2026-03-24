import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
  
    const body = await req.json().catch(() => ({}));
    const { priceId, productTierId, type, customAmount } = body ?? {};
  
    if (!priceId || !productTierId) {
      return NextResponse.json({ error: "priceId e productTierId são obrigatórios" }, { status: 400 });
    }
  
    const origin = req.nextUrl.origin;
    if (!user?.id) {
      const next = encodeURIComponent(`/produtos?tier=${productTierId}&price=${priceId}`);
      return NextResponse.json({ checkoutUrl: `${origin}/login?next=${next}` });
    }
  
    // Proxy seguro para o endpoint de checkout principal.
    // Mantém o embed simples e sem duplicar regras de split/afiliado/fraude.
    const res = await fetch(`${origin}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId,
        userId: user.id,
        productTierId,
        type: type ?? "subscription",
        customAmount: customAmount ?? null,
      }),
    });
  
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: j.error ?? "Erro ao criar checkout" }, { status: res.status });
    }
    return NextResponse.json({ checkoutUrl: j.checkoutUrl, sessionId: j.sessionId });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
