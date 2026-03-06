/**
 * WooCommerce order export CSV → SalesPeriod import.
 *
 * WooCommerce orders export columns (relevant ones):
 *   Order ID, Order Status, Date, SKU, Item Name, Quantity, Item Cost
 */
import type { SalesPeriod } from "@/types/sales";
import type { Product } from "@/types/product";
import { nanoid } from "@/lib/nanoid";
import { differenceInCalendarDays, startOfMonth, endOfMonth, format } from "date-fns";

export interface WooCommerceRow {
  "Order ID"?: string;
  "Order Status"?: string;
  "Date"?: string;
  "SKU"?: string;
  "Item Name"?: string;
  "Quantity"?: string;
  "Item Cost"?: string;
  [key: string]: string | undefined;
}

export interface ImportResult {
  periods: SalesPeriod[];
  unmatchedSkus: string[];
  rowsProcessed: number;
  periodsCreated: number;
}

const COMPLETED_STATUSES = new Set(["completed", "processing", "wc-completed", "wc-processing"]);

export function parseWooCommerceExport(rows: WooCommerceRow[], products: Product[]): ImportResult {
  const skuMap = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const unmatchedSkus = new Set<string>();

  type MonthKey = string;
  const groups = new Map<MonthKey, { productId: string; unitsSold: number }>();

  let rowsProcessed = 0;

  for (const row of rows) {
    const status = (row["Order Status"] ?? "").toLowerCase().replace(/^wc-/, "");
    if (!COMPLETED_STATUSES.has(status) && !COMPLETED_STATUSES.has(`wc-${status}`)) continue;

    const sku = row["SKU"]?.trim() ?? "";
    if (!sku) continue;

    const dateStr = row["Date"]?.trim() ?? "";
    if (!dateStr) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const qty = parseInt(row["Quantity"] ?? "1", 10);
    if (isNaN(qty) || qty <= 0) continue;

    rowsProcessed++;

    const product = skuMap.get(sku.toLowerCase());
    if (!product) {
      unmatchedSkus.add(sku);
      continue;
    }

    const monthKey = `${sku}::${format(date, "yyyy-MM")}`;
    if (!groups.has(monthKey)) {
      groups.set(monthKey, { productId: product.id, unitsSold: 0 });
    }
    groups.get(monthKey)!.unitsSold += qty;
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
      inStockDays: totalDays,
      unitsReceived: 0,
      unitsSold: group.unitsSold,
      openingStock: 0,
      closingStock: 0,
      hadStockout: false,
      notes: `Imported from WooCommerce export`,
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
