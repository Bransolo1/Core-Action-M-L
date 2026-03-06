/**
 * Comprehensive forecasting engine tests.
 *
 * Validates against academic best practices:
 *  - Censored demand estimation (Vulcano et al., Talluri & van Ryzin)
 *  - Multiplicative seasonal decomposition (Holt-Winters family)
 *  - Analogous-product new-SKU prediction (Fisher & Raman)
 *  - Fractional knapsack budget optimisation (greedy by margin)
 *
 * Coverage includes:
 *  - calculateSellThrough: stockout-adjusted velocity & mathematical identities
 *  - generateMonthlyForecast: seasonal uplift, partial months, cross-year
 *  - buildProductForecast: rollup conservation laws
 *  - predictNewProductVelocity: analogous, category, fallback paths
 *  - categoryAverageVelocity: aggregation correctness
 *  - getFactorsForCategory / buildSeasonalProfile: lookup & default fallback
 *  - optimisePOForBudget: knapsack edge cases
 *  - chargeableWeightKg / cartonsInSpace: volumetric edge cases
 */

import { describe, it, expect } from "vitest";
import {
  calculateSellThrough,
  getSeasonalMultiplier,
  buildSeasonalProfile,
  generateMonthlyForecast,
  buildProductForecast,
} from "../forecasting";
import { getFactorsForCategory, DEFAULT_SEASONAL_FACTORS, ACTION_SPORTS_SEASONAL_AU } from "../seasonal";
import { predictNewProductVelocity, categoryAverageVelocity } from "../new-product";
import { optimisePOForBudget, calculateGrossMarginPct, calculateMarkup, forecastRevenue, forecastCost, forecastGrossProfit } from "../costs";
import { chargeableWeightKg, cartonsInSpace, cartonVolumeCBM } from "../volumetrics";
import type { SalesPeriod, SellThroughAnalysis } from "@/types/sales";
import type { Product } from "@/types/product";
import type { SeasonalFactors } from "@/types/forecast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePeriod(overrides: Partial<SalesPeriod> = {}): SalesPeriod {
  return {
    id: "sp-1",
    productId: "prod-1",
    periodStart: "2024-01-01",
    periodEnd: "2024-03-31",
    totalDays: 90,
    inStockDays: 90,
    unitsReceived: 100,
    unitsSold: 80,
    openingStock: 100,
    closingStock: 20,
    hadStockout: false,
    createdAt: "2024-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    sku: "TEST-001",
    name: "Test Product",
    category: "Skateboarding",
    rrpCents: 8995,
    costCents: 3500,
    landedCostCents: 4025,
    landedCostFactor: 1.15,
    unitsPerCarton: 10,
    minOrderQty: 1,
    leadTimeDays: 0,
    isActive: true,
    isNewToMarket: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const FLAT_FACTORS: SeasonalFactors = { ...DEFAULT_SEASONAL_FACTORS };

// ==========================================================================
// 1. CENSORED DEMAND ESTIMATION — calculateSellThrough
// ==========================================================================

describe("calculateSellThrough — censored demand estimation", () => {
  it("returns zero analysis for empty input", () => {
    const r = calculateSellThrough([]);
    expect(r.standardStr).toBe(0);
    expect(r.adjustedStr).toBe(0);
    expect(r.dailyVelocity).toBe(0);
    expect(r.projectedAnnualDemand).toBe(0);
    expect(r.periodsAnalysed).toBe(0);
    expect(r.stockoutRate).toBe(0);
  });

  describe("mathematical identity: adjustedStr ≡ inStockDays / totalPeriodDays", () => {
    /**
     * Academic insight: when we define
     *   velocity = sold / inStockDays
     *   adjustedDemand = velocity × totalDays
     *   adjustedStr = sold / adjustedDemand
     * Then: adjustedStr = sold / (sold/inStockDays × totalDays) = inStockDays / totalDays
     *
     * This identity means adjusted STR is the in-stock availability rate.
     */
    const cases = [
      { sold: 100, inStock: 30, total: 90, label: "severe stockout (33%)" },
      { sold: 80, inStock: 90, total: 90, label: "no stockout (100%)" },
      { sold: 50, inStock: 45, total: 90, label: "50% stockout" },
      { sold: 200, inStock: 60, total: 60, label: "full availability" },
      { sold: 1, inStock: 1, total: 365, label: "extreme stockout (1/365)" },
    ];

    for (const { sold, inStock, total, label } of cases) {
      it(`holds for ${label}`, () => {
        const period = makePeriod({
          unitsSold: sold,
          unitsReceived: sold,
          inStockDays: inStock,
          totalDays: total,
        });
        const r = calculateSellThrough([period]);
        expect(r.adjustedStr).toBeCloseTo(inStock / total, 6);
      });
    }
  });

  describe("velocity = unitsSold / inStockDays (censored demand rate)", () => {
    it("CLAUDE.md worked example: 100 sold in 30/90 days → 3.33/day", () => {
      const period = makePeriod({
        unitsReceived: 100,
        unitsSold: 100,
        totalDays: 90,
        inStockDays: 30,
        hadStockout: true,
        closingStock: 0,
      });
      const r = calculateSellThrough([period]);
      expect(r.dailyVelocity).toBeCloseTo(100 / 30, 4);
      expect(r.projectedAnnualDemand).toBeCloseTo((100 / 30) * 365, 0);
    });

    it("no stockout: velocity = sold / period length", () => {
      const period = makePeriod({
        unitsSold: 60,
        unitsReceived: 100,
        inStockDays: 90,
        totalDays: 90,
      });
      const r = calculateSellThrough([period]);
      expect(r.dailyVelocity).toBeCloseTo(60 / 90, 6);
    });
  });

  describe("stockout rate = (totalDays − inStockDays) / totalDays", () => {
    it("calculates correctly for mixed availability", () => {
      const period = makePeriod({ totalDays: 100, inStockDays: 75 });
      const r = calculateSellThrough([period]);
      expect(r.stockoutRate).toBeCloseTo(0.25, 6);
    });

    it("returns 0 when fully in stock", () => {
      const period = makePeriod({ totalDays: 90, inStockDays: 90 });
      const r = calculateSellThrough([period]);
      expect(r.stockoutRate).toBe(0);
    });
  });

  describe("multi-period aggregation", () => {
    it("pools in-stock days across periods (weighted velocity)", () => {
      const p1 = makePeriod({
        unitsSold: 100,
        unitsReceived: 100,
        inStockDays: 30,
        totalDays: 90,
      });
      const p2 = makePeriod({
        id: "sp-2",
        unitsSold: 50,
        unitsReceived: 50,
        inStockDays: 50,
        totalDays: 90,
      });
      const r = calculateSellThrough([p1, p2]);

      expect(r.dailyVelocity).toBeCloseTo(150 / 80, 4);
      expect(r.periodsAnalysed).toBe(2);
      expect(r.stockoutRate).toBeCloseTo((180 - 80) / 180, 4);
    });

    it("standard STR uses total received, not demand", () => {
      const p1 = makePeriod({ unitsSold: 90, unitsReceived: 100 });
      const p2 = makePeriod({ unitsSold: 45, unitsReceived: 50, id: "sp-2" });
      const r = calculateSellThrough([p1, p2]);
      expect(r.standardStr).toBeCloseTo(135 / 150, 6);
    });
  });

  describe("edge cases", () => {
    it("guards against 0 inStockDays (clamps to 1)", () => {
      const period = makePeriod({
        unitsSold: 10,
        unitsReceived: 10,
        inStockDays: 0,
        totalDays: 90,
      });
      const r = calculateSellThrough([period]);
      expect(r.dailyVelocity).toBeCloseTo(10 / 1, 6);
    });

    it("handles zero received (standardStr = 0)", () => {
      const period = makePeriod({
        unitsReceived: 0,
        unitsSold: 0,
        inStockDays: 90,
        totalDays: 90,
      });
      const r = calculateSellThrough([period]);
      expect(r.standardStr).toBe(0);
      expect(r.dailyVelocity).toBe(0);
    });
  });
});

// ==========================================================================
// 2. SEASONAL MULTIPLIERS
// ==========================================================================

describe("getSeasonalMultiplier", () => {
  it("returns configured value for known month", () => {
    expect(getSeasonalMultiplier(12, ACTION_SPORTS_SEASONAL_AU)).toBe(1.8);
    expect(getSeasonalMultiplier(1, ACTION_SPORTS_SEASONAL_AU)).toBe(0.7);
  });

  it("falls back to 1.0 for unconfigured month", () => {
    expect(getSeasonalMultiplier(13, FLAT_FACTORS)).toBe(1.0);
    expect(getSeasonalMultiplier(99, {})).toBe(1.0);
  });
});

describe("buildSeasonalProfile", () => {
  it("returns 12 months", () => {
    const profile = buildSeasonalProfile(2025, FLAT_FACTORS);
    expect(profile).toHaveLength(12);
    expect(profile[0].month).toBe(1);
    expect(profile[11].month).toBe(12);
  });

  it("carries through seasonal values", () => {
    const profile = buildSeasonalProfile(2025, ACTION_SPORTS_SEASONAL_AU);
    expect(profile[11].multiplier).toBe(1.8); // December
    expect(profile[0].multiplier).toBe(0.7); // January
  });
});

describe("getFactorsForCategory", () => {
  const configs = [
    { category: "Skateboarding", factors: ACTION_SPORTS_SEASONAL_AU },
    { category: "Apparel", factors: { "1": 0.5, "12": 2.5 } as SeasonalFactors },
  ];

  it("returns matching category factors (case-insensitive)", () => {
    const f = getFactorsForCategory("skateboarding", configs);
    expect(f).toEqual(ACTION_SPORTS_SEASONAL_AU);
  });

  it("falls back to default when category not found", () => {
    const f = getFactorsForCategory("Unknown", configs);
    expect(f).toEqual(DEFAULT_SEASONAL_FACTORS);
  });
});

// ==========================================================================
// 3. MONTHLY FORECAST GENERATION
// ==========================================================================

describe("generateMonthlyForecast", () => {
  const product = makeProduct();

  /**
   * IMPORTANT: windowEnd is treated as an exclusive boundary (midnight of that
   * day). "2025-03-31" = up to 2025-03-31T00:00 = 30 effective days in March.
   * To cover a full calendar month, use the 1st of the next month as windowEnd.
   */
  describe("flat seasonality (multiplier = 1.0)", () => {
    it("produces correct base units for a full-month window", () => {
      // windowEnd = first of next month → includes that month with 0 days
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 2.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-03-01",
        windowEnd: "2025-04-01",
      });

      // March entry has full 31 effective days; April entry has 0 effective days
      expect(months.length).toBeGreaterThanOrEqual(1);
      expect(months[0].month).toBe(3);
      expect(months[0].year).toBe(2025);
      expect(months[0].baseUnits).toBe(Math.round(2.0 * 31));
      expect(months[0].adjustedUnits).toBe(Math.round(2.0 * 31 * 1.0));
      expect(months[0].seasonalMultiplier).toBe(1.0);
      // Trailing month with 0 effective days has 0 units
      if (months.length > 1) {
        expect(months[1].adjustedUnits).toBe(0);
      }
    });

    it("windowEnd on last day of month gives (daysInMonth − 1) effective days", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 2.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-03-01",
        windowEnd: "2025-03-31", // 30 effective days, not 31
      });

      const effectiveDays = 30;
      const dayRatio = effectiveDays / 31;
      expect(months[0].baseUnits).toBe(Math.round(2.0 * 31 * dayRatio));
      expect(months[0].adjustedUnits).toBe(Math.round(2.0 * 31 * 1.0 * dayRatio));
    });

    it("handles a 3-month window correctly", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 3.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-01-01",
        windowEnd: "2025-04-01",
      });

      // Jan, Feb, Mar have full months; April has 0 effective days
      expect(months.length).toBeGreaterThanOrEqual(3);
      expect(months[0].adjustedUnits).toBe(Math.round(3.0 * 31)); // Jan (31d)
      expect(months[1].adjustedUnits).toBe(Math.round(3.0 * 28)); // Feb 2025 (28d)
      expect(months[2].adjustedUnits).toBe(Math.round(3.0 * 31)); // Mar (31d)
    });
  });

  describe("seasonal uplift (multiplicative model)", () => {
    it("applies December 1.8× uplift correctly", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 2.0,
        seasonalFactors: ACTION_SPORTS_SEASONAL_AU,
        windowStart: "2025-12-01",
        windowEnd: "2026-01-01",
      });

      expect(months.length).toBeGreaterThanOrEqual(1);
      expect(months[0].seasonalMultiplier).toBe(1.8);
      expect(months[0].baseUnits).toBe(Math.round(2.0 * 31));
      expect(months[0].adjustedUnits).toBe(Math.round(2.0 * 31 * 1.8));
    });

    it("applies January 0.7× downlift correctly (exclusive end)", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 10.0,
        seasonalFactors: ACTION_SPORTS_SEASONAL_AU,
        windowStart: "2025-01-01",
        windowEnd: "2025-02-01", // exclusive → full January
      });

      expect(months[0].adjustedUnits).toBe(Math.round(10 * 31 * 0.7));
    });
  });

  describe("partial months at window boundaries", () => {
    it("prorates a mid-month start", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 3.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-01-16",
        windowEnd: "2025-01-31",
      });

      expect(months).toHaveLength(1);
      const effectiveDays = 15; // Jan 16–31
      const dayRatio = effectiveDays / 31;
      expect(months[0].adjustedUnits).toBe(Math.round(3.0 * 31 * 1.0 * dayRatio));
    });

    it("prorates a mid-month end", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 2.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-03-01",
        windowEnd: "2025-03-15",
      });

      const effectiveDays = 14; // Mar 1–15 (exclusive end in date diff)
      const dayRatio = effectiveDays / 31;
      expect(months[0].adjustedUnits).toBe(Math.round(2.0 * 31 * 1.0 * dayRatio));
    });
  });

  describe("cross-year forecast window", () => {
    it("spans November 2025 through February 2026", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 1.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-11-01",
        windowEnd: "2026-02-28",
      });

      expect(months.length).toBeGreaterThanOrEqual(4);
      expect(months[0].year).toBe(2025);
      expect(months[0].month).toBe(11);
      const lastMonth = months[months.length - 1];
      expect(lastMonth.year).toBe(2026);
      expect(lastMonth.month).toBe(2);
    });
  });

  describe("revenue / cost / margin arithmetic", () => {
    it("calculates correctly per month", () => {
      const p = makeProduct({ rrpCents: 10000, landedCostCents: 5000 });
      const months = generateMonthlyForecast({
        product: p,
        dailyVelocity: 1.0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-06-01",
        windowEnd: "2025-06-30",
      });

      const m = months[0];
      expect(m.revenueCents).toBe(m.adjustedUnits * 10000);
      expect(m.costCents).toBe(m.adjustedUnits * 5000);
      expect(m.grossProfitCents).toBe(m.revenueCents - m.costCents);
      expect(m.grossMarginPct).toBeCloseTo(50, 1);
    });
  });

  describe("zero velocity", () => {
    it("produces zero units across all months", () => {
      const months = generateMonthlyForecast({
        product,
        dailyVelocity: 0,
        seasonalFactors: FLAT_FACTORS,
        windowStart: "2025-01-01",
        windowEnd: "2025-03-31",
      });

      for (const m of months) {
        expect(m.adjustedUnits).toBe(0);
        expect(m.revenueCents).toBe(0);
      }
    });
  });
});

