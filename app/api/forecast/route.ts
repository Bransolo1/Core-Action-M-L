import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calculateSellThrough, buildProductForecast } from "@/lib/forecasting";
import { getFactorsForCategory } from "@/lib/seasonal";
import { predictNewProductVelocity, categoryAverageVelocity } from "@/lib/new-product";
import { unauthorized, zodError, serverError, ok } from "@/lib/api-response";
import type { Product } from "@/types/product";
import type { SalesPeriod } from "@/types/sales";
import type { CategorySeasonalConfig } from "@/types/forecast";

const schema = z.object({
  product: z.object({}).passthrough(),
  salesPeriods: z.array(z.object({}).passthrough()),
  allProductsInCategory: z.array(z.object({}).passthrough()),
  seasonalConfigs: z.array(z.object({}).passthrough()),
  windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  try {
    const { product, salesPeriods, allProductsInCategory, seasonalConfigs, windowStart, windowEnd } = parsed.data;

    const typedProduct = product as unknown as Product;
    const typedSalesPeriods = salesPeriods as unknown as SalesPeriod[];
    const typedAllProducts = allProductsInCategory as unknown as { product: Product; salesPeriods: SalesPeriod[] }[];
    const typedSeasonalConfigs = seasonalConfigs as unknown as CategorySeasonalConfig[];

    const seasonalFactors = getFactorsForCategory(typedProduct.category, typedSeasonalConfigs);

    let dailyVelocity: number;
    let velocitySource: "historical" | "new-product" | "manual";
    let confidenceLow: number | undefined;
    let confidenceHigh: number | undefined;

    if (!typedProduct.isNewToMarket && typedSalesPeriods.length > 0) {
      const sta = calculateSellThrough(typedSalesPeriods);
      dailyVelocity = sta.dailyVelocity;
      velocitySource = "historical";
    } else {
      const analogousData = typedProduct.analogousProductId
        ? typedAllProducts.find((p) => p.product.id === typedProduct.analogousProductId)
        : null;
      const analogousAnalysis = analogousData ? calculateSellThrough(analogousData.salesPeriods) : null;
      const categoryAnalyses = typedAllProducts
        .filter((p) => !p.product.isNewToMarket && p.salesPeriods.length > 0)
        .map((p) => calculateSellThrough(p.salesPeriods));
      const catAvg = categoryAverageVelocity(categoryAnalyses);
      const prediction = predictNewProductVelocity(typedProduct, analogousAnalysis, catAvg);
      dailyVelocity = prediction.estimatedDailyVelocity;
      confidenceLow = prediction.confidenceLow;
      confidenceHigh = prediction.confidenceHigh;
      velocitySource = "new-product";
    }

    const forecast = buildProductForecast({
      product: typedProduct,
      dailyVelocity,
      velocitySource,
      seasonalFactors,
      windowStart,
      windowEnd,
      confidenceLow,
      confidenceHigh,
    });

    return ok(forecast);
  } catch (err) {
    return serverError(err);
  }
}
