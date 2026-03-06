"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MONTH_NAMES, ACTION_SPORTS_SEASONAL_AU, formatMultiplier } from "@/lib/seasonal";
import type { OrderCycle, OrderCycleType } from "@/types/purchase-order";
import type { CategorySeasonalConfig, SeasonalFactors } from "@/types/forecast";
import { nanoid } from "@/lib/nanoid";
import { Plus, Trash2, Save, X } from "lucide-react";
import { useForm } from "react-hook-form";

const CYCLE_TYPES: { value: OrderCycleType; label: string }[] = [
  { value: "Q1", label: "Q1 (Jan–Mar)" },
  { value: "Q2", label: "Q2 (Apr–Jun)" },
  { value: "Q3", label: "Q3 (Jul–Sep)" },
  { value: "Q4", label: "Q4 (Oct–Dec)" },
  { value: "adhoc", label: "Ad-hoc" },
];

export default function SettingsPage() {
  const { state, dispatch } = useAppStore();
  const { settings, orderCycles, purchaseOrders } = state;
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [showSeasonalForm, setShowSeasonalForm] = useState(false);
  const [saved, setSaved] = useState(false);

  function saveSettings(updates: Partial<typeof settings>) {
    dispatch({ type: "UPDATE_SETTINGS", settings: updates });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          {saved && <Badge variant="success">Saved</Badge>}
        </CardHeader>
        <GeneralSettingsForm settings={settings} onSave={saveSettings} />
      </Card>

      {/* Order Cycles */}
      <Card>
        <CardHeader>
          <CardTitle>Order Cycles</CardTitle>
          <Button size="sm" onClick={() => setShowCycleForm(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Cycle
          </Button>
        </CardHeader>

        {showCycleForm && (
          <div className="mb-4">
            <OrderCycleForm
              onClose={() => setShowCycleForm(false)}
              onSave={(data) => {
                dispatch({
                  type: "UPSERT_ORDER_CYCLE",
                  cycle: { ...data, id: nanoid() },
                });
                setShowCycleForm(false);
              }}
            />
          </div>
        )}

        {orderCycles.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-dark-gray">
            No order cycles configured. Add your quarterly or ad-hoc cycles above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {["Name", "Type", "Order Date", "Delivery", "Season Window", "Budget", "POs Placed", "OTB", "Max Vol (CBM)", "Status", ""].map((h) => (
                    <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orderCycles.map((cycle) => {
                  const cyclePOs = purchaseOrders.filter((po) => po.orderCycleId === cycle.id);
                  const totalPlaced = cyclePOs.reduce((s, po) => s + po.optimisedValueCents, 0);
                  const otb = cycle.budgetCents - totalPlaced;
                  return (
                  <tr key={cycle.id} className="hover:bg-brand-gray/30">
                    <td className="py-2.5 pr-4 font-500">{cycle.name}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="info">{cycle.type}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{cycle.orderDate}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{cycle.expectedDeliveryDate}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{cycle.seasonStart} → {cycle.seasonEnd}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">${(cycle.budgetCents / 100).toLocaleString()}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">${(totalPlaced / 100).toLocaleString()}</td>
                    <td className={`py-2.5 pr-4 font-mono text-xs font-700 ${otb < 0 ? "text-red-600" : otb < cycle.budgetCents * 0.1 ? "text-amber-600" : "text-green-600"}`}>
                      ${(otb / 100).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{cycle.maxVolumeCBM ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={cycle.isActive ? "success" : "default"}>
                        {cycle.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => {
                          if (confirm("Delete this order cycle?")) {
                            dispatch({ type: "DELETE_ORDER_CYCLE", id: cycle.id });
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

      {/* Seasonal Factors */}
      <Card>
        <CardHeader>
          <CardTitle>Seasonal Uplift Factors</CardTitle>
          <Button size="sm" onClick={() => setShowSeasonalForm(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Category
          </Button>
        </CardHeader>

        <div className="mb-4 rounded-sm bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Monthly multipliers applied to base velocity. 1.0 = no change, 2.0 = double demand, 0.5 = half demand.
          The default preset uses Australian action sports seasonality.
        </div>

        {showSeasonalForm && (
          <div className="mb-4">
            <SeasonalForm
              onClose={() => setShowSeasonalForm(false)}
              onSave={(config) => {
                const existing = settings.seasonalConfigs.find(
                  (c) => c.category.toLowerCase() === config.category.toLowerCase()
                );
                const updated = existing
                  ? settings.seasonalConfigs.map((c) =>
                      c.category.toLowerCase() === config.category.toLowerCase() ? config : c
                    )
                  : [...settings.seasonalConfigs, config];
                saveSettings({ seasonalConfigs: updated });
                setShowSeasonalForm(false);
              }}
            />
          </div>
        )}

        {/* Default preset display */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">
            Default Preset (Action Sports AU) — applied when no category override exists
          </p>
          <SeasonalGrid factors={ACTION_SPORTS_SEASONAL_AU} readOnly />
        </div>

        {settings.seasonalConfigs.length > 0 && (
          <div className="space-y-4">
            {settings.seasonalConfigs.map((config) => (
              <div key={config.category}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-600">{config.category}</p>
                  <button
                    onClick={() => {
                      const updated = settings.seasonalConfigs.filter(
                        (c) => c.category !== config.category
                      );
                      saveSettings({ seasonalConfigs: updated });
                    }}
                    className="text-brand-dark-gray hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <SeasonalGrid factors={config.factors} readOnly />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Danger Zone */}
      <Card className="border border-red-200">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
        </CardHeader>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("This will permanently delete ALL data. Are you sure?")) {
              localStorage.removeItem("core-action-ml-state");
              window.location.reload();
            }
          }}
        >
          Reset All Data
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// General Settings Form
// ---------------------------------------------------------------------------

function GeneralSettingsForm({
  settings,
  onSave,
}: {
  settings: ReturnType<typeof useAppStore>["state"]["settings"];
  onSave: (updates: Partial<typeof settings>) => void;
}) {
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [currency, setCurrency] = useState(settings.currency);
  const [landedCostFactor, setLandedCostFactor] = useState(String(settings.defaultLandedCostFactor));
  const [targetMargin, setTargetMargin] = useState(String(settings.targetGrossMarginPct));
  const [forecastWindow, setForecastWindow] = useState(String(settings.defaultForecastWindowDays));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Input
          label="Business Name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
        <Select
          label="Currency"
          options={[
            { value: "AUD", label: "AUD" },
            { value: "USD", label: "USD" },
            { value: "GBP", label: "GBP" },
            { value: "NZD", label: "NZD" },
            { value: "EUR", label: "EUR" },
          ]}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
        <Input
          label="Default Landed Cost Factor"
          type="number"
          step="0.01"
          value={landedCostFactor}
          onChange={(e) => setLandedCostFactor(e.target.value)}
          hint="e.g. 1.15 = 15% on top of cost"
        />
        <Input
          label="Target GM% "
          type="number"
          value={targetMargin}
          onChange={(e) => setTargetMargin(e.target.value)}
        />
        <Input
          label="Default Forecast Window (days)"
          type="number"
          value={forecastWindow}
          onChange={(e) => setForecastWindow(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() =>
            onSave({
              businessName,
              currency,
              defaultLandedCostFactor: parseFloat(landedCostFactor) || 1.15,
              targetGrossMarginPct: parseFloat(targetMargin) || 50,
              defaultForecastWindowDays: parseInt(forecastWindow) || 90,
            })
          }
        >
          <Save className="h-4 w-4" /> Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Cycle Form
// ---------------------------------------------------------------------------

function OrderCycleForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Omit<OrderCycle, "id">) => void;
}) {
  const { register, handleSubmit } = useForm<Omit<OrderCycle, "id">>({
    defaultValues: {
      name: "",
      type: "Q1",
      orderDate: "",
      expectedDeliveryDate: "",
      seasonStart: "",
      seasonEnd: "",
      budgetCents: 0,
      isActive: true,
    },
  });

  function onSubmit(data: Omit<OrderCycle, "id">) {
    onSave({
      ...data,
      budgetCents: Math.round(Number(data.budgetCents) * 100),
    });
  }

  return (
    <div className="rounded-sm border border-brand-red/20 bg-brand-gray/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-600">New Order Cycle</p>
        <button onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Input label="Name *" id="cycleName" {...register("name", { required: true })} placeholder="e.g. 2025 Q3" />
          <Select
            label="Type"
            id="cycleType"
            options={CYCLE_TYPES}
            {...register("type")}
          />
          <Input label="Order Date" id="orderDate" type="date" {...register("orderDate")} />
          <Input label="Expected Delivery" id="deliveryDate" type="date" {...register("expectedDeliveryDate")} />
          <Input label="Season Start" id="seasonStart" type="date" {...register("seasonStart")} />
          <Input label="Season End" id="seasonEnd" type="date" {...register("seasonEnd")} />
          <Input
            label="Budget ($)"
            id="budget"
            type="number"
            step="100"
            {...register("budgetCents", { valueAsNumber: true })}
          />
          <Input
            label="Max Volume (CBM)"
            id="maxVolume"
            type="number"
            step="0.1"
            {...register("maxVolumeCBM", { valueAsNumber: true })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} className="accent-brand-red" defaultChecked />
          Active
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm">Save Cycle</Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seasonal Grid
// ---------------------------------------------------------------------------

function SeasonalGrid({
  factors,
  readOnly,
}: {
  factors: SeasonalFactors;
  readOnly?: boolean;
}) {
  return (
    <div className="grid grid-cols-6 gap-1 lg:grid-cols-12">
      {MONTH_NAMES.map((name, i) => {
        const month = i + 1;
        const val = factors[String(month)] ?? 1.0;
        return (
          <div
            key={month}
            className={`rounded-sm p-2 text-center ${
              val > 1.2
                ? "bg-green-100"
                : val > 1
                ? "bg-green-50"
                : val < 0.8
                ? "bg-red-100"
                : val < 1
                ? "bg-red-50"
                : "bg-gray-100"
            }`}
          >
            <p className="text-[10px] font-600 text-brand-dark-gray">{name}</p>
            <p className={`font-mono text-xs font-700 ${val > 1 ? "text-green-700" : val < 1 ? "text-red-600" : "text-gray-600"}`}>
              {formatMultiplier(val)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seasonal Form
// ---------------------------------------------------------------------------

function SeasonalForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (config: CategorySeasonalConfig) => void;
}) {
  const [category, setCategory] = useState("");
  const [factors, setFactors] = useState<SeasonalFactors>({ ...ACTION_SPORTS_SEASONAL_AU });

  return (
    <div className="rounded-sm border border-brand-red/20 bg-brand-gray/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-600">New Seasonal Config</p>
        <button onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <Input
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Skateboarding"
        />
        <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">Monthly Multipliers</p>
        <div className="grid grid-cols-6 gap-2 lg:grid-cols-12">
          {MONTH_NAMES.map((name, i) => {
            const month = i + 1;
            return (
              <div key={month}>
                <p className="mb-0.5 text-center text-[10px] font-600 text-brand-dark-gray">{name}</p>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="5"
                  value={factors[String(month)] ?? 1.0}
                  onChange={(e) =>
                    setFactors((prev) => ({
                      ...prev,
                      [String(month)]: parseFloat(e.target.value) || 1.0,
                    }))
                  }
                  className="w-full rounded-none border border-gray-300 px-1 py-1 text-center font-mono text-xs focus:border-brand-red focus:outline-none"
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!category}
            onClick={() => onSave({ category, factors })}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
