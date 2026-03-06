"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatPct } from "@/lib/costs";
import { MONTH_NAMES, getFactorsForCategory } from "@/lib/seasonal";
import { nanoid } from "@/lib/nanoid";
import type { ForecastRun, ProductForecast, ForecastScenario } from "@/types/forecast";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Play,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ─── Scenario config ──────────────────────────────────────────────────────────

const SCENARIOS: { key: ForecastScenario; label: string; multiplier: number; colour: string }[] = [
  { key: "base",  label: "Base",  multiplier: 1.0, colour: "text-brand-black" },
  { key: "bull",  label: "Bull",  multiplier: 1.2, colour: "text-green-600"  },
  { key: "bear",  label: "Bear",  multiplier: 0.8, colour: "text-red-600"    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TrendBadge({ direction }: { direction: "up" | "flat" | "down" | undefined }) {
  if (!direction || direction === "flat")
    return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  if (direction === "up")
    return <TrendingUp className="h-3.5 w-3.5 text-green-600" />;
  return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
}

function trendTooltip(direction: "up" | "flat" | "down" | undefined): string {
  if (direction === "up") return "Trending up — velocity increasing";
  if (direction === "down") return "Trending down — velocity declining";
  return "Stable demand";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const { state, dispatch } = useAppStore();
  const { products, salesPeriods, forecastRuns, settings } = state;

  // Controls
  const [windowStart, setWindowStart] = useState(new Date().toISOString().slice(0, 10));
  const [windowEnd, setWindowEnd] = useState(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [forecastName, setForecastName] = useState("");
  const [scenario, setScenario] = useState<ForecastScenario>("base");

  // Run state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Display
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);

  const selectedRun = forecastRuns.find((r) => r.id === selectedRunId) ?? forecastRuns.at(-1);

  const scenarioConfig = SCENARIOS.find((s) => s.key === scenario) ?? SCENARIOS[0];

  // ─── Run forecast ───────────────────────────────────────────────────────────

  async function runForecast() {
    if (!products.length) return;
    if (windowStart >= windowEnd) {
      alert("Window end must be after window start.");
      return;
    }

    setRunning(true);
    setAiInsight(null);

    const activeProducts = products.filter((p) => p.isActive);
    setProgress({ done: 0, total: activeProducts.length });

    const forecastProducts: ProductForecast[] = [];
    const errors: ForecastRun["errors"] = [];

    for (const product of activeProducts) {
      try {
        const productSalesPeriods = salesPeriods.filter((sp) => sp.productId === product.id);
        const categoryProducts = products.filter(
          (p) => p.category === product.category && p.isActive
        );
        const allProductsInCategory = categoryProducts.map((p) => ({
          product: p,
          salesPeriods: salesPeriods.filter((sp) => sp.productId === p.id),
        }));

        // Use seeded seasonal configs; fall back to flat factors if none configured
        const seasonalConfigs = settings.seasonalConfigs.length
          ? settings.seasonalConfigs
          : [
              {
                category: product.category,
                factors: Object.fromEntries(
                  Array.from({ length: 12 }, (_, i) => [String(i + 1), 1.0])
                ),
              },
            ];

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
            scenarioMultiplier: scenarioConfig.multiplier,
          }),
        });

        if (res.ok) {
          const pf: ProductForecast = await res.json();
          forecastProducts.push(pf);
        } else {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          errors.push({ sku: product.sku, message: err?.error ?? "Unknown error" });
        }
      } catch (e) {
        errors.push({ sku: product.sku, message: (e as Error).message ?? "Network error" });
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    const run: ForecastRun = {
      id: nanoid(),
      name:
        forecastName ||
        `${scenario.charAt(0).toUpperCase() + scenario.slice(1)} Forecast ${new Date().toLocaleDateString("en-GB")}`,
      createdAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      scenario,
      scenarioMultiplier: scenarioConfig.multiplier,
      products: forecastProducts,
      errors,
    };

    dispatch({ type: "UPSERT_FORECAST_RUN", run });
    setSelectedRunId(run.id);
    setRunning(false);
    setProgress({ done: 0, total: 0 });

    if (errors.length > 0) setShowErrors(true);
  }

  // ─── AI Insight ────────────────────────────────────────────────────────────

  async function getAISuggestion() {
    if (!selectedRun) return;
    setAiLoading(true);
    setAiInsight(null);

    const top5 = [...selectedRun.products]
      .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
      .slice(0, 5);

    const context = `
Forecast: ${selectedRun.name} (${selectedRun.scenario} scenario, ×${selectedRun.scenarioMultiplier})
Window: ${selectedRun.windowStart} to ${selectedRun.windowEnd}
Products analysed: ${selectedRun.products.length} (${selectedRun.errors.length} failed)
Total forecast revenue: ${formatCurrency(selectedRun.products.reduce((s, p) => s + p.totalRevenueCents, 0))}
Total forecast units: ${selectedRun.products.reduce((s, p) => s + p.totalUnits, 0).toLocaleString("en-GB")}
Avg gross margin: ${formatPct(
      selectedRun.products.length > 0
        ? selectedRun.products.reduce((s, p) => s + p.overallGrossMarginPct, 0) / selectedRun.products.length
        : 0
    )}
New-to-market SKUs: ${selectedRun.products.filter((p) => p.velocitySource === "new-product").length}
High stockout risk (>30% days OOS): ${selectedRun.products.filter((p) => p.stockoutRate > 0.3).length}
Trending up: ${selectedRun.products.filter((p) => p.trend?.direction === "up").length} SKUs
Trending down: ${selectedRun.products.filter((p) => p.trend?.direction === "down").length} SKUs
Intermittent demand SKUs: ${selectedRun.products.filter((p) => p.isIntermittent).length}

Top 5 by revenue:
${top5.map((p) => `- ${p.sku} ${p.name}: ${formatCurrency(p.totalRevenueCents)} (${formatPct(p.overallGrossMarginPct)} GM, ${p.trend?.direction ?? "stable"} trend)`).join("\n")}
    `.trim();

    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          question:
            "Review this action-sports inventory forecast. Provide: 1) Key risks (stockout, margin squeeze, trend reversals), 2) Buying opportunities, 3) Specific recommended actions for the buyer including any SKUs to investigate.",
        }),
      });
      const data = await res.json();
      setAiInsight(data.insight ?? data.error ?? "No insight returned.");
    } catch {
      setAiInsight("Failed to get AI insight. Check your ANTHROPIC_API_KEY.");
    }

    setAiLoading(false);
  }

  // ─── Chart data (windowed) ────────────────────────────────────────────────

  const chartData = useMemo(() => {
    if (!selectedRun) return [];
    // Only include months that exist in the forecast (the engine already clips to window)
    const allPeriods = new Set<string>();
    for (const pf of selectedRun.products) {
      for (const m of pf.monthly) allPeriods.add(m.period);
    }
    const sortedPeriods = Array.from(allPeriods).sort();

    return sortedPeriods.map((period) => {
      const [y, mo] = period.split("-").map(Number);
      const label = `${MONTH_NAMES[mo - 1]} ${y !== new Date().getFullYear() ? y : ""}`.trim();

      let units = 0;
      let unitsLow = 0;
      let unitsHigh = 0;
      let revenue = 0;

      for (const pf of selectedRun.products) {
        const mf = pf.monthly.find((m) => m.period === period);
        if (mf) {
          units += mf.adjustedUnits;
          unitsLow += mf.unitsLow;
          unitsHigh += mf.unitsHigh;
          revenue += mf.revenueCents;
        }
      }

      return {
        name: label,
        Units: units,
        Low: unitsLow,
        High: unitsHigh,
        Revenue: Math.round(revenue / 100),
      };
    });
  }, [selectedRun]);

  // ─── Aggregated KPIs ──────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!selectedRun) return null;
    const ps = selectedRun.products;
    return {
      totalUnits: ps.reduce((s, p) => s + p.totalUnits, 0),
      totalUnitsLow: ps.reduce((s, p) => s + p.totalUnitsLow, 0),
      totalUnitsHigh: ps.reduce((s, p) => s + p.totalUnitsHigh, 0),
      totalRevenue: ps.reduce((s, p) => s + p.totalRevenueCents, 0),
      totalGP: ps.reduce((s, p) => s + p.totalGrossProfitCents, 0),
      avgMargin:
        ps.length > 0
          ? ps.reduce((s, p) => s + p.overallGrossMarginPct, 0) / ps.length
          : 0,
      newToMarket: ps.filter((p) => p.velocitySource === "new-product").length,
      highStockoutRisk: ps.filter((p) => p.stockoutRate > 0.3).length,
      trendingUp: ps.filter((p) => p.trend?.direction === "up").length,
      trendingDown: ps.filter((p) => p.trend?.direction === "down").length,
    };
  }, [selectedRun]);

  function toggleProduct(id: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Controls */}
      <Card>
        <CardHeader><CardTitle>Run Forecast</CardTitle></CardHeader>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input
            label="Forecast Name"
            value={forecastName}
            onChange={(e) => setForecastName(e.target.value)}
            placeholder="e.g. Christmas 2026 Base"
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
              disabled={products.length === 0 || windowStart >= windowEnd}
              className="w-full"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running
                ? `${progress.done} / ${progress.total} products…`
                : "Run Forecast"}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {running && progress.total > 0 && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-brand-red transition-all duration-200"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Scenario selector */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">Scenario:</span>
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setScenario(s.key)}
              className={`rounded-none border px-3 py-1 text-xs font-600 transition-colors ${
                scenario === s.key
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-gray-300 bg-white text-brand-black hover:border-brand-red"
              }`}
            >
              {s.label}
              {s.key !== "base" && (
                <span className={`ml-1 ${s.key === "bull" ? "text-green-200" : "text-red-200"} ${scenario === s.key ? "" : s.colour}`}>
                  {s.key === "bull" ? "+20%" : "−20%"}
                </span>
              )}
            </button>
          ))}
        </div>

        {products.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">Add products first to run a forecast.</p>
        )}
        {windowStart >= windowEnd && products.length > 0 && (
          <p className="mt-2 text-xs text-red-600">Window end must be after window start.</p>
        )}
      </Card>

      {/* Run selector */}
      {forecastRuns.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          {[...forecastRuns].reverse().map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className={`flex-shrink-0 rounded-none border px-3 py-1.5 text-xs font-600 transition-colors ${
                selectedRun?.id === run.id
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-gray-300 bg-white text-brand-black hover:border-brand-red"
              }`}
            >
              {run.name}
              {run.errors.length > 0 && (
                <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-400" />
              )}
            </button>
          ))}
        </div>
      )}

      {selectedRun && kpis && (
        <>
          {/* Error banner */}
          {selectedRun.errors.length > 0 && (
            <div className="rounded-sm border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-600 text-amber-800">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                  {selectedRun.errors.length} product{selectedRun.errors.length !== 1 ? "s" : ""} failed to forecast
                </p>
                <button
                  onClick={() => setShowErrors((v) => !v)}
                  className="text-xs text-amber-600 underline"
                >
                  {showErrors ? "Hide" : "Show"} details
                </button>
              </div>
              {showErrors && (
                <ul className="mt-2 space-y-0.5">
                  {selectedRun.errors.map((e) => (
                    <li key={e.sku} className="font-mono text-xs text-amber-700">
                      {e.sku}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">Total Units</p>
              <p className="mt-1 font-mono text-xl font-700">{kpis.totalUnits.toLocaleString("en-GB")}</p>
              <p className="font-mono text-[10px] text-brand-dark-gray">
                Range: {kpis.totalUnitsLow.toLocaleString("en-GB")}–{kpis.totalUnitsHigh.toLocaleString("en-GB")}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">Forecast Revenue</p>
              <p className="mt-1 font-mono text-xl font-700">{formatCurrency(kpis.totalRevenue)}</p>
            </Card>
            <Card>
              <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">Forecast GP</p>
              <p className="mt-1 font-mono text-xl font-700">{formatCurrency(kpis.totalGP)}</p>
              <p className="font-mono text-[10px] text-brand-dark-gray">{formatPct(kpis.avgMargin)} avg margin</p>
            </Card>
            <Card>
              <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">Demand Signals</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {kpis.trendingUp > 0 && (
                  <span className="flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 font-mono text-[10px] font-700 text-green-700">
                    <TrendingUp className="h-3 w-3" /> {kpis.trendingUp} ↑
                  </span>
                )}
                {kpis.trendingDown > 0 && (
                  <span className="flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-700 text-red-700">
                    <TrendingDown className="h-3 w-3" /> {kpis.trendingDown} ↓
                  </span>
                )}
                {kpis.highStockoutRisk > 0 && (
                  <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-700 text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> {kpis.highStockoutRisk} OOS risk
                  </span>
                )}
                {kpis.newToMarket > 0 && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-700 text-blue-700">
                    {kpis.newToMarket} new SKU{kpis.newToMarket !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </Card>
          </div>

          {/* Monthly chart with confidence band */}
          <Card>
            <CardHeader>
              <CardTitle>
                Monthly Forecast — {selectedRun.name}
                <span className={`ml-2 text-xs font-500 ${scenarioConfig.colour}`}>
                  ({selectedRun.scenario} ×{selectedRun.scenarioMultiplier})
                </span>
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={getAISuggestion} loading={aiLoading}>
                <Sparkles className="h-3.5 w-3.5" /> AI Insights
              </Button>
            </CardHeader>

            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "Revenue") return [`£${Number(value).toLocaleString("en-GB")}`, "Revenue (£)"];
                    return [Number(value).toLocaleString("en-GB"), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* Confidence band */}
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="High"
                  stroke="none"
                  fill="#E30713"
                  fillOpacity={0.08}
                  legendType="none"
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="Low"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  legendType="none"
                />
                {/* Main lines */}
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="Units"
                  stroke="#0A0A0A"
                  strokeWidth={2}
                  fill="transparent"
                  dot={false}
                  name="Units"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="Revenue"
                  stroke="#E30713"
                  strokeWidth={2}
                  fill="transparent"
                  dot={false}
                  name="Revenue"
                />
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[10px] text-brand-dark-gray">
              Shaded band = ±1σ confidence range based on historical velocity variation.
            </p>
          </Card>

          {/* AI Insights */}
          {aiInsight && (
            <Card className="border border-brand-red/20 bg-red-50/30">
              <CardHeader>
                <CardTitle>
                  <Sparkles className="mr-1 inline h-4 w-4 text-brand-red" />
                  AI Buying Insights
                </CardTitle>
                <button onClick={() => setAiInsight(null)} className="text-xs text-brand-dark-gray hover:text-brand-black">
                  Dismiss
                </button>
              </CardHeader>
              <pre className="whitespace-pre-wrap font-barlow text-sm text-brand-black">{aiInsight}</pre>
            </Card>
          )}

          {/* Product breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>
                Product Forecasts ({selectedRun.products.length})
              </CardTitle>
            </CardHeader>
            <div className="divide-y divide-gray-100">
              {[...selectedRun.products]
                .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
                .map((pf) => {
                  const expanded = expandedProducts.has(pf.productId);
                  const stockoutPct = Math.round(pf.stockoutRate * 100);

                  return (
                    <div key={pf.productId}>
                      <button
                        className="flex w-full items-center justify-between py-3 text-left hover:bg-brand-gray/30"
                        onClick={() => toggleProduct(pf.productId)}
                      >
                        <div className="flex items-center gap-3">
                          {expanded
                            ? <ChevronDown className="h-4 w-4 flex-shrink-0" />
                            : <ChevronRight className="h-4 w-4 flex-shrink-0" />}

                          <span
                            title={trendTooltip(pf.trend?.direction)}
                          >
                            <TrendBadge direction={pf.trend?.direction} />
                          </span>

                          <div>
                            <p className="text-sm font-600">{pf.name}</p>
                            <p className="font-mono text-xs text-brand-dark-gray">{pf.sku}</p>
                          </div>

                          <div className="flex gap-1">
                            {pf.velocitySource === "new-product" && (
                              <Badge variant="info" className="text-[10px]">PREDICTED</Badge>
                            )}
                            {pf.isIntermittent && (
                              <Badge variant="warning" className="text-[10px]">LUMPY</Badge>
                            )}
                            {pf.stockoutRate > 0.3 && (
                              <Badge variant="danger" className="text-[10px]">OOS RISK</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-5 pr-2 text-right">
                          {pf.periodsAnalysed > 0 && (
                            <div>
                              <p className="font-mono text-[10px] text-brand-dark-gray">OOS%</p>
                              <p className={`font-mono text-xs font-700 ${stockoutPct > 30 ? "text-red-600" : stockoutPct > 10 ? "text-amber-600" : "text-green-600"}`}>
                                {stockoutPct}%
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="font-mono text-[10px] text-brand-dark-gray">Velocity</p>
                            <p className="font-mono text-xs font-700">
                              {pf.dailyVelocity.toFixed(2)}/d
                              {pf.velocityStdDev !== undefined && (
                                <span className="text-brand-dark-gray"> ±{pf.velocityStdDev.toFixed(2)}</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-brand-dark-gray">Units</p>
                            <p className="font-mono text-sm font-700">{pf.totalUnits.toLocaleString("en-GB")}</p>
                            <p className="font-mono text-[10px] text-brand-dark-gray">
                              {pf.totalUnitsLow.toLocaleString("en-GB")}–{pf.totalUnitsHigh.toLocaleString("en-GB")}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-brand-dark-gray">Revenue</p>
                            <p className="font-mono text-sm font-700">{formatCurrency(pf.totalRevenueCents)}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-brand-dark-gray">GM%</p>
                            <p
                              className={`font-mono text-sm font-700 ${
                                pf.overallGrossMarginPct >= 50
                                  ? "text-green-600"
                                  : pf.overallGrossMarginPct >= 35
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }`}
                            >
                              {formatPct(pf.overallGrossMarginPct)}
                            </p>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="bg-brand-gray/30 px-8 py-3">
                          {/* Trend summary */}
                          {pf.trend && (
                            <p className="mb-2 text-xs text-brand-dark-gray">
                              <span className="font-600">Trend:</span>{" "}
                              {pf.trend.direction === "up" && "↑ Accelerating —"}
                              {pf.trend.direction === "down" && "↓ Decelerating —"}
                              {pf.trend.direction === "flat" && "→ Stable —"}
                              {" "}slope {pf.trend.slopePerPeriod > 0 ? "+" : ""}{pf.trend.slopePerPeriod.toFixed(3)} u/day·period,
                              {" "}projected velocity {pf.trend.projectedVelocity.toFixed(2)} u/day
                            </p>
                          )}

                          {/* Monthly table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left">
                                  {[
                                    "Month",
                                    "Base",
                                    "Seasonal ×",
                                    "Adj Units",
                                    "Low",
                                    "High",
                                    "Revenue",
                                    "GM%",
                                  ].map((h) => (
                                    <th
                                      key={h}
                                      className="pb-1 pr-4 font-600 uppercase tracking-wider text-brand-dark-gray"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {pf.monthly.map((m) => (
                                  <tr key={m.period}>
                                    <td className="py-1 pr-4 font-500">
                                      {MONTH_NAMES[m.month - 1]} {m.year}
                                    </td>
                                    <td className="py-1 pr-4 font-mono">{m.baseUnits}</td>
                                    <td
                                      className={`py-1 pr-4 font-mono ${
                                        m.seasonalMultiplier > 1
                                          ? "text-green-700"
                                          : m.seasonalMultiplier < 1
                                          ? "text-red-600"
                                          : ""
                                      }`}
                                    >
                                      {m.seasonalMultiplier.toFixed(2)}×
                                    </td>
                                    <td className="py-1 pr-4 font-mono font-700">
                                      {m.adjustedUnits}
                                    </td>
                                    <td className="py-1 pr-4 font-mono text-brand-dark-gray">
                                      {m.unitsLow}
                                    </td>
                                    <td className="py-1 pr-4 font-mono text-brand-dark-gray">
                                      {m.unitsHigh}
                                    </td>
                                    <td className="py-1 pr-4 font-mono">
                                      {formatCurrency(m.revenueCents)}
                                    </td>
                                    <td
                                      className={`py-1 pr-4 font-mono ${
                                        m.grossMarginPct >= 50 ? "text-green-600" : "text-amber-600"
                                      }`}
                                    >
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
              Configure a date window, pick a scenario, and click &quot;Run Forecast&quot;
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
