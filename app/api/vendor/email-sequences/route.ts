import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";

// Local types
interface EmailSequenceStep {
  id?: string;
  delay_days?: number;
  subject?: string;
  preview_text?: string | null;
  sent_count?: number;
}

interface EmailSequence {
  id: string;
  name: string;
  type: string;
  product_id?: string | null;
  is_active: boolean;
  created_at: string;
  email_sequence_steps?: EmailSequenceStep[] | null;
}

export async function GET() {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

    const admin = createAdminClient();
    const { data: sequences } = await admin
      .from("email_sequences")
      .select(`id, name, type, product_id, is_active, created_at,
        email_sequence_steps(id, delay_days, subject, preview_text, sent_count)`)
      .eq("vendor_id", user.id)
      .order("created_at", { ascending: false });

    // Stats
    const seqs = (sequences ?? []) as unknown as EmailSequence[];
    const active = seqs.filter((s) => s.is_active).length;
    const totalSent = seqs
      .flatMap((s) => (s.email_sequence_steps ?? []) as EmailSequenceStep[])
      .reduce((sum: number, st) => sum + (st.sent_count ?? 0), 0);

    return success({
      sequences: seqs.map((s) => ({
        ...s,
        steps: s.email_sequence_steps ?? [],
        total_subscribers: 0,
        open_rate: 0,
        click_rate: 0,
      })),
      stats: {
        total_sequences: seqs.length,
        active_sequences: active,
        total_sent: totalSent,
        avg_open_rate: 0,
      },
    });
  } catch (e: unknown) {
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}

export async function POST(req: NextRequest) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return failure("UNAUTHORIZED", 401, "Acesso negado");

    const { name, type, product_id } = await req.json() as { name: string; type: string; product_id?: string };
    if (!name || !type) return failure("MISSING_FIELDS", 400, "name e type obrigatórios");

    const admin = createAdminClient();
    const { data, error } = await admin.from("email_sequences").insert({
      vendor_id: user.id,
      name, type,
      product_id: product_id ?? null,
      is_active: false,
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) return failure("INSERT_ERROR", 500, getErrorMessage(error));
    return success({ sequence: data });
  } catch (e: unknown) {
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
