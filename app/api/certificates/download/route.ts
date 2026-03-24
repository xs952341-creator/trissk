// app/api/certificates/download/route.ts
// Gera e faz download do PDF do certificado de conclusão.

import { NextRequest, NextResponse } from "next/server";
import type { ApiError } from "@/lib/types/api";
import PDFDocument from "pdfkit";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getIP } from "@/lib/rate-limit";
import { failure } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local types
interface CertificateRow {
  code: string;
  buyer_name: string;
  product_name: string;
  vendor_name: string;
  issued_at?: string | null;
  is_valid: boolean;
}

export async function GET(req: NextRequest) {
  const rl = await rateLimit(`cert-dl:${getIP(req)}`, 10, 3_600_000);
  if (!rl.success) {
    return failure("RATE_LIMIT", 429, "Limite atingido. Aguarde.");
  }

  const code = (req.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json<ApiError>({ success: false, error: "Código obrigatório.", code: "MISSING_FIELD" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: certRaw } = await admin
    .from("certificates")
    .select("code, buyer_name, product_name, vendor_name, issued_at, is_valid")
    .eq("code", code)
    .maybeSingle();

  const cert = certRaw as unknown as CertificateRow | null;

  if (!cert) return NextResponse.json<ApiError>({ success: false, error: "Certificado não encontrado.", code: "CERTIFICATE_NOT_FOUND" }, { status: 404 });
  if (!cert.is_valid) return NextResponse.json<ApiError>({ success: false, error: "Certificado revogado.", code: "CERTIFICATE_REVOKED" }, { status: 403 });

  // ── Geração do PDF ──────────────────────────────────────────────────────────
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 60 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (c: Buffer) => chunks.push(new Uint8Array(c)));
  const done = new Promise<Uint8Array>((res) =>
    doc.on("end", () => {
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      res(out);
    })
  );

  const W = doc.page.width;
  const H = doc.page.height;
  const issued = new Date(cert.issued_at ?? "").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // Background
  doc.rect(0, 0, W, H).fill("#0d1117");

  // Border outer
  doc.rect(20, 20, W - 40, H - 40).lineWidth(3).stroke("#22d4a0");
  // Border inner
  doc.rect(30, 30, W - 60, H - 60).lineWidth(1).stroke("rgba(34,212,160,0.2)");

  // Header
  doc.fillColor("#22d4a0").font("Helvetica-Bold").fontSize(11)
    .text("PLAYBOOK HUB", 0, 58, { align: "center", width: W });

  doc.fillColor("#f0f4f8").font("Helvetica-Bold").fontSize(34)
    .text("Certificado de Conclusão", 0, 85, { align: "center", width: W });

  // Divider
  doc.moveTo(W / 2 - 100, 138).lineTo(W / 2 + 100, 138).lineWidth(1).stroke("#22d4a0");

  // Body
  doc.fillColor("#8fa3b8").font("Helvetica").fontSize(13)
    .text("Certificamos que", 0, 158, { align: "center", width: W });

  doc.fillColor("#f0f4f8").font("Helvetica-Bold").fontSize(28)
    .text(cert.buyer_name, 0, 182, { align: "center", width: W });

  doc.moveTo(W / 2 - 160, 222).lineTo(W / 2 + 160, 222).lineWidth(0.5).stroke("#4e6275");

  doc.fillColor("#8fa3b8").font("Helvetica").fontSize(13)
    .text("concluiu com êxito", 0, 238, { align: "center", width: W });

  doc.fillColor("#22d4a0").font("Helvetica-Bold").fontSize(22)
    .text(cert.product_name, 0, 262, { align: "center", width: W });

  doc.fillColor("#8fa3b8").font("Helvetica").fontSize(12)
    .text(`ofertado por ${cert.vendor_name}`, 0, 300, { align: "center", width: W });

  // Footer
  doc.fillColor("#4e6275").font("Helvetica").fontSize(11)
    .text(`Emitido em ${issued}`, 0, 355, { align: "center", width: W });

  doc.fillColor("#2d3f4f").font("Helvetica").fontSize(9)
    .text(`Código de Validação: ${cert.code}  ·  playbook-hub.com/certificado?code=${cert.code}`,
      0, 373, { align: "center", width: W });

  doc.end();
  const pdf = await done;

  const safeName = cert.product_name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado_${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
