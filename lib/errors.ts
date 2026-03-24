/**
 * lib/errors.ts
 * Helper central para extração segura de mensagens de erro — v46
 *
 * Uso:
 *   import { getErrorMessage } from "@/lib/errors";
 *
 *   } catch (e: unknown) {
 *     toast.error(getErrorMessage(e));
 *   }
 *
 * Resolve o problema de acessar `.message` diretamente em `unknown`,
 * que é incorreto com TypeScript strict mode.
 */

/**
 * Extrai a mensagem de um erro desconhecido de forma type-safe.
 * @param error - Qualquer valor capturado em um bloco catch
 * @param fallback - Mensagem padrão se o erro não tiver `.message`
 */
export function getErrorMessage(error: unknown, fallback = "Erro desconhecido"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    return (error as Record<string, unknown>).message as string;
  }
  return fallback;
}

/**
 * Versão para erros de banco Supabase (que têm `.message` tipado).
 * Pode ser usada quando o error já é `{ message: string } | null`.
 */
export function getSupabaseErrorMessage(
  error: { message: string } | null | undefined,
  fallback = "Erro no banco de dados"
): string {
  return getErrorMessage(error) ?? fallback;
}

/**
 * Wrapper para usar em catch blocks com console.error.
 * Retorna a mensagem E faz o log automaticamente.
 */
export function logAndGetError(
  context: string,
  error: unknown,
  fallback = "Erro desconhecido"
): string {
  const message = getErrorMessage(error, fallback);
  console.error(`[${context}]`, message, error);
  return message;
}
