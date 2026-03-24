import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runReconcile } from "@/lib/jobs/reconcile";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Chama a lógica interna de reconciliação sem expor segredo
  try {
    return runReconcile();
  } catch (error) {
    console.error("Admin reconcile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
