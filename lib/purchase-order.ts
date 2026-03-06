/**
 * Purchase order generation and optimisation — CORE Action Sports Buyer Portal
 *
 * IMPROVEMENTS OVER V1
 * ────────────────────
 * 1. Carton rounding — all quantities are rounded up to whole carton multiples.
 *    Partial cartons are physically impossible; the old code produced invalid POs.
 *
 * 2. MOQ enforcement — if a product has a supplier minimum order quantity
 *    (product.minOrderQty), the ordered quantity is raised to meet that
 *    minimum before any budget optimisation. If the MOQ itself is unaffordable,
 *    the line is excluded rather than generating a sub-MOQ order.
 *
 * 3. Safety stock buffer — when a product has a leadTimeDays value, a safety
 *    stock buffer is added on top of the forecast quantity:
 *      safetyStock = dailyVelocity × (leadTimeDays / 2) × stockoutRiskFactor
 *    stockoutRiskFactor = 1 + velocityStdDev / dailyVelocity (coefficient of
 *    variation). This means volatile SKUs carry a larger buffer.
 *
 * 4. Volume constraint — the optimisation loop checks cumulative CBM against
 *    the cycle's maxVolumeCBM cap. Lines that would breach the cap are excluded
 *    even if they fit within budget.
 *
 * 5. Contribution sort — lines are sorted by (grossMarginPct × dailyVelocity),
 *    i.e. contribution margin per time unit, not pure GM%. A fast low-margin
 *    SKU may contribute more cash than a slow high-margin one.
 */

import type { Product } from "@/types/product";
import type { ProductForecast } from "@/types/forecast";
import type { POLineItem, PurchaseOrder, OrderCycle } from "@/types/purchase-order";
import { totalVolumeCBM } from "@/lib/volumetrics";
import { calculateGrossMarginPct } from "@/lib/costs";
import { nanoid } from "@/lib/nanoid";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Round qty up to the nearest whole carton. */
function roundUpToCarton(qty: number, unitsPerCarton: number): number {
  if (unitsPerCarton <= 0) return qty;
  return Math.ceil(qty / unitsPerCarton) * unitsPerCarton;
}

/**
 * Calculate safety stock for a product based on lead time and demand variability.
 *
 * @param dailyVelocity     Base velocity (units/day)
 * @param velocityStdDev    Std dev of velocity across historical periods
 * @param leadTimeDays      Days from order to warehouse receipt
 * @returns                 Integer safety stock quantity
 */
function calcSafetyStock(
  dailyVelocity: number,
  velocityStdDev: number,
  leadTimeDays: number
): number {
  if (leadTimeDays <= 0 || dailyVelocity <= 0) return 0;
  // Coefficient of variation: higher CV = more risk = bigger buffer
  const cv = velocityStdDev > 0 ? velocityStdDev / dailyVelocity : 0;
  const stockoutRiskFactor = 1 + cv;
  const safetyStockDays = leadTimeDays / 2; // cover half the lead time as buffer
  return Math.ceil(dailyVelocity * safetyStockDays * stockoutRiskFactor);
}

/**
 * Recalculate line financials after a quantity change.
 */
function recomputeLine(
  line: POLineItem,
  newQty: number
): POLineItem {
  const cartons = Math.ceil(newQty / line.unitsPerCarton);
  const totalLandedCostCents = newQty * line.landedCostPerUnitCents;
  const totalForecastedRevenueCents = newQty * line.rrpPerUnitCents;
  const grossProfitCents = totalForecastedRevenueCents - totalLandedCostCents;
  const grossMarginPct = calculateGrossMarginPct(
    totalForecastedRevenueCents,
    totalLandedCostCents
  );
  return {
    ...line,
    orderedQty: newQty,
    cartons,
    totalLandedCostCents,
    totalForecastedRevenueCents,
    grossProfitCents,
    grossMarginPct,
  };
}

// ─── Build PO Lines ───────────────────────────────────────────────────────────

