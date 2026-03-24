import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const updates = await req.json();
    const admin = createAdminClient();
    const { data, error } = await admin.from("email_sequences")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("vendor_id", user.id)
      .select().single();

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ sequence: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supa = createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { error } = await admin.from("email_sequences")
      .delete().eq("id", params.id).eq("vendor_id", user.id);

    if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e, "Internal Server Error") }, { status: 500 });
  }
}
