// app/api/reports/order/[id]/pdf/route.ts
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/errors";
import { success, failure } from "@/lib/api/responses";

// Local types
interface OrderRow {
  id: string;
  status: string;
  amount_gross?: number | null;
  created_at?: string | null;
  user_id: string;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabaseAuth = createClient();
    const { data: auth } = await supabaseAuth.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
    const supabase = createAdminClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id,status,amount_gross,created_at,user_id")
      .eq("id", params.id)
      .maybeSingle();
  
    if (error || !order) return failure("NOT_FOUND", 404, "Pedido não encontrado");

    const typedOrder = order as unknown as OrderRow;
    if (typedOrder.user_id !== auth.user.id) return failure("FORBIDDEN", 403, "Acesso negado");
  
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Buffer) => chunks.push(new Uint8Array(c)));
    const done = new Promise<Uint8Array>((resolve) =>
      doc.on("end", () => {
        const merged = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        resolve(merged);
      })
    );
  
    doc.fontSize(20).text("Relatório de Compra", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("gray").text("Gerado automaticamente.");
    doc.fillColor("black");
    doc.moveDown(1);
  
    doc.fontSize(12).text(`Pedido: ${typedOrder.id}`);
    doc.text(`Status: ${typedOrder.status}`);
    doc.text(`Valor: R$ ${Number(typedOrder.amount_gross ?? 0).toFixed(2)}`);
    doc.text(`Data: ${new Date(typedOrder.created_at ?? "").toLocaleString("pt-BR")}`);
  
    doc.moveDown(1);
    doc.fontSize(12).text("Assinatura Digital", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(
      "Para validade jurídica (ICP-Brasil), integre um serviço de assinatura digital (Clicksign/DocuSign). Este endpoint gera o PDF pronto para assinatura.",
      { width: 500 }
    );
  
    doc.end();
    const pdf = await done;
  
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="order-${typedOrder.id}.pdf"`,
      },
    });
  } catch (e: unknown) {
    console.error("[api]", getErrorMessage(e));
    return failure("INTERNAL_ERROR", 500, getErrorMessage(e, "Erro interno."));
  }
}
