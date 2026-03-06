/**
 * New-to-market product velocity prediction.
 *
 * When a product has no sales history, we estimate velocity by:
 * 1. Using the analogous product's adjusted daily velocity (if specified)
 * 2. Falling back to the category average velocity
 * 3. Applying a price-tier adjustment (higher price = lower volume)
 *
 * Returns velocity with a confidence range.
 */

import type { Product } from "@/types/product";
import type { SellThroughAnalysis } from "@/types/sales";

export interface NewProductPrediction {
  estimatedDailyVelocity: number;
  confidenceLow: number;
  confidenceHigh: number;
  basisProductId?: string;
  method: "analogous" | "category-average" | "manual";
  note: string;
}

/**
 * Predict velocity for a new product.
 *
 * @param product            The new product
 * @param analogousAnalysis  STA of the analogous product (if available)
 * @param categoryAvgVelocity  Average daily velocity for the category
 */
export function predictNewProductVelocity(
  product: Product,
  analogousAnalysis: SellThroughAnalysis | null,
  categoryAvgVelocity: number
): NewProductPrediction {
  let base: number;
  let method: NewProductPrediction["method"];
  let basisProductId: string | undefined;
  let note: string;

  if (analogousAnalysis && analogousAnalysis.dailyVelocity > 0) {
    base = analogousAnalysis.dailyVelocity;
    method = "analogous";
    basisProductId = product.analogousProductId;
    note = `Based on analogous product velocity of ${base.toFixed(2)} units/day.`;
  } else if (categoryAvgVelocity > 0) {
    base = categoryAvgVelocity;
    method = "category-average";
    note = `Based on category average velocity of ${base.toFixed(2)} units/day.`;
  } else {
    // Minimal fallback
    base = 0.5;
    method = "manual";
    note = "No historical data available. Using conservative estimate of 0.5 units/day.";
  }

  // Apply a ±30% confidence range for new products (wider = more uncertainty)
  const confidenceLow = base * 0.7;
  const confidenceHigh = base * 1.3;

  return {
    estimatedDailyVelocity: base,
    confidenceLow,
    confidenceHigh,
    basisProductId,
    method,
    note,
  };
}

/**
 * Calculate the category average daily velocity from a set of analyses.
 */
export function categoryAverageVelocity(analyses: SellThroughAnalysis[]): number {
  if (analyses.length === 0) return 0;
  const total = analyses.reduce((s, a) => s + a.dailyVelocity, 0);
  return total / analyses.length;
}
