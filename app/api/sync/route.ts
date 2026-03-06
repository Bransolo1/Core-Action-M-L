import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";

/** GET /api/sync — return the full server-side state */
export async function GET() {
  try {
    const state = readDb();
    return NextResponse.json(state);
  } catch (err) {
    console.error("[GET /api/sync]", err);
    return NextResponse.json({ error: "Failed to read database" }, { status: 500 });
  }
}

/** POST /api/sync — replace the full server-side state */
export async function POST(req: NextRequest) {
  try {
    const state = await req.json();
    writeDb(state);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/sync]", err);
    return NextResponse.json({ error: "Failed to write database" }, { status: 500 });
  }
}
