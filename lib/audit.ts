// lib/audit.ts
// Helper para registrar eventos críticos na tabela audit_log
// Tabela SQL necessária: audit_log(id uuid, actor_id uuid, action text, entity_type text, entity_id text, metadata jsonb, created_at timestamptz)
import { createClient as createAdminClientDirect } from "@supabase/supabase-js";
import { NEXT_PUBLIC_SUPABASE_URL } from "@/lib/env";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env-server";

// Lazy singleton to avoid module-level errors in client bundles
let _supabase: ReturnType<typeof createAdminClientDirect> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createAdminClientDirect(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

export type AuditAction =
  | "product.created"       | "product.approved"    | "product.rejected"
  | "product.price_changed" | "product.deleted"
  | "subscription.canceled" | "subscription.renewed"
  | "dispute.opened"        | "dispute.won"          | "dispute.lost"
  | "user.blacklisted"      | "user.role_changed"
  | "refund.issued"
  | "fiscal.config_saved"   | "fiscal.note_emitted";

type AuditLogInsert = {
  actor_id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
};

interface SupabaseAuditLog {
  from(table: "audit_log"): {
    insert(data: AuditLogInsert): Promise<{ error: null | unknown }>;
  };
}

export async function auditLog(args: {
  actorId:    string;
  action:     AuditAction;
  entityType: string;
  entityId:   string;
  metadata?:  Record<string, unknown>;
}) {
  try {
    const payload: AuditLogInsert = {
      actor_id:    args.actorId,
      action:      args.action,
      entity_type: args.entityType,
      entity_id:   args.entityId,
      metadata:    args.metadata ?? {},
    };
    
    await (getSupabase() as unknown as SupabaseAuditLog)
      .from("audit_log")
      .insert(payload);
  } catch (e) {
    // Audit log failures must never break the main flow
    console.error("[audit]", e);
  }
}
