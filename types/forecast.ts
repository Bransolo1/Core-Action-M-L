export interface SeasonalFactors {
  /** Key: month number 1-12, value: multiplier (1.0 = no change) */
  [month: string]: number;
}

export interface CategorySeasonalConfig {
  category: string;
  factors: SeasonalFactors;
}

// ─── Trend ────────────────────────────────────────────────────────────────────

export type TrendDirection = "up" | "flat" | "down";

export interface VelocityTrend {
  /** Directional classification */
  direction: TrendDirection;
  /**
   * Velocity slope in units/day per period (positive = accelerating demand).
   * Derived from OLS regression over per-period velocities, oldest → newest.
   */
  slopePerPeriod: number;
  /**
   * Projected daily velocity at end of forecast window,
   * extrapolating the trend from the last observed period.
   */
  projectedVelocity: number;
}

// ─── Monthly Forecast ────────────────────────────────────────────────────────

export interface MonthlyForecast {
  year: number;
  month: number;
  /** e.g. "2025-07" */
  period: string;
  /** Flat (no-seasonal) unit estimate for the month */
  baseUnits: number;
  seasonalMultiplier: number;
  /** Seasonally adjusted units — the primary forecast */
  adjustedUnits: number;
  /** 1-sigma low (bear case) */
  unitsLow: number;
  /** 1-sigma high (bull case) */
  unitsHigh: number;
  /** Revenue forecast in cents */
  revenueCents: number;
  /** Cost forecast in cents */
  costCents: number;
  /** Gross profit in cents */
  grossProfitCents: number;
  grossMarginPct: number;
}

// ─── Product Forecast ────────────────────────────────────────────────────────

export interface ProductForecast {
  productId: string;
  sku: string;
  name: string;
  category: string;

  /** Where this velocity came from */
  velocitySource: "historical" | "new-product" | "manual";

  /**
   * Base daily velocity (units/day) used for the forecast.
   * For historical products this is the recency-weighted average.
   * For new products this is the analogous/category estimate.
   */
  dailyVelocity: number;

  /**
   * Standard deviation of daily velocity across historical periods.
   * Undefined for new products.
   */
  velocityStdDev?: number;

  /**
   * Number of sales periods used in velocity calculation.
   */
  periodsAnalysed: number;

  /**
   * Fraction of total period days lost to stockouts (0–1).
   */
  stockoutRate: number;

  /** Demand trend derived from period-over-period velocity changes */
  trend?: VelocityTrend;

  /**
   * Whether this product shows intermittent / lumpy demand
   * (many zero-sales periods with occasional bursts).
   */
  isIntermittent: boolean;

  monthly: MonthlyForecast[];

  /** Total base-case units over forecast window */
  totalUnits: number;
  /** Bear-case total units (−1σ or new-product low) */
  totalUnitsLow: number;
  /** Bull-case total units (+1σ or new-product high) */
  totalUnitsHigh: number;

  totalRevenueCents: number;
  totalCostCents: number;
  totalGrossProfitCents: number;
  overallGrossMarginPct: number;
}

// ─── Forecast Run ────────────────────────────────────────────────────────────

/** Demand scenario used when building the forecast */
export type ForecastScenario = "base" | "bull" | "bear";

export interface ForecastRun {
  id: string;
  name: string;
  createdAt: string;
  windowStart: string;
  windowEnd: string;
  /** The scenario multiplier applied during this run */
  scenario: ForecastScenario;
  /** Multiplier applied to all base velocities for this scenario */
  scenarioMultiplier: number;
  orderCycleId?: string;
  products: ProductForecast[];
  /** Products that failed to forecast (SKU + error message) */
  errors: { sku: string; message: string }[];
  notes?: string;
}
