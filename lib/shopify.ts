/**
 * Shopify Admin REST API client (2024-10).
 *
 * Use getShopifyClient() to obtain a configured instance — it resolves
 * credentials from env vars first, then falls back to DB-stored credentials.
 */
import { prisma } from "@/lib/prisma";
import type {
  ShopifyShop,
  ShopifyProduct,
  ShopifyOrder,
} from "@/types/integration";

const API_VERSION = "2024-10";

// ─── Client ──────────────────────────────────────────────────────────────────

export class ShopifyClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(domain: string, accessToken: string) {
    // Normalise: strip https:// if user accidentally included it
    const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.baseUrl = `https://${clean}/admin/api/${API_VERSION}`;
    this.headers = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    };
  }

  // ── Connection test ─────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; shopName?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/shop.json`, {
        headers: this.headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as { shop: ShopifyShop };
      return { ok: true, shopName: data.shop.name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Products ────────────────────────────────────────────────────────────

  /** Fetches all active products, paginating through the full catalogue. */
  async getProducts(): Promise<ShopifyProduct[]> {
    return this.paginate<ShopifyProduct>(
      `${this.baseUrl}/products.json?limit=250&status=active`,
      (d) => (d as { products: ShopifyProduct[] }).products
    );
  }

  // ── Orders ──────────────────────────────────────────────────────────────

  /**
   * Fetches paid orders. Paginates until all are retrieved.
   * @param sinceDate  ISO date string — only orders created on/after this date
   */
  async getOrders(sinceDate?: string): Promise<ShopifyOrder[]> {
    const params = new URLSearchParams({
      limit: "250",
      financial_status: "paid",
      status: "any",
    });
    if (sinceDate) params.set("created_at_min", sinceDate);

    return this.paginate<ShopifyOrder>(
      `${this.baseUrl}/orders.json?${params.toString()}`,
      (d) => (d as { orders: ShopifyOrder[] }).orders
    );
  }

  // ── Pagination helper ───────────────────────────────────────────────────

  private async paginate<T>(
    firstUrl: string,
    extract: (data: unknown) => T[]
  ): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = firstUrl;

    while (nextUrl !== null) {
      // eslint-disable-next-line no-await-in-loop
      const pageRes: Response = await fetch(nextUrl, {
        headers: this.headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!pageRes.ok) {
        throw new Error(`Shopify API error: HTTP ${pageRes.status}`);
      }
      // eslint-disable-next-line no-await-in-loop
      results.push(...extract(await pageRes.json()));

      const linkHeader: string = pageRes.headers.get("Link") ?? "";
      const nextMatch: RegExpMatchArray | null =
        linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      nextUrl = nextMatch ? nextMatch[1] : null;
    }

    return results;
  }
}

// ─── Credential resolver ─────────────────────────────────────────────────────

/**
 * Returns a ShopifyClient built from environment variables if present,
 * otherwise falls back to the IntegrationCredentials row in the database.
 * Returns null when no credentials are configured at all.
 */
export async function getShopifyClient(): Promise<{
  client: ShopifyClient;
  domain: string;
} | null> {
  // Prefer env vars (good for server / CI deployments)
  const envDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const envToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (envDomain && envToken) {
    return { client: new ShopifyClient(envDomain, envToken), domain: envDomain };
  }

  // Fall back to DB-stored credentials
  const creds = await prisma.integrationCredentials
    .findUnique({ where: { id: "singleton" } })
    .catch(() => null);

  if (creds?.shopifyDomain && creds?.shopifyToken) {
    return {
      client: new ShopifyClient(creds.shopifyDomain, creds.shopifyToken),
      domain: creds.shopifyDomain,
    };
  }

  return null;
}

// ─── Weight → grams conversion ───────────────────────────────────────────────

export function toGrams(value: number, unit: string): number {
  switch (unit) {
    case "kg":  return Math.round(value * 1000);
    case "lb":  return Math.round(value * 453.592);
    case "oz":  return Math.round(value * 28.3495);
    default:    return Math.round(value); // already grams
  }
}
