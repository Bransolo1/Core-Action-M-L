"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatPct } from "@/lib/costs";
import { formatCBM } from "@/lib/volumetrics";
import type { PurchaseOrder, POLineItem } from "@/types/purchase-order";
import { nanoid } from "@/lib/nanoid";
import { ShoppingCart, Sparkles, Download, ChevronDown, ChevronRight } from "lucide-react";

const STATUS_LABELS: Record<PurchaseOrder["status"], string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  received: "Received",
};

const STATUS_VARIANTS: Record<PurchaseOrder["status"], "default" | "warning" | "success" | "info"> = {
  draft: "default",
  submitted: "warning",
  confirmed: "info",
  received: "success",
};

export default function PurchaseOrdersPage() {
  const { state, dispatch } = useAppStore();
  const { forecastRuns, orderCycles, purchaseOrders, products } = state;

  const [selectedForecastId, setSelectedForecastId] = useState<string>("");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [budgetOverride, setBudgetOverride] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const [expandedLines, setExpandedLines] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const forecastOptions = [
    { value: "", label: "— Select forecast run —" },
    ...forecastRuns.map((r) => ({ value: r.id, label: r.name })),
  ];

  const cycleOptions = [
    { value: "", label: "— Select order cycle —" },
    ...orderCycles.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` })),
  ];

  const selectedPO = purchaseOrders.find((po) => po.id === selectedPOId) ?? purchaseOrders.at(-1);

  async function generatePO() {
    const forecast = forecastRuns.find((r) => r.id === selectedForecastId);
    const cycle = orderCycles.find((c) => c.id === selectedCycleId);

    if (!forecast || !cycle) return;

    setGenerating(true);

    const effectiveCycle = budgetOverride
      ? { ...cycle, budgetCents: Math.round(parseFloat(budgetOverride) * 100) }
      : cycle;

    try {
      const res = await fetch("/api/purchase-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forecasts: forecast.products,
          products,
          cycle: effectiveCycle,
          supplierName,
        }),
      });

      if (res.ok) {
        const po: PurchaseOrder = await res.json();
        dispatch({ type: "UPSERT_PURCHASE_ORDER", order: po });
        setSelectedPOId(po.id);
      }
    } catch {
      alert("Failed to generate purchase order");
    }

    setGenerating(false);
  }

  async function getAIInsight() {
    if (!selectedPO) return;
    setAiLoading(true);
    setAiInsight(null);

    const includedLines = selectedPO.lines.filter((l) => l.isIncluded);
    const context = `
Purchase Order: ${selectedPO.reference}
Status: ${selectedPO.status}
Budget: ${formatCurrency(selectedPO.budgetCents)}
Optimised PO Value: ${formatCurrency(selectedPO.optimisedValueCents)}
Forecast Revenue: ${formatCurrency(selectedPO.totalRevenueCents)}
Forecast Gross Profit: ${formatCurrency(selectedPO.totalGrossProfitCents)}
Overall Gross Margin: ${formatPct(selectedPO.overallGrossMarginPct)}
Total Volume: ${selectedPO.totalVolumeCBM ? formatCBM(selectedPO.totalVolumeCBM) : "N/A"}
Lines included: ${includedLines.length} of ${selectedPO.lines.length}
Lines excluded (over budget): ${selectedPO.lines.filter((l) => !l.isIncluded).length}
Top 5 lines by GM%:
${includedLines
  .sort((a, b) => b.grossMarginPct - a.grossMarginPct)
  .slice(0, 5)
  .map((l) => `- ${l.sku} ${l.productName}: ${l.orderedQty} units @ ${formatCurrency(l.landedCostPerUnitCents)}, ${formatPct(l.grossMarginPct)} GM`)
  .join("\n")}
    `.trim();

    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          question:
            "Review this purchase order. Flag: 1) Any SKUs excluded that should be prioritised, 2) Budget allocation efficiency, 3) Volume/freight considerations, 4) Margin optimisation opportunities.",
        }),
      });
      const data = await res.json();
      setAiInsight(data.insight ?? data.error ?? "No insight returned");
    } catch {
      setAiInsight("Failed to get AI insight. Check your ANTHROPIC_API_KEY.");
    }

    setAiLoading(false);
  }

  function updateLineQty(lineId: string, qty: number) {
    if (!selectedPO) return;
    const updatedLines: POLineItem[] = selectedPO.lines.map((l) => {
      if (l.id !== lineId) return l;
      const orderedQty = Math.max(0, qty);
      const cartons = Math.ceil(orderedQty / l.unitsPerCarton);
      const totalLandedCostCents = orderedQty * l.landedCostPerUnitCents;
      const totalForecastedRevenueCents = orderedQty * l.rrpPerUnitCents;
      const grossProfitCents = totalForecastedRevenueCents - totalLandedCostCents;
      const grossMarginPct = totalForecastedRevenueCents > 0
        ? (grossProfitCents / totalForecastedRevenueCents) * 100 : 0;
      return {
        ...l,
        orderedQty,
        cartons,
        totalLandedCostCents,
        totalForecastedRevenueCents,
        grossProfitCents,
        grossMarginPct,
      };
    });
    const included = updatedLines.filter((l) => l.isIncluded);
    dispatch({
      type: "UPSERT_PURCHASE_ORDER",
      order: {
        ...selectedPO,
        lines: updatedLines,
        optimisedValueCents: included.reduce((s, l) => s + l.totalLandedCostCents, 0),
        totalRevenueCents: included.reduce((s, l) => s + l.totalForecastedRevenueCents, 0),
        totalGrossProfitCents: included.reduce((s, l) => s + l.grossProfitCents, 0),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function toggleLine(lineId: string) {
    if (!selectedPO) return;
    const updatedLines = selectedPO.lines.map((l) =>
      l.id === lineId ? { ...l, isIncluded: !l.isIncluded } : l
    );
    const included = updatedLines.filter((l) => l.isIncluded);
    dispatch({
      type: "UPSERT_PURCHASE_ORDER",
      order: {
        ...selectedPO,
        lines: updatedLines,
        optimisedValueCents: included.reduce((s, l) => s + l.totalLandedCostCents, 0),
        totalRevenueCents: included.reduce((s, l) => s + l.totalForecastedRevenueCents, 0),
        totalGrossProfitCents: included.reduce((s, l) => s + l.grossProfitCents, 0),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function updateStatus(status: PurchaseOrder["status"]) {
    if (!selectedPO) return;
    dispatch({
      type: "UPSERT_PURCHASE_ORDER",
      order: { ...selectedPO, status, updatedAt: new Date().toISOString() },
    });
  }

  function exportCSV() {
    if (!selectedPO) return;
    const rows = [
      ["SKU", "Product", "Category", "Qty", "Cartons", "Landed Cost/Unit", "Total Cost", "RRP/Unit", "Forecast Revenue", "GP", "GM%", "Volume CBM", "Included"],
      ...selectedPO.lines.map((l) => [
        l.sku,
        l.productName,
        l.category,
        l.orderedQty,
        l.cartons,
        (l.landedCostPerUnitCents / 100).toFixed(2),
        (l.totalLandedCostCents / 100).toFixed(2),
        (l.rrpPerUnitCents / 100).toFixed(2),
        (l.totalForecastedRevenueCents / 100).toFixed(2),
        (l.grossProfitCents / 100).toFixed(2),
        l.grossMarginPct.toFixed(1),
        l.volumeCBM?.toFixed(3) ?? "",
        l.isIncluded ? "Yes" : "No",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedPO.reference}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Generate PO */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Purchase Order</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Select
            label="Forecast Run"
            options={forecastOptions}
            value={selectedForecastId}
            onChange={(e) => setSelectedForecastId(e.target.value)}
          />
          <Select
            label="Order Cycle"
            options={cycleOptions}
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
          />
          <Input
            label="Budget Override ($)"
            type="number"
            step="100"
            placeholder="Leave blank to use cycle budget"
            value={budgetOverride}
            onChange={(e) => setBudgetOverride(e.target.value)}
          />
          <Input
            label="Supplier Name"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
          <div className="flex items-end">
            <Button
              onClick={generatePO}
              loading={generating}
              disabled={!selectedForecastId || !selectedCycleId}
              className="w-full"
            >
              <ShoppingCart className="h-4 w-4" />
              Generate PO
            </Button>
          </div>
        </div>
        {orderCycles.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">
            Set up order cycles in <a href="/settings" className="underline">Settings</a> first.
          </p>
        )}
      </Card>

      {/* PO selector */}
      {purchaseOrders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          {[...purchaseOrders].reverse().map((po) => (
            <button
              key={po.id}
              onClick={() => setSelectedPOId(po.id)}
              className={`whitespace-nowrap rounded-none border px-3 py-1.5 text-xs font-600 transition-colors ${
                selectedPO?.id === po.id
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-gray-300 bg-white text-brand-black hover:border-brand-red"
              }`}
            >
              {po.reference}
            </button>
          ))}
        </div>
      )}

      {selectedPO && (
        <>
          {/* PO Header */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-700">{selectedPO.reference}</h2>
                  <Badge variant={STATUS_VARIANTS[selectedPO.status]}>
                    {STATUS_LABELS[selectedPO.status]}
                  </Badge>
                </div>
                {selectedPO.supplierName && (
                  <p className="text-sm text-brand-dark-gray">{selectedPO.supplierName}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "submitted", label: "Submitted" },
                    { value: "confirmed", label: "Confirmed" },
                    { value: "received", label: "Received" },
                  ]}
                  value={selectedPO.status}
                  onChange={(e) => updateStatus(e.target.value as PurchaseOrder["status"])}
                />
                <Button size="sm" variant="ghost" onClick={exportCSV}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={getAIInsight} loading={aiLoading}>
                  <Sparkles className="h-3.5 w-3.5" /> AI Review
                </Button>
              </div>
            </div>

            {/* PO Summary */}
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 lg:grid-cols-5">
              {[
                { label: "Budget", value: formatCurrency(selectedPO.budgetCents) },
                { label: "PO Value", value: formatCurrency(selectedPO.optimisedValueCents), highlight: selectedPO.optimisedValueCents <= selectedPO.budgetCents },
                { label: "Forecast Revenue", value: formatCurrency(selectedPO.totalRevenueCents) },
                { label: "Forecast GP", value: formatCurrency(selectedPO.totalGrossProfitCents) },
                { label: "GM%", value: formatPct(selectedPO.overallGrossMarginPct), highlight: selectedPO.overallGrossMarginPct >= 50 },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
                  <p className={`font-mono text-base font-700 ${highlight ? "text-green-600" : "text-brand-black"}`}>{value}</p>
                </div>
              ))}
            </div>

            {selectedPO.totalVolumeCBM !== undefined && selectedPO.totalVolumeCBM > 0 && (
              <p className="mt-2 text-xs text-brand-dark-gray">
                Total Volume: {formatCBM(selectedPO.totalVolumeCBM)}
              </p>
            )}
          </Card>

          {/* AI Insight */}
          {aiInsight && (
            <Card className="border border-brand-red/20 bg-red-50/30">
              <CardHeader>
                <CardTitle>
                  <Sparkles className="mr-1 inline h-4 w-4 text-brand-red" />
                  AI PO Review
                </CardTitle>
                <button onClick={() => setAiInsight(null)} className="text-xs text-brand-dark-gray">Dismiss</button>
              </CardHeader>
              <pre className="whitespace-pre-wrap font-barlow text-sm text-brand-black">{aiInsight}</pre>
            </Card>
          )}

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Line Items</CardTitle>
                <Badge variant="default">{selectedPO.lines.filter((l) => l.isIncluded).length} included</Badge>
                {selectedPO.lines.some((l) => !l.isIncluded) && (
                  <Badge variant="warning">{selectedPO.lines.filter((l) => !l.isIncluded).length} excluded</Badge>
                )}
              </div>
              <button
                onClick={() => setExpandedLines((v) => !v)}
                className="flex items-center gap-1 text-xs text-brand-dark-gray hover:text-brand-black"
              >
                {expandedLines ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {expandedLines ? "Collapse" : "Show all"}
              </button>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    {["#", "SKU", "Product", "Cat", "Fcst Qty", "Order Qty", "Ctns", "Landed/Unit", "Total Cost", "Rev", "GP", "GM%", "Vol", "Include"].map((h) => (
                      <th key={h} className="py-2 pr-3 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedPO.lines
                    .sort((a, b) => a.priorityRank - b.priorityRank)
                    .filter((l) => expandedLines || l.isIncluded)
                    .map((line) => (
                      <tr key={line.id} className={`hover:bg-brand-gray/30 ${!line.isIncluded ? "opacity-50" : ""}`}>
                        <td className="py-2.5 pr-3 font-mono text-xs">{line.priorityRank}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{line.sku}</td>
                        <td className="py-2.5 pr-3 text-sm font-500">{line.productName}</td>
                        <td className="py-2.5 pr-3 text-xs text-brand-dark-gray">{line.category}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{line.forecastedQty}</td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            value={line.orderedQty}
                            onChange={(e) => updateLineQty(line.id, parseInt(e.target.value) || 0)}
                            className="w-20 rounded-none border border-gray-300 px-2 py-1 font-mono text-xs focus:border-brand-red focus:outline-none"
                          />
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{line.cartons}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{formatCurrency(line.landedCostPerUnitCents)}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs font-700">{formatCurrency(line.totalLandedCostCents)}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{formatCurrency(line.totalForecastedRevenueCents)}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{formatCurrency(line.grossProfitCents)}</td>
                        <td className={`py-2.5 pr-3 font-mono text-xs font-700 ${line.grossMarginPct >= 50 ? "text-green-600" : line.grossMarginPct >= 35 ? "text-amber-600" : "text-red-600"}`}>
                          {formatPct(line.grossMarginPct)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{line.volumeCBM ? formatCBM(line.volumeCBM) : "—"}</td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="checkbox"
                            checked={line.isIncluded}
                            onChange={() => toggleLine(line.id)}
                            className="accent-brand-red"
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {purchaseOrders.length === 0 && (
        <Card className="border border-dashed border-gray-300 bg-transparent shadow-none">
          <div className="py-12 text-center">
            <p className="mb-1 text-sm font-600">No purchase orders yet</p>
            <p className="text-xs text-brand-dark-gray">
              Run a forecast and set up order cycles, then generate your first PO above.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
