/**
 * POST /api/integrations/shopify/sync
 * Pulls products and paid orders from Shopify and upserts them into the
 * local database.
 *
 * Body (optional):
 *   { sinceDate?: "YYYY-MM-DD" }  — only import orders from this date forward.
 *   Omit to import all available paid orders.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopifyClient, toGrams } from "@/lib/shopify";
import { nanoid } from "@/lib/nanoid";
import {
  format,
  startOfMonth,
  endOfMonth,
  differenceInCalendarDays,
} from "date-fns";
import type { SyncLog } from "@/types/integration";
import type { ShopifyProduct } from "@/types/integration";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { sinceDate?: string };
  const start = Date.now();

  const shopify = await getShopifyClient();
  if (!shopify) {
    return NextResponse.json(
      { error: "Shopify credentials not configured. Please save your credentials first." },
      { status: 400 }
    );
  }

  const log: SyncLog = {
    timestamp: new Date().toISOString(),
    productsImported: 0,
    productsUpdated: 0,
    salesPeriodsCreated: 0,
    salesPeriodsUpdated: 0,
    errors: [],
    durationMs: 0,
  };

  // ── 1. Sync Products ──────────────────────────────────────────────────────
  try {
    const shopifyProducts = await shopify.client.getProducts();

    for (const sp of shopifyProducts) {
      for (const variant of sp.variants) {
        if (!variant.sku) continue;

        const rrpCents = Math.round(parseFloat(variant.price) * 100);
        if (rrpCents <= 0) continue;

        // Cost: use compare_at_price as cost proxy if it's lower than price
        // (Shopify convention varies; buyers often set compare_at_price as the
        // original/wholesale price). Fall back to 50% of RRP as a safe default.
        const compareCents = variant.compare_at_price
          ? Math.round(parseFloat(variant.compare_at_price) * 100)
          : 0;
        const costCents =
          compareCents > 0 && compareCents < rrpCents
            ? compareCents
            : Math.round(rrpCents * 0.5);

        const weightGrams = toGrams(
          variant.weight,
          variant.weight_unit ?? "kg"
        );

        const category = mapCategory(sp);
        const productName = buildProductName(sp, variant);

        const existing = await prisma.product.findFirst({
          where: { sku: variant.sku },
        });

        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              name: productName,
              category,
              rrpCents,
              costCents,
              landedCostCents: Math.round(costCents * existing.landedCostFactor),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              boxDimensions: weightGrams
                ? { lengthMm: 0, widthMm: 0, heightMm: 0, weightGrams }
                : (existing.boxDimensions as any) ?? undefined,
            },
          });
          log.productsUpdated++;
        } else {
          await prisma.product.create({
            data: {
              id: nanoid(),
              sku: variant.sku,
              name: productName,
              category,
              rrpCents,
              costCents,
              landedCostCents: Math.round(costCents * 1.15),
              landedCostFactor: 1.15,
              unitsPerCarton: 1,
              isActive: sp.status === "active",
              isNewToMarket: false,
              boxDimensions: weightGrams
                ? { lengthMm: 0, widthMm: 0, heightMm: 0, weightGrams }
                : undefined,
            },
          });
          log.productsImported++;
        }
      }
    }
  } catch (err) {
    log.errors.push(`Product sync: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Sync Orders → SalesPeriods ────────────────────────────────────────
  try {
    const orders = await shopify.client.getOrders(body.sinceDate);

    for (const order of orders) {
      if (order.financial_status !== "paid") continue;

      const orderDate = new Date(order.created_at);
      const periodStart = format(startOfMonth(orderDate), "yyyy-MM-dd");
      const periodEnd   = format(endOfMonth(orderDate),   "yyyy-MM-dd");
      const totalDays   =
        differenceInCalendarDays(endOfMonth(orderDate), startOfMonth(orderDate)) + 1;

      for (const item of order.line_items) {
        if (!item.sku) continue;

        const product = await prisma.product.findFirst({
          where: { sku: item.sku },
        });
        if (!product) continue;

        const existing = await prisma.salesPeriod.findFirst({
          where: { productId: product.id, periodStart, periodEnd },
        });

        if (existing) {
          await prisma.salesPeriod.update({
            where: { id: existing.id },
            data: {
              unitsSold: { increment: item.quantity },
              inStockDays: totalDays,
            },
          });
          log.salesPeriodsUpdated++;
        } else {
          await prisma.salesPeriod.create({
            data: {
              id: nanoid(),
              productId: product.id,
              periodStart,
              periodEnd,
              totalDays,
              inStockDays: totalDays,
              unitsReceived: 0,
              unitsSold: item.quantity,
              openingStock: 0,
              closingStock: 0,
              hadStockout: false,
              notes: `Shopify import — order ${order.name}`,
            },
          });
          log.salesPeriodsCreated++;
        }
      }
    }
  } catch (err) {
    log.errors.push(`Order sync: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Persist log ───────────────────────────────────────────────────────
  log.durationMs = Date.now() - start;

  await prisma.integrationCredentials.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      shopifyLastSync: new Date(),
      shopifySyncLog: log as object,
    },
    update: {
      shopifyLastSync: new Date(),
      shopifySyncLog: log as object,
    },
  });

  return NextResponse.json({ ok: true, log });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapCategory(sp: ShopifyProduct): string {
  const raw = (sp.product_type ?? "").trim();
  if (!raw) return "Accessories";

  // Map common Shopify product_type values to Core Action taxonomy
  const map: Record<string, string> = {
    scooter:       "Scooters",
    scooters:      "Scooters",
    "scooter parts": "Scooter Parts",
    protection:    "Protection",
    helmet:        "Protection",
    helmets:       "Protection",
    pads:          "Protection",
    skate:         "Skate",
    skateboard:    "Skateboard",
    bike:          "Bike",
    kids:          "Kids",
  };

  return map[raw.toLowerCase()] ?? raw;
}

function buildProductName(sp: ShopifyProduct, variant: { title: string }): string {
  if (!variant.title || variant.title === "Default Title") return sp.title;
  return `${sp.title} — ${variant.title}`;
}
