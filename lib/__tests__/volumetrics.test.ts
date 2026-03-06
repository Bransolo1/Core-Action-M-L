import { describe, it, expect } from "vitest";
import { cartonVolumeCBM, totalVolumeCBM, totalWeightKg } from "../volumetrics";
import type { BoxDimensions } from "@/types/product";

const BOX: BoxDimensions = {
  lengthMm: 600,
  widthMm: 400,
  heightMm: 300,
  weightGrams: 5000,
};

describe("cartonVolumeCBM", () => {
  it("calculates correct volume", () => {
    // 0.6m × 0.4m × 0.3m = 0.072 CBM
    expect(cartonVolumeCBM(BOX)).toBeCloseTo(0.072);
  });
});

describe("totalVolumeCBM", () => {
  it("calculates for multiple units", () => {
    // 10 units, 5 per carton = 2 cartons, 2 × 0.072 = 0.144
    const vol = totalVolumeCBM({ dims: BOX, units: 10, unitsPerCarton: 5 });
    expect(vol).toBeCloseTo(0.144);
  });
});

describe("totalWeightKg", () => {
  it("calculates total weight correctly", () => {
    // 10 units, 5 per carton = 2 cartons, 2 × 5kg = 10kg
    const kg = totalWeightKg({ dims: BOX, units: 10, unitsPerCarton: 5 });
    expect(kg).toBeCloseTo(10);
  });
});
