import { NextRequest, NextResponse } from "next/server";
import { calculateSellThrough } from "@/lib/forecasting";
import { buildProductForecast } from "@/lib/forecasting";
import { getFactorsForCategory } from "@/lib/seasonal";
import { predictNewProductVelocity, categoryAverageVelocity } from "@/lib/new-product";
import type { SalesPeriod } from "@/types/sales";
import type { Product } from "@/types/product";
import type { CategorySeasonalConfig } from "@/types/forecast";

interface ForecastRequestBody {
  product: Product;
  salesPeriods: SalesPeriod[];
  allProductsInCategory: { product: Product; salesPeriods: SalesPeriod[] }[];
  seasonalConfigs: CategorySeasonalConfig[];
  windowStart: string;
  windowEnd: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: ForecastRequestBody = await req.json();
    const { product, salesPeriods, allProductsInCategory, seasonalConfigs, windowStart, windowEnd } =
      body;

    const seasonalFactors = getFactorsForCategory(product.category, seasonalConfigs);

    let dailyVelocity: number;
    let velocitySource: "historical" | "new-product" | "manual";
    let confidenceLow: number | undefined;
    let confidenceHigh: number | undefined;

    if (!product.isNewToMarket && salesPeriods.length > 0) {
      const sta = calculateSellThrough(salesPeriods);
      dailyVelocity = sta.dailyVelocity;
      velocitySource = "historical";
    } else {
      // New-to-market: find analogous product analysis
      const analogousData = product.analogousProductId
        ? allProductsInCategory.find((p) => p.product.id === product.analogousProductId)
        : null;

      const analogousAnalysis = analogousData
        ? calculateSellThrough(analogousData.salesPeriods)
        : null;

      const categoryAnalyses = allProductsInCategory
        .filter((p) => !p.product.isNewToMarket && p.salesPeriods.length > 0)
        .map((p) => calculateSellThrough(p.salesPeriods));

      const catAvg = categoryAverageVelocity(categoryAnalyses);
      const prediction = predictNewProductVelocity(product, analogousAnalysis, catAvg);

      dailyVelocity = prediction.estimatedDailyVelocity;
      confidenceLow = prediction.confidenceLow;
      confidenceHigh = prediction.confidenceHigh;
      velocitySource = "new-product";
    }

    const forecast = buildProductForecast({
      product,
      dailyVelocity,
      velocitySource,
      seasonalFactors,
      windowStart,
      windowEnd,
      confidenceLow,
      confidenceHigh,
    });

    return NextResponse.json(forecast);
  } catch (err) {
    console.error("[/api/forecast]", err);
    return NextResponse.json({ error: "Forecast failed" }, { status: 500 });
  }
}