// ==========================================================================
// 4. PRODUCT FORECAST ROLLUP — conservation laws
// ==========================================================================

describe("buildProductForecast", () => {
  const product = makeProduct();

  it("totalUnits = sum of monthly adjustedUnits", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 2.5,
      velocitySource: "historical",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-01-01",
      windowEnd: "2025-06-30",
    });

    const sumUnits = pf.monthly.reduce((s, m) => s + m.adjustedUnits, 0);
    expect(pf.totalUnits).toBe(sumUnits);
  });

  it("totalRevenueCents = sum of monthly revenueCents", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 2.5,
      velocitySource: "historical",
      seasonalFactors: ACTION_SPORTS_SEASONAL_AU,
      windowStart: "2025-01-01",
      windowEnd: "2025-12-31",
    });

    const sumRev = pf.monthly.reduce((s, m) => s + m.revenueCents, 0);
    expect(pf.totalRevenueCents).toBe(sumRev);
  });

  it("totalCostCents = sum of monthly costCents", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 1.0,
      velocitySource: "historical",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-04-01",
      windowEnd: "2025-09-30",
    });

    const sumCost = pf.monthly.reduce((s, m) => s + m.costCents, 0);
    expect(pf.totalCostCents).toBe(sumCost);
  });

  it("totalGrossProfitCents = revenue − cost", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 3.0,
      velocitySource: "historical",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-01-01",
      windowEnd: "2025-03-31",
    });

    expect(pf.totalGrossProfitCents).toBe(pf.totalRevenueCents - pf.totalCostCents);
  });

  it("overallGrossMarginPct = GP / revenue × 100", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 5.0,
      velocitySource: "historical",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-06-01",
      windowEnd: "2025-06-30",
    });

    const expected = (pf.totalGrossProfitCents / pf.totalRevenueCents) * 100;
    expect(pf.overallGrossMarginPct).toBeCloseTo(expected, 4);
  });

  it("passes through confidence range for new products", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 1.0,
      velocitySource: "new-product",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-01-01",
      windowEnd: "2025-01-31",
      confidenceLow: 0.7,
      confidenceHigh: 1.3,
    });

    expect(pf.confidenceLow).toBe(0.7);
    expect(pf.confidenceHigh).toBe(1.3);
    expect(pf.velocitySource).toBe("new-product");
  });

  it("includes product metadata", () => {
    const pf = buildProductForecast({
      product,
      dailyVelocity: 1.0,
      velocitySource: "historical",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-01-01",
      windowEnd: "2025-01-31",
    });

    expect(pf.productId).toBe(product.id);
    expect(pf.sku).toBe(product.sku);
    expect(pf.name).toBe(product.name);
  });
});

