/**
 * Shopify order export CSV → SalesPeriod import.
 *
 * Shopify orders export columns (relevant ones):
 *   Name, Email, Financial Status, Fulfillment Status, Currency,
 *   Lineitem quantity, Lineitem name, Lineitem sku, Lineitem price,
 *   Created at, Paid at
 */
import type { SalesPeriod } from "@/types/sales";
import type { Product } from "@/types/product";
import { nanoid } from "@/lib/nanoid";
import { differenceInCalendarDays, startOfMonth, endOfMonth, format } from "date-fns";

export interface ShopifyRow {
  "Created at"?: string;
  "Paid at"?: string;
  "Financial Status"?: string;
  "Fulfillment Status"?: string;
  "Lineitem sku"?: string;
  "Lineitem name"?: string;
  "Lineitem quantity"?: string;
  [key: string]: string | undefined;
}

export interface ImportResult {
  periods: SalesPeriod[];
  unmatchedSkus: string[];
  rowsProcessed: number;
  periodsCreated: number;
}

/**
 * Parse Shopify CSV rows into monthly SalesPeriod records grouped by SKU.
 * Only includes rows where Financial Status = "paid" (or "partially_paid").
 */
export function parseShopifyExport(rows: ShopifyRow[], products: Product[]): ImportResult {
  const skuMap = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const unmatchedSkus = new Set<string>();

  // Group sales by SKU + year-month
  type MonthKey = string; // "SKU::YYYY-MM"
  const groups = new Map<MonthKey, { productId: string; unitsSold: number; dates: Date[] }>();

  let rowsProcessed = 0;

  for (const row of rows) {
    const status = row["Financial Status"]?.toLowerCase() ?? "";
    if (!status.includes("paid")) continue;

    const sku = row["Lineitem sku"]?.trim() ?? "";
    if (!sku) continue;

    const dateStr = row["Paid at"] || row["Created at"] || "";
    if (!dateStr) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const qty = parseInt(row["Lineitem quantity"] ?? "1", 10);
    if (isNaN(qty) || qty <= 0) continue;

    rowsProcessed++;

    const product = skuMap.get(sku.toLowerCase());
    if (!product) {
      unmatchedSkus.add(sku);
      continue;
    }

    const monthKey = `${sku}::${format(date, "yyyy-MM")}`;
    if (!groups.has(monthKey)) {
      groups.set(monthKey, { productId: product.id, unitsSold: 0, dates: [] });
    }
    const group = groups.get(monthKey)!;
    group.unitsSold += qty;
    group.dates.push(date);
  }

  const periods: SalesPeriod[] = [];

  for (const [key, group] of Array.from(groups.entries())) {
    const [, yearMonth] = key.split("::");
    const [year, month] = yearMonth.split("-").map(Number);
    const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const totalDays = differenceInCalendarDays(
      endOfMonth(new Date(year, month - 1)),
      startOfMonth(new Date(year, month - 1))
    ) + 1;

    periods.push({
      id: nanoid(),
      productId: group.productId,
      periodStart,
      periodEnd,
      totalDays,
      inStockDays: totalDays, // user can adjust after import
      unitsReceived: 0, // unknown from order data
      unitsSold: group.unitsSold,
      openingStock: 0,
      closingStock: 0,
      hadStockout: false,
      notes: `Imported from Shopify export`,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    periods,
    unmatchedSkus: Array.from(unmatchedSkus),
    rowsProcessed,
    periodsCreated: periods.length,
  };
}
