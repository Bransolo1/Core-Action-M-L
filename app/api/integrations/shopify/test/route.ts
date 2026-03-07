/**
 * POST /api/integrations/shopify/test
 * Tests a Shopify connection using credentials supplied in the request body
 * (not yet saved to DB). Returns { ok, shopName, error }.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShopifyClient } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain, accessToken } = (await req.json()) as {
    domain: string;
    accessToken: string;
  };

  if (!domain || !accessToken) {
    return NextResponse.json(
      { ok: false, error: "domain and accessToken are required" },
      { status: 400 }
    );
  }

  const client = new ShopifyClient(domain, accessToken);
  const result = await client.testConnection();
  return NextResponse.json(result);
}
