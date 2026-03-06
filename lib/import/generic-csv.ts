/**
 * Generic CSV import — Products and Sales History.
 *
 * Accepts the CSV format matching the templates in data/templates/.
 * Column names are case-insensitive and whitespace-trimmed.
 */
import type { Product } from "@/types/product";
import type { SalesPeriod } from "@/types/sales";
import { nanoid } from "@/lib/nanoid";
import { differenceInCalendarDays } from "date-fns";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

interface RawProductRow {
  [key: string]: string | undefined;
}

export interface ProductImportResult {
  products: Omit<Product, "id" | "createdAt" | "updatedAt">[];
  errors: string[];
  rowsProcessed: number;
}

function col(row: RawProductRow, ...names: string[]): string {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().trim() === name.toLowerCase()) {
        return (row[key] ?? "").trim();
      }
    }
  }
  return "";
}

export function parseProductCSV(rows: RawProductRow[]): ProductImportResult {
  const products: ProductImportResult["products"] = [];
  const errors: string[] = [];
  let rowsProcessed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    rowsProcessed++;

    const sku = col(row, "sku");
    const name = col(row, "product name", "name", "product");
    const category = col(row, "category");

    if (!sku) { errors.push(`Row ${i + 2}: Missing SKU`); continue; }
    if (!name) { errors.push(`Row ${i + 2}: Missing Product Name`); continue; }
    if (!category) { errors.push(`Row ${i + 2}: Missing Category`); continue; }

    const rrp = parseFloat(col(row, "rrp", "rrp price", "retail price", "price")) || 0;
    const cost = parseFloat(col(row, "cost price", "cost", "wholesale price", "wholesale")) || 0;
    const factor = parseFloat(col(row, "landed cost factor", "landed factor", "factor")) || 1.15;
    const landedCost = Math.round(cost * factor * 100);
    const unitsPerCarton = parseInt(col(row, "units per carton", "carton qty", "pack size"), 10) || 1;
    const minOrderQty = parseInt(col(row, "min order qty", "moq", "min qty"), 10) || 1;
    const leadTimeDays = parseInt(col(row, "lead time days", "lead time", "lead days"), 10) || 0;

    const activeRaw = col(row, "active", "is active", "status").toLowerCase();
    const isActive = activeRaw === "" || activeRaw === "yes" || activeRaw === "true" || activeRaw === "1" || activeRaw === "active";

    const newRaw = col(row, "new to market", "new", "is new").toLowerCase();
    const isNewToMarket = newRaw === "yes" || newRaw === "true" || newRaw === "1";

    products.push({
      sku,
      name,
      category,
      rrpCents: Math.round(rrp * 100),
      costCents: Math.round(cost * 100),
      landedCostCents: landedCost,
      landedCostFactor: factor,
      unitsPerCarton,
      minOrderQty,
      leadTimeDays,
      isActive,
      isNewToMarket,
    });
  }

  return { products, errors, rowsProcessed };
}

// ---------------------------------------------------------------------------
// Sales History
// ---------------------------------------------------------------------------

interface RawSalesRow {
  [key: string]: string | undefined;
}

export interface SalesImportResult {
  periods: SalesPeriod[];
  unmatchedSkus: string[];
  errors: string[];
  rowsProcessed: number;
  periodsCreated: number;
}

export function parseSalesCSV(rows: RawSalesRow[], products: Product[]): SalesImportResult {
  const skuMap = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const periods: SalesPeriod[] = [];
  const unmatchedSkus = new Set<string>();
  const errors: string[] = [];
  let rowsProcessed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    rowsProcessed++;

    const sku = col(row, "sku");
    if (!sku) { errors.push(`Row ${i + 2}: Missing SKU`); continue; }

    const product = skuMap.get(sku.toLowerCase());
    if (!product) { unmatchedSkus.add(sku); continue; }

    const periodStart = col(row, "period start", "start date", "start", "from");
    const periodEnd = col(row, "period end", "end date", "end", "to");
    if (!periodStart || !periodEnd) {
      errors.push(`Row ${i + 2}: Missing period dates`);
      continue;
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push(`Row ${i + 2}: Invalid date format`);
      continue;
    }

    const totalDays = parseInt(col(row, "total days"), 10) ||
      differenceInCalendarDays(endDate, startDate) + 1;

    const inStockDaysRaw = col(row, "in stock days", "in-stock days", "stock days");
    const inStockDays = inStockDaysRaw ? parseInt(inStockDaysRaw, 10) : totalDays;

    const unitsReceived = parseInt(col(row, "units received", "received", "qty received"), 10) || 0;
    const unitsSold = parseInt(col(row, "units sold", "sold", "qty sold", "quantity"), 10) || 0;
    const openingStock = parseInt(col(row, "opening stock", "opening"), 10) || 0;
    const closingStock = parseInt(col(row, "closing stock", "closing"), 10) || 0;

    const stockoutRaw = col(row, "had stockout", "stockout", "stock out").toLowerCase();
    const hadStockout = stockoutRaw === "yes" || stockoutRaw === "true" || stockoutRaw === "1";

    const notes = col(row, "notes", "note", "comments");

    periods.push({
      id: nanoid(),
      productId: product.id,
      periodStart: startDate.toISOString().slice(0, 10),
      periodEnd: endDate.toISOString().slice(0, 10),
      totalDays,
      inStockDays: Math.min(inStockDays, totalDays),
      unitsReceived,
      unitsSold,
      openingStock,
      closingStock,
      hadStockout,
      notes: notes || `Imported from CSV`,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    periods,
    unmatchedSkus: Array.from(unmatchedSkus),
    errors,
    rowsProcessed,
    periodsCreated: periods.length,
  };
}
