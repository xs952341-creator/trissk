// app/api/admin/radar/route.ts
// CRUD de regras do Stripe Radar via API
// Admin pode criar/listar/deletar regras de fraude sem acessar o Dashboard do Stripe.

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { STRIPE_SECRET_KEY } from "@/lib/env-server";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// Stripe Radar types
interface RadarRule {
  id: string;
  predicate: string;
  action: string;
  enabled: boolean;
}

interface RadarListResponse {
  data: RadarRule[];
}

async function isAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}

// GET /api/admin/radar — lista regras
export async function GET(req: NextRequest) {
  const supabase = createClient();
  if (!(await isAdmin(supabase))) return failure("UNAUTHORIZED", 403, "Acesso negado.");

  try {
    const radar = stripe.radar as unknown as { rules: { list: (opts: { limit: number }) => Promise<RadarListResponse> } };
    const rules = await radar.rules.list({ limit: 50 });
    return success({ rules: rules.data ?? [] });
  } catch (e: unknown) {
    const err = e as { code?: string; statusCode?: number };
    if (err.code === "radar_not_supported" || err.statusCode === 400) {
      return success({
        rules: [],
        warning: "O Stripe Radar requer plano Stripe com Radar habilitado.",
      });
    }
    console.error("[radar] list:", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro ao listar regras."));
  }
}

// POST /api/admin/radar — cria regra
export async function POST(req: NextRequest) {
  const supabase = createClient();
  if (!(await isAdmin(supabase))) return failure("UNAUTHORIZED", 403, "Acesso negado.");

  const { predicate } = await req.json();
  if (!predicate) return failure("MISSING_PREDICATE", 400, "predicate é obrigatório.");

  try {
    const radar = stripe.radar as unknown as { rules: { create: (opts: { predicate: string }) => Promise<RadarRule> } };
    const rule = await radar.rules.create({ predicate });
    return success({ rule });
  } catch (e: unknown) {
    console.error("[radar] create:", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro ao criar regra."));
  }
}

// DELETE /api/admin/radar?id=rule_xxx — deleta regra
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  if (!(await isAdmin(supabase))) return failure("UNAUTHORIZED", 403, "Acesso negado.");

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return failure("MISSING_ID", 400, "id é obrigatório.");

  try {
    const radar = stripe.radar as unknown as { rules: { del: (id: string) => Promise<void> } };
    await radar.rules.del(id);
    return success({ deleted: true });
  } catch (e: unknown) {
    console.error("[radar] delete:", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro ao deletar regra."));
  }
}
