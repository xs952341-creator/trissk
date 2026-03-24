// app/api/vendor/white-label/route.ts
// Gerencia domínios personalizados (white-label) para vendors.
// O vendor registra seu domínio → sistema gera TXT record para verificação DNS
// → quando DNS propagado, marca como verified → middleware redireciona o domínio.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// GET: lista domínios do vendor
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const adminSupabase = createAdminClient();
  const { data: domains } = await adminSupabase
    .from("vendor_custom_domains")
    .select("*")
    .eq("vendor_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ domains: domains ?? [] });
}

// POST: adicionar domínio
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`white-label:${getIP(req)}`, 5, 60_000);
  if (!rl.success) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { domain, productSlug } = await req.json();

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "domain é obrigatório" }, { status: 400 });
  }

  // Sanitize domain
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Validação básica
  if (!/^[a-z0-9][a-z0-9.-]{1,250}[a-z0-9]$/.test(cleanDomain)) {
    return NextResponse.json({ error: "Domínio inválido" }, { status: 400 });
  }

  // Verificar se domínio já está em uso
  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from("vendor_custom_domains")
    .select("id, vendor_id")
    .eq("domain", cleanDomain)
    .maybeSingle();

  if (existing && existing.vendor_id !== user.id) {
    return NextResponse.json({ error: "Este domínio já está em uso por outro vendor" }, { status: 409 });
  }
  if (existing && existing.vendor_id === user.id) {
    return NextResponse.json({ error: "Você já adicionou este domínio" }, { status: 409 });
  }

  // Gerar token de verificação DNS (TXT record)
  const verifyToken = `playbook-verify=${crypto.randomUUID().replace(/-/g, "")}`;

  const { data: newDomain, error } = await adminSupabase
    .from("vendor_custom_domains")
    .insert({
      vendor_id:    user.id,
      domain:       cleanDomain,
      product_slug: productSlug ?? null,
      verify_token: verifyToken,
      verified:     false,
    })
    .select()
    .single();

  if (error) {
    console.error("[white-label] insert:", getErrorMessage(error));
    return NextResponse.json({ error: "Erro ao salvar domínio" }, { status: 500 });
  }

  return NextResponse.json({
    domain:       newDomain,
    instructions: {
      type:  "TXT",
      name:  `_playbook-verify.${cleanDomain}`,
      value: verifyToken,
      ttl:   300,
      note:  "Adicione este TXT record no seu DNS. A verificação pode levar até 24h para propagar.",
    },
  });
}

// PUT: verificar DNS + marcar como verified
export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { domainId } = await req.json();
  if (!domainId) return NextResponse.json({ error: "domainId obrigatório" }, { status: 400 });

  const adminSupabase = createAdminClient();
  const { data: domainRecord } = await adminSupabase
    .from("vendor_custom_domains")
    .select("*")
    .eq("id", domainId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!domainRecord) return NextResponse.json({ error: "Domínio não encontrado" }, { status: 404 });
  if (domainRecord.verified) return NextResponse.json({ verified: true, message: "Domínio já verificado" });

  // Verificar TXT record via DNS lookup
  try {
    const dns = await import("dns/promises");
    const txtRecords = await dns.resolveTxt(`_playbook-verify.${domainRecord.domain}`);
    const flatRecords = txtRecords.flat();
    const tokenFound = flatRecords.some((r: string) => r === domainRecord.verify_token);

    if (tokenFound) {
      await adminSupabase
        .from("vendor_custom_domains")
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq("id", domainId);

      return NextResponse.json({ verified: true, message: "Domínio verificado com sucesso! O redirecionamento estará ativo em até 5 minutos." });
    } else {
      return NextResponse.json({
        verified: false,
        message:  "TXT record não encontrado. Verifique se o record foi adicionado corretamente e aguarde a propagação DNS (pode levar até 24h).",
        expected: domainRecord.verify_token,
      });
    }
  } catch (e: unknown) {
    return NextResponse.json({
      verified: false,
      message:  `Erro ao verificar DNS: ${getErrorMessage(e)}. Verifique se o domínio e TXT record estão corretos.`,
    });
  }
}

// DELETE: remover domínio
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("vendor_custom_domains")
    .delete()
    .eq("id", id)
    .eq("vendor_id", user.id);

  if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
