"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { calculateSellThrough } from "@/lib/forecasting";
import { formatPct } from "@/lib/costs";
import { nanoid } from "@/lib/nanoid";
import type { SalesPeriod, SalesPeriodFormData } from "@/types/sales";
import { Plus, Trash2, X, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";

export default function SalesPage() {
  const { state, dispatch } = useAppStore();
  const { products, salesPeriods } = state;
  const [showForm, setShowForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  const productOptions = [
    { value: "", label: "— All Products —" },
    ...products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
  ];

  const filtered = selectedProductId
    ? salesPeriods.filter((sp) => sp.productId === selectedProductId)
    : salesPeriods;

  const sorted = [...filtered].sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  // Summary stats per product
  const productSummaries = products.map((p) => {
    const periods = salesPeriods.filter((sp) => sp.productId === p.id);
    const sta = calculateSellThrough(periods);
    return { product: p, sta, periodCount: periods.length };
  }).filter((s) => s.periodCount > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-64">
            <Select
              options={productOptions}
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Record Sales Period
        </Button>
      </div>

      {showForm && (
        <SalesPeriodForm
          products={products}
          onClose={() => setShowForm(false)}
          onSave={(data) => {
            dispatch({
              type: "UPSERT_SALES_PERIOD",
              period: { ...data, id: nanoid(), createdAt: new Date().toISOString() },
            });
            setShowForm(false);
          }}
        />
      )}

      {/* Sell-Through Summary */}
      {productSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stockout-Adjusted Sell-Through Summary</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {["SKU", "Product", "Periods", "Std STR", "Adj STR", "Daily Vel.", "Annual Demand", "Stockout Rate"].map((h) => (
                    <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productSummaries.map(({ product, sta }) => (
                  <tr key={product.id} className="hover:bg-brand-gray/30">
                    <td className="py-2.5 pr-4 font-mono text-xs">{product.sku}</td>
                    <td className="py-2.5 pr-4 font-500 text-sm">{product.name}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-center">{sta.periodsAnalysed}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{formatPct(sta.standardStr * 100)}</td>
                    <td className={`py-2.5 pr-4 font-mono text-xs font-700 ${sta.adjustedStr > 0.8 ? "text-red-600" : "text-green-600"}`}>
                      {formatPct(sta.adjustedStr * 100)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{sta.dailyVelocity.toFixed(2)}/day</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{Math.round(sta.projectedAnnualDemand).toLocaleString()} units</td>
                    <td className="py-2.5 pr-4">
                      {sta.stockoutRate > 0.3 ? (
                        <Badge variant="danger">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          {formatPct(sta.stockoutRate * 100)}
                        </Badge>
                      ) : sta.stockoutRate > 0 ? (
                        <Badge variant="warning">{formatPct(sta.stockoutRate * 100)}</Badge>
                      ) : (
                        <Badge variant="success">No stockouts</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Period Records */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Periods ({sorted.length})</CardTitle>
        </CardHeader>
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-brand-dark-gray">
            No sales periods recorded. Click &quot;Record Sales Period&quot; to add historical data.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {["Product", "Period", "Days", "In-Stock Days", "Received", "Sold", "Closing", "Stockout", "Notes", ""].map((h) => (
                    <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((sp) => {
                  const product = products.find((p) => p.id === sp.productId);
                  return (
                    <tr key={sp.id} className="hover:bg-brand-gray/30">
                      <td className="py-2.5 pr-4">
                        <p className="font-500 text-sm">{product?.name ?? "Unknown"}</p>
                        <p className="font-mono text-xs text-brand-dark-gray">{product?.sku}</p>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {format(new Date(sp.periodStart), "d MMM yy")} –{" "}
                        {format(new Date(sp.periodEnd), "d MMM yy")}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-center">{sp.totalDays}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-center">{sp.inStockDays}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{sp.unitsReceived}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs font-700">{sp.unitsSold}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{sp.closingStock}</td>
                      <td className="py-2.5 pr-4">
                        {sp.hadStockout ? (
                          <Badge variant="danger">Yes</Badge>
                        ) : (
                          <Badge variant="success">No</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-brand-dark-gray">{sp.notes ?? "—"}</td>
                      <td className="py-2.5">
                        <button
                          onClick={() => {
                            if (confirm("Delete this record?")) {
                              dispatch({ type: "DELETE_SALES_PERIOD", id: sp.id });
                            }
                          }}
                          className="text-brand-dark-gray hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales Period Form
// ---------------------------------------------------------------------------

function SalesPeriodForm({
  products,
  onClose,
  onSave,
}: {
  products: ReturnType<typeof useAppStore>["state"]["products"];
  onClose: () => void;
  onSave: (data: SalesPeriodFormData) => void;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<SalesPeriodFormData>({
    defaultValues: {
      productId: "",
      periodStart: "",
      periodEnd: "",
      totalDays: 90,
      inStockDays: 90,
      unitsReceived: 0,
      unitsSold: 0,
      openingStock: 0,
      closingStock: 0,
      hadStockout: false,
    },
  });

  const hadStockout = watch("hadStockout");

  const productOptions = [
    { value: "", label: "— Select product —" },
    ...products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
  ];

  // Auto-calculate total days from dates
  function handleDateChange() {
    const start = watch("periodStart");
    const end = watch("periodEnd");
    if (start && end) {
      const diff = Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff > 0) {
        setValue("totalDays", diff);
        if (!hadStockout) setValue("inStockDays", diff);
      }
    }
  }

  return (
    <Card className="border border-brand-red/20">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-700">Record Sales Period</h3>
        <button onClick={onClose}><X className="h-4 w-4 text-brand-dark-gray" /></button>
      </div>

      <div className="mb-3 rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <strong>Stockout correction:</strong> If the product sold out during this period, tick
        &quot;Had Stockout&quot; and enter only the days it was actually in stock. This ensures
        velocity is not underestimated.
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <Select
          label="Product *"
          id="productId"
          options={productOptions}
          error={errors.productId?.message}
          {...register("productId", { required: "Required" })}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input
            label="Period Start *"
            id="periodStart"
            type="date"
            {...register("periodStart", { required: "Required" })}
            onChange={(e) => { register("periodStart").onChange(e); handleDateChange(); }}
          />
          <Input
            label="Period End *"
            id="periodEnd"
            type="date"
            {...register("periodEnd", { required: "Required" })}
            onChange={(e) => { register("periodEnd").onChange(e); handleDateChange(); }}
          />
          <Input label="Total Days" id="totalDays" type="number" {...register("totalDays", { valueAsNumber: true })} />
          <Input
            label="In-Stock Days *"
            id="inStockDays"
            type="number"
            hint="Days product was available"
            {...register("inStockDays", { valueAsNumber: true, required: true, min: 1 })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input label="Units Received" id="unitsReceived" type="number" {...register("unitsReceived", { valueAsNumber: true })} />
          <Input label="Units Sold" id="unitsSold" type="number" {...register("unitsSold", { valueAsNumber: true })} />
          <Input label="Opening Stock" id="openingStock" type="number" {...register("openingStock", { valueAsNumber: true })} />
          <Input label="Closing Stock" id="closingStock" type="number" {...register("closingStock", { valueAsNumber: true })} />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("hadStockout")} className="accent-brand-red" />
            Had Stockout during this period
          </label>
        </div>

        <Input label="Notes (optional)" id="notes" {...register("notes")} />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save Period</Button>
        </div>
      </form>
    </Card>
  );
}
