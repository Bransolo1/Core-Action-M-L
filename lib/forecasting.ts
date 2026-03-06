/**
 * Core forecasting algorithms — CORE Action Sports Buyer Portal
 *
 * KEY PRINCIPLES
 * ──────────────
 * 1. Stockout-adjusted velocity: use in-stock days only, never total period days.
 * 2. Recency-weighted aggregation: recent periods influence the forecast more
 *    than older ones (exponential decay, α = 0.85).
 * 3. Trend detection: linear regression over per-period velocities to classify
 *    demand as up / flat / down and project a trend-adjusted base velocity.
 * 4. Statistical confidence: propagate per-period velocity standard deviation
 *    into monthly forecast bands (±1σ). Intermittent / lumpy SKUs are flagged
 *    when ≥50% of periods have zero in-stock velocity.
 * 5. Monthly window accuracy: only months that overlap the requested window
 *    are included; effectiveDays proportion prevents phantom full-month values.
 */

import type { SalesPeriod, SellThroughAnalysis } from "@/types/sales";
import type {
  SeasonalFactors,
  MonthlyForecast,
  ProductForecast,
  VelocityTrend,
  TrendDirection,
} from "@/types/forecast";
import type { Product } from "@/types/product";
import { addMonths, getDaysInMonth, startOfMonth, format } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Exponential smoothing decay factor. Higher = more weight on recent periods. */
const EWM_ALPHA = 0.85;

/** Minimum slope (units/day per period) to classify as trending up or down. */
const TREND_SLOPE_THRESHOLD = 0.02;

/** Price-elasticity coefficient for analogous product scaling. */
export const PRICE_ELASTICITY = 1.5;

