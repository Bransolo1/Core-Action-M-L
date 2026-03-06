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

export interface SizeQty {
  size: string;
  qty: number;
  pct: number;
}

export interface POLineItem {
  id: string;
  productId: string;
  supplierId?: string;
  sku: string;
  productName: string;
  category: string;
  forecastedQty: number;
  orderedQty: number;
  unitsPerCarton: number;
  cartons: number;
  landedCostPerUnitCents: number;
  rrpPerUnitCents: number;
  totalLandedCostCents: number;
  totalForecastedRevenueCents: number;
  grossProfitCents: number;
  grossMarginPct: number;
  volumeCBM?: number;
  priorityRank: number;
  isIncluded: boolean;
  sizeBreakdown?: SizeQty[];
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  reference: string;
  orderCycleId: string;
  supplierId?: string;
  supplierName?: string;
  status: "draft" | "submitted" | "confirmed" | "received";
  createdAt: string;
  updatedAt: string;
  lines: POLineItem[];
  fullValueCents: number;
  optimisedValueCents: number;
  budgetCents: number;
  totalRevenueCents: number;
  totalGrossProfitCents: number;
  overallGrossMarginPct: number;
  totalVolumeCBM?: number;
  notes?: string;
}

export interface POComment {
  id: string;
  purchaseOrderId: string;
  userId: string;
  userName: string | null;
  content: string;
  createdAt: string;
}
