// app/api/og/route.tsx — Open Graph image generator dinâmico
// Gera imagens OG customizadas para produtos, perfis e páginas
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title   = searchParams.get("title")   || "Playbook Hub";
  const desc    = searchParams.get("desc")    || "Marketplace de SaaS e Ferramentas de IA";
  const price   = searchParams.get("price")   || "";
  const vendor  = searchParams.get("vendor")  || "";
  const type    = searchParams.get("type")    || "default"; // "product" | "default"

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "#09090b",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div style={{
          position: "absolute",
          top: "-100px",
          left: "100px",
          width: "600px",
          height: "500px",
          background: "radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute",
          bottom: "-150px",
          right: "-50px",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />

        {/* Grid lines */}
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", padding: "60px 72px", height: "100%", position: "relative" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "auto" }}>
            <div style={{
              width: "40px", height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #34d399, #10b981)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: "20px", height: "20px", color: "#09090b", fontSize: "16px", fontWeight: "900" }}>⚡</div>
            </div>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#f4f4f5", letterSpacing: "-0.03em" }}>
              Playbook<span style={{ color: "#34d399" }}>Hub</span>
            </div>
          </div>

          {/* Main content */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {type === "product" && vendor && (
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.2)",
                borderRadius: "100px",
                padding: "6px 14px",
                width: "fit-content",
              }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#34d399" }} />
                <span style={{ color: "#34d399", fontSize: "13px", fontWeight: "600" }}>por {vendor}</span>
              </div>
            )}

            <h1 style={{
              fontSize: title.length > 40 ? "52px" : "64px",
              fontWeight: "900",
              color: "#f4f4f5",
              lineHeight: "1",
              letterSpacing: "-0.04em",
              margin: 0,
              maxWidth: "900px",
            }}>
              {title}
            </h1>

            {desc && (
              <p style={{
                fontSize: "24px",
                color: "#71717a",
                margin: 0,
                maxWidth: "700px",
                lineHeight: "1.4",
              }}>
                {desc.length > 100 ? desc.slice(0, 100) + "..." : desc}
              </p>
            )}

            {price && (
              <div style={{
                display: "flex", alignItems: "center", gap: "12px", marginTop: "8px",
              }}>
                <span style={{
                  fontSize: "36px",
                  fontWeight: "900",
                  color: "#f4f4f5",
                  letterSpacing: "-0.03em",
                }}>{price}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: "40px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              {["Checkout PIX nativo", "Afiliados multi-level", "Analytics avançado"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399" }} />
                  <span style={{ color: "#52525b", fontSize: "13px" }}>{f}</span>
                </div>
              ))}
            </div>
            <span style={{ color: "#3f3f46", fontSize: "13px" }}>{BRAND.domain}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
