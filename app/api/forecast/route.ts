import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyseVelocity, buildProductForecast } from "@/lib/forecasting";
import { getFactorsForCategory } from "@/lib/seasonal";
import {
  predictNewProductVelocity,
  categoryAverageVelocity,
  type AnalogousData,
  type CategoryAnalysisData,
} from "@/lib/new-product";
import { calculateSellThrough } from "@/lib/forecasting";
import { unauthorized, zodError, serverError, ok } from "@/lib/api-response";
import type { Product } from "@/types/product";
import type { SalesPeriod } from "@/types/sales";
import type { CategorySeasonalConfig } from "@/types/forecast";

// ─── Zod schemas ──────────────────────────────────────────────────────────────
// We use passthrough() for deeply nested objects because Zod cannot fully
// introspect runtime shapes of domain types (Product, SalesPeriod) that
// contain optional/unknown fields. The route validates critical string/number
// fields and lets TypeScript's static types guard the rest.

const SalesPeriodSchema = z.object({
  id: z.string(),
  productId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  totalDays: z.number().int().nonnegative(),
  inStockDays: z.number().int().nonnegative(),
  unitsReceived: z.number().int().nonnegative(),
  unitsSold: z.number().int().nonnegative(),
  openingStock: z.number().int().nonnegative(),
  closingStock: z.number().int().nonnegative(),
  hadStockout: z.boolean(),
  notes: z.string().optional(),
  createdAt: z.string(),
});

const ProductSchema = z.object({
  id: z.string(),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  subCategory: z.string().optional(),
  supplierId: z.string().optional(),
  rrpCents: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative(),
  landedCostCents: z.number().int().nonnegative(),
  landedCostFactor: z.number().positive(),
  unitsPerCarton: z.number().int().positive(),
  isActive: z.boolean(),
  isNewToMarket: z.boolean(),
  analogousProductId: z.string().optional(),
  minOrderQty: z.number().int().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough(); // allow boxDimensions, sizeCurve, etc.

const SeasonalConfigSchema = z.object({
  category: z.string(),
  factors: z.record(z.string(), z.number()),
});

const CategoryProductSchema = z.object({
  product: ProductSchema,
  salesPeriods: z.array(SalesPeriodSchema),
});

const schema = z.object({
  product: ProductSchema,
  salesPeriods: z.array(SalesPeriodSchema),
  allProductsInCategory: z.array(CategoryProductSchema),
  seasonalConfigs: z.array(SeasonalConfigSchema),
  windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  /** 1.0 = base, 1.2 = bull, 0.8 = bear */
  scenarioMultiplier: z.number().min(0.1).max(5.0).default(1.0),
});

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return serverError("Invalid JSON body");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const {
      product,
      salesPeriods,
      allProductsInCategory,
      seasonalConfigs,
      windowStart,
      windowEnd,
      scenarioMultiplier,
    } = parsed.data;

    // Validate window ordering
    if (windowStart >= windowEnd) {
      return zodError({ issues: [{ path: ["windowEnd"], message: "windowEnd must be after windowStart" }] } as never);
    }

    const typedProduct = product as unknown as Product;
    const typedSalesPeriods = salesPeriods as unknown as SalesPeriod[];
    const typedAllProducts = allProductsInCategory as unknown as {
      product: Product;
      salesPeriods: SalesPeriod[];
    }[];
    const typedSeasonalConfigs = seasonalConfigs as unknown as CategorySeasonalConfig[];

    const seasonalFactors = getFactorsForCategory(typedProduct.category, typedSeasonalConfigs);

    let dailyVelocity: number;
    let velocityStdDev: number | undefined;
    let velocitySource: "historical" | "new-product" | "manual";
    let totalUnitsLowOverride: number | undefined;
    let totalUnitsHighOverride: number | undefined;

    const isHistorical = !typedProduct.isNewToMarket && typedSalesPeriods.length > 0;

    if (isHistorical) {
      // Full velocity analysis: recency-weighted, trend, confidence
      const analysis = analyseVelocity(typedSalesPeriods);

      if (analysis) {
        dailyVelocity = analysis.weightedVelocity;
        velocityStdDev = analysis.velocityStdDev;
        velocitySource = "historical";

        return ok(
          buildProductForecast({
            product: typedProduct,
            dailyVelocity,
            velocityStdDev,
            velocitySource,
            seasonalFactors,
            windowStart,
            windowEnd,
            scenarioMultiplier,
            trend: analysis.trend,
            isIntermittent: analysis.isIntermittent,
            stockoutRate: analysis.stockoutRate,
            periodsAnalysed: analysis.periodsAnalysed,
          })
        );
      }

      // Fallback: not enough data for full analysis — use simple STR
      const sta = calculateSellThrough(typedSalesPeriods);
      dailyVelocity = sta.dailyVelocity;
      velocitySource = "historical";

      return ok(
        buildProductForecast({
          product: typedProduct,
          dailyVelocity,
          velocitySource,
          seasonalFactors,
          windowStart,
          windowEnd,
          scenarioMultiplier,
          stockoutRate: sta.stockoutRate,
          periodsAnalysed: sta.periodsAnalysed,
        })
      );
    }

    // ── New-to-market path ─────────────────────────────────────────────────
    const analogousRaw = typedProduct.analogousProductId
      ? typedAllProducts.find((p) => p.product.id === typedProduct.analogousProductId)
      : null;

    let analogousData: AnalogousData | null = null;
    if (analogousRaw) {
      const sta = calculateSellThrough(analogousRaw.salesPeriods);
      // Collect per-period velocities for adaptive band
      const periodVelocities = analogousRaw.salesPeriods
        .filter((p) => p.inStockDays > 0)
        .map((p) => p.unitsSold / p.inStockDays);
      analogousData = {
        analysis: sta,
        periodVelocities,
        rrpCents: analogousRaw.product.rrpCents,
      };
    }

    const categoryData: CategoryAnalysisData[] = typedAllProducts
      .filter((p) => !p.product.isNewToMarket && p.salesPeriods.length > 0)
      .map((p) => ({
        productId: p.product.id,
        dailyVelocity: calculateSellThrough(p.salesPeriods).dailyVelocity,
        rrpCents: p.product.rrpCents,
      }));

    const prediction = predictNewProductVelocity(typedProduct, analogousData, categoryData);
    dailyVelocity = prediction.estimatedDailyVelocity;
    velocitySource = "new-product";

    // For new products, convert confidence velocity range to unit totals
    // across the window length (seasonal-neutral approximation for bounds)
    const windowDays =
      (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / (1000 * 60 * 60 * 24);
    totalUnitsLowOverride = Math.round(prediction.confidenceLow * windowDays);
    totalUnitsHighOverride = Math.round(prediction.confidenceHigh * windowDays);

    // Unused but needed for older categoryAverageVelocity callers
    void categoryAverageVelocity;

    return ok(
      buildProductForecast({
        product: typedProduct,
        dailyVelocity,
        velocitySource,
        seasonalFactors,
        windowStart,
        windowEnd,
        scenarioMultiplier,
        periodsAnalysed: 0,
        stockoutRate: 0,
        totalUnitsLowOverride,
        totalUnitsHighOverride,
      })
    );
  } catch (err) {
    return serverError(err);
  }
}
