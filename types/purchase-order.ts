export type OrderCycleType = "Q1" | "Q2" | "Q3" | "Q4" | "adhoc";

export interface OrderCycle {
  id: string;
  name: string;
  type: OrderCycleType;
  orderDate: string;
  expectedDeliveryDate: string;
  seasonStart: string;
  seasonEnd: string;
  /** Budget cap in cents */
  budgetCents: number;
  /** Max warehouse volume in cubic metres */
  maxVolumeCBM?: number;
  isActive: boolean;
}

export interface POLineItem {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  /** Quantity suggested by forecast */
  forecastedQty: number;
  /** Final order quantity (may be adjusted) */
  orderedQty: number;
  /** Units per carton */
  unitsPerCarton: number;
  /** Number of cartons */
  cartons: number;
  /** Landed cost per unit in cents */
  landedCostPerUnitCents: number;
  /** RRP per unit in cents */
  rrpPerUnitCents: number;
  /** Total landed cost in cents */
  totalLandedCostCents: number;
  /** Total forecasted revenue in cents */
  totalForecastedRevenueCents: number;
  /** Gross profit in cents */
  grossProfitCents: number;
  grossMarginPct: number;
  /** Volume in cubic metres */
  volumeCBM?: number;
  priorityRank: number;
  isIncluded: boolean;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  reference: string;
  orderCycleId: string;
  status: "draft" | "submitted" | "confirmed" | "received";
  createdAt: string;
  updatedAt: string;
  lines: POLineItem[];
  /** Total value before budget optimisation */
  fullValueCents: number;
  /** Total value after budget optimisation */
  optimisedValueCents: number;
  /** Budget ceiling in cents */
  budgetCents: number;
  /** Total forecasted revenue in cents */
  totalRevenueCents: number;
  /** Total gross profit in cents */
  totalGrossProfitCents: number;
  overallGrossMarginPct: number;
  /** Total volume in cubic metres */
  totalVolumeCBM?: number;
  supplierName?: string;
  notes?: string;
}
