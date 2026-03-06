export interface BoxDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightGrams: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  subCategory?: string;
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
  isActive: boolean;
  isNewToMarket: boolean;
  /** ID of analogous product used for new-to-market prediction */
  analogousProductId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;