// ─── Statistical helpers ──────────────────────────────────────────────────────

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function olsSlope(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
  const meanX = (n - 1) / 2;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (y[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

// ─── Sell-Through Rate (Stockout-Adjusted) ────────────────────────────────────

/**
 * Basic STR calculation used by the API route for simple queries.
 * For full analysis with trend/confidence, use analyseVelocity().
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
  const validPeriods = periods.filter((p) => p.inStockDays > 0);

  let totalReceived = 0;
  let totalSold = 0;
  let totalInStockDays = 0;
  let totalPeriodDays = 0;

  for (const p of periods) {
    totalReceived += p.unitsReceived;
    totalSold += p.unitsSold;
    totalPeriodDays += p.totalDays;
  }
  for (const p of validPeriods) {
    totalInStockDays += p.inStockDays;
  }

  const standardStr = totalReceived > 0 ? totalSold / totalReceived : 0;
  const dailyVelocity = totalInStockDays > 0 ? totalSold / totalInStockDays : 0;
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

// ─── Full Velocity Analysis ───────────────────────────────────────────────────

export interface VelocityAnalysis {
  /** Recency-weighted daily velocity — primary forecast input */
  weightedVelocity: number;
  /** Unweighted average velocity (for display / comparison) */
  simpleVelocity: number;
  /** Population std dev of per-period velocities */
  velocityStdDev: number;
  /** Per-period velocities, sorted oldest → newest */
  periodVelocities: number[];
  trend: VelocityTrend;
  isIntermittent: boolean;
  stockoutRate: number;
  periodsAnalysed: number;
}

/**
 * Full velocity analysis with:
 * - Stockout correction
 * - Exponential recency weighting (α = 0.85)
 * - OLS trend detection
 * - Statistical std dev
 * - Intermittent demand flag
 *
 * Returns null when there are no periods with any in-stock time.
 */
export function analyseVelocity(periods: SalesPeriod[]): VelocityAnalysis | null {
  const validPeriods = periods
    .filter((p) => p.inStockDays > 0)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  if (validPeriods.length === 0) return null;

  const periodVelocities = validPeriods.map((p) => p.unitsSold / p.inStockDays);
  const n = periodVelocities.length;

  // Exponential recency weights: oldest = α^(n-1), newest = α^0 = 1, normalised
  const rawWeights = periodVelocities.map((_, i) => EWM_ALPHA ** (n - 1 - i));
  const totalWeight = rawWeights.reduce((s, w) => s + w, 0);
  const weights = rawWeights.map((w) => w / totalWeight);

  const weightedVelocity = periodVelocities.reduce((s, v, i) => s + v * weights[i], 0);
  const simpleVelocity = periodVelocities.reduce((s, v) => s + v, 0) / n;
  const velocityStdDev = stdDev(periodVelocities);

  // Trend: OLS regression, project one period forward
  const { slope } = olsSlope(periodVelocities);
  const projectedVelocity = Math.max(0, periodVelocities[n - 1] + slope);
  let direction: TrendDirection = "flat";
  if (slope > TREND_SLOPE_THRESHOLD) direction = "up";
  else if (slope < -TREND_SLOPE_THRESHOLD) direction = "down";

  const trend: VelocityTrend = { direction, slopePerPeriod: slope, projectedVelocity };

  // Intermittent: ≥50% of all periods (inc. zero-sales) have zero velocity
  const zeroPeriods = periods.filter((p) => p.inStockDays === 0 || p.unitsSold === 0).length;
  const isIntermittent = zeroPeriods / periods.length >= 0.5;

  const totalPeriodDays = periods.reduce((s, p) => s + p.totalDays, 0);
  const totalInStockDays = validPeriods.reduce((s, p) => s + p.inStockDays, 0);
  const stockoutRate =
    totalPeriodDays > 0 ? (totalPeriodDays - totalInStockDays) / totalPeriodDays : 0;

  return {
    weightedVelocity,
    simpleVelocity,
    velocityStdDev,
    periodVelocities,
    trend,
    isIntermittent,
    stockoutRate,
    periodsAnalysed: periods.length,
  };
}

// ─── Seasonal uplift ──────────────────────────────────────────────────────────

export function getSeasonalMultiplier(month: number, factors: SeasonalFactors): number {
  return factors[String(month)] ?? 1.0;
}

export function buildSeasonalProfile(
  year: number,
  factors: SeasonalFactors
): { month: number; multiplier: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return { month, multiplier: getSeasonalMultiplier(month, factors) };
  });
}

// ─── Monthly Forecast Generation ─────────────────────────────────────────────

/**
 * Generate a monthly forecast for a product over a window.
 *
 * Confidence bands (unitsLow / unitsHigh) are derived from ±1σ of the
 * velocity standard deviation propagated through seasonal scaling.
 *
 * @param scenarioMultiplier  1.0 = base, 1.2 = bull, 0.8 = bear
 */
