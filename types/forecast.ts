export interface SeasonalFactors {
  /** Key: month number 1-12, value: multiplier (1.0 = no change) */
  [month: string]: number;
}

export interface CategorySeasonalConfig {
  category: string;
  factors: SeasonalFactors;
}

export interface MonthlyForecast {
  year: number;
  month: number;
  /** e.g. "2025-07" */
  period: string;
  baseUnits: number;
  seasonalMultiplier: number;
  adjustedUnits: number;
  /** Revenue forecast in cents */
  revenueCents: number;
  /** Cost forecast in cents */
  costCents: number;
  /** Gross profit in cents */
  grossProfitCents: number;
  grossMarginPct: number;
}

export interface ProductForecast {
  productId: string;
  sku: string;
  name: string;
  /** Source: 'historical' | 'new-product' | 'manual' */
  velocitySource: "historical" | "new-product" | "manual";
  dailyVelocity: number;
  monthly: MonthlyForecast[];
  /** Total units over forecast window */
  totalUnits: number;
  totalRevenueCents: number;
  totalCostCents: number;
  totalGrossProfitCents: number;
  overallGrossMarginPct: number;
  /** For new products: confidence range */
  confidenceLow?: number;
  confidenceHigh?: number;
}

export interface ForecastRun {
  id: string;
  name: string;
  createdAt: string;
  windowStart: string;
  windowEnd: string;
  orderCycleId?: string;
  products: ProductForecast[];
  notes?: string;
}
