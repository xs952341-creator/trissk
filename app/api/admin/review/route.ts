// app/api/admin/review/route.ts
// API de aprovação/rejeição de produtos com notificação ao vendor por email.

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailProductApproved, emailProductRejected } from "@/lib/email";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { log } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createAdminClient();

// Local types
interface ProfileInfo {
  email?: string;
  full_name?: string;
}

interface ProductWithProfile {
  id: string;
  name: string;
  vendor_id: string;
  slug: string | null;
  profiles?: ProfileInfo | ProfileInfo[] | null;
}

async function isAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { admin: false, userId: null };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { admin: data?.role === "admin", userId: user.id };
}

// POST /api/admin/review — aprovar ou rejeitar produto
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { admin, userId } = await isAdmin(supabase);
  if (!admin) return failure("UNAUTHORIZED", 403, "Acesso negado.");

  const { productId, action, reason, feedback, checklist } = await req.json();

  if (!productId || !action) {
    return failure("MISSING_PARAMS", 400, "productId e action são obrigatórios.");
  }
  if (!["approve", "reject"].includes(action)) {
    return failure("INVALID_ACTION", 400, "action deve ser 'approve' ou 'reject'.");
  }

  // Buscar produto + vendor
  const { data: product, error: prodErr } = await supabaseAdmin
    .from("saas_products")
    .select("id, name, vendor_id, slug, profiles!vendor_id(email, full_name)")
    .eq("id", productId)
    .single();

  if (prodErr || !product) {
    return failure("PRODUCT_NOT_FOUND", 404, "Produto não encontrado.");
  }

  const typedProduct = product as ProductWithProfile;
  const rawProfiles = typedProduct.profiles;
  const vendor: ProfileInfo | null = Array.isArray(rawProfiles) ? rawProfiles[0] : rawProfiles ?? null;
  const appUrl = NEXT_PUBLIC_APP_URL || "";

  // Atualizar produto
  const updateData = {
    approval_status: action === "approve" ? "APPROVED" as const : "REJECTED" as const,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_feedback: feedback ?? null,
    review_checklist: checklist ?? {},
    ...(action === "approve" ? {
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    } : {
      rejection_reason: reason ?? null,
    }),
  };

  const { error: updateErr } = await supabaseAdmin
    .from("saas_products")
    .update(updateData)
    .eq("id", productId);

  if (updateErr) {
    return failure("UPDATE_FAILED", 500, updateErr.message);
  }

  // Notificação no painel do vendor
  await supabaseAdmin.from("notifications").insert({
    user_id: typedProduct.vendor_id,
    type: action === "approve" ? "product_approved" : "product_rejected",
    title: action === "approve" ? "✅ Produto aprovado!" : "❌ Produto requer ajustes",
    body: action === "approve"
      ? `"${typedProduct.name}" foi aprovado e está no marketplace!`
      : `"${typedProduct.name}" foi rejeitado: ${reason ?? "Veja o feedback completo por email."}`,
    action_url: action === "approve"
      ? `/produtos/${typedProduct.slug ?? productId}`
      : `/vendor/produtos`,
  });

  // Email ao vendor
  if (vendor?.email) {
    try {
      if (action === "approve") {
        const tpl = emailProductApproved({
          vendorName: vendor.full_name ?? undefined,
          productName: typedProduct.name,
          feedback: feedback ?? undefined,
          dashUrl: `${appUrl}/vendor/produtos`,
        });
        await sendEmail({ to: vendor.email, ...tpl });
      } else {
        const tpl = emailProductRejected({
          vendorName: vendor.full_name ?? undefined,
          productName: typedProduct.name,
          reason: reason ?? undefined,
          feedback: feedback ?? undefined,
          editUrl: `${appUrl}/vendor/produtos`,
        });
        await sendEmail({ to: vendor.email, ...tpl });
      }
    } catch (e: unknown) {
      void log.warn("admin/review", "email.failed", getErrorMessage(e), { productId, vendorId: typedProduct.vendor_id });
    }
  }

  void log.info("admin/review", `product.${action}d`, `Produto ${typedProduct.name} ${action === "approve" ? "aprovado" : "rejeitado"}`, {
    productId, vendorId: typedProduct.vendor_id, reviewedBy: userId, reason, hasFeedback: !!feedback,
  });

  return success({ status: updateData.approval_status });
}
