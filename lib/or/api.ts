import { NextResponse } from "next/server";

export function ok<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function apiError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status });
}
