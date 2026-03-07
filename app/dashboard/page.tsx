"use client";

import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatPct,
  calculateGMROI,
  calculateWeeksOfCover,
  calculateReorderPoint,
  calculateOTB,
} from "@/lib/costs";
import { analyseVelocity } from "@/lib/forecasting";
import { MONTH_NAMES } from "@/lib/seasonal";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ArrowRight,
  AlertTriangle,
  TrendingUp,
  Package,
  ShoppingCart,
  Clock,
  PoundSterling,
  BarChart2,
  RefreshCw,
} from "lucide-react";
import type { SalesPeriod } from "@/types/sales";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function latestClosingStock(productId: string, salesPeriods: SalesPeriod[]): number {
  const periods = salesPeriods
    .filter((sp) => sp.productId === productId)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  return periods[0]?.closingStock ?? 0;
}

function daysSinceLastSale(productId: string, salesPeriods: SalesPeriod[]): number {
  const periods = salesPeriods
    .filter((sp) => sp.productId === productId && sp.unitsSold > 0)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  if (!periods[0]) return Infinity;
  return Math.floor((Date.now() - new Date(periods[0].periodEnd).getTime()) / 86_400_000);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { state } = useAppStore();
  const { products, salesPeriods, forecastRuns, purchaseOrders, orderCycles } = state;

  const activeProducts = products.filter((p) => p.isActive);

  // ── Core KPIs ────────────────────────────────────────────────────────────
  const stockoutRate =
    salesPeriods.length > 0
      ? (salesPeriods.filter((p) => p.hadStockout).length / salesPeriods.length) * 100
      : 0;

  const latestForecast = forecastRuns.at(-1);
  const totalForecastRevenue = latestForecast?.products.reduce((s, p) => s + p.totalRevenueCents, 0) ?? 0;
  const totalForecastProfit = latestForecast?.products.reduce((s, p) => s + p.totalGrossProfitCents, 0) ?? 0;
  const avgMargin = totalForecastRevenue > 0 ? (totalForecastProfit / totalForecastRevenue) * 100 : 0;
  const latestPO = purchaseOrders.at(-1);

  // ── Velocity map ─────────────────────────────────────────────────────────
  const velocityMap = new Map<string, number>();
  for (const p of activeProducts) {
    const analysis = analyseVelocity(salesPeriods.filter((sp) => sp.productId === p.id));
    if (analysis) velocityMap.set(p.id, analysis.weightedVelocity);
  }

  // ── Stock on order per product ────────────────────────────────────────────
  const stockOnOrder = new Map<string, number>();
  for (const po of purchaseOrders.filter((po) => po.status !== "received")) {
    for (const line of po.lines.filter((l) => l.isIncluded)) {
      stockOnOrder.set(line.productId, (stockOnOrder.get(line.productId) ?? 0) + line.orderedQty);
    }
  }

  // ── Weeks of Cover ────────────────────────────────────────────────────────
  const wocValues = activeProducts
    .map((p) => {
      const v = velocityMap.get(p.id) ?? 0;
      if (v <= 0) return null;
      return calculateWeeksOfCover(latestClosingStock(p.id, salesPeriods), stockOnOrder.get(p.id) ?? 0, v);
    })
    .filter((v): v is number => v !== null && isFinite(v));
  const avgWoC = wocValues.length > 0 ? wocValues.reduce((s, v) => s + v, 0) / wocValues.length : 0;

  // ── GMROI ────────────────────────────────────────────────────────────────
  const totalInventoryCosts = activeProducts.reduce((s, p) => {
    return s + latestClosingStock(p.id, salesPeriods) * p.landedCostCents;
  }, 0);
  const annualisedGP = (() => {
    if (!latestForecast || totalForecastProfit <= 0) return 0;
    const days = Math.max(
      1,
      (new Date(latestForecast.windowEnd).getTime() - new Date(latestForecast.windowStart).getTime()) / 86_400_000
    );
    return (totalForecastProfit / days) * 365;
  })();
  const gmroi = calculateGMROI(annualisedGP, totalInventoryCosts);

  // ── Open-to-Buy ───────────────────────────────────────────────────────────
  const otbByCycle = orderCycles
    .filter((c) => c.isActive)
    .map((cycle) => {
      const committed = purchaseOrders
        .filter((po) => po.orderCycleId === cycle.id && po.status !== "draft")
        .reduce((s, po) => s + po.optimisedValueCents, 0);
      return { cycle, committed, otb: calculateOTB(cycle.budgetCents, committed) };
    });
  const totalOTB = otbByCycle.reduce((s, c) => s + c.otb, 0);
  const totalBudget = otbByCycle.reduce((s, c) => s + c.cycle.budgetCents, 0);

  // ── Reorder Alerts ────────────────────────────────────────────────────────
  const reorderAlerts = activeProducts
    .flatMap((p) => {
      const v = velocityMap.get(p.id) ?? 0;
      if (v <= 0 || !p.leadTimeDays) return [];
      const stock = latestClosingStock(p.id, salesPeriods);
      const onOrder = stockOnOrder.get(p.id) ?? 0;
      const rop = calculateReorderPoint(v, p.leadTimeDays);
      if (stock + onOrder > rop) return [];
      return [{
        product: p,
        stock,
        onOrder,
        rop,
        velocity: v,
        daysLeft: v > 0 ? Math.floor((stock + onOrder) / v) : Infinity,
      }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);

  // ── Dead Stock ────────────────────────────────────────────────────────────
  const deadStock = activeProducts
    .flatMap((p) => {
      const days = daysSinceLastSale(p.id, salesPeriods);
      const stock = latestClosingStock(p.id, salesPeriods);
      if (days < 90 || stock <= 0) return [];
      return [{ product: p, stock, days, value: stock * p.landedCostCents }];
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // ── Category STR chart ────────────────────────────────────────────────────
  const categoryMap = new Map<string, { sold: number; received: number }>();
  for (const p of products) {
    if (!categoryMap.has(p.category)) categoryMap.set(p.category, { sold: 0, received: 0 });
    const cat = categoryMap.get(p.category)!;
    for (const sp of salesPeriods.filter((sp) => sp.productId === p.id)) {
      cat.sold += sp.unitsSold; cat.received += sp.unitsReceived;
    }
  }
  const categoryData = Array.from(categoryMap.entries()).map(([name, d]) => ({
    name,
    str: d.received > 0 ? Math.round((d.sold / d.received) * 100) : 0,
  }));

  // ── Monthly forecast chart ────────────────────────────────────────────────
  const monthlyChartData = (() => {
    if (!latestForecast) return MONTH_NAMES.map((name) => ({ name, Revenue: 0, "Gross Profit": 0, Cost: 0 }));
    const periodSet = new Set<string>();
    for (const pf of latestForecast.products) for (const m of pf.monthly) periodSet.add(m.period);
    return Array.from(periodSet).sort().map((period) => {
      const mo = parseInt(period.split("-")[1], 10);
      let rev = 0, cost = 0;
      for (const pf of latestForecast.products) {
        const m = pf.monthly.find((m) => m.period === period);
        if (m) { rev += m.revenueCents; cost += m.costCents; }
      }
      return { name: MONTH_NAMES[mo - 1], Revenue: Math.round(rev / 100), "Gross Profit": Math.round((rev - cost) / 100), Cost: Math.round(cost / 100) };
    });
  })();

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Row 1 — Core KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Active Products" value={String(activeProducts.length)}
          sub={`${products.filter((p) => p.isNewToMarket).length} new-to-market`}
          icon={<Package className="h-5 w-5 text-brand-dark-gray" />} />
        <KPICard label="Forecast Revenue" value={latestForecast ? formatCurrency(totalForecastRevenue) : "—"}
          sub={latestForecast ? `${formatPct(avgMargin)} GM · ${latestForecast.scenario ?? "base"}` : "No forecast yet"}
          icon={<TrendingUp className="h-5 w-5 text-brand-dark-gray" />} highlight={avgMargin >= 50} />
        <KPICard label="Stockout Rate" value={`${stockoutRate.toFixed(0)}%`}
          sub={`${salesPeriods.filter((p) => p.hadStockout).length} periods affected`}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} danger={stockoutRate > 20} />
        <KPICard label="Latest PO" value={latestPO ? formatCurrency(latestPO.optimisedValueCents) : "—"}
          sub={latestPO ? latestPO.status : "No orders yet"}
          icon={<ShoppingCart className="h-5 w-5 text-brand-dark-gray" />} />
      </div>

      {/* Row 2 — Buying Intelligence */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Avg Weeks of Cover"
          value={avgWoC > 0 ? `${avgWoC.toFixed(1)}w` : "—"}
          sub={avgWoC <= 0 ? "Add stock data" : avgWoC < 4 ? "⚠ Reorder urgently" : avgWoC > 20 ? "⚠ Excess risk" : "Healthy range"}
          icon={<Clock className="h-5 w-5 text-brand-dark-gray" />}
          danger={avgWoC > 0 && (avgWoC < 4 || avgWoC > 20)} highlight={avgWoC >= 6 && avgWoC <= 16} />
        <KPICard label="Open-to-Buy"
          value={totalBudget > 0 ? formatCurrency(Math.max(totalOTB, 0)) : "—"}
          sub={totalBudget > 0 ? `${formatPct(Math.max(0, totalOTB / totalBudget) * 100)} of ${formatCurrency(totalBudget)} left` : "No active cycles"}
          icon={<PoundSterling className="h-5 w-5 text-brand-dark-gray" />}
          highlight={totalOTB > 0} danger={totalOTB < 0} />
        <KPICard label="GMROI"
          value={gmroi > 0 ? `${gmroi.toFixed(2)}×` : "—"}
          sub={gmroi === 0 ? "Add forecast + stock data" : gmroi >= 2.5 ? "Above benchmark ≥2.5×" : "Below benchmark ≥2.5×"}
          icon={<BarChart2 className="h-5 w-5 text-brand-dark-gray" />}
          highlight={gmroi >= 2.5} danger={gmroi > 0 && gmroi < 1.5} />
        <KPICard label="Dead Stock SKUs"
          value={deadStock.length > 0 ? String(deadStock.length) : "0"}
          sub={deadStock.length > 0 ? `${formatCurrency(deadStock.reduce((s, d) => s + d.value, 0))} tied up` : "Clean — no dead stock"}
          icon={<RefreshCw className="h-5 w-5 text-brand-dark-gray" />}
          danger={deadStock.length > 0} />
      </div>

      {/* Reorder Alerts */}
      {reorderAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle><AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-500" />Reorder Alerts</CardTitle>
            <Badge variant="warning">{reorderAlerts.length} below reorder point</Badge>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {reorderAlerts.map(({ product, stock, onOrder, rop, velocity, daysLeft }) => (
              <div key={product.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-600">{product.name}</p>
                  <p className="text-xs text-brand-dark-gray">{product.sku} · {product.category}</p>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <div>
                    <p className="font-mono text-[10px] text-brand-dark-gray">Stock + On Order</p>
                    <p className="font-mono text-xs font-700">{stock} + {onOrder}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-brand-dark-gray">ROP</p>
                    <p className="font-mono text-xs font-700 text-amber-600">{rop}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-brand-dark-gray">Days Left</p>
                    <p className={`font-mono text-sm font-700 ${daysLeft < 14 ? "text-red-600" : "text-amber-600"}`}>
                      {isFinite(daysLeft) ? `${daysLeft}d` : "∞"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-brand-dark-gray">Velocity</p>
                    <p className="font-mono text-xs">{velocity.toFixed(2)}/d</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-gray-100 pt-2">
            <Link href="/purchase-orders" className="text-xs font-600 text-brand-red">Create Purchase Order →</Link>
          </div>
        </Card>
      )}

      {/* OTB by Cycle */}
      {otbByCycle.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open-to-Buy by Cycle</CardTitle>
            <Link href="/purchase-orders" className="text-xs font-600 text-brand-red">View Orders →</Link>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {otbByCycle.map(({ cycle, committed, otb }) => {
              const pctUsed = cycle.budgetCents > 0 ? (committed / cycle.budgetCents) * 100 : 0;
              return (
                <div key={cycle.id} className="py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-600">{cycle.name} <Badge variant="info" className="ml-1 text-[10px]">{cycle.type}</Badge></span>
                    <span className="font-mono text-xs">
                      <span className={`font-700 ${otb < 0 ? "text-red-600" : "text-green-700"}`}>{formatCurrency(Math.abs(otb))}</span>
                      <span className="text-brand-dark-gray"> {otb < 0 ? "over" : "remaining"} · {formatCurrency(committed)} of {formatCurrency(cycle.budgetCents)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div className={`h-full rounded-full ${pctUsed > 100 ? "bg-red-500" : pctUsed > 80 ? "bg-amber-400" : "bg-brand-red"}`}
                      style={{ width: `${Math.min(pctUsed, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Forecast Revenue vs Profit</CardTitle>
            {latestForecast && <Badge variant="info" className="text-[10px]">{latestForecast.name}</Badge>}
          </CardHeader>
          {latestForecast ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number, name: string) => [`£${v.toLocaleString("en-GB")}`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Revenue" fill="#E30713" radius={0} />
                <Bar dataKey="Gross Profit" fill="#22C55E" radius={0} />
                <Bar dataKey="Cost" fill="#6B6B6B" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Run a forecast to see revenue projections" href="/forecasting" />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Sell-Through Rate</CardTitle>
            <Link href="/analytics" className="text-xs font-600 text-brand-red">ABC Analysis →</Link>
          </CardHeader>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}%`, "STR"]} />
                <Bar dataKey="str" fill="#0A0A0A" name="STR %" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Add products and sales data" href="/products" />
          )}
        </Card>
      </div>

      {/* Dead Stock */}
      {deadStock.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle><RefreshCw className="mr-1.5 inline h-4 w-4 text-red-500" />Dead Stock — No Sales 90+ Days</CardTitle>
            <Badge variant="danger">{formatCurrency(deadStock.reduce((s, d) => s + d.value, 0))} at risk</Badge>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {deadStock.map(({ product, stock, days, value }) => (
              <div key={product.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-600">{product.name}</p>
                  <p className="text-xs text-brand-dark-gray">{product.sku} · {product.category}</p>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <div><p className="font-mono text-[10px] text-brand-dark-gray">Units</p><p className="font-mono text-xs font-700">{stock}</p></div>
                  <div><p className="font-mono text-[10px] text-brand-dark-gray">No Sales</p><p className="font-mono text-sm font-700 text-red-600">{isFinite(days) ? `${days}d` : "Never sold"}</p></div>
                  <div><p className="font-mono text-[10px] text-brand-dark-gray">Tied-up Value</p><p className="font-mono text-sm font-700">{formatCurrency(value)}</p></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-gray-100 pt-2">
            <Link href="/analytics" className="text-xs font-600 text-brand-red">Full analytics →</Link>
          </div>
        </Card>
      )}

      {products.length === 0 && (
        <Card className="border border-dashed border-gray-300 bg-transparent shadow-none">
          <div className="py-4 text-center">
            <p className="mb-1 text-sm font-600">Get started</p>
            <p className="mb-4 text-xs text-brand-dark-gray">Add your product catalogue to begin forecasting</p>
            <Link href="/products" className="inline-flex items-center gap-1 bg-brand-red px-4 py-2 text-sm font-600 text-white hover:bg-red-700">
              Add Products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function KPICard({ label, value, sub, icon, highlight, danger }: {
  label: string; value: string; sub: string; icon: React.ReactNode; highlight?: boolean; danger?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
          <p className={`mt-1 font-mono text-2xl font-700 ${danger ? "text-red-600" : highlight ? "text-green-600" : "text-brand-black"}`}>{value}</p>
          <p className="mt-0.5 text-xs text-brand-dark-gray">{sub}</p>
        </div>
        <div className="mt-0.5">{icon}</div>
      </div>
    </Card>
  );
}

function EmptyState({ message, href }: { message: string; href: string }) {
  return (
    <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
      <p className="text-xs text-brand-dark-gray">{message}</p>
      <Link href={href} className="text-xs font-600 text-brand-red underline">Get started →</Link>
    </div>
  );
}
