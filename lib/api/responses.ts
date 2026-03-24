import { NextResponse } from "next/server";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: string; message?: string };

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data } satisfies ApiSuccess<T>, { status });
}

export function failure(error: string, status = 400, message?: string) {
  return NextResponse.json({ ok: false, error, ...(message ? { message } : {}) } satisfies ApiFailure, { status });
}
