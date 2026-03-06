export interface BoxDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightGrams: number;
}

export interface SizeRun {
  size: string;
  /** Percentage of total order, 0–100. All sizes in a curve must sum to 100. */
  pct: number;
}

export interface SizeCurve {
  label: string;
  sizes: SizeRun[];
}

/** Categories for which size curves are automatically shown */
export const SIZE_CURVE_CATEGORIES = new Set(["Apparel", "Footwear"]);

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  subCategory?: string;
  /** ID of the supplier for this product */
  supplierId?: string;
  /** RRP in cents */
  rrpCents: number;
  /** Cost price (ex-works) in cents */
  costCents: number;
  /** Landed cost (inc. freight + duties) in cents */
  landedCostCents: number;
  /** Freight + duty factor, e.g. 1.15 = 15% on top of cost */
  landedCostFactor: number;
  boxDimensions?: BoxDimensions;
  /** Units per carton */
  unitsPerCarton: number;
  /** Size curve for apparel/footwear — percentages per size */
  sizeCurve?: SizeCurve;
  isActive: boolean;
  isNewToMarket: boolean;
  /** ID of analogous product used for new-to-market prediction */
  analogousProductId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;
