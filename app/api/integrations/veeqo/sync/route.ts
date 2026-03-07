/**
 * POST /api/integrations/veeqo/sync
 * Pulls products and dispatched orders from Veeqo and upserts them into the
 * local database.
 *
 * Body (optional):
 *   { sinceDate?: "YYYY-MM-DD" }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVeeqoClient } from "@/lib/veeqo";
import { nanoid } from "@/lib/nanoid";
import {
  format,
  startOfMonth,
  endOfMonth,
  differenceInCalendarDays,
} from "date-fns";
import type { SyncLog } from "@/types/integration";
import type { VeeqoProduct } from "@/types/integration";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { sinceDate?: string };
  const start = Date.now();

  const client = await getVeeqoClient();
  if (!client) {
    return NextResponse.json(
      { error: "Veeqo credentials not configured. Please save your API key first." },
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
    const veeqoProducts = await client.getProducts();

    for (const vp of veeqoProducts) {
      for (const sellable of vp.sellables ?? []) {
        if (!sellable.sku_code) continue;

        const rrpCents  = Math.round((sellable.sell_price ?? 0) * 100);
        const costCents = Math.round((sellable.cost_price ?? rrpCents * 0.5) * 100);
        if (rrpCents <= 0) continue;

        const category = mapVeeqoCategory(vp);
        const productName = buildVeeqoName(vp, sellable.title);
        const weightGrams = sellable.weight ? Math.round(sellable.weight * 1000) : 0;

        const existing = await prisma.product.findFirst({
          where: { sku: sellable.sku_code },
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
              ...(weightGrams > 0 && {
                boxDimensions: { lengthMm: 0, widthMm: 0, heightMm: 0, weightGrams },
              }),
            },
          });
          log.productsUpdated++;
        } else {
          await prisma.product.create({
            data: {
              id: nanoid(),
              sku: sellable.sku_code,
              name: productName,
              category,
              rrpCents,
              costCents,
              landedCostCents: Math.round(costCents * 1.15),
              landedCostFactor: 1.15,
              unitsPerCarton: 1,
              isActive: true,
              isNewToMarket: false,
              ...(weightGrams > 0 && {
                boxDimensions: { lengthMm: 0, widthMm: 0, heightMm: 0, weightGrams },
              }),
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
    const orders = await client.getOrders(body.sinceDate);

    for (const order of orders) {
      const orderDate   = new Date(order.created_at);
      const periodStart = format(startOfMonth(orderDate), "yyyy-MM-dd");
      const periodEnd   = format(endOfMonth(orderDate),   "yyyy-MM-dd");
      const totalDays   =
        differenceInCalendarDays(endOfMonth(orderDate), startOfMonth(orderDate)) + 1;

      for (const item of order.line_items ?? []) {
        if (!item.sku_code) continue;

        const product = await prisma.product.findFirst({
          where: { sku: item.sku_code },
        });
        if (!product) continue;

        const existing = await prisma.salesPeriod.findFirst({
          where: { productId: product.id, periodStart, periodEnd },
        });

        if (existing) {
          await prisma.salesPeriod.update({
            where: { id: existing.id },
            data: { unitsSold: { increment: item.quantity }, inStockDays: totalDays },
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
              notes: `Veeqo import — order ${order.number}`,
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
      veeqoLastSync: new Date(),
      veeqoSyncLog: log as object,
    },
    update: {
      veeqoLastSync: new Date(),
      veeqoSyncLog: log as object,
    },
  });

  return NextResponse.json({ ok: true, log });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapVeeqoCategory(vp: VeeqoProduct): string {
  const raw = (vp.product_type ?? "").trim();
  if (!raw) return "Accessories";

  const map: Record<string, string> = {
    scooter:          "Scooters",
    scooters:         "Scooters",
    "scooter parts":  "Scooter Parts",
    protection:       "Protection",
    helmet:           "Protection",
    helmets:          "Protection",
    pads:             "Protection",
    skate:            "Skate",
    skateboard:       "Skateboard",
    bike:             "Bike",
    kids:             "Kids",
  };

  return map[raw.toLowerCase()] ?? raw;
}

function buildVeeqoName(vp: VeeqoProduct, variantTitle?: string): string {
  if (!variantTitle || variantTitle === vp.title) return vp.title;
  return `${vp.title} — ${variantTitle}`;
}
