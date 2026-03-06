"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatPct } from "@/lib/costs";
import { MONTH_NAMES, ACTION_SPORTS_SEASONAL_AU, getFactorsForCategory } from "@/lib/seasonal";
import { calculateSellThrough } from "@/lib/forecasting";
import { nanoid } from "@/lib/nanoid";
import type { ForecastRun, ProductForecast } from "@/types/forecast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Play, Trash2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";

export default function ForecastingPage() {
  const { state, dispatch } = useAppStore();
  const { products, salesPeriods, forecastRuns, settings } = state;

  const [windowStart, setWindowStart] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [windowEnd, setWindowEnd] = useState(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [forecastName, setForecastName] = useState("");
  const [running, setRunning] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const selectedRun = forecastRuns.find((r) => r.id === selectedRunId) ?? forecastRuns.at(-1);

  async function runForecast() {
    if (!products.length) return;
    setRunning(true);

    const forecastProducts: ProductForecast[] = [];

    for (const product of products.filter((p) => p.isActive)) {
      try {
        const productSalesPeriods = salesPeriods.filter((sp) => sp.productId === product.id);
        const categoryProducts = products.filter(
          (p) => p.category === product.category && p.isActive
        );
        const allProductsInCategory = categoryProducts.map((p) => ({
          product: p,
          salesPeriods: salesPeriods.filter((sp) => sp.productId === p.id),
        }));

        const seasonalConfigs = settings.seasonalConfigs.length
          ? settings.seasonalConfigs
          : [{ category: product.category, factors: ACTION_SPORTS_SEASONAL_AU }];

        const res = await fetch("/api/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product,
            salesPeriods: productSalesPeriods,
            allProductsInCategory,
            seasonalConfigs,
            windowStart,
            windowEnd,
          }),
        });

        if (res.ok) {
          const pf: ProductForecast = await res.json();
          forecastProducts.push(pf);
        }
      } catch {
        // skip failed products
      }
    }

    const run: ForecastRun = {
      id: nanoid(),
      name: forecastName || `Forecast ${new Date().toLocaleDateString("en-AU")}`,
      createdAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      products: forecastProducts,
    };

    dispatch({ type: "UPSERT_FORECAST_RUN", run });
    setSelectedRunId(run.id);
    setRunning(false);
  }

  async function getAISuggestion() {
    if (!selectedRun) return;
    setAiLoading(true);
    setAiInsight(null);

    const context = `
Forecast: ${selectedRun.name}
Window: ${selectedRun.windowStart} to ${selectedRun.windowEnd}
Products analysed: ${selectedRun.products.length}
Total forecast revenue: ${formatCurrency(selectedRun.products.reduce((s, p) => s + p.totalRevenueCents, 0))}
Total forecast units: ${selectedRun.products.reduce((s, p) => s + p.totalUnits, 0)}
Average gross margin: ${formatPct(
      selectedRun.products.length > 0
        ? selectedRun.products.reduce((s, p) => s + p.overallGrossMarginPct, 0) / selectedRun.products.length
        : 0
    )}
Products with new-to-market velocity: ${selectedRun.products.filter((p) => p.velocitySource === "new-product").length}
Top 5 products by revenue:
${selectedRun.products
  .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
  .slice(0, 5)
  .map((p) => `- ${p.sku} ${p.name}: ${formatCurrency(p.totalRevenueCents)} (${formatPct(p.overallGrossMarginPct)} GM)`)
  .join("\n")}
    `.trim();

    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          question:
            "Review this forecast and provide: 1) Key risks (stockout, seasonal, margin), 2) Opportunities, 3) Recommended actions for the buying team.",
        }),
      });
      const data = await res.json();
      setAiInsight(data.insight ?? data.error ?? "No insight returned");
    } catch {
      setAiInsight("Failed to get AI insight. Check your ANTHROPIC_API_KEY.");
    }

    setAiLoading(false);
  }

  function toggleProduct(productId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  // Build chart data from selected run
  const chartData = MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    let units = 0;
    let revenue = 0;
    if (selectedRun) {
      for (const pf of selectedRun.products) {
        const mf = pf.monthly.find((m) => m.month === month);
        if (mf) {
          units += mf.adjustedUnits;
          revenue += mf.revenueCents;
        }
      }
    }
    return { name, Units: units, Revenue: Math.round(revenue / 100) };
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Run Forecast</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input
            label="Forecast Name"
            value={forecastName}
            onChange={(e) => setForecastName(e.target.value)}
            placeholder="e.g. Q3 2025 Forecast"
          />
          <Input
            label="Window Start"
            type="date"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
          />
          <Input
            label="Window End"
            type="date"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
          />
          <div className="flex items-end">
            <Button
              onClick={runForecast}
              loading={running}
              disabled={products.length === 0}
              className="w-full"
            >
              <Play className="h-4 w-4" />
              {running ? "Running..." : "Run Forecast"}
            </Button>
          </div>
        </div>
        {products.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">Add products first to run a forecast.</p>
        )}
      </Card>

      {/* Previous runs */}
      {forecastRuns.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          {[...forecastRuns].reverse().map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className={`whitespace-nowrap rounded-none border px-3 py-1.5 text-xs font-600 transition-colors ${
                selectedRun?.id === run.id
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-gray-300 bg-white text-brand-black hover:border-brand-red"
              }`}
            >
              {run.name}
            </button>
          ))}
        </div>
      )}

      {selectedRun && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              {
                label: "Total Units",
                value: selectedRun.products.reduce((s, p) => s + p.totalUnits, 0).toLocaleString(),
              },
              {
                label: "Forecast Revenue",
                value: formatCurrency(selectedRun.products.reduce((s, p) => s + p.totalRevenueCents, 0)),
              },
              {
                label: "Forecast GP",
                value: formatCurrency(selectedRun.products.reduce((s, p) => s + p.totalGrossProfitCents, 0)),
              },
              {
                label: "Avg Gross Margin",
                value: formatPct(
                  selectedRun.products.length > 0
                    ? selectedRun.products.reduce((s, p) => s + p.overallGrossMarginPct, 0) /
                        selectedRun.products.length
                    : 0
                ),
              },
            ].map(({ label, value }) => (
              <Card key={label}>
                <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
                <p className="mt-1 font-mono text-xl font-700 text-brand-black">{value}</p>
              </Card>
            ))}
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Forecast — {selectedRun.name}</CardTitle>
              <Button size="sm" variant="ghost" onClick={getAISuggestion} loading={aiLoading}>
                <Sparkles className="h-3.5 w-3.5" /> AI Insights
              </Button>
            </CardHeader>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="Units" stroke="#0A0A0A" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="Revenue" stroke="#E30713" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* AI Insights Panel */}
          {aiInsight && (
            <Card className="border border-brand-red/20 bg-red-50/30">
              <CardHeader>
                <CardTitle>
                  <Sparkles className="mr-1 inline h-4 w-4 text-brand-red" />
                  AI Buying Insights
                </CardTitle>
                <button onClick={() => setAiInsight(null)} className="text-xs text-brand-dark-gray hover:text-brand-black">Dismiss</button>
              </CardHeader>
              <div className="prose prose-sm max-w-none text-sm">
                <pre className="whitespace-pre-wrap font-barlow text-sm text-brand-black">{aiInsight}</pre>
              </div>
            </Card>
          )}

          {/* Product breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Product Forecasts ({selectedRun.products.length})</CardTitle>
            </CardHeader>
            <div className="divide-y divide-gray-100">
              {selectedRun.products
                .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
                .map((pf) => {
                  const expanded = expandedProducts.has(pf.productId);
                  return (
                    <div key={pf.productId}>
                      <button
                        className="flex w-full items-center justify-between py-3 text-left hover:bg-brand-gray/30"
                        onClick={() => toggleProduct(pf.productId)}
                      >
                        <div className="flex items-center gap-3">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <div>
                            <p className="text-sm font-600">{pf.name}</p>
                            <p className="font-mono text-xs text-brand-dark-gray">{pf.sku}</p>
                          </div>
                          {pf.velocitySource === "new-product" && (
                            <Badge variant="info" className="text-[10px]">PREDICTED</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-6 pr-2 text-right">
                          <div>
                            <p className="font-mono text-xs text-brand-dark-gray">Units</p>
                            <p className="font-mono text-sm font-700">{pf.totalUnits.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="font-mono text-xs text-brand-dark-gray">Revenue</p>
                            <p className="font-mono text-sm font-700">{formatCurrency(pf.totalRevenueCents)}</p>
                          </div>
                          <div>
                            <p className="font-mono text-xs text-brand-dark-gray">GM%</p>
                            <p className={`font-mono text-sm font-700 ${pf.overallGrossMarginPct >= 50 ? "text-green-600" : pf.overallGrossMarginPct >= 35 ? "text-amber-600" : "text-red-600"}`}>
                              {formatPct(pf.overallGrossMarginPct)}
                            </p>
                          </div>
                          {pf.confidenceLow !== undefined && (
                            <div>
                              <p className="font-mono text-xs text-brand-dark-gray">Range</p>
                              <p className="font-mono text-xs">
                                {Math.round(pf.confidenceLow)}–{Math.round(pf.confidenceHigh ?? 0)} units
                              </p>
                            </div>
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="bg-brand-gray/30 px-8 py-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left">
                                  {["Month", "Base Units", "Seasonal ×", "Adj Units", "Revenue", "Cost", "GP", "GM%"].map((h) => (
                                    <th key={h} className="pb-1 pr-4 font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {pf.monthly.map((m) => (
                                  <tr key={m.period}>
                                    <td className="py-1 pr-4 font-500">{MONTH_NAMES[m.month - 1]} {m.year}</td>
                                    <td className="py-1 pr-4 font-mono">{m.baseUnits}</td>
                                    <td className={`py-1 pr-4 font-mono ${m.seasonalMultiplier > 1 ? "text-green-700" : m.seasonalMultiplier < 1 ? "text-red-600" : ""}`}>
                                      {m.seasonalMultiplier.toFixed(2)}×
                                    </td>
                                    <td className="py-1 pr-4 font-mono font-700">{m.adjustedUnits}</td>
                                    <td className="py-1 pr-4 font-mono">{formatCurrency(m.revenueCents)}</td>
                                    <td className="py-1 pr-4 font-mono">{formatCurrency(m.costCents)}</td>
                                    <td className="py-1 pr-4 font-mono">{formatCurrency(m.grossProfitCents)}</td>
                                    <td className={`py-1 pr-4 font-mono ${m.grossMarginPct >= 50 ? "text-green-600" : "text-amber-600"}`}>
                                      {formatPct(m.grossMarginPct)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm("Delete this forecast run?")) {
                  dispatch({ type: "DELETE_FORECAST_RUN", id: selectedRun.id });
                  setSelectedRunId(null);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Run
            </Button>
          </div>
        </>
      )}

      {forecastRuns.length === 0 && (
        <Card className="border border-dashed border-gray-300 bg-transparent shadow-none">
          <div className="py-12 text-center">
            <p className="mb-1 text-sm font-600">No forecasts yet</p>
            <p className="text-xs text-brand-dark-gray">
              Configure a date window above and click &quot;Run Forecast&quot;
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
