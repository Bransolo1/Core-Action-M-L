import type { SeasonalFactors, CategorySeasonalConfig } from "@/types/forecast";

/** Default seasonal factors — evenly balanced (no uplift) */
export const DEFAULT_SEASONAL_FACTORS: SeasonalFactors = {
  "1": 1.0,
  "2": 1.0,
  "3": 1.0,
  "4": 1.0,
  "5": 1.0,
  "6": 1.0,
  "7": 1.0,
  "8": 1.0,
  "9": 1.0,
  "10": 1.0,
  "11": 1.0,
  "12": 1.0,
};

/** Action sports seasonal preset (Southern Hemisphere / Australian market) */
export const ACTION_SPORTS_SEASONAL_AU: SeasonalFactors = {
  "1": 0.7, // January — post-Christmas slump
  "2": 0.8,
  "3": 0.9,
  "4": 1.0, // Easter uplift baked into April
  "5": 0.9,
  "6": 1.1, // Mid-year school holidays
  "7": 1.3, // Peak winter school holidays
  "8": 1.0,
  "9": 1.0,
  "10": 1.1,
  "11": 1.3, // Pre-Christmas stocking
  "12": 1.8, // Christmas peak
};

export function getFactorsForCategory(
  category: string,
  configs: CategorySeasonalConfig[]
): SeasonalFactors {
  const config = configs.find((c) => c.category.toLowerCase() === category.toLowerCase());
  return config?.factors ?? DEFAULT_SEASONAL_FACTORS;
}

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMultiplier(v: number): string {
  return `${v.toFixed(2)}×`;
}
