/**
 * lib/types/api.ts
 * Tipos canônicos de resposta de API — v44
 *
 * Uso:
 *   import type { ApiResponse, ApiSuccess, ApiError } from "@/lib/types/api";
 *
 *   return NextResponse.json<ApiSuccess<{ id: string }>>({
 *     success: true,
 *     data: { id: certificate.id },
 *   });
 *
 *   return NextResponse.json<ApiError>(
 *     { success: false, error: "Usuário sem entitlement ativo.", code: "CERTIFICATE_FORBIDDEN" },
 *     { status: 403 }
 *   );
 */

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  /** Mensagem opcional para o cliente (ex: "Certificado emitido com sucesso.") */
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  /** Código de erro legível por máquina para o cliente diferenciar causas */
  code?: ApiErrorCode;
  /** Detalhes adicionais (campos de validação, contexto) */
  details?: Record<string, unknown>;
}

/** Códigos de erro padronizados da plataforma */
export type ApiErrorCode =
  // Auth
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  // Recursos
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  // Pagamentos / billing
  | "PAYMENT_REQUIRED"
  | "ENTITLEMENT_NOT_FOUND"
  | "ENTITLEMENT_REVOKED"
  | "SUBSCRIPTION_INACTIVE"
  // Certificados
  | "CERTIFICATE_FORBIDDEN"
  | "CERTIFICATE_NOT_FOUND"
  | "CERTIFICATE_REVOKED"
  // Webhook
  | "WEBHOOK_SSRF_BLOCKED"
  | "WEBHOOK_INVALID_URL"
  | "WEBHOOK_INACTIVE"
  // Validação
  | "VALIDATION_ERROR"
  | "MISSING_FIELD"
  | "INVALID_FORMAT"
  // Rate limit
  | "RATE_LIMITED"
  // Sistema
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  // Idempotência
  | "DUPLICATE_REQUEST";

/** Union type para respostas completas */
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/** Helper para construir resposta de sucesso tipada */
export function apiSuccess<T>(data: T, message?: string): ApiSuccess<T> {
  return { success: true, data, ...(message ? { message } : {}) };
}

/** Helper para construir resposta de erro tipada */
export function apiError(
  error: string,
  code?: ApiErrorCode,
  details?: Record<string, unknown>
): ApiError {
  return {
    success: false,
    error,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  };
}

/** Type guard: verifica se uma resposta é de sucesso */
export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.success === true;
}

/** Type guard: verifica se uma resposta é de erro */
export function isApiError(res: ApiResponse): res is ApiError {
  return res.success === false;
}