/**
 * Build PO line items from product forecasts.
 *
 * - Quantity = forecastedQty + safetyStock, rounded up to whole cartons
 * - If product.minOrderQty is set, quantity is raised to at least minOrderQty
 *   (still carton-rounded from that floor)
 * - Volume is calculated from box dimensions if available
 * - Contribution score (for optimisation sort) = grossMarginPct × dailyVelocity
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

      // Base quantity from forecast
      let targetQty = Math.max(forecast.totalUnits, 0);

      // Add safety stock if lead time is known
      if (product.leadTimeDays && product.leadTimeDays > 0) {
        const ss = calcSafetyStock(
          forecast.dailyVelocity,
          forecast.velocityStdDev ?? 0,
          product.leadTimeDays
        );
        targetQty += ss;
      }

      // Round up to whole cartons
      let orderedQty = roundUpToCarton(targetQty, product.unitsPerCarton);

      // Enforce MOQ (round MOQ up to carton boundary too)
      if (product.minOrderQty && product.minOrderQty > 0) {
        const moqInCartons = roundUpToCarton(product.minOrderQty, product.unitsPerCarton);
        if (orderedQty < moqInCartons) orderedQty = moqInCartons;
      }

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
        supplierId: product.supplierId,
        sku: product.sku,
        productName: product.name,
        category: product.category,
        forecastedQty: Math.max(forecast.totalUnits, 0),
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
        // Priority rank will be (re-)assigned during optimisation
        priorityRank: index + 1,
        isIncluded: true,
      };
    })
    .filter((l): l is POLineItem => l !== null);
}

// ─── Budget + Volume Optimisation ─────────────────────────────────────────────

/**
 * Apply budget and volume optimisation to PO lines.
 *
 * Sort order: (grossMarginPct × dailyVelocity) descending — contribution
 * margin per unit time. This ensures fast-turning, high-margin SKUs are
 * prioritised over slow-moving ones regardless of raw margin rank.
 *
 * Volume enforcement: if cycle.maxVolumeCBM is set, lines that would
 * push cumulative CBM over the cap are excluded even if budget remains.
 *
 * Partial quantity logic: if a line fits partially within the remaining
 * budget, the quantity is trimmed to whole cartons. Sub-carton orders are
 * never generated. If even one carton is unaffordable, the line is excluded.
 *
 * MOQ enforcement: a line trimmed below its product MOQ is excluded entirely
 * (better to skip than to order below supplier minimum).
 *
 * @param lines             Lines to optimise (will not be mutated)
 * @param budgetCents       Hard budget ceiling in pence/cents
 * @param maxVolumeCBM      Optional warehouse volume cap (cubic metres)
 * @param velocityByProduct Map of productId → daily velocity (for sort score)
 * @param moqByProduct      Map of productId → min order qty
 */
export function applyBudgetOptimisation(
  lines: POLineItem[],
  budgetCents: number,
  maxVolumeCBM?: number,
  velocityByProduct: Map<string, number> = new Map(),
  moqByProduct: Map<string, number> = new Map()
): POLineItem[] {
  // Contribution score: gross margin % × daily velocity (higher = more profitable per day)
  const score = (line: POLineItem) => {
    const v = velocityByProduct.get(line.productId) ?? 1;
    return (line.grossMarginPct / 100) * v;
  };

  const sorted = [...lines].sort((a, b) => score(b) - score(a));

  let remainingBudget = budgetCents;
  let usedVolumeCBM = 0;
  let rank = 1;

  return sorted.map((line) => {
    // Skip if no budget left
    if (remainingBudget <= 0) {
      return { ...line, isIncluded: false, priorityRank: rank++ };
    }

    // Volume cap check: if one full carton would already breach cap, exclude
    const lineVolumeFull = line.volumeCBM ?? 0;
    const singleCartonVolume =
      lineVolumeFull > 0 && line.cartons > 0 ? lineVolumeFull / line.cartons : 0;

    if (maxVolumeCBM !== undefined && usedVolumeCBM + singleCartonVolume > maxVolumeCBM) {
      return { ...line, isIncluded: false, priorityRank: rank++ };
    }

    // Full line fits
    if (line.totalLandedCostCents <= remainingBudget) {
      // Check volume for full line
      if (maxVolumeCBM === undefined || usedVolumeCBM + lineVolumeFull <= maxVolumeCBM) {
        remainingBudget -= line.totalLandedCostCents;
        usedVolumeCBM += lineVolumeFull;
        return { ...line, isIncluded: true, priorityRank: rank++ };
      }
    }

    // Partial line: trim to affordable whole-carton quantity
    const affordableCartons = Math.floor(
      remainingBudget / (line.landedCostPerUnitCents * line.unitsPerCarton)
    );

    if (affordableCartons <= 0) {
      return { ...line, isIncluded: false, priorityRank: rank++ };
    }

    let partialQty = affordableCartons * line.unitsPerCarton;

    // Volume-constrain the partial quantity too
    if (maxVolumeCBM !== undefined && singleCartonVolume > 0) {
      const maxCartonsByVolume = Math.floor((maxVolumeCBM - usedVolumeCBM) / singleCartonVolume);
      if (maxCartonsByVolume <= 0) {
        return { ...line, isIncluded: false, priorityRank: rank++ };
      }
      partialQty = Math.min(partialQty, maxCartonsByVolume * line.unitsPerCarton);
    }

    // Enforce MOQ: exclude rather than order below minimum
    const moq = moqByProduct.get(line.productId) ?? 0;
    if (moq > 0 && partialQty < moq) {
      return { ...line, isIncluded: false, priorityRank: rank++ };
    }

    const updated = recomputeLine(line, partialQty);
    remainingBudget -= updated.totalLandedCostCents;
    usedVolumeCBM += updated.volumeCBM ?? 0;

    return { ...updated, isIncluded: true, priorityRank: rank++ };
  });
}

// ─── PO Assembly ─────────────────────────────────────────────────────────────

/**
 * Assemble a full PurchaseOrder from optimised lines and cycle context.
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

  // Reference: PO-{CYCLE_TYPE}-{YYYYMMDD}-{RANDOM4}
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const reference = `PO-${cycle.type.toUpperCase()}-${datePart}-${rand}`;

  return {
    id: nanoid(),
    reference,
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
