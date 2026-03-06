/**
 * New-to-market product velocity prediction.
 *
 * When a product has no sales history we estimate demand by:
 *
 * 1. ANALOGOUS PRODUCT (preferred)
 *    Start from the analogous SKU's recency-weighted velocity, then
 *    scale by a price-elasticity factor:
 *      adjusted = analogue_velocity × (analogue_rrp / new_rrp) ^ ELASTICITY
 *    Action sports: elasticity ≈ 1.5 (moderately price-sensitive)
 *
 * 2. CATEGORY MEDIAN
 *    Median (not mean) of non-new historical SKU velocities in the same
 *    category. More robust when one or two outliers skew the distribution.
 *    Price-adjusted in the same way as above, using the category median RRP.
 *
 * 3. CONSERVATIVE FALLBACK
 *    0.5 units/day with a very wide confidence band (±60%) when no reference
 *    data exists at all.
 *
 * CONFIDENCE BANDS
 * ────────────────
 * Bands are adaptive, not fixed ±30%:
 *   - Method = analogous: ±(1σ of analogue's period velocities), min ±20%
 *   - Method = category median: ±(1σ of category velocities), min ±30%
 *   - Method = fallback: ±60%
 *
 * LAUNCH RAMP
 * ───────────
 * New products rarely hit steady-state velocity immediately.
 * The ramp curve (applied externally per-month) is:
 *   Month 1: 50% of predicted velocity
 *   Month 2: 75%
 *   Month 3+: 100%
 * See getLaunchRampMultiplier().
 */

import type { Product } from "@/types/product";
import type { SellThroughAnalysis } from "@/types/sales";
import { PRICE_ELASTICITY } from "@/lib/forecasting";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewProductPrediction {
  estimatedDailyVelocity: number;
  confidenceLow: number;
  confidenceHigh: number;
  /** SKU ID of the reference product (analogous or category rep) */
  basisProductId?: string;
  method: "analogous" | "category-median" | "fallback";
  /**
   * Fraction of price-elasticity adjustment applied (1.0 = no adjustment).
   * < 1 means new product is more expensive than reference → lower volume.
   * > 1 means new product is cheaper than reference → higher volume.
   */
  priceElasticityFactor: number;
  note: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDevOfArray(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/**
 * Scale a reference velocity to account for the price difference between
 * the reference product and the new product.
 *
 * Higher-priced new product → lower demand (inverse relationship)
 * Lower-priced new product → higher demand
 *
 * Returns the factor applied: >1 = boost, <1 = reduction.
 */
function priceElasticityScale(
  referenceRrpCents: number,
  newProductRrpCents: number
): number {
  if (referenceRrpCents <= 0 || newProductRrpCents <= 0) return 1;
  return (referenceRrpCents / newProductRrpCents) ** PRICE_ELASTICITY;
}

// ─── Launch Ramp ─────────────────────────────────────────────────────────────

/**
 * Multiplier to apply to a new product's velocity in month N of its life.
 * Month index is 0-based (0 = first month in range).
 *
 * Month 0: 50%  (awareness building)
 * Month 1: 75%  (growing distribution)
 * Month 2+: 100% (steady state)
 */
export function getLaunchRampMultiplier(monthIndex: number): number {
  if (monthIndex === 0) return 0.5;
  if (monthIndex === 1) return 0.75;
  return 1.0;
}

// ─── Main Predictor ───────────────────────────────────────────────────────────

/**
 * Extended analogous analysis with the product's reference RRP, so we can
 * apply price elasticity scaling.
 */
export interface AnalogousData {
  analysis: SellThroughAnalysis;
  /** Velocities from each historical period for std dev calculation */
  periodVelocities: number[];
  rrpCents: number;
}

/**
 * Extended category data with per-SKU velocities and RRPs for median + std dev.
 */
export interface CategoryAnalysisData {
  productId: string;
  dailyVelocity: number;
  rrpCents: number;
}

/**
 * Predict the steady-state daily velocity for a new product.
 *
 * @param product              The new product
 * @param analogousData        Analysis + RRP for the analogous SKU (if available)
 * @param categoryData         Velocity + RRP for each established SKU in category
 */
export function predictNewProductVelocity(
  product: Product,
  analogousData: AnalogousData | null,
  categoryData: CategoryAnalysisData[]
): NewProductPrediction {
  const established = categoryData.filter((d) => d.dailyVelocity > 0);

  // ── Method 1: Analogous product ──────────────────────────────────────────
  if (analogousData && analogousData.analysis.dailyVelocity > 0) {
    const priceFactor = priceElasticityScale(analogousData.rrpCents, product.rrpCents);
    const base = analogousData.analysis.dailyVelocity * priceFactor;

    // Adaptive band: ±1σ of analogue's period velocities, minimum ±20%
    const sd = stdDevOfArray(analogousData.periodVelocities) * priceFactor;
    const minBand = base * 0.2;
    const halfBand = Math.max(sd, minBand);

    return {
      estimatedDailyVelocity: base,
      confidenceLow: Math.max(0, base - halfBand),
      confidenceHigh: base + halfBand,
      basisProductId: product.analogousProductId,
      method: "analogous",
      priceElasticityFactor: priceFactor,
      note:
        `Based on analogous SKU velocity ${analogousData.analysis.dailyVelocity.toFixed(2)} u/day` +
        (priceFactor !== 1
          ? `, scaled ${priceFactor > 1 ? "up" : "down"} by price-elasticity factor ×${priceFactor.toFixed(2)}`
          : "") +
        `.`,
    };
  }

  // ── Method 2: Category median ─────────────────────────────────────────────
  if (established.length > 0) {
    const velocities = established.map((d) => d.dailyVelocity);
    const rrps = established.map((d) => d.rrpCents);
    const medianVelocity = median(velocities);
    const medianRrp = median(rrps);

    const priceFactor = priceElasticityScale(medianRrp, product.rrpCents);
    const base = medianVelocity * priceFactor;

    const sd = stdDevOfArray(velocities) * priceFactor;
    const minBand = base * 0.3;
    const halfBand = Math.max(sd, minBand);

    return {
      estimatedDailyVelocity: base,
      confidenceLow: Math.max(0, base - halfBand),
      confidenceHigh: base + halfBand,
      basisProductId: undefined,
      method: "category-median",
      priceElasticityFactor: priceFactor,
      note:
        `Based on category median velocity ${medianVelocity.toFixed(2)} u/day` +
        ` (${established.length} SKU${established.length !== 1 ? "s" : ""})` +
        (priceFactor !== 1
          ? `, price-adjusted ×${priceFactor.toFixed(2)}`
          : "") +
        `.`,
    };
  }

  // ── Method 3: Conservative fallback ──────────────────────────────────────
  const base = 0.5;
  return {
    estimatedDailyVelocity: base,
    confidenceLow: base * 0.4,
    confidenceHigh: base * 1.6,
    basisProductId: undefined,
    method: "fallback",
    priceElasticityFactor: 1,
    note: "No historical data available. Using conservative estimate (0.5 u/day, ±60%).",
  };
}

// ─── Legacy helper (used by API route) ───────────────────────────────────────

/**
 * Simple category average velocity — kept for backwards compatibility.
 * Prefer predictNewProductVelocity() for production forecasts.
 */
export function categoryAverageVelocity(analyses: SellThroughAnalysis[]): number {
  if (analyses.length === 0) return 0;
  const total = analyses.reduce((s, a) => s + a.dailyVelocity, 0);
  return total / analyses.length;
}
