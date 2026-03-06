import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SETTINGS } from "@/types/settings";
import type { AppState } from "@/store/app-store";
import type { BoxDimensions, SizeCurve, InventorySnapshot } from "@/types/product";
import type { ProductForecast } from "@/types/forecast";
import type { POLineItem, OrderCycleType } from "@/types/purchase-order";

function unauth() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return unauth();

  try {
    const [products, salesPeriods, forecastRuns, purchaseOrders, orderCycles, suppliers, inventorySnapshots, dbSettings] =
      await Promise.all([
        prisma.product.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.salesPeriod.findMany({ orderBy: { periodStart: "asc" } }),
        prisma.forecastRun.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.orderCycle.findMany({ orderBy: { orderDate: "asc" } }),
        prisma.supplier.findMany({ orderBy: { name: "asc" } }),
        prisma.inventorySnapshot.findMany(),
        prisma.appSettings.findUnique({ where: { id: "singleton" } }),
      ]);

    const settings = dbSettings
      ? {
          ...DEFAULT_SETTINGS,
          businessName: dbSettings.businessName,
          currency: dbSettings.currency,
          defaultLandedCostFactor: dbSettings.defaultLandedCostFactor,
          targetGrossMarginPct: dbSettings.targetGrossMarginPct,
          defaultForecastWindowDays: dbSettings.defaultForecastWindowDays,
          orderCycles: JSON.parse(dbSettings.orderCycles || "[]") as typeof DEFAULT_SETTINGS.orderCycles,
          seasonalConfigs: JSON.parse(dbSettings.seasonalConfigs || "[]") as typeof DEFAULT_SETTINGS.seasonalConfigs,
        }
      : DEFAULT_SETTINGS;

    const state: AppState = {
      products: products.map((p) => ({
        id: p.id, sku: p.sku, name: p.name, category: p.category,
        subCategory: p.subCategory ?? undefined,
        supplierId: p.supplierId ?? undefined,
        rrpCents: p.rrpCents, costCents: p.costCents,
        landedCostCents: p.landedCostCents, landedCostFactor: p.landedCostFactor,
        boxDimensions: p.boxDimensions ? JSON.parse(p.boxDimensions) as BoxDimensions : undefined,
        sizeCurve: p.sizeCurve ? JSON.parse(p.sizeCurve) as SizeCurve : undefined,
        unitsPerCarton: p.unitsPerCarton, minOrderQty: p.minOrderQty, leadTimeDays: p.leadTimeDays,
        isActive: p.isActive, isNewToMarket: p.isNewToMarket,
        analogousProductId: p.analogousProductId ?? undefined,
        createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
      })),
      salesPeriods: salesPeriods.map((s) => ({
        id: s.id, productId: s.productId, periodStart: s.periodStart, periodEnd: s.periodEnd,
        totalDays: s.totalDays, inStockDays: s.inStockDays, unitsReceived: s.unitsReceived,
        unitsSold: s.unitsSold, openingStock: s.openingStock, closingStock: s.closingStock,
        hadStockout: s.hadStockout, notes: s.notes ?? undefined,
        createdAt: s.createdAt.toISOString(),
      })),
      forecastRuns: forecastRuns.map((f) => ({
        id: f.id, name: f.name, windowStart: f.windowStart, windowEnd: f.windowEnd,
        orderCycleId: f.orderCycleId ?? undefined,
        scenario: f.scenario ?? undefined,
        scenarioMultiplier: f.scenarioMultiplier ?? undefined,
        products: JSON.parse(f.products) as ProductForecast[],
        errors: f.errors ? JSON.parse(f.errors) as string[] : undefined,
        notes: f.notes ?? undefined, createdAt: f.createdAt.toISOString(),
      })),
      purchaseOrders: purchaseOrders.map((po) => ({
        id: po.id, reference: po.reference, orderCycleId: po.orderCycleId,
        supplierId: po.supplierId ?? undefined, supplierName: po.supplierName ?? undefined,
        status: po.status as "draft"|"submitted"|"confirmed"|"received",
        lines: JSON.parse(po.lines) as POLineItem[],
        fullValueCents: po.fullValueCents, optimisedValueCents: po.optimisedValueCents,
        budgetCents: po.budgetCents, totalRevenueCents: po.totalRevenueCents,
        totalGrossProfitCents: po.totalGrossProfitCents, overallGrossMarginPct: po.overallGrossMarginPct,
        totalVolumeCBM: po.totalVolumeCBM ?? undefined, notes: po.notes ?? undefined,
        createdAt: po.createdAt.toISOString(), updatedAt: po.updatedAt.toISOString(),
      })),
      orderCycles: orderCycles.map((c) => ({
        id: c.id, name: c.name, type: c.type as OrderCycleType,
        orderDate: c.orderDate, expectedDeliveryDate: c.expectedDeliveryDate,
        seasonStart: c.seasonStart, seasonEnd: c.seasonEnd,
        budgetCents: c.budgetCents, maxVolumeCBM: c.maxVolumeCBM ?? undefined,
        isActive: c.isActive,
      })),
      inventorySnapshots: inventorySnapshots.map((s) => ({
        id: s.id,
        productId: s.productId,
        quantityOnHand: s.quantityOnHand,
        reorderPoint: s.reorderPoint,
        lastUpdated: s.lastUpdated.toISOString(),
      })),
      suppliers: suppliers.map((s) => ({
        id: s.id, code: s.code, name: s.name, country: s.country, currency: s.currency,
        leadTimeDays: s.leadTimeDays, leadTimeAlertDays: s.leadTimeAlertDays,
        paymentTerms: s.paymentTerms ?? undefined, contactName: s.contactName ?? undefined,
        contactEmail: s.contactEmail ?? undefined, notes: s.notes ?? undefined,
        isActive: s.isActive, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
      })),
      settings,
    };

    return NextResponse.json(state);
  } catch (err) {
    console.error("[GET /api/sync]", err);
    return NextResponse.json({ error: "Database read failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauth();
  if (session.user.role === "VIEWER") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    const state = await req.json() as AppState;

    await prisma.$transaction(async (tx) => {
      for (const p of state.products) {
        const { createdAt, updatedAt, boxDimensions, sizeCurve, ...rest } = p;
        const data = {
          ...rest,
          boxDimensions: boxDimensions ? JSON.stringify(boxDimensions) : null,
          sizeCurve: sizeCurve ? JSON.stringify(sizeCurve) : null,
        };
        await tx.product.upsert({
          where: { id: p.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          create: { ...data, id: p.id, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: { ...data, updatedAt: new Date(updatedAt) } as any,
        });
      }
      for (const s of state.salesPeriods) {
        const { createdAt, ...rest } = s;
        await tx.salesPeriod.upsert({
          where: { id: s.id },
          create: { ...rest, id: s.id, createdAt: new Date(createdAt) },
          update: rest,
        });
      }
      for (const f of state.forecastRuns) {
        const { createdAt, products: fps, errors: errs, ...rest } = f;
        const data = { ...rest, products: JSON.stringify(fps), errors: errs ? JSON.stringify(errs) : null };
        await tx.forecastRun.upsert({
          where: { id: f.id },
          create: { ...data, id: f.id, createdAt: new Date(createdAt) },
          update: data,
        });
      }
      for (const po of state.purchaseOrders) {
        const { createdAt, updatedAt, lines, ...rest } = po;
        const data = { ...rest, lines: JSON.stringify(lines) };
        await tx.purchaseOrder.upsert({
          where: { id: po.id },
          create: { ...data, id: po.id, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) },
          update: { ...data, updatedAt: new Date(updatedAt) },
        });
      }
      for (const c of state.orderCycles) {
        await tx.orderCycle.upsert({ where: { id: c.id }, create: c, update: c });
      }
      for (const s of state.suppliers) {
        const { createdAt, updatedAt, ...rest } = s;
        await tx.supplier.upsert({
          where: { id: s.id },
          create: { ...rest, id: s.id, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) },
          update: { ...rest, updatedAt: new Date(updatedAt) },
        });
      }
      for (const snap of (state.inventorySnapshots ?? [])) {
        await tx.inventorySnapshot.upsert({
          where: { productId: snap.productId },
          create: {
            id: snap.id,
            productId: snap.productId,
            quantityOnHand: snap.quantityOnHand,
            reorderPoint: snap.reorderPoint,
            lastUpdated: new Date(snap.lastUpdated),
          },
          update: {
            quantityOnHand: snap.quantityOnHand,
            reorderPoint: snap.reorderPoint,
            lastUpdated: new Date(snap.lastUpdated),
          },
        });
      }
      await tx.appSettings.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton", ...state.settings,
          orderCycles: JSON.stringify(state.settings.orderCycles),
          seasonalConfigs: JSON.stringify(state.settings.seasonalConfigs),
        },
        update: {
          ...state.settings,
          orderCycles: JSON.stringify(state.settings.orderCycles),
          seasonalConfigs: JSON.stringify(state.settings.seasonalConfigs),
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/sync]", err);
    return NextResponse.json({ error: "Database write failed" }, { status: 500 });
  }
}
