/**
 * Shopify orders/paid webhook handler.
 * Configure in Shopify: Settings → Notifications → Webhooks
 *   Topic:  orders/paid
 *   Format: JSON
 *   URL:    https://your-domain.com/api/webhooks/shopify
 *
 * The webhook secret is resolved from (in priority order):
 *   1. SHOPIFY_WEBHOOK_SECRET environment variable
 *   2. The shopifySecret field in the IntegrationCredentials DB row
 *      (set via the Integrations page in the app)
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { nanoid } from "@/lib/nanoid";
import { format, startOfMonth, endOfMonth, differenceInCalendarDays } from "date-fns";

interface ShopifyLineItem {
  sku: string;
  quantity: number;
  name: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  line_items: ShopifyLineItem[];
}

function verifyHmac(body: string, signature: string, secret: string): boolean {
  const digest = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  // Resolve webhook secret: env var → DB credentials → none (skip verification)
  let secret: string | undefined = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    try {
      const creds = await prisma.integrationCredentials.findUnique({
        where: { id: "singleton" },
        select: { shopifySecret: true },
      });
      secret = creds?.shopifySecret ?? undefined;
    } catch {
      // DB unavailable — proceed without verification
    }
  }
  if (!secret) {
    console.warn("[Shopify Webhook] No webhook secret configured — skipping HMAC verification");
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-shopify-hmac-sha256") ?? "";

  if (secret && !verifyHmac(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (order.financial_status !== "paid") {
    return NextResponse.json({ ok: true, skipped: "not paid" });
  }

  const orderDate = new Date(order.created_at);
  const monthKey = format(orderDate, "yyyy-MM");

  // Process each line item — group sales by SKU into monthly SalesPeriod records
  for (const item of order.line_items) {
    if (!item.sku) continue;

    const product = await prisma.product.findFirst({ where: { sku: item.sku } });
    if (!product) continue;

    const periodStart = format(startOfMonth(orderDate), "yyyy-MM-dd");
    const periodEnd = format(endOfMonth(orderDate), "yyyy-MM-dd");
    const totalDays =
      differenceInCalendarDays(endOfMonth(orderDate), startOfMonth(orderDate)) + 1;

    // Find or create the monthly sales period for this product
    const existing = await prisma.salesPeriod.findFirst({
      where: { productId: product.id, periodStart, periodEnd },
    });

    if (existing) {
      await prisma.salesPeriod.update({
        where: { id: existing.id },
        data: { unitsSold: { increment: item.quantity } },
      });
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
          notes: `Shopify webhook — order ${order.name} (${monthKey})`,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
