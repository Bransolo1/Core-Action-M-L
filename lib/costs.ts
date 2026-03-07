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
// Key retail buying metrics
// ---------------------------------------------------------------------------

/**
 * Gross Margin Return on Investment (GMROI).
 * Measures how much gross profit the business earns for every £1 of
 * average inventory investment.
 *
 *   GMROI = Annual Gross Profit / Average Inventory Cost
 *
 * Industry benchmark for action sports retail: ≥ 2.5
 *
 * @param annualGrossProfitCents  Total GP over the year in cents
 * @param avgInventoryCostCents   Average landed cost of inventory held (cents)
 */
export function calculateGMROI(
  annualGrossProfitCents: number,
  avgInventoryCostCents: number
): number {
  if (avgInventoryCostCents <= 0) return 0;
  return annualGrossProfitCents / avgInventoryCostCents;
}

/**
 * Weeks of Cover (WoC) — how many weeks of sales current stock will last.
 *
 *   WoC = (Current Stock + Stock on Order) / Weekly Velocity
 *
 * Healthy range for action sports: 8–16 weeks outside peak; 4–6 during peak.
 * < 4 weeks = reorder urgently; > 20 weeks = potential excess/dead stock.
 *
 * @param currentStock      Units currently in warehouse
 * @param stockOnOrder      Units committed on open POs not yet received
 * @param dailyVelocity     Stockout-adjusted velocity in units/day
 */
export function calculateWeeksOfCover(
  currentStock: number,
  stockOnOrder: number,
  dailyVelocity: number
): number {
  if (dailyVelocity <= 0) return Infinity;
  const weeklyVelocity = dailyVelocity * 7;
  return (currentStock + stockOnOrder) / weeklyVelocity;
}

/**
 * Reorder Point — the stock level at which a new order should be placed.
 *
 *   ROP = (Daily Velocity × Lead Time Days) + Safety Stock
 *
 * @param dailyVelocity   Units/day (stockout-adjusted)
 * @param leadTimeDays    Days from order to warehouse receipt
 * @param safetyStock     Buffer units (typically velocity × leadTime/2 × (1 + CV))
 */
export function calculateReorderPoint(
  dailyVelocity: number,
  leadTimeDays: number,
  safetyStock = 0
): number {
  return Math.ceil(dailyVelocity * leadTimeDays + safetyStock);
}

/**
 * Open-to-Buy (OTB) remaining for a buying cycle.
 *
 *   OTB = Cycle Budget - Sum of PO values placed for this cycle
 *
 * @param cycleBudgetCents     Total budget allocated to the cycle
 * @param committedCents       Sum of optimisedValueCents of all POs in the cycle
 */
export function calculateOTB(cycleBudgetCents: number, committedCents: number): number {
  return cycleBudgetCents - committedCents;
}

/**
 * Inventory turnover — how many times stock is sold and replaced in a period.
 *
 *   Turnover = COGS / Average Inventory Cost
 *
 * Higher is better (typically 4–8 for action sports).
 */
export function calculateInventoryTurnover(
  cogsCents: number,
  avgInventoryCostCents: number
): number {
  if (avgInventoryCostCents <= 0) return 0;
  return cogsCents / avgInventoryCostCents;
}

/**
 * ABC classification of a product by its share of total revenue.
 *
 * Class A: top 80% of cumulative revenue
 * Class B: next 15% (80–95%)
 * Class C: bottom 5% (95–100%)
 */
export type ABCClass = "A" | "B" | "C";

export function classifyABC(cumulativePct: number): ABCClass {
  if (cumulativePct <= 80) return "A";
  if (cumulativePct <= 95) return "B";
  return "C";
}

export interface ABCItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  revenueCents: number;
  revenuePct: number;
  cumulativePct: number;
  abcClass: ABCClass;
}

/**
 * Build the full ABC ranking from an array of product revenue data.
 * Returns products sorted by revenue descending with class assigned.
 */
export function buildABCRanking(
  products: { productId: string; sku: string; name: string; category: string; revenueCents: number }[]
): ABCItem[] {
  const sorted = [...products].sort((a, b) => b.revenueCents - a.revenueCents);
  const total = sorted.reduce((s, p) => s + p.revenueCents, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return sorted.map((p) => {
    const revenuePct = (p.revenueCents / total) * 100;
    cumulative += revenuePct;
    return {
      ...p,
      revenuePct,
      cumulativePct: cumulative,
      abcClass: classifyABC(cumulative),
    };
  });
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
