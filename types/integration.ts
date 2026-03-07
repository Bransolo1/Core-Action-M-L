// ─── Integration Credential Shapes ───────────────────────────────────────────

export interface ShopifyCredentials {
  /** e.g. "my-store.myshopify.com" — no https:// prefix */
  domain: string;
  /** Shopify Admin API access token (shpat_…) */
  accessToken: string;
  /** Webhook HMAC signing secret — from Shopify Admin → Notifications → Webhooks */
  webhookSecret?: string;
}

export interface VeeqoCredentials {
  /** Veeqo REST API key — from Veeqo → Settings → API */
  apiKey: string;
}

// ─── Sync Log ────────────────────────────────────────────────────────────────

export interface SyncLog {
  timestamp: string;
  productsImported: number;
  productsUpdated: number;
  salesPeriodsCreated: number;
  salesPeriodsUpdated: number;
  errors: string[];
  durationMs: number;
}

// ─── Integration Status (returned by GET /api/integrations) ──────────────────

export interface IntegrationStatus {
  shopify: {
    connected: boolean;
    enabled: boolean;
    /** Domain, masked if configured via env var */
    domain?: string;
    lastSync?: string;
    lastSyncLog?: SyncLog;
    /** True when credentials come from server env vars (read-only in UI) */
    configuredViaEnv: boolean;
  };
  veeqo: {
    connected: boolean;
    enabled: boolean;
    lastSync?: string;
    lastSyncLog?: SyncLog;
    configuredViaEnv: boolean;
  };
}

// ─── Shopify API shapes (subset we use) ──────────────────────────────────────

export interface ShopifyShop {
  name: string;
  myshopify_domain: string;
  currency: string;
}

export interface ShopifyProductVariant {
  id: number;
  sku: string;
  price: string;
  compare_at_price: string | null;
  weight: number;
  weight_unit: "kg" | "g" | "lb" | "oz";
  inventory_quantity: number;
  title: string; // "S" / "M" / Default Title
}

export interface ShopifyProduct {
  id: number;
  title: string;
  product_type: string;
  status: "active" | "draft" | "archived";
  variants: ShopifyProductVariant[];
  tags: string;
}

export interface ShopifyLineItem {
  variant_id: number;
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  price: string;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  line_items: ShopifyLineItem[];
}

// ─── Veeqo API shapes (subset we use) ────────────────────────────────────────

export interface VeeqoSellable {
  id: number;
  sku_code: string;
  title: string;
  sell_price: number;
  cost_price: number;
  weight: number | null;
  total_quantity_on_hand: number;
}

export interface VeeqoProduct {
  id: number;
  title: string;
  product_type: string | null;
  sellables: VeeqoSellable[];
}

export interface VeeqoOrderLineItem {
  sellable_id: number;
  sku_code: string;
  quantity: number;
  price_per_unit: number;
}

export interface VeeqoOrder {
  id: number;
  number: string;
  created_at: string;
  status: string;
  line_items: VeeqoOrderLineItem[];
}
