import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildPOLines, applyBudgetOptimisation, assemblePurchaseOrder } from "@/lib/purchase-order";
import { unauthorized, zodError, serverError, ok } from "@/lib/api-response";
import type { ProductForecast } from "@/types/forecast";
import type { Product } from "@/types/product";
import type { OrderCycle } from "@/types/purchase-order";

const schema = z.object({
  forecasts: z.array(z.object({}).passthrough()),
  products: z.array(z.object({}).passthrough()),
  cycle: z.object({}).passthrough(),
  supplierName: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  try {
    const { forecasts, products, cycle, supplierName, notes } = parsed.data;

    let lines = buildPOLines({
      forecasts: forecasts as unknown as ProductForecast[],
      products: products as unknown as Product[],
    });

    lines = applyBudgetOptimisation(lines, (cycle as unknown as OrderCycle).budgetCents);

    const po = assemblePurchaseOrder({
      lines,
      cycle: cycle as unknown as OrderCycle,
      supplierName,
      notes,
    });

    return ok(po);
  } catch (err) {
    return serverError(err);
  }
}
