/**
 * Purchase order generation and optimisation utilities.
 */

import type { Product } from "@/types/product";
import type { ProductForecast } from "@/types/forecast";
import type { POLineItem, PurchaseOrder, OrderCycle } from "@/types/purchase-order";
import { totalVolumeCBM } from "@/lib/volumetrics";
import { calculateGrossMarginPct } from "@/lib/costs";
import { nanoid } from "@/lib/nanoid";

/**
 * Build PO line items from a set of product forecasts.
 * Quantity = forecastedQty for the order cycle window.
 */
export function buildPOLines(params: {
  forecasts: ProductForecast[];
  products: Product[];
}): POLineItem[] {
  const { forecasts, products } = params;
  const productMap = new Map(products.map((p) => [p.id, p]));

  return forecasts
    .map((forecast, index): POLineItem | null => {
      const product = productMap.get(forecast.productId);
      if (!product) return null;

      const orderedQty = Math.max(forecast.totalUnits, 0);
      const cartons = Math.ceil(orderedQty / product.unitsPerCarton);
      const totalLandedCostCents = orderedQty * product.landedCostCents;
      const totalForecastedRevenueCents = orderedQty * product.rrpCents;
      const grossProfitCents = totalForecastedRevenueCents - totalLandedCostCents;
      const grossMarginPct = calculateGrossMarginPct(
        totalForecastedRevenueCents,
        totalLandedCostCents
      );

      let volumeCBM: number | undefined;
      if (product.boxDimensions) {
        volumeCBM = totalVolumeCBM({
          dims: product.boxDimensions,
          units: orderedQty,
          unitsPerCarton: product.unitsPerCarton,
        });
      }

      return {
        id: nanoid(),
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        category: product.category,
        forecastedQty: orderedQty,
        orderedQty,
        unitsPerCarton: product.unitsPerCarton,
        cartons,
        landedCostPerUnitCents: product.landedCostCents,
        rrpPerUnitCents: product.rrpCents,
        totalLandedCostCents,
        totalForecastedRevenueCents,
        grossProfitCents,
        grossMarginPct,
        volumeCBM,
        priorityRank: index + 1,
        isIncluded: true,
      };
    })
    .filter((l): l is POLineItem => l !== null);
}

/**
 * Apply budget optimisation to PO lines.
 * Sorts by gross margin % desc, includes lines greedily until budget is used.
 */
export function applyBudgetOptimisation(lines: POLineItem[], budgetCents: number): POLineItem[] {
  const sorted = [...lines].sort((a, b) => b.grossMarginPct - a.grossMarginPct);
  let remaining = budgetCents;
  let rank = 1;

  const result: POLineItem[] = sorted.map((line) => {
    if (remaining <= 0) {
      return { ...line, isIncluded: false, priorityRank: rank++ };
    }

    if (line.totalLandedCostCents <= remaining) {
      remaining -= line.totalLandedCostCents;
      return { ...line, isIncluded: true, priorityRank: rank++ };
    }

    // Try partial quantity
    const affordableQty = Math.floor(remaining / line.landedCostPerUnitCents);
    if (affordableQty > 0) {
      const cartons = Math.ceil(affordableQty / line.unitsPerCarton);
      const totalLandedCostCents = affordableQty * line.landedCostPerUnitCents;
      const totalForecastedRevenueCents = affordableQty * line.rrpPerUnitCents;
      const grossProfitCents = totalForecastedRevenueCents - totalLandedCostCents;
      const grossMarginPct = calculateGrossMarginPct(
        totalForecastedRevenueCents,
        totalLandedCostCents
      );
      remaining -= totalLandedCostCents;
      return {
        ...line,
        orderedQty: affordableQty,
        cartons,
        totalLandedCostCents,
        totalForecastedRevenueCents,
        grossProfitCents,
        grossMarginPct,
        isIncluded: true,
        priorityRank: rank++,
      };
    }

    return { ...line, isIncluded: false, priorityRank: rank++ };
  });

  return result;
}

/**
 * Assemble a full PurchaseOrder from lines and cycle context.
 */
export function assemblePurchaseOrder(params: {
  lines: POLineItem[];
  cycle: OrderCycle;
  supplierName?: string;
  notes?: string;
}): PurchaseOrder {
  const { lines, cycle } = params;

  const included = lines.filter((l) => l.isIncluded);
  const fullValueCents = lines.reduce((s, l) => s + l.totalLandedCostCents, 0);
  const optimisedValueCents = included.reduce((s, l) => s + l.totalLandedCostCents, 0);
  const totalRevenueCents = included.reduce((s, l) => s + l.totalForecastedRevenueCents, 0);
  const totalGrossProfitCents = included.reduce((s, l) => s + l.grossProfitCents, 0);
  const overallGrossMarginPct = calculateGrossMarginPct(totalRevenueCents, optimisedValueCents);
  const totalVolumeCBMVal = included.reduce((s, l) => s + (l.volumeCBM ?? 0), 0);

  return {
    id: nanoid(),
    reference: `PO-${cycle.type.toUpperCase()}-${Date.now()}`,
    orderCycleId: cycle.id,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lines,
    fullValueCents,
    optimisedValueCents,
    budgetCents: cycle.budgetCents,
    totalRevenueCents,
    totalGrossProfitCents,
    overallGrossMarginPct,
    totalVolumeCBM: totalVolumeCBMVal,
    supplierName: params.supplierName,
    notes: params.notes,
  };
}
