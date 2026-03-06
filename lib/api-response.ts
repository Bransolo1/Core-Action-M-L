import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function tooManyRequests(resetAt: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) },
    }
  );
}

export function serverError(err: unknown) {
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[API Error]", err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function zodError(err: ZodError) {
  return badRequest("Validation error", err.flatten().fieldErrors);
}