// ==========================================================================
// 5. NEW PRODUCT PREDICTION (analogous product method)
// ==========================================================================

describe("predictNewProductVelocity", () => {
  const newProduct = makeProduct({ isNewToMarket: true, analogousProductId: "analog-1" });

  it("uses analogous product velocity when available", () => {
    const analogAnalysis: SellThroughAnalysis = {
      productId: "analog-1",
      standardStr: 0.9,
      adjustedStr: 0.8,
      dailyVelocity: 4.0,
      projectedAnnualDemand: 1460,
      periodsAnalysed: 2,
      stockoutRate: 0.2,
    };
    const pred = predictNewProductVelocity(newProduct, analogAnalysis, 2.0);

    expect(pred.method).toBe("analogous");
    expect(pred.estimatedDailyVelocity).toBe(4.0);
    expect(pred.confidenceLow).toBeCloseTo(4.0 * 0.7, 6);
    expect(pred.confidenceHigh).toBeCloseTo(4.0 * 1.3, 6);
  });

  it("falls back to category average when analogous has no velocity", () => {
    const zeroAnalog: SellThroughAnalysis = {
      productId: "analog-1",
      standardStr: 0,
      adjustedStr: 0,
      dailyVelocity: 0,
      projectedAnnualDemand: 0,
      periodsAnalysed: 0,
      stockoutRate: 0,
    };
    const pred = predictNewProductVelocity(newProduct, zeroAnalog, 3.0);

    expect(pred.method).toBe("category-average");
    expect(pred.estimatedDailyVelocity).toBe(3.0);
  });

  it("falls back to category average when no analogous provided", () => {
    const pred = predictNewProductVelocity(newProduct, null, 2.5);
    expect(pred.method).toBe("category-average");
    expect(pred.estimatedDailyVelocity).toBe(2.5);
  });

  it("falls back to 0.5 manual estimate when no data available", () => {
    const pred = predictNewProductVelocity(newProduct, null, 0);
    expect(pred.method).toBe("manual");
    expect(pred.estimatedDailyVelocity).toBe(0.5);
    expect(pred.note).toContain("conservative");
  });

  it("confidence range is always ±30%", () => {
    const pred = predictNewProductVelocity(newProduct, null, 10);
    expect(pred.confidenceLow).toBeCloseTo(10 * 0.7, 6);
    expect(pred.confidenceHigh).toBeCloseTo(10 * 1.3, 6);
  });
});

