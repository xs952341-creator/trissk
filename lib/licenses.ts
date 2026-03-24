// lib/licenses.ts
// Geração, validação e gerenciamento de license keys industriais.
// Suporta: single-machine, multi-machine, floating licenses.
// Padrão: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (25 chars, Gumroad-style)

import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getErrorMessage } from "@/lib/errors";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I/O/0/1 para evitar confusão

// ─── Geração ──────────────────────────────────────────────────────────────────

export function generateLicenseKey(): string {
  const groups = 5;
  const groupLen = 5;
  const parts: string[] = [];

  for (let g = 0; g < groups; g++) {
    let segment = "";
    for (let i = 0; i < groupLen; i++) {
      // crypto.randomInt é mais seguro que Math.random
      segment += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    parts.push(segment);
  }

  return parts.join("-"); // ex: AB2CD-EF3GH-JK4LM-NP5QR-ST6UV
}

export function generateLicenseKeyCompact(): string {
  // Versão curta para produtos simples: XXXX-XXXX-XXXX-XXXX
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join("")
  ).join("-");
}

// ─── Criação no banco ─────────────────────────────────────────────────────────

export interface CreateLicenseOptions {
  userId: string;
  productId: string;
  orderId?: string;
  machineLimit?: number;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface LicenseKey {
  id: string;
  license_key: string;
  status: string;
  machine_limit: number;
  activation_count: number;
  expires_at: string | null;
  created_at: string;
}

export async function createLicenseKey(opts: CreateLicenseOptions): Promise<LicenseKey | null> {
  const admin = createAdminClient();
  const key = generateLicenseKey();

  const { data, error } = await admin
    .from("license_keys")
    .upsert(
      {
        user_id:          opts.userId,
        product_id:       opts.productId,
        license_key:      key,
        order_id:         opts.orderId ?? null,
        machine_limit:    opts.machineLimit ?? 1,
        activation_count: 0,
        status:           "active",
        expires_at:       opts.expiresAt?.toISOString() ?? null,
        metadata:         opts.metadata ?? {},
      },
      { onConflict: "user_id,product_id" }
    )
    .select("id, license_key, status, machine_limit, activation_count, expires_at, created_at")
    .single();

  if (error) {
    console.error("[licenses] createLicenseKey error:", getErrorMessage(error));
    return null;
  }

  return data as LicenseKey;
}

// ─── Validação ────────────────────────────────────────────────────────────────

export interface ValidateLicenseResult {
  valid: boolean;
  reason?: "not_found" | "revoked" | "expired" | "machine_limit_exceeded" | "ok";
  licenseId?: string;
  userId?: string;
  activationsUsed?: number;
  machineLimit?: number;
  expiresAt?: string | null;
}

export async function validateLicense(
  productId: string,
  licenseKey: string,
  hardwareId?: string
): Promise<ValidateLicenseResult> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("license_keys")
    .select("id, user_id, status, machine_limit, activation_count, expires_at")
    .eq("product_id", productId)
    .eq("license_key", licenseKey)
    .maybeSingle();

  if (!row) return { valid: false, reason: "not_found" };
  if (row.status === "revoked") return { valid: false, reason: "revoked" };

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { valid: false, reason: "expired" };
  }

  // Se hardware_id fornecido, verificar/registrar ativação
  if (hardwareId) {
    const activation = await activateMachine(row.id, hardwareId);
    if (!activation.success) {
      return {
        valid: false,
        reason: "machine_limit_exceeded",
        activationsUsed: activation.currentCount,
        machineLimit: row.machine_limit ?? 1,
      };
    }
  }

  return {
    valid: true,
    reason: "ok",
    licenseId: row.id,
    userId: row.user_id,
    activationsUsed: row.activation_count ?? 0,
    machineLimit: row.machine_limit ?? 1,
    expiresAt: row.expires_at,
  };
}

// ─── Ativação de Máquina ──────────────────────────────────────────────────────

interface ActivationResult {
  success: boolean;
  currentCount: number;
  alreadyActivated?: boolean;
}

async function activateMachine(
  licenseId: string,
  hardwareId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ActivationResult> {
  const admin = createAdminClient();

  // Verificar se já está ativado nessa máquina
  const { data: existing } = await admin
    .from("license_activations")
    .select("id")
    .eq("license_id", licenseId)
    .eq("hardware_id", hardwareId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) {
    const { data: lic } = await admin
      .from("license_keys")
      .select("activation_count")
      .eq("id", licenseId)
      .single();
    return { success: true, currentCount: lic?.activation_count ?? 1, alreadyActivated: true };
  }

  // Verificar limite
  const { data: lic } = await admin
    .from("license_keys")
    .select("machine_limit, activation_count")
    .eq("id", licenseId)
    .single();

  const limit = lic?.machine_limit ?? 1;
  const used = lic?.activation_count ?? 0;

  if (used >= limit) {
    return { success: false, currentCount: used };
  }

  // Registrar ativação
  await admin.from("license_activations").insert({
    license_id:  licenseId,
    hardware_id: hardwareId,
    ip_address:  ipAddress ?? null,
    user_agent:  userAgent ?? null,
  });

  // Incrementar contador
  await admin
    .from("license_keys")
    .update({
      activation_count:  used + 1,
      last_activated_at: new Date().toISOString(),
    })
    .eq("id", licenseId);

  return { success: true, currentCount: used + 1 };
}

// ─── Revogar Licença ──────────────────────────────────────────────────────────

export async function revokeLicense(licenseId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("license_keys")
    .update({ status: "revoked" })
    .eq("id", licenseId);

  return !error;
}

export async function revokeLicenseByUser(userId: string, productId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("license_keys")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("product_id", productId);

  return !error;
}

// ─── Revogar ativação de máquina ──────────────────────────────────────────────

export async function revokeMachineActivation(
  licenseId: string,
  hardwareId: string
): Promise<boolean> {
  const admin = createAdminClient();

  await admin
    .from("license_activations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("license_id", licenseId)
    .eq("hardware_id", hardwareId);

  // Decrementar contador
  const { data: lic } = await admin
    .from("license_keys")
    .select("activation_count")
    .eq("id", licenseId)
    .single();

  await admin
    .from("license_keys")
    .update({ activation_count: Math.max(0, (lic?.activation_count ?? 1) - 1) })
    .eq("id", licenseId);

  return true;
}

// ─── Listar licenças de um produto (admin/vendor) ─────────────────────────────

export async function listLicensesByProduct(
  productId: string,
  opts?: { limit?: number; offset?: number; status?: string }
) {
  const admin = createAdminClient();

  let q = admin
    .from("license_keys")
    .select(
      "id, license_key, status, machine_limit, activation_count, expires_at, created_at, user_id, order_id, profiles!user_id(email, full_name)"
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.limit)  q = q.limit(opts.limit);
  if (opts?.offset) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}