export function generateMonthlyForecast(params: {
  product: Product;
  dailyVelocity: number;
  velocityStdDev?: number;
  seasonalFactors: SeasonalFactors;
  windowStart: string;
  windowEnd: string;
  scenarioMultiplier?: number;
}): MonthlyForecast[] {
  const {
    product,
    dailyVelocity,
    velocityStdDev = 0,
    seasonalFactors,
    windowStart,
    windowEnd,
    scenarioMultiplier = 1.0,
  } = params;

  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const results: MonthlyForecast[] = [];

  let cursor = startOfMonth(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const daysInMonth = getDaysInMonth(cursor);
    const monthEnd = addMonths(cursor, 1);

    // Clip month to forecast window boundaries
    const effectiveStart = cursor < start ? start : cursor;
    const effectiveEnd = monthEnd > end ? end : monthEnd;
    const effectiveDays = Math.max(
      0,
      (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (effectiveDays <= 0) {
      cursor = addMonths(cursor, 1);
      continue;
    }

    const dayRatio = effectiveDays / daysInMonth;
    const seasonalMultiplier = getSeasonalMultiplier(month, seasonalFactors);
    const effectiveVelocity = dailyVelocity * scenarioMultiplier;
    const effectiveStdDev = velocityStdDev * scenarioMultiplier;

    const baseUnitsRaw = effectiveVelocity * daysInMonth * dayRatio;
    const adjustedUnits = Math.round(baseUnitsRaw * seasonalMultiplier);

    // ±1σ bands in unit space
    const sdUnits = effectiveStdDev * daysInMonth * dayRatio * seasonalMultiplier;
    const unitsLow = Math.max(0, Math.round(adjustedUnits - sdUnits));
    const unitsHigh = Math.round(adjustedUnits + sdUnits);

    const revenueCents = adjustedUnits * product.rrpCents;
    const costCents = adjustedUnits * product.landedCostCents;
    const grossProfitCents = revenueCents - costCents;
    const grossMarginPct = revenueCents > 0 ? (grossProfitCents / revenueCents) * 100 : 0;

    results.push({
      year,
      month,
      period: format(cursor, "yyyy-MM"),
      baseUnits: Math.round(baseUnitsRaw),
      seasonalMultiplier,
      adjustedUnits,
      unitsLow,
      unitsHigh,
      revenueCents,
      costCents,
      grossProfitCents,
      grossMarginPct,
    });

    cursor = addMonths(cursor, 1);
  }

  return results;
}

// ─── Product Forecast Assembly ────────────────────────────────────────────────

/**
 * Roll up monthly forecasts into a ProductForecast summary.
 * Pass velocityStdDev to propagate statistical confidence into monthly bands.
 */
export function buildProductForecast(params: {
  product: Product;
  dailyVelocity: number;
  velocityStdDev?: number;
  velocitySource: ProductForecast["velocitySource"];
  seasonalFactors: SeasonalFactors;
  windowStart: string;
  windowEnd: string;
  scenarioMultiplier?: number;
  trend?: VelocityTrend;
  isIntermittent?: boolean;
  stockoutRate?: number;
  periodsAnalysed?: number;
  /** For new products: explicit total confidence overrides */
  totalUnitsLowOverride?: number;
  totalUnitsHighOverride?: number;
}): ProductForecast {
  const {
    product,
    dailyVelocity,
    velocityStdDev = 0,
    velocitySource,
    seasonalFactors,
    windowStart,
    windowEnd,
    scenarioMultiplier = 1.0,
    trend,
    isIntermittent = false,
    stockoutRate = 0,
    periodsAnalysed = 0,
    totalUnitsLowOverride,
    totalUnitsHighOverride,
  } = params;

  const monthly = generateMonthlyForecast({
    product,
    dailyVelocity,
    velocityStdDev,
    seasonalFactors,
    windowStart,
    windowEnd,
    scenarioMultiplier,
  });

  const totalUnits = monthly.reduce((s, m) => s + m.adjustedUnits, 0);
  const totalUnitsLow = totalUnitsLowOverride ?? monthly.reduce((s, m) => s + m.unitsLow, 0);
  const totalUnitsHigh = totalUnitsHighOverride ?? monthly.reduce((s, m) => s + m.unitsHigh, 0);

  const totalRevenueCents = monthly.reduce((s, m) => s + m.revenueCents, 0);
  const totalCostCents = monthly.reduce((s, m) => s + m.costCents, 0);
  const totalGrossProfitCents = totalRevenueCents - totalCostCents;
  const overallGrossMarginPct =
    totalRevenueCents > 0 ? (totalGrossProfitCents / totalRevenueCents) * 100 : 0;

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    velocitySource,
    dailyVelocity,
    velocityStdDev: velocityStdDev > 0 ? velocityStdDev : undefined,
    periodsAnalysed,
    stockoutRate,
    trend,
    isIntermittent,
    monthly,
    totalUnits,
    totalUnitsLow,
    totalUnitsHigh,
    totalRevenueCents,
    totalCostCents,
    totalGrossProfitCents,
    overallGrossMarginPct,
  };
}
