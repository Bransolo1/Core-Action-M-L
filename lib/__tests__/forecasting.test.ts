import { describe, it, expect } from "vitest";
import { calculateSellThrough } from "../forecasting";
import type { SalesPeriod } from "@/types/sales";

function makePeriod(overrides: Partial<SalesPeriod> = {}): SalesPeriod {
  return {
    id: "test",
    productId: "prod1",
    periodStart: "2024-01-01",
    periodEnd: "2024-03-31",
    totalDays: 90,
    inStockDays: 90,
    unitsReceived: 100,
    unitsSold: 80,
    openingStock: 100,
    closingStock: 20,
    hadStockout: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("calculateSellThrough", () => {
  it("returns zeros for empty periods", () => {
    const result = calculateSellThrough([]);
    expect(result.standardStr).toBe(0);
    expect(result.adjustedStr).toBe(0);
    expect(result.dailyVelocity).toBe(0);
  });

  it("calculates standard STR correctly", () => {
    const period = makePeriod({ unitsReceived: 100, unitsSold: 80 });
    const result = calculateSellThrough([period]);
    expect(result.standardStr).toBeCloseTo(0.8);
  });

  it("calculates stockout-adjusted velocity correctly", () => {
    // 100 units received, sold all 100 in 30 days out of 90 days
    const period = makePeriod({
      unitsReceived: 100,
      unitsSold: 100,
      totalDays: 90,
      inStockDays: 30,
      hadStockout: true,
      closingStock: 0,
    });
    const result = calculateSellThrough([period]);

    // Daily velocity = 100/30 ≈ 3.33
    expect(result.dailyVelocity).toBeCloseTo(100 / 30);

    // Adjusted demand = 3.33 * 90 = 300
    // Adjusted STR = 100/300 ≈ 0.333
    expect(result.adjustedStr).toBeCloseTo(100 / (100 / 30 * 90));

    // Projected annual demand = 3.33 * 365 ≈ 1216
    expect(result.projectedAnnualDemand).toBeCloseTo((100 / 30) * 365);
  });

  it("calculates stockout rate correctly", () => {
    const period = makePeriod({
      totalDays: 90,
      inStockDays: 60,
      hadStockout: true,
    });
    const result = calculateSellThrough([period]);
    expect(result.stockoutRate).toBeCloseTo(30 / 90);
  });

  it("aggregates multiple periods correctly", () => {
    const p1 = makePeriod({ unitsReceived: 100, unitsSold: 80, totalDays: 90, inStockDays: 90 });
    const p2 = makePeriod({ unitsReceived: 50, unitsSold: 50, totalDays: 90, inStockDays: 50, hadStockout: true });
    const result = calculateSellThrough([p1, p2]);

    // Total received = 150, total sold = 130
    expect(result.standardStr).toBeCloseTo(130 / 150);

    // Total in-stock days = 90+50 = 140, total period days = 180
    // Daily velocity = 130/140 ≈ 0.929
    expect(result.dailyVelocity).toBeCloseTo(130 / 140);
    expect(result.periodsAnalysed).toBe(2);
  });
});
