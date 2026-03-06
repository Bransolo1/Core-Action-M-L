/**
 * Cost, landed cost, and revenue calculation utilities.
 * All monetary values are in cents (integers) internally.
 */

import type { Product } from "@/types/product";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatCurrency(cents: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Cost calculations
// ---------------------------------------------------------------------------

export function calculateLandedCost(costCents: number, factor: number): number {
  return Math.round(costCents * factor);
}

export function calculateGrossProfit(revenueCents: number, costCents: number): number {
  return revenueCents - costCents;
}

export function calculateGrossMarginPct(revenueCents: number, costCents: number): number {
  if (revenueCents === 0) return 0;
  return ((revenueCents - costCents) / revenueCents) * 100;
}

export function calculateMarkup(rrpCents: number, costCents: number): number {
  if (costCents === 0) return 0;
  return ((rrpCents - costCents) / costCents) * 100;
}

// ---------------------------------------------------------------------------
// Revenue forecast
// ---------------------------------------------------------------------------

export function forecastRevenue(units: number, product: Product): number {
  return units * product.rrpCents;
}

export function forecastCost(units: number, product: Product): number {
  return units * product.landedCostCents;
}

export function forecastGrossProfit(units: number, product: Product): number {
  const rev = forecastRevenue(units, product);
  const cost = forecastCost(units, product);
  return calculateGrossProfit(rev, cost);
}

// ---------------------------------------------------------------------------
// Budget optimisation
// ---------------------------------------------------------------------------

export interface POLineForOptimisation {
  id: string;
  productId: string;
  orderedQty: number;
  landedCostPerUnitCents: number;
  grossMarginPct: number;
  totalLandedCostCents: number;
  isIncluded: boolean;
}

/**
 * Given a list of PO lines and a budget ceiling, return which lines to include.
 * Lines are sorted by gross margin % descending. Lines are included greedily
 * until budget is exhausted.
 * Within-line partial quantities are considered if a line doesn't fully fit.
 */
export function optimisePOForBudget(
  lines: POLineForOptimisation[],
  budgetCents: number
): POLineForOptimisation[] {
  // Sort by margin desc
  const sorted = [...lines].sort((a, b) => b.grossMarginPct - a.grossMarginPct);

  let remaining = budgetCents;
  const result: POLineForOptimisation[] = [];

  for (const line of sorted) {
    if (remaining <= 0) {
      result.push({ ...line, isIncluded: false });
      continue;
    }

    if (line.totalLandedCostCents <= remaining) {
      result.push({ ...line, isIncluded: true });
      remaining -= line.totalLandedCostCents;
    } else {
      // Partial — reduce qty to fit
      const affordableQty = Math.floor(remaining / line.landedCostPerUnitCents);
      if (affordableQty > 0) {
        result.push({
          ...line,
          orderedQty: affordableQty,
          totalLandedCostCents: affordableQty * line.landedCostPerUnitCents,
          isIncluded: true,
        });
        remaining -= affordableQty * line.landedCostPerUnitCents;
      } else {
        result.push({ ...line, isIncluded: false });
      }
    }
  }

  // Re-sort back to original priority rank order by productId
  return result;
}
