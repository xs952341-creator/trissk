// app/api/vendor/health-score/recalculate/route.ts
// Dispara o recálculo do Health Score preditivo para as assinaturas do vendor.
// POST /api/vendor/health-score/recalculate
//
// Chamado pelo botão "Atualizar" na página /vendor/health-score.
// Rate-limited: máximo 1 recálculo por vendor a cada 5 minutos.

import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { calculateHealthBatch } from "@/lib/analytics/health-score";
import { rateLimit, getIP }   from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 1 recálculo por vendor a cada 5 minutos
    const rl = await rateLimit(`health-recalc:${user.id}`, 1, 5 * 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Aguarde 5 minutos entre recálculos.", retryAfter: rl.resetAt },
        { status: 429 }
      );
    }

    // Verificar que o utilizador é vendor
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "vendor" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Apenas vendors podem recalcular." }, { status: 403 });
    }

    // Disparar cálculo
    const result = await calculateHealthBatch(user.id);

    return NextResponse.json({
      ok: true,
      total:    result.total,
      healthy:  result.healthy,
      at_risk:  result.at_risk,
      churning: result.churning,
      message:  `${result.total} assinaturas analisadas.`,
    });

  } catch (err: unknown) {
    console.error("[health-score/recalculate]", getErrorMessage(err));
    return NextResponse.json({ error: getErrorMessage(err, "Erro interno.") }, { status: 500 });
  }
}