describe("categoryAverageVelocity", () => {
  it("returns 0 for empty array", () => {
    expect(categoryAverageVelocity([])).toBe(0);
  });

  it("computes simple mean of daily velocities", () => {
    const analyses: SellThroughAnalysis[] = [
      { productId: "a", standardStr: 0.9, adjustedStr: 0.8, dailyVelocity: 2.0, projectedAnnualDemand: 730, periodsAnalysed: 1, stockoutRate: 0.1 },
      { productId: "b", standardStr: 0.8, adjustedStr: 0.7, dailyVelocity: 4.0, projectedAnnualDemand: 1460, periodsAnalysed: 1, stockoutRate: 0.2 },
      { productId: "c", standardStr: 0.7, adjustedStr: 0.6, dailyVelocity: 3.0, projectedAnnualDemand: 1095, periodsAnalysed: 1, stockoutRate: 0.3 },
    ];
    expect(categoryAverageVelocity(analyses)).toBeCloseTo(3.0, 6);
  });
});

// ==========================================================================
// 6. END-TO-END SCENARIO: product with stockout → forecast
// ==========================================================================

describe("end-to-end: stockout-adjusted forecast pipeline", () => {
  it("correctly recovers latent demand and produces accurate seasonal forecast", () => {
    const product = makeProduct({
      rrpCents: 10000,
      landedCostCents: 4000,
    });

    const periods: SalesPeriod[] = [
      makePeriod({
        unitsSold: 120,
        unitsReceived: 120,
        inStockDays: 40,
        totalDays: 90,
        hadStockout: true,
        closingStock: 0,
      }),
    ];

    // Step 1: Calculate sell-through (censored demand estimation)
    const sta = calculateSellThrough(periods);
    expect(sta.dailyVelocity).toBeCloseTo(120 / 40, 4); // 3.0 units/day

    // Step 2: Build forecast with December uplift (exclusive end = full month)
    const pf = buildProductForecast({
      product,
      dailyVelocity: sta.dailyVelocity,
      velocitySource: "historical",
      seasonalFactors: ACTION_SPORTS_SEASONAL_AU,
      windowStart: "2025-12-01",
      windowEnd: "2026-01-01", // exclusive end → full December (31 days)
    });

    // December: 31 days × 3.0 velocity × 1.8 seasonal = 167.4 → 167
    expect(pf.totalUnits).toBe(Math.round(3.0 * 31 * 1.8));
    expect(pf.totalRevenueCents).toBe(pf.totalUnits * 10000);
    expect(pf.totalCostCents).toBe(pf.totalUnits * 4000);

    const expectedGM = ((10000 - 4000) / 10000) * 100;
    expect(pf.overallGrossMarginPct).toBeCloseTo(expectedGM, 1);
  });

  it("new product forecast uses analogous velocity with confidence range", () => {
    const newProduct = makeProduct({
      id: "new-1",
      isNewToMarket: true,
      analogousProductId: "analog-1",
      rrpCents: 12000,
      landedCostCents: 5000,
    });

    const analogAnalysis: SellThroughAnalysis = {
      productId: "analog-1",
      standardStr: 0.95,
      adjustedStr: 0.85,
      dailyVelocity: 2.0,
      projectedAnnualDemand: 730,
      periodsAnalysed: 3,
      stockoutRate: 0.15,
    };

    const prediction = predictNewProductVelocity(newProduct, analogAnalysis, 1.5);
    expect(prediction.estimatedDailyVelocity).toBe(2.0); // uses analog

    const pf = buildProductForecast({
      product: newProduct,
      dailyVelocity: prediction.estimatedDailyVelocity,
      velocitySource: "new-product",
      seasonalFactors: FLAT_FACTORS,
      windowStart: "2025-01-01",
      windowEnd: "2025-04-01", // exclusive end → full Jan+Feb+Mar
    });

    // Jan(31) + Feb(28) + Mar(31) = 90 days × 2.0 = 180 units
    expect(pf.totalUnits).toBe(2 * 31 + 2 * 28 + 2 * 31);
    expect(pf.velocitySource).toBe("new-product");
  });
});

