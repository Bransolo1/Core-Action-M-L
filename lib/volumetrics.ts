import type { BoxDimensions } from "@/types/product";

/**
 * Calculate volume in cubic metres for a single carton.
 * Dimensions are stored in millimetres.
 */
export function cartonVolumeCBM(dims: BoxDimensions): number {
  const l = dims.lengthMm / 1000;
  const w = dims.widthMm / 1000;
  const h = dims.heightMm / 1000;
  return l * w * h;
}

/**
 * Calculate total volume for an order quantity.
 */
export function totalVolumeCBM(params: {
  dims: BoxDimensions;
  units: number;
  unitsPerCarton: number;
}): number {
  const { dims, units, unitsPerCarton } = params;
  const cartons = Math.ceil(units / unitsPerCarton);
  return cartonVolumeCBM(dims) * cartons;
}

/**
 * Calculate total weight in kilograms for an order quantity.
 */
export function totalWeightKg(params: {
  dims: BoxDimensions;
  units: number;
  unitsPerCarton: number;
}): number {
  const { dims, units, unitsPerCarton } = params;
  const cartons = Math.ceil(units / unitsPerCarton);
  return (dims.weightGrams / 1000) * cartons;
}

/**
 * Chargeable weight for air freight (max of actual vs volumetric).
 * Volumetric factor: 1 CBM = 167 kg (standard air freight).
 */
export function chargeableWeightKg(dims: BoxDimensions, unitsPerCarton: number): number {
  const volKg = cartonVolumeCBM(dims) * 167;
  const actualKg = dims.weightGrams / 1000;
  return Math.max(volKg, actualKg);
}

/**
 * How many cartons fit in a given warehouse space (CBM)?
 */
export function cartonsInSpace(dims: BoxDimensions, availableCBM: number): number {
  const vol = cartonVolumeCBM(dims);
  if (vol === 0) return 0;
  return Math.floor(availableCBM / vol);
}

export function formatCBM(v: number): string {
  return `${v.toFixed(3)} m³`;
}

export function formatDimensions(dims: BoxDimensions): string {
  const l = (dims.lengthMm / 10).toFixed(0);
  const w = (dims.widthMm / 10).toFixed(0);
  const h = (dims.heightMm / 10).toFixed(0);
  return `${l} × ${w} × ${h} cm`;
}
