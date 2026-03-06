export interface SalesPeriod {
  id: string;
  productId: string;
  /** ISO date: start of the period being recorded */
  periodStart: string;
  /** ISO date: end of the period being recorded */
  periodEnd: string;
  /** Total days in the period */
  totalDays: number;
  /** Days the product was actually in stock */
  inStockDays: number;
  /** Units received at the start of this period (or during) */
  unitsReceived: number;
  /** Units sold during the period */
  unitsSold: number;
  /** Opening stock at start of period */
  openingStock: number;
  /** Closing stock at end of period */
  closingStock: number;
  /** Was this period affected by a stockout? */
  hadStockout: boolean;
  notes?: string;
  createdAt: string;
}

export type SalesPeriodFormData = Omit<SalesPeriod, "id" | "createdAt">;

/** Aggregated sell-through analysis for a product */
export interface SellThroughAnalysis {
  productId: string;
  /** Standard STR: unitsSold / unitsReceived */
  standardStr: number;
  /** Adjusted STR: based on in-stock days only */
  adjustedStr: number;
  /** Average daily velocity (units/day, in-stock only) */
  dailyVelocity: number;
  /** Projected annual demand based on velocity */
  projectedAnnualDemand: number;
  periodsAnalysed: number;
  /** Percentage of days lost to stockouts */
  stockoutRate: number;
}
