/**
 * Core forecasting algorithms.
 *
 * KEY PRINCIPLE: All sell-through rates and velocity calculations
 * MUST be based on in-stock days only, not total period days.
 * This prevents stockout periods from diluting demand signals.
 */

import type { SalesPeriod, SellThroughAnalysis } from "@/types/sales";
import type { SeasonalFactors, MonthlyForecast, ProductForecast } from "@/types/forecast";
import type { Product } from "@/types/product";
import { addMonths, getDaysInMonth, startOfMonth, format } from "date-fns";

// ---------------------------------------------------------------------------
// Sell-Through Rate (Stockout-Adjusted)
// ---------------------------------------------------------------------------

/**
 * Calculate the stockout-adjusted sell-through rate for a product
 * across multiple recorded periods.
 *
 * Example:
 *   100 units received, sold all 100 in 30 days out of a 90-day period.
 *   Standard STR = 100/100 = 100%
 *   Daily velocity = 100/30 = 3.33 units/day
 *   Adjusted demand (full 90 days) = 3.33 × 90 = 300 units
 *   Adjusted STR = 100/(3.33 × 90) = 33% — meaning demand >> supply
 */
export function calculateSellThrough(periods: SalesPeriod[]): SellThroughAnalysis {
  if (periods.length === 0) {
    return {
      productId: "",
      standardStr: 0,
      adjustedStr: 0,
      dailyVelocity: 0,
      projectedAnnualDemand: 0,
      periodsAnalysed: 0,
      stockoutRate: 0,
    };
  }

  const productId = periods[0].productId;

  let totalReceived = 0;
  let totalSold = 0;
  let totalInStockDays = 0;
  let totalPeriodDays = 0;

  for (const p of periods) {
    totalReceived += p.unitsReceived;
    totalSold += p.unitsSold;
    totalInStockDays += Math.max(p.inStockDays, 1); // guard against 0
    totalPeriodDays += p.totalDays;
  }

  const standardStr = totalReceived > 0 ? totalSold / totalReceived : 0;
  const dailyVelocity = totalInStockDays > 0 ? totalSold / totalInStockDays : 0;

  // What would have sold if in stock all days?
  const adjustedDemand = dailyVelocity * totalPeriodDays;
  const adjustedStr = adjustedDemand > 0 ? totalSold / adjustedDemand : 0;
  const projectedAnnualDemand = dailyVelocity * 365;
  const stockoutRate =
    totalPeriodDays > 0 ? (totalPeriodDays - totalInStockDays) / totalPeriodDays : 0;

  return {
    productId,
    standardStr,
    adjustedStr,
    dailyVelocity,
    projectedAnnualDemand,
    periodsAnalysed: periods.length,
    stockoutRate,
  };
}

// ---------------------------------------------------------------------------
// Seasonal Uplift
// ---------------------------------------------------------------------------

/**
 * Get the seasonal multiplier for a given month.
 * Falls back to 1.0 if not configured.
 */
export function getSeasonalMultiplier(month: number, factors: SeasonalFactors): number {
  return factors[String(month)] ?? 1.0;
}

/**
 * Build a full monthly breakdown of seasonal factors for a given year.
 */
export function buildSeasonalProfile(
  year: number,
  factors: SeasonalFactors
): { month: number; multiplier: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return { month, multiplier: getSeasonalMultiplier(month, factors) };
  });
}

// ---------------------------------------------------------------------------
// Monthly Forecast Generation
// ---------------------------------------------------------------------------

/**
 * Generate a monthly forecast for a product over a window.
 */
export function generateMonthlyForecast(params: {
  product: Product;
  dailyVelocity: number;
  seasonalFactors: SeasonalFactors;
  windowStart: string; // ISO date
  windowEnd: string; // ISO date
}): MonthlyForecast[] {
  const { product, dailyVelocity, seasonalFactors, windowStart, windowEnd } = params;
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const results: MonthlyForecast[] = [];

  let cursor = startOfMonth(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const daysInMonth = getDaysInMonth(cursor);

    // Proportion of month within window
    const monthStart = cursor;
    const monthEnd = addMonths(cursor, 1);
    const effectiveStart = monthStart < start ? start : monthStart;
    const effectiveEnd = monthEnd > end ? end : monthEnd;
    const effectiveDays = Math.max(
      0,
      (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const dayRatio = effectiveDays / daysInMonth;

    const seasonalMultiplier = getSeasonalMultiplier(month, seasonalFactors);
    const baseUnits = dailyVelocity * daysInMonth;
    const adjustedUnits = Math.round(baseUnits * seasonalMultiplier * dayRatio);

    const revenueCents = adjustedUnits * product.rrpCents;
    const costCents = adjustedUnits * product.landedCostCents;
    const grossProfitCents = revenueCents - costCents;
    const grossMarginPct = revenueCents > 0 ? (grossProfitCents / revenueCents) * 100 : 0;

    results.push({
      year,
      month,
      period: format(cursor, "yyyy-MM"),
      baseUnits: Math.round(baseUnits * dayRatio),
      seasonalMultiplier,
      adjustedUnits,
      revenueCents,
      costCents,
      grossProfitCents,
      grossMarginPct,
    });

    cursor = addMonths(cursor, 1);
  }

  return results;
}

/**
 * Roll up monthly forecasts into a ProductForecast summary.
 */
export function buildProductForecast(params: {
  product: Product;
  dailyVelocity: number;
  velocitySource: ProductForecast["velocitySource"];
  seasonalFactors: SeasonalFactors;
  windowStart: string;
  windowEnd: string;
  confidenceLow?: number;
  confidenceHigh?: number;
}): ProductForecast {
  const monthly = generateMonthlyForecast({
    product: params.product,
    dailyVelocity: params.dailyVelocity,
    seasonalFactors: params.seasonalFactors,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });

  const totalUnits = monthly.reduce((s, m) => s + m.adjustedUnits, 0);
  const totalRevenueCents = monthly.reduce((s, m) => s + m.revenueCents, 0);
  const totalCostCents = monthly.reduce((s, m) => s + m.costCents, 0);
  const totalGrossProfitCents = totalRevenueCents - totalCostCents;
  const overallGrossMarginPct =
    totalRevenueCents > 0 ? (totalGrossProfitCents / totalRevenueCents) * 100 : 0;

  return {
    productId: params.product.id,
    sku: params.product.sku,
    name: params.product.name,
    velocitySource: params.velocitySource,
    dailyVelocity: params.dailyVelocity,
    monthly,
    totalUnits,
    totalRevenueCents,
    totalCostCents,
    totalGrossProfitCents,
    overallGrossMarginPct,
    confidenceLow: params.confidenceLow,
    confidenceHigh: params.confidenceHigh,
  };
}
