/**
 * Veeqo REST API client.
 * Docs: https://developer.veeqo.com/docs
 *
 * Use getVeeqoClient() to obtain a configured instance — credentials resolved
 * from env vars first, then DB.
 */
import { prisma } from "@/lib/prisma";
import type { VeeqoProduct, VeeqoOrder } from "@/types/integration";

const VEEQO_BASE = "https://api.veeqo.com";

// ─── Client ──────────────────────────────────────────────────────────────────

export class VeeqoClient {
  private headers: Record<string, string>;

  constructor(apiKey: string) {
    this.headers = {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    };
  }

  // ── Connection test ─────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; companyName?: string; error?: string }> {
    try {
      const res = await fetch(`${VEEQO_BASE}/company`, {
        headers: this.headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as { name?: string; company?: { name?: string } };
      const name = data.name ?? data.company?.name ?? "Veeqo account";
      return { ok: true, companyName: name };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Products ────────────────────────────────────────────────────────────

  /** Fetches all products, paginating through Veeqo's 100-per-page limit. */
  async getProducts(): Promise<VeeqoProduct[]> {
    const results: VeeqoProduct[] = [];
    let page = 1;

    while (true) {
      const res = await fetch(
        `${VEEQO_BASE}/products?page_size=100&page=${page}`,
        { headers: this.headers, signal: AbortSignal.timeout(20000) }
      );
      if (!res.ok) throw new Error(`Veeqo products fetch failed: HTTP ${res.status}`);

      const data = (await res.json()) as VeeqoProduct[];
      if (!data.length) break;
      results.push(...data);
      if (data.length < 100) break;
      page++;
    }

    return results;
  }

  // ── Orders ──────────────────────────────────────────────────────────────

  /** Fetches dispatched / complete orders. Optional `since` ISO date string. */
  async getOrders(since?: string): Promise<VeeqoOrder[]> {
    const results: VeeqoOrder[] = [];
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        page_size: "100",
        page: String(page),
        status: "dispatched",
      });
      if (since) params.set("created_at_gt", since);

      const res = await fetch(`${VEEQO_BASE}/orders?${params.toString()}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Veeqo orders fetch failed: HTTP ${res.status}`);

      const data = (await res.json()) as VeeqoOrder[];
      if (!data.length) break;
      results.push(...data);
      if (data.length < 100) break;
      page++;
    }

    return results;
  }
}

// ─── Credential resolver ─────────────────────────────────────────────────────

export async function getVeeqoClient(): Promise<VeeqoClient | null> {
  const envKey = process.env.VEEQO_API_KEY;
  if (envKey) return new VeeqoClient(envKey);

  const creds = await prisma.integrationCredentials
    .findUnique({ where: { id: "singleton" } })
    .catch(() => null);

  if (creds?.veeqoApiKey) return new VeeqoClient(creds.veeqoApiKey);
  return null;
}
