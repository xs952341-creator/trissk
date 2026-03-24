// app/dashboard/page.tsx
// Canonical post-login landing route.
// Redirects users to the correct dashboard based on their role.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardRouter() {
  const supabase = createClient();

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login?next=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  const role = profile?.role ?? "buyer";

  // Map roles to their home routes (note: route groups do not appear in URL)
  switch (role) {
    case "admin":
      redirect("/admin");
    case "vendor":
      redirect("/vendor");
    case "affiliate":
      redirect("/affiliate");
    case "buyer":
    default:
      redirect("/buyer");
  }
}