// ==========================================================================
// 7. BUDGET OPTIMISATION — additional edge cases
// ==========================================================================

describe("optimisePOForBudget — edge cases", () => {
  it("handles zero budget (nothing included)", () => {
    const lines = [
      { id: "a", productId: "1", orderedQty: 10, landedCostPerUnitCents: 1000, grossMarginPct: 50, totalLandedCostCents: 10000, isIncluded: true },
    ];
    const result = optimisePOForBudget(lines, 0);
    expect(result.every((l) => !l.isIncluded)).toBe(true);
  });

  it("handles single unit cost exceeding budget", () => {
    const lines = [
      { id: "a", productId: "1", orderedQty: 1, landedCostPerUnitCents: 5000, grossMarginPct: 60, totalLandedCostCents: 5000, isIncluded: true },
    ];
    const result = optimisePOForBudget(lines, 4000);
    expect(result[0].isIncluded).toBe(false);
  });

  it("empty lines returns empty", () => {
    const result = optimisePOForBudget([], 10000);
    expect(result).toHaveLength(0);
  });

  it("greedy picks highest margin first (fractional knapsack optimality)", () => {
    const lines = [
      { id: "low", productId: "1", orderedQty: 100, landedCostPerUnitCents: 100, grossMarginPct: 20, totalLandedCostCents: 10000, isIncluded: true },
      { id: "high", productId: "2", orderedQty: 100, landedCostPerUnitCents: 100, grossMarginPct: 80, totalLandedCostCents: 10000, isIncluded: true },
      { id: "mid", productId: "3", orderedQty: 100, landedCostPerUnitCents: 100, grossMarginPct: 50, totalLandedCostCents: 10000, isIncluded: true },
    ];
    const result = optimisePOForBudget(lines, 15000);
    const included = result.filter((l) => l.isIncluded);
    const excluded = result.filter((l) => !l.isIncluded);

    // High (80%) fully included, mid (50%) partially included, low (20%) excluded
    const highLine = result.find((l) => l.id === "high")!;
    const midLine = result.find((l) => l.id === "mid")!;
    const lowLine = result.find((l) => l.id === "low")!;

    expect(highLine.isIncluded).toBe(true);
    expect(highLine.orderedQty).toBe(100);
    expect(midLine.isIncluded).toBe(true);
    expect(midLine.orderedQty).toBe(50); // partial: 5000 budget left / 100 per unit = 50
    expect(lowLine.isIncluded).toBe(false);
  });
});

