import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-static";

export function GET() {
  try {
    const spec = readFileSync(join(process.cwd(), "public/api-docs/openapi.json"), "utf-8");
    return new NextResponse(spec, {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "OpenAPI spec not found" }, { status: 404 });
  }
}
