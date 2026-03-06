"use client";

import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPct } from "@/lib/costs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from "recharts";

const ABC_COLORS = { A: "#22C55E", B: "#F59E0B", C: "#EF4444" } as const;

type ABCClass = "A" | "B" | "C";

interface ABCProduct {
  productId: string;
  sku: string;
  name: string;
  category: string;
  revenueCents: number;
  revenuePct: number;
  cumulativePct: number;
  abcClass: ABCClass;
}

/**
 * Standard Pareto / ABC classification.
 * A product is classified based on its cumulative position BEFORE adding its own contribution:
 *  - A: needed to reach the first 80% of total revenue
 *  - B: between 80% and 95%
 *  - C: tail beyond 95%
 */
function classifyABC(prevCumulativePct: number): ABCClass {
  if (prevCumulativePct < 80) return "A";
  if (prevCumulativePct < 95) return "B";
  return "C";
}

export default function ABCAnalysisPage() {
  const { state } = useAppStore();
  const { products, salesPeriods } = state;

  const productRevenue = products
    .filter((p) => p.isActive)
    .map((p) => {
      const periods = salesPeriods.filter((sp) => sp.productId === p.id);
      const revenueCents = periods.reduce((s, sp) => s + sp.unitsSold * p.rrpCents, 0);
      return { product: p, revenueCents };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const totalRevenue = productRevenue.reduce((s, p) => s + p.revenueCents, 0);

  let cumulative = 0;
  const abcData: ABCProduct[] = productRevenue.map(({ product, revenueCents }) => {
    const prevCumulative = cumulative;
    const revenuePct = totalRevenue > 0 ? (revenueCents / totalRevenue) * 100 : 0;
    cumulative += revenuePct;
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      revenueCents,
      revenuePct,
      cumulativePct: cumulative,
      abcClass: classifyABC(prevCumulative),
    };
  });

  const countA = abcData.filter((p) => p.abcClass === "A").length;
  const countB = abcData.filter((p) => p.abcClass === "B").length;
  const countC = abcData.filter((p) => p.abcClass === "C").length;
  const revenueA = abcData.filter((p) => p.abcClass === "A").reduce((s, p) => s + p.revenueCents, 0);
  const revenueB = abcData.filter((p) => p.abcClass === "B").reduce((s, p) => s + p.revenueCents, 0);
  const revenueC = abcData.filter((p) => p.abcClass === "C").reduce((s, p) => s + p.revenueCents, 0);

  const chartData = abcData.map((p, i) => ({
    name: p.sku,
    revenue: Math.round(p.revenueCents / 100),
    cumulative: Math.round(p.cumulativePct * 10) / 10,
    abcClass: p.abcClass,
    index: i + 1,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {([
          { cls: "A" as ABCClass, count: countA, rev: revenueA, desc: "Top 80% revenue" },
          { cls: "B" as ABCClass, count: countB, rev: revenueB, desc: "Next 15% revenue" },
          { cls: "C" as ABCClass, count: countC, rev: revenueC, desc: "Bottom 5% revenue" },
        ] as const).map(({ cls, count, rev, desc }) => (
          <Card key={cls}>
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center text-sm font-800 text-white"
                    style={{ backgroundColor: ABC_COLORS[cls] }}
                  >
                    {cls}
                  </span>
                  <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">
                    Class {cls}
                  </p>
                </div>
                <p className="font-mono text-2xl font-700 text-brand-black">
                  {count} <span className="text-sm font-500 text-brand-dark-gray">SKUs</span>
                </p>
                <p className="mt-0.5 text-xs text-brand-dark-gray">
                  {formatCurrency(rev)} · {desc}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pareto Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pareto Chart — Revenue by SKU</CardTitle>
          </CardHeader>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 40, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === "revenue" ? `$${v.toLocaleString()}` : `${v}%`
                }
              />
              <ReferenceLine yAxisId="right" y={80} stroke="#22C55E" strokeDasharray="4 4" label={{ value: "80%", fill: "#22C55E", fontSize: 10 }} />
              <ReferenceLine yAxisId="right" y={95} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: "95%", fill: "#F59E0B", fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="revenue" name="revenue" radius={0}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={ABC_COLORS[entry.abcClass]} />
                ))}
              </Bar>
              <Bar yAxisId="right" dataKey="cumulative" name="cumulative %" fill="transparent" stroke="#0A0A0A" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Product Table */}
      <Card>
        <CardHeader>
          <CardTitle>Product Rankings ({abcData.length})</CardTitle>
        </CardHeader>
        {abcData.length === 0 ? (
          <p className="py-8 text-center text-sm text-brand-dark-gray">
            Add products and sales data to see ABC analysis.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {["Rank", "Class", "SKU", "Product", "Category", "Revenue", "% of Total", "Cumulative %"].map(
                    (h) => (
                      <th
                        key={h}
                        className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {abcData.map((p, i) => (
                  <tr key={p.productId} className="hover:bg-brand-gray/30">
                    <td className="py-2 pr-4 font-mono text-xs">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center text-[10px] font-800 text-white"
                        style={{ backgroundColor: ABC_COLORS[p.abcClass] }}
                      >
                        {p.abcClass}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.sku}</td>
                    <td className="py-2 pr-4 font-500">{p.name}</td>
                    <td className="py-2 pr-4 text-xs text-brand-dark-gray">{p.category}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{formatCurrency(p.revenueCents)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{formatPct(p.revenuePct)}</td>
                    <td className="py-2 pr-4 font-mono text-xs font-700">{formatPct(p.cumulativePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
