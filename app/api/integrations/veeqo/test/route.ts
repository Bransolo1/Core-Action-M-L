/**
 * POST /api/integrations/veeqo/test
 * Tests a Veeqo API key supplied in the request body.
 * Returns { ok, companyName?, error? }.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VeeqoClient } from "@/lib/veeqo";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiKey } = (await req.json()) as { apiKey: string };

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "apiKey is required" },
      { status: 400 }
    );
  }

  const client = new VeeqoClient(apiKey);
  const result = await client.testConnection();
  return NextResponse.json(result);
}
