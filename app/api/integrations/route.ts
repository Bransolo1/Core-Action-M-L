/**
 * GET  /api/integrations  — return current integration status (credentials masked)
 * POST /api/integrations  — save integration credentials to DB
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { IntegrationStatus } from "@/types/integration";

function unauth() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET — return masked status ────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return unauth();

  // Resolve env-var overrides
  const envShopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const envShopifyToken  = process.env.SHOPIFY_ACCESS_TOKEN;
  const envVeeqoKey      = process.env.VEEQO_API_KEY;

  const creds = await prisma.integrationCredentials
    .findUnique({ where: { id: "singleton" } })
    .catch(() => null);

  const shopifyViaEnv = Boolean(envShopifyDomain && envShopifyToken);
  const veeqoViaEnv   = Boolean(envVeeqoKey);

  const hasShopify = shopifyViaEnv || Boolean(creds?.shopifyDomain && creds?.shopifyToken);
  const hasVeeqo   = veeqoViaEnv   || Boolean(creds?.veeqoApiKey);

  const status: IntegrationStatus = {
    shopify: {
      connected: hasShopify,
      enabled: shopifyViaEnv ? true : (creds?.shopifyEnabled ?? false),
      domain: shopifyViaEnv
        ? envShopifyDomain
        : (creds?.shopifyDomain ?? undefined),
      lastSync: creds?.shopifyLastSync?.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lastSyncLog: (creds?.shopifySyncLog as any) ?? undefined,
      configuredViaEnv: shopifyViaEnv,
    },
    veeqo: {
      connected: hasVeeqo,
      enabled: veeqoViaEnv ? true : (creds?.veeqoEnabled ?? false),
      lastSync: creds?.veeqoLastSync?.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lastSyncLog: (creds?.veeqoSyncLog as any) ?? undefined,
      configuredViaEnv: veeqoViaEnv,
    },
  };

  return NextResponse.json(status);
}

// ── POST — save credentials ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauth();
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = (await req.json()) as {
    shopify?: {
      domain?: string;
      accessToken?: string;
      webhookSecret?: string;
      enabled?: boolean;
    };
    veeqo?: {
      apiKey?: string;
      enabled?: boolean;
    };
  };

  // Build update payload — only set fields that were provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};

  if (body.shopify !== undefined) {
    if (body.shopify.domain     !== undefined) data.shopifyDomain  = body.shopify.domain.trim();
    if (body.shopify.accessToken !== undefined) data.shopifyToken  = body.shopify.accessToken.trim();
    if (body.shopify.webhookSecret !== undefined) data.shopifySecret = body.shopify.webhookSecret.trim();
    if (body.shopify.enabled    !== undefined) data.shopifyEnabled = body.shopify.enabled;
  }

  if (body.veeqo !== undefined) {
    if (body.veeqo.apiKey  !== undefined) data.veeqoApiKey  = body.veeqo.apiKey.trim();
    if (body.veeqo.enabled !== undefined) data.veeqoEnabled = body.veeqo.enabled;
  }

  await prisma.integrationCredentials.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
