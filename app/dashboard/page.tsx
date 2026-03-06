"use client";

import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPct } from "@/lib/costs";
import { calculateSellThrough } from "@/lib/forecasting";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { MONTH_NAMES } from "@/lib/seasonal";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowRight, AlertTriangle, TrendingUp, Package, ShoppingCart } from "lucide-react";

export default function DashboardPage() {
  const { state } = useAppStore();
  const { products, salesPeriods, forecastRuns, purchaseOrders } = state;

  // KPI calculations
  const totalProducts = products.filter((p) => p.isActive).length;
  const newToMarket = products.filter((p) => p.isNewToMarket).length;

  // Stockout analysis
  const periodsWithStockout = salesPeriods.filter((p) => p.hadStockout);
  const stockoutRate =
    salesPeriods.length > 0 ? (periodsWithStockout.length / salesPeriods.length) * 100 : 0;

  // Latest forecast totals
  const latestForecast = forecastRuns.at(-1);
  const totalForecastRevenue = latestForecast
    ? latestForecast.products.reduce((s, p) => s + p.totalRevenueCents, 0)
    : 0;
  const totalForecastProfit = latestForecast
    ? latestForecast.products.reduce((s, p) => s + p.totalGrossProfitCents, 0)
    : 0;
  const avgMargin =
    totalForecastRevenue > 0 ? (totalForecastProfit / totalForecastRevenue) * 100 : 0;

  // Latest PO totals
  const latestPO = purchaseOrders.at(-1);

  // Category performance
  const categoryMap = new Map<string, { sold: number; received: number; products: number }>();
  for (const p of products) {
    if (!categoryMap.has(p.category)) {
      categoryMap.set(p.category, { sold: 0, received: 0, products: 0 });
    }
    const cat = categoryMap.get(p.category)!;
    cat.products += 1;
    const periods = salesPeriods.filter((sp) => sp.productId === p.id);
    for (const sp of periods) {
      cat.sold += sp.unitsSold;
      cat.received += sp.unitsReceived;
    }
  }

  const categoryData = Array.from(categoryMap.entries()).map(([name, data]) => ({
    name,
    products: data.products,
    str: data.received > 0 ? Math.round((data.sold / data.received) * 100) : 0,
  }));

  // Monthly forecast chart data (from latest forecast run)
  const monthlyChartData = MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    let revenue = 0;
    let cost = 0;
    if (latestForecast) {
      for (const pf of latestForecast.products) {
        const mf = pf.monthly.find((m) => m.month === month);
        if (mf) {
          revenue += mf.revenueCents;
          cost += mf.costCents;
        }
      }
    }
    return {
      name,
      Revenue: Math.round(revenue / 100),
      Cost: Math.round(cost / 100),
      "Gross Profit": Math.round((revenue - cost) / 100),
    };
  });

  // Top stockout products
  const stockoutProducts = products
    .map((p) => {
      const periods = salesPeriods.filter((sp) => sp.productId === p.id);
      const sta = calculateSellThrough(periods);
      return { product: p, sta };
    })
    .filter((x) => x.sta.stockoutRate > 0.2)
    .sort((a, b) => b.sta.stockoutRate - a.sta.stockoutRate)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Active Products"
          value={String(totalProducts)}
          sub={`${newToMarket} new-to-market`}
          icon={<Package className="h-5 w-5 text-brand-dark-gray" />}
        />
        <KPICard
          label="Forecast Revenue"
          value={latestForecast ? formatCurrency(totalForecastRevenue) : "—"}
          sub={latestForecast ? `${formatPct(avgMargin)} GM` : "No forecast yet"}
          icon={<TrendingUp className="h-5 w-5 text-brand-dark-gray" />}
          highlight={avgMargin > 0}
        />
        <KPICard
          label="Stockout Rate"
          value={`${stockoutRate.toFixed(0)}%`}
          sub={`${periodsWithStockout.length} periods affected`}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          danger={stockoutRate > 20}
        />
        <KPICard
          label="Latest PO Value"
          value={latestPO ? formatCurrency(latestPO.optimisedValueCents) : "—"}
          sub={latestPO ? latestPO.status : "No orders yet"}
          icon={<ShoppingCart className="h-5 w-5 text-brand-dark-gray" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Forecast Revenue vs Cost</CardTitle>
            {latestForecast && (
              <Badge variant="info" className="text-[10px]">
                {latestForecast.name}
              </Badge>
            )}
          </CardHeader>
          {latestForecast ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
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
          </CardHeader>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="str" fill="#0A0A0A" name="STR %" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Add products and sales data to see performance" href="/products" />
          )}
        </Card>
      </div>

      {/* Stockout Alert Panel */}
      {stockoutProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stockout Risk — Top Products</CardTitle>
            <Badge variant="danger">{stockoutProducts.length} at risk</Badge>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {stockoutProducts.map(({ product, sta }) => (
              <div key={product.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-600">{product.name}</p>
                  <p className="text-xs text-brand-dark-gray">{product.sku} · {product.category}</p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="font-mono text-xs text-brand-dark-gray">Stockout Rate</p>
                    <p className="font-mono text-sm font-700 text-red-600">
                      {formatPct(sta.stockoutRate * 100)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs text-brand-dark-gray">Adj. Velocity</p>
                    <p className="font-mono text-sm font-700">
                      {sta.dailyVelocity.toFixed(1)}/day
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Links */}
      {products.length === 0 && (
        <Card className="border border-dashed border-gray-300 bg-transparent shadow-none">
          <div className="py-4 text-center">
            <p className="mb-1 text-sm font-600">Get started</p>
            <p className="mb-4 text-xs text-brand-dark-gray">
              Add your product catalogue to begin forecasting
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-1 bg-brand-red px-4 py-2 text-sm font-600 text-white hover:bg-red-700"
            >
              Add Products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function KPICard({
  label,
  value,
  sub,
  icon,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
          <p
            className={`mt-1 font-mono text-2xl font-700 ${
              danger ? "text-red-600" : highlight ? "text-green-600" : "text-brand-black"
            }`}
          >
            {value}
          </p>
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
      <Link href={href} className="text-xs font-600 text-brand-red underline">
        Get started →
      </Link>
    </div>
  );
}
