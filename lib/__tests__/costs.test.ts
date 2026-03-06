import { describe, it, expect } from "vitest";
import {
  calculateGrossMarginPct,
  calculateLandedCost,
  optimisePOForBudget,
} from "../costs";

describe("calculateGrossMarginPct", () => {
  it("returns 0 when revenue is 0", () => {
    expect(calculateGrossMarginPct(0, 100)).toBe(0);
  });

  it("calculates margin correctly", () => {
    // Revenue 100, cost 60 → margin 40%
    expect(calculateGrossMarginPct(10000, 6000)).toBeCloseTo(40);
  });

  it("returns 100% when cost is 0", () => {
    expect(calculateGrossMarginPct(10000, 0)).toBe(100);
  });
});

describe("calculateLandedCost", () => {
  it("applies factor correctly", () => {
    expect(calculateLandedCost(1000, 1.15)).toBe(1150);
  });
});

describe("optimisePOForBudget", () => {
  it("includes all lines when budget is sufficient", () => {
    const lines = [
      { id: "a", productId: "1", orderedQty: 10, landedCostPerUnitCents: 1000, grossMarginPct: 50, totalLandedCostCents: 10000, isIncluded: true },
      { id: "b", productId: "2", orderedQty: 5, landedCostPerUnitCents: 2000, grossMarginPct: 40, totalLandedCostCents: 10000, isIncluded: true },
    ];
    const result = optimisePOForBudget(lines, 50000);
    expect(result.every((l) => l.isIncluded)).toBe(true);
  });

  it("excludes lowest margin lines when budget is exceeded", () => {
    const lines = [
      { id: "a", productId: "1", orderedQty: 10, landedCostPerUnitCents: 1000, grossMarginPct: 50, totalLandedCostCents: 10000, isIncluded: true },
      { id: "b", productId: "2", orderedQty: 10, landedCostPerUnitCents: 1000, grossMarginPct: 20, totalLandedCostCents: 10000, isIncluded: true },
    ];
    const result = optimisePOForBudget(lines, 10000);
    const included = result.filter((l) => l.isIncluded);
    const excluded = result.filter((l) => !l.isIncluded);
    expect(included.length).toBe(1);
    expect(included[0].id).toBe("a"); // higher margin included
    expect(excluded[0].id).toBe("b"); // lower margin excluded
  });

  it("handles partial quantities", () => {
    const lines = [
      {
        id: "a",
        productId: "1",
        orderedQty: 10,
        landedCostPerUnitCents: 500,
        grossMarginPct: 50,
        totalLandedCostCents: 5000,
        isIncluded: true,
      },
    ];
    // Budget = 3000, can afford 6 units at $5 each
    const result = optimisePOForBudget(lines, 3000);
    expect(result[0].isIncluded).toBe(true);
    expect(result[0].orderedQty).toBe(6);
  });
});