// ==========================================================================
// 8. ADDITIONAL COST FUNCTIONS
// ==========================================================================

describe("cost utility functions", () => {
  const product = makeProduct({ rrpCents: 10000, landedCostCents: 4000 });

  it("forecastRevenue = units × rrpCents", () => {
    expect(forecastRevenue(50, product)).toBe(50 * 10000);
  });

  it("forecastCost = units × landedCostCents", () => {
    expect(forecastCost(50, product)).toBe(50 * 4000);
  });

  it("forecastGrossProfit = revenue − cost", () => {
    expect(forecastGrossProfit(50, product)).toBe(50 * 10000 - 50 * 4000);
  });

  it("calculateMarkup: (rrp − cost) / cost × 100", () => {
    expect(calculateMarkup(10000, 4000)).toBeCloseTo(150, 1);
  });

  it("calculateMarkup returns 0 when cost is 0", () => {
    expect(calculateMarkup(10000, 0)).toBe(0);
  });
});

// ==========================================================================
// 9. ADDITIONAL VOLUMETRIC FUNCTIONS
// ==========================================================================

describe("volumetric utility functions", () => {
  const dims = { lengthMm: 800, widthMm: 200, heightMm: 100, weightGrams: 3000 };

  it("chargeableWeightKg returns max of actual vs volumetric", () => {
    const volCBM = cartonVolumeCBM(dims); // 0.8*0.2*0.1 = 0.016 CBM
    const volKg = volCBM * 167; // 2.672 kg
    const actualKg = 3.0; // 3000g
    expect(chargeableWeightKg(dims, 10)).toBeCloseTo(Math.max(volKg, actualKg), 2);
  });

  it("cartonsInSpace returns floor division", () => {
    const vol = cartonVolumeCBM(dims); // 0.016 CBM
    expect(cartonsInSpace(dims, 1.0)).toBe(Math.floor(1.0 / vol)); // 62
  });

  it("cartonsInSpace returns 0 for zero-volume box", () => {
    const zeroBox = { lengthMm: 0, widthMm: 200, heightMm: 100, weightGrams: 1000 };
    expect(cartonsInSpace(zeroBox, 10)).toBe(0);
  });
});
