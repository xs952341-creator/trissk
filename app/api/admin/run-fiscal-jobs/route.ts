import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runFiscalJobs } from "@/lib/jobs/fiscal";

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

  // Chama a lógica interna de emissão fiscal sem expor segredo
  try {
    return runFiscalJobs();
  } catch (error) {
    console.error("Admin fiscal jobs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
