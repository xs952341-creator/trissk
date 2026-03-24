// lib/api/parse.ts
// Único helper para parsear e validar payload de request.
// Centraliza tratamento de JSON inválido e erros de schema Zod.

import type { ZodSchema } from "zod";

export type ParseOk<T>  = { success: true;  data: T };
export type ParseFail   = { success: false; message: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

/**
 * Lê o body JSON da request e valida contra o schema fornecido.
 * Nunca lança exceção — erros retornam { success: false }.
 */
export async function parseRequestBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      const field = first?.path?.join(".") ?? "payload";
      const msg   = first?.message ?? "Payload inválido.";
      return { success: false, message: `${field}: ${msg}` };
    }
    return { success: true, data: parsed.data };
  } catch {
    return { success: false, message: "Body JSON inválido ou ausente." };
  }
}
