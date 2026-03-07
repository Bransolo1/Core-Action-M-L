"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  formatPct,
  calculateGMROI,
  calculateWeeksOfCover,
  calculateInventoryTurnover,
  buildABCRanking,
  type ABCClass,
} from "@/lib/costs";
import { analyseVelocity } from "@/lib/forecasting";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { SalesPeriod } from "@/types/sales";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function latestClosingStock(productId: string, salesPeriods: SalesPeriod[]): number {
  return (
    [...salesPeriods]
      .filter((sp) => sp.productId === productId)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0]?.closingStock ?? 0
  );
}

function daysSinceLastSale(productId: string, salesPeriods: SalesPeriod[]): number {
  const last = [...salesPeriods]
    .filter((sp) => sp.productId === productId && sp.unitsSold > 0)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (!last) return Infinity;
  return Math.floor((Date.now() - new Date(last.periodEnd).getTime()) / 86_400_000);
}

const ABC_COLOURS: Record<ABCClass, string> = {
  A: "#E30713",
  B: "#F59E0B",
  C: "#6B7280",
};

const ABC_BG: Record<ABCClass, string> = {
  A: "bg-red-100 text-red-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-gray-100 text-gray-600",
};

type Tab = "abc" | "gmroi" | "cover" | "dead";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { state } = useAppStore();
  const { products, salesPeriods, forecastRuns, purchaseOrders } = state;
  const [tab, setTab] = useState<Tab>("abc");
  const [abcFilter, setAbcFilter] = useState<ABCClass | "all">("all");

  const activeProducts = products.filter((p) => p.isActive);
  const latestForecast = forecastRuns.at(-1);

  // ── Revenue per product from latest forecast ──────────────────────────────
  const revenueByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!latestForecast) return map;
    for (const pf of latestForecast.products) map.set(pf.productId, pf.totalRevenueCents);
    return map;
  }, [latestForecast]);

  // ── Historical sold units & revenue per product ────────────────────────────
  const historicalRevByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activeProducts) {
      const rev = salesPeriods
        .filter((sp) => sp.productId === p.id)
        .reduce((s, sp) => s + sp.unitsSold * p.rrpCents, 0);
      map.set(p.id, rev);
    }
    return map;
  }, [activeProducts, salesPeriods]);

  // Use forecast revenue if available, else historical
  const revenueSource = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activeProducts) {
      map.set(p.id, revenueByProduct.get(p.id) ?? historicalRevByProduct.get(p.id) ?? 0);
    }
    return map;
  }, [activeProducts, revenueByProduct, historicalRevByProduct]);

  // ── ABC Ranking ───────────────────────────────────────────────────────────
  const abcRanking = useMemo(() => {
    const input = activeProducts.map((p) => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      revenueCents: revenueSource.get(p.id) ?? 0,
    }));
    return buildABCRanking(input);
  }, [activeProducts, revenueSource]);

  const abcCounts = useMemo(
    () => ({
      A: abcRanking.filter((p) => p.abcClass === "A").length,
      B: abcRanking.filter((p) => p.abcClass === "B").length,
      C: abcRanking.filter((p) => p.abcClass === "C").length,
    }),
    [abcRanking]
  );

  const filteredABC = abcFilter === "all" ? abcRanking : abcRanking.filter((p) => p.abcClass === abcFilter);

  // ── Velocity & stock map ──────────────────────────────────────────────────
  const velocityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activeProducts) {
      const a = analyseVelocity(salesPeriods.filter((sp) => sp.productId === p.id));
      if (a) map.set(p.id, a.weightedVelocity);
    }
    return map;
  }, [activeProducts, salesPeriods]);

  const stockOnOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const po of purchaseOrders.filter((po) => po.status !== "received")) {
      for (const line of po.lines.filter((l) => l.isIncluded)) {
        map.set(line.productId, (map.get(line.productId) ?? 0) + line.orderedQty);
      }
    }
    return map;
  }, [purchaseOrders]);

  // ── GMROI by category ─────────────────────────────────────────────────────
  const gmroiByCategory = useMemo(() => {
    const catMap = new Map<string, { gp: number; inventoryCost: number; cogs: number }>();
    for (const p of activeProducts) {
      if (!catMap.has(p.category)) catMap.set(p.category, { gp: 0, inventoryCost: 0, cogs: 0 });
      const cat = catMap.get(p.category)!;
      // Annualise GP from forecast
      if (latestForecast) {
        const pf = latestForecast.products.find((pf) => pf.productId === p.id);
        if (pf) {
          const days = Math.max(
            1,
            (new Date(latestForecast.windowEnd).getTime() - new Date(latestForecast.windowStart).getTime()) / 86_400_000
          );
          cat.gp += (pf.totalGrossProfitCents / days) * 365;
          cat.cogs += (pf.totalCostCents / days) * 365;
        }
      }
      const stock = latestClosingStock(p.id, salesPeriods);
      cat.inventoryCost += stock * p.landedCostCents;
    }
    return Array.from(catMap.entries())
      .map(([category, data]) => ({
        category,
        gmroi: calculateGMROI(data.gp, data.inventoryCost),
        turnover: calculateInventoryTurnover(data.cogs, data.inventoryCost),
        inventoryCost: data.inventoryCost,
      }))
      .filter((c) => c.gmroi > 0 || c.inventoryCost > 0)
      .sort((a, b) => b.gmroi - a.gmroi);
  }, [activeProducts, latestForecast, salesPeriods]);

  // ── Forward Cover table ───────────────────────────────────────────────────
  const coverData = useMemo(() => {
    return activeProducts
      .map((p) => {
        const v = velocityMap.get(p.id) ?? 0;
        const stock = latestClosingStock(p.id, salesPeriods);
        const onOrder = stockOnOrder.get(p.id) ?? 0;
        const woc = v > 0 ? calculateWeeksOfCover(stock, onOrder, v) : null;
        return { product: p, stock, onOrder, velocity: v, woc };
      })
      .filter((d) => d.velocity > 0 || d.stock > 0)
      .sort((a, b) => {
        if (a.woc === null) return 1;
        if (b.woc === null) return -1;
        return a.woc - b.woc;
      });
  }, [activeProducts, velocityMap, salesPeriods, stockOnOrder]);

  // ── Dead Stock ────────────────────────────────────────────────────────────
  const deadStockData = useMemo(() => {
    return activeProducts
      .map((p) => {
        const days = daysSinceLastSale(p.id, salesPeriods);
        const stock = latestClosingStock(p.id, salesPeriods);
        const value = stock * p.landedCostCents;
        const rrpValue = stock * p.rrpCents;
        return { product: p, days, stock, value, rrpValue };
      })
      .filter((d) => d.stock > 0)
      .sort((a, b) => {
        if (!isFinite(a.days) && !isFinite(b.days)) return b.value - a.value;
        if (!isFinite(a.days)) return -1;
        if (!isFinite(b.days)) return 1;
        return b.days - a.days;
      });
  }, [activeProducts, salesPeriods]);

  const deadStockTotal = deadStockData.filter((d) => d.days >= 90).reduce((s, d) => s + d.value, 0);

  // ─── Render ──────────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string }[] = [
    { key: "abc", label: "ABC Analysis" },
    { key: "gmroi", label: "GMROI by Category" },
    { key: "cover", label: "Forward Cover" },
    { key: "dead", label: "Aged Stock" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-700 tracking-tight">Analytics</h1>
        <p className="mt-0.5 text-xs text-brand-dark-gray">
          ABC ranking · GMROI · Weeks of cover · Aged stock — the numbers every buyer needs
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-600 transition-colors ${
              tab === t.key
                ? "border-b-2 border-brand-red text-brand-red"
                : "text-brand-dark-gray hover:text-brand-black"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABC Analysis ──────────────────────────────────────────────── */}
      {tab === "abc" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {(["A", "B", "C"] as ABCClass[]).map((cls) => {
              const items = abcRanking.filter((p) => p.abcClass === cls);
              const rev = items.reduce((s, p) => s + p.revenueCents, 0);
              const totalRev = abcRanking.reduce((s, p) => s + p.revenueCents, 0);
              return (
                <Card key={cls}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-800 ${ABC_BG[cls]}`}>
                        Class {cls}
                      </span>
                      <p className="mt-2 font-mono text-2xl font-700">{items.length} SKUs</p>
                      <p className="text-xs text-brand-dark-gray">{formatCurrency(rev)}</p>
                      <p className="text-xs text-brand-dark-gray">
                        {totalRev > 0 ? formatPct((rev / totalRev) * 100) : "—"} of total revenue
                      </p>
                    </div>
                    <div
                      className="h-10 w-10 rounded-none"
                      style={{ backgroundColor: ABC_COLOURS[cls] + "33" }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Revenue concentration chart */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Concentration — Top 20 SKUs</CardTitle>
              <div className="flex gap-1.5">
                {(["all", "A", "B", "C"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAbcFilter(f)}
                    className={`rounded-none border px-2.5 py-1 text-xs font-600 ${
                      abcFilter === f
                        ? "border-brand-red bg-brand-red text-white"
                        : "border-gray-300 hover:border-brand-red"
                    }`}
                  >
                    {f === "all" ? "All" : `Class ${f}`}
                  </button>
                ))}
              </div>
            </CardHeader>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={filteredABC.slice(0, 20)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={(v) => `£${(v / 100).toLocaleString("en-GB")}`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="sku" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                <Bar dataKey="revenueCents" radius={0} name="Revenue">
                  {filteredABC.slice(0, 20).map((item, i) => (
                    <Cell key={i} fill={ABC_COLOURS[item.abcClass]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* ABC Class distribution pie */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Class Distribution by SKU Count</CardTitle></CardHeader>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={[
                    { name: "Class A", value: abcCounts.A },
                    { name: "Class B", value: abcCounts.B },
                    { name: "Class C", value: abcCounts.C },
                  ]} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {["A", "B", "C"].map((cls, i) => (
                      <Cell key={i} fill={ABC_COLOURS[cls as ABCClass]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <CardHeader><CardTitle>Full ABC Table</CardTitle></CardHeader>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-brand-dark-gray">
                      {["#", "SKU", "Name", "Class", "Revenue", "Cum%"].map((h) => (
                        <th key={h} className="pb-1 pr-3 font-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredABC.map((item, i) => (
                      <tr key={item.productId} className={i % 2 === 0 ? "bg-white" : "bg-brand-gray/30"}>
                        <td className="py-1 pr-3 font-mono text-brand-dark-gray">{i + 1}</td>
                        <td className="py-1 pr-3 font-mono font-600">{item.sku}</td>
                        <td className="py-1 pr-3 max-w-[180px] truncate">{item.name}</td>
                        <td className="py-1 pr-3">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-800 ${ABC_BG[item.abcClass]}`}>
                            {item.abcClass}
                          </span>
                        </td>
                        <td className="py-1 pr-3 font-mono">{formatCurrency(item.revenueCents)}</td>
                        <td className="py-1 font-mono text-brand-dark-gray">{item.cumulativePct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── GMROI by Category ─────────────────────────────────────── */}
      {tab === "gmroi" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GMROI by Category</CardTitle>
              <Badge variant="info" className="text-[10px]">Benchmark ≥ 2.5×</Badge>
            </CardHeader>
            {gmroiByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={gmroiByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}×`} />
                  <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)}×`, "GMROI"]} />
                  <Bar dataKey="gmroi" radius={0} name="GMROI">
                    {gmroiByCategory.map((c, i) => (
                      <Cell key={i} fill={c.gmroi >= 2.5 ? "#22C55E" : c.gmroi >= 1.5 ? "#F59E0B" : "#EF4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-xs text-brand-dark-gray">Run a forecast to calculate GMROI</p>
            )}
          </Card>

          {/* GMROI detail table */}
          <Card>
            <CardHeader><CardTitle>Category Performance Detail</CardTitle></CardHeader>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-dark-gray">
                  {["Category", "GMROI", "Turnover", "Inventory Value", "Signal"].map((h) => (
                    <th key={h} className="pb-2 pr-4 font-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gmroiByCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="py-2 pr-4 font-600">{c.category}</td>
                    <td className={`py-2 pr-4 font-mono font-700 ${c.gmroi >= 2.5 ? "text-green-600" : c.gmroi >= 1.5 ? "text-amber-600" : "text-red-600"}`}>
                      {c.gmroi.toFixed(2)}×
                    </td>
                    <td className="py-2 pr-4 font-mono">{c.turnover.toFixed(1)}×</td>
                    <td className="py-2 pr-4 font-mono">{formatCurrency(c.inventoryCost)}</td>
                    <td className="py-2">
                      {c.gmroi >= 2.5 ? <Badge variant="success">Strong</Badge>
                        : c.gmroi >= 1.5 ? <Badge variant="warning">Review</Badge>
                        : c.gmroi > 0 ? <Badge variant="danger">Poor</Badge>
                        : <span className="text-brand-dark-gray">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── Forward Cover ──────────────────────────────────────────── */}
      {tab === "cover" && (
        <Card>
          <CardHeader>
            <CardTitle>Forward Cover by SKU</CardTitle>
            <div className="flex items-center gap-3 text-[10px] text-brand-dark-gray">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />{"<4w danger"}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />{"4–8w low"}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />{"8–16w ok"}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />{">16w excess"}</span>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-dark-gray">
                  {["SKU", "Name", "Category", "Stock", "+On Order", "Velocity /d", "Weeks Cover", "Status"].map((h) => (
                    <th key={h} className="pb-2 pr-4 font-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coverData.map(({ product, stock, onOrder, velocity, woc }) => {
                  const wocStatus = woc === null
                    ? "no-data"
                    : woc < 4 ? "danger"
                    : woc < 8 ? "low"
                    : woc <= 16 ? "ok"
                    : "excess";

                  return (
                    <tr key={product.id}>
                      <td className="py-2 pr-4 font-mono font-600">{product.sku}</td>
                      <td className="py-2 pr-4 max-w-[160px] truncate">{product.name}</td>
                      <td className="py-2 pr-4 text-brand-dark-gray">{product.category}</td>
                      <td className="py-2 pr-4 font-mono">{stock}</td>
                      <td className="py-2 pr-4 font-mono text-brand-dark-gray">{onOrder > 0 ? `+${onOrder}` : "—"}</td>
                      <td className="py-2 pr-4 font-mono">{velocity > 0 ? velocity.toFixed(2) : "—"}</td>
                      <td className={`py-2 pr-4 font-mono font-700 ${
                        wocStatus === "danger" ? "text-red-600"
                          : wocStatus === "low" ? "text-amber-600"
                          : wocStatus === "ok" ? "text-green-600"
                          : wocStatus === "excess" ? "text-gray-500"
                          : "text-brand-dark-gray"
                      }`}>
                        {woc !== null && isFinite(woc) ? `${woc.toFixed(1)}w` : "—"}
                      </td>
                      <td className="py-2">
                        {wocStatus === "danger" && <Badge variant="danger">Reorder</Badge>}
                        {wocStatus === "low" && <Badge variant="warning">Low</Badge>}
                        {wocStatus === "ok" && <Badge variant="success">OK</Badge>}
                        {wocStatus === "excess" && <Badge variant="default">Excess</Badge>}
                        {wocStatus === "no-data" && <span className="text-brand-dark-gray">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Aged Stock ───────────────────────────────────────────────── */}
      {tab === "dead" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Never Sold (stock on hand)", count: deadStockData.filter((d) => !isFinite(d.days)).length, value: deadStockData.filter((d) => !isFinite(d.days)).reduce((s, d) => s + d.value, 0), colour: "danger" as const },
              { label: "90+ Days No Sales", count: deadStockData.filter((d) => isFinite(d.days) && d.days >= 90).length, value: deadStockData.filter((d) => isFinite(d.days) && d.days >= 90).reduce((s, d) => s + d.value, 0), colour: "warning" as const },
              { label: "30–89 Days — Watch", count: deadStockData.filter((d) => isFinite(d.days) && d.days >= 30 && d.days < 90).length, value: deadStockData.filter((d) => isFinite(d.days) && d.days >= 30 && d.days < 90).reduce((s, d) => s + d.value, 0), colour: "info" as const },
            ].map(({ label, count, value, colour }) => (
              <Card key={label}>
                <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
                <p className="mt-1 font-mono text-2xl font-700">{count} SKUs</p>
                <p className="font-mono text-sm text-brand-dark-gray">{formatCurrency(value)} at cost</p>
                {value > 0 && <Badge variant={colour} className="mt-1 text-[10px]">Action needed</Badge>}
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Stock with Aged Analysis</CardTitle>
              <p className="text-[10px] text-brand-dark-gray">
                Sorted by days since last sale. Red = 90+ days (dead). Amber = 30–89 days (watch).
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-brand-dark-gray">
                    {["SKU", "Name", "Category", "Stock", "Days Since Sale", "Cost Value", "RRP Value", "Status"].map((h) => (
                      <th key={h} className="pb-2 pr-4 font-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {deadStockData.map(({ product, days, stock, value, rrpValue }) => {
                    const status = !isFinite(days) ? "never" : days >= 90 ? "dead" : days >= 30 ? "watch" : "ok";
                    return (
                      <tr key={product.id} className={status === "dead" || status === "never" ? "bg-red-50/40" : status === "watch" ? "bg-amber-50/40" : ""}>
                        <td className="py-2 pr-4 font-mono font-600">{product.sku}</td>
                        <td className="py-2 pr-4 max-w-[160px] truncate">{product.name}</td>
                        <td className="py-2 pr-4 text-brand-dark-gray">{product.category}</td>
                        <td className="py-2 pr-4 font-mono font-700">{stock}</td>
                        <td className={`py-2 pr-4 font-mono font-700 ${status === "dead" || status === "never" ? "text-red-600" : status === "watch" ? "text-amber-600" : "text-green-600"}`}>
                          {isFinite(days) ? `${days}d` : "Never sold"}
                        </td>
                        <td className="py-2 pr-4 font-mono">{formatCurrency(value)}</td>
                        <td className="py-2 pr-4 font-mono text-brand-dark-gray">{formatCurrency(rrpValue)}</td>
                        <td className="py-2">
                          {status === "never" && <Badge variant="danger">Never Sold</Badge>}
                          {status === "dead" && <Badge variant="danger">Dead Stock</Badge>}
                          {status === "watch" && <Badge variant="warning">Watch</Badge>}
                          {status === "ok" && <Badge variant="success">Moving</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] text-brand-dark-gray">
              Total dead stock ({">"}90d): <span className="font-700 text-red-600">{formatCurrency(deadStockTotal)}</span> at cost. Consider markdowns to free capital before next season.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
