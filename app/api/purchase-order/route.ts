import { NextRequest, NextResponse } from "next/server";
import { buildPOLines, applyBudgetOptimisation, assemblePurchaseOrder } from "@/lib/purchase-order";
import type { ProductForecast } from "@/types/forecast";
import type { Product } from "@/types/product";
import type { OrderCycle } from "@/types/purchase-order";

interface PORequestBody {
  forecasts: ProductForecast[];
  products: Product[];
  cycle: OrderCycle;
  supplierName?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: PORequestBody = await req.json();
    const { forecasts, products, cycle, supplierName, notes } = body;

    // Build raw lines from forecasts
    let lines = buildPOLines({ forecasts, products });

    // Apply budget optimisation
    lines = applyBudgetOptimisation(lines, cycle.budgetCents);

    // Assemble the full PO
    const po = assemblePurchaseOrder({ lines, cycle, supplierName, notes });

    return NextResponse.json(po);
  } catch (err) {
    console.error("[/api/purchase-order]", err);
    return NextResponse.json({ error: "Purchase order generation failed" }, { status: 500 });
  }
}
