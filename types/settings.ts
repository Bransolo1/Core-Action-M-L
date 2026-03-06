import type { CategorySeasonalConfig } from "./forecast";
import type { OrderCycle } from "./purchase-order";

export interface AppSettings {
  businessName: string;
  currency: string;
  /** Default landed cost factor, e.g. 1.15 */
  defaultLandedCostFactor: number;
  /** Default order cycles for the year */
  orderCycles: OrderCycle[];
  /** Seasonal factors per category */
  seasonalConfigs: CategorySeasonalConfig[];
  /** Default gross margin target % */
  targetGrossMarginPct: number;
  /** Default forecast window in days */
  defaultForecastWindowDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: "Core Action Sports",
  currency: "GBP",
  defaultLandedCostFactor: 1.15,
  orderCycles: [],
  seasonalConfigs: [],
  targetGrossMarginPct: 50,
  defaultForecastWindowDays: 90,
};
