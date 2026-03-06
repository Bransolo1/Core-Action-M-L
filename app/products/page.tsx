"use client";

import React, { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatPct, calculateGrossMarginPct } from "@/lib/costs";
import { formatDimensions, formatCBM, cartonVolumeCBM } from "@/lib/volumetrics";
import { nanoid } from "@/lib/nanoid";
import type { Product, ProductFormData, SizeCurve } from "@/types/product";
import { SIZE_CURVE_CATEGORIES } from "@/types/product";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useForm } from "react-hook-form";

const CATEGORIES = [
  "Skateboarding",
  "Surfing",
  "Snowboarding",
  "BMX",
  "Scooter",
  "Footwear",
  "Apparel",
  "Accessories",
  "Hardware",
  "Protection",
];

const CATEGORY_OPTIONS = [
  { value: "", label: "— Select category —" },
  ...CATEGORIES.map((c) => ({ value: c, label: c })),
];

export default function ProductsPage() {
  const { state, dispatch } = useAppStore();
  const { products, suppliers } = state;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );

  function handleEdit(product: Product) {
    setEditingId(product.id);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    if (confirm("Delete this product?")) {
      dispatch({ type: "DELETE_PRODUCT", id });
    }
  }

  function handleClose() {
    setShowForm(false);
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="max-w-xs">
          <Input
            placeholder="Search SKU, name, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => { setEditingId(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {showForm && (
        <ProductForm
          editingProduct={editingId ? products.find((p) => p.id === editingId) : undefined}
          products={products}
          suppliers={suppliers}
          onClose={handleClose}
          onSave={(data) => {
            if (editingId) {
              dispatch({
                type: "UPSERT_PRODUCT",
                product: { ...data, id: editingId, createdAt: products.find((p) => p.id === editingId)!.createdAt, updatedAt: new Date().toISOString() },
              });
            } else {
              dispatch({
                type: "UPSERT_PRODUCT",
                product: { ...data, id: nanoid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              });
            }
            handleClose();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Products ({filtered.length})</CardTitle>
        </CardHeader>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-brand-dark-gray">
            No products yet. Click &quot;Add Product&quot; to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {["SKU", "Name", "Category", "Supplier", "RRP", "Cost", "Landed Cost", "GM%", "Box Dims", "Vol/Carton", "Units/Ctn", "Sizes", "Status", ""].map((h) => (
                    <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => {
                  const margin = calculateGrossMarginPct(p.rrpCents, p.landedCostCents);
                  return (
                    <tr key={p.id} className="hover:bg-brand-gray/30">
                      <td className="py-2.5 pr-4 font-mono text-xs">{p.sku}</td>
                      <td className="py-2.5 pr-4 font-500">
                        {p.name}
                        {p.isNewToMarket && (
                          <Badge variant="info" className="ml-2 text-[10px]">NEW</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-brand-dark-gray">{p.category}</td>
                      <td className="py-2.5 pr-4 text-xs text-brand-dark-gray">
                        {p.supplierId ? (suppliers.find((s) => s.id === p.supplierId)?.code ?? "—") : "—"}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{formatCurrency(p.rrpCents)}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{formatCurrency(p.costCents)}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{formatCurrency(p.landedCostCents)}</td>
                      <td className={`py-2.5 pr-4 font-mono text-xs font-700 ${margin >= 50 ? "text-green-600" : margin >= 35 ? "text-amber-600" : "text-red-600"}`}>
                        {formatPct(margin)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {p.boxDimensions ? formatDimensions(p.boxDimensions) : "—"}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {p.boxDimensions ? formatCBM(cartonVolumeCBM(p.boxDimensions)) : "—"}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{p.unitsPerCarton}</td>
                      <td className="py-2.5 pr-4 text-xs text-brand-dark-gray">
                        {p.sizeCurve ? p.sizeCurve.sizes.map((s) => s.size).join("/") : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={p.isActive ? "success" : "default"}>
                          {p.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(p)} className="text-brand-dark-gray hover:text-brand-black">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="text-brand-dark-gray hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
// Product Form
// ---------------------------------------------------------------------------

interface ProductFormProps {
  editingProduct?: Product;
  products: Product[];
  suppliers: import("@/types/supplier").Supplier[];
  onClose: () => void;
  onSave: (data: ProductFormData) => void;
}

function ProductForm({ editingProduct, products, suppliers, onClose, onSave }: ProductFormProps) {
  const [sizeCurve, setSizeCurve] = useState<SizeCurve | undefined>(editingProduct?.sizeCurve);
  const defaultValues: ProductFormData = editingProduct
    ? {
        sku: editingProduct.sku,
        name: editingProduct.name,
        category: editingProduct.category,
        subCategory: editingProduct.subCategory,
        rrpCents: editingProduct.rrpCents,
        costCents: editingProduct.costCents,
        landedCostCents: editingProduct.landedCostCents,
        landedCostFactor: editingProduct.landedCostFactor,
        boxDimensions: editingProduct.boxDimensions,
        unitsPerCarton: editingProduct.unitsPerCarton,
        isActive: editingProduct.isActive,
        isNewToMarket: editingProduct.isNewToMarket,
        analogousProductId: editingProduct.analogousProductId,
      }
    : {
        sku: "",
        name: "",
        category: "",
        rrpCents: 0,
        costCents: 0,
        landedCostCents: 0,
        landedCostFactor: 1.15,
        unitsPerCarton: 1,
        isActive: true,
        isNewToMarket: false,
      };

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ProductFormData>({ defaultValues });

  const isNewToMarket = watch("isNewToMarket");
  const costCents = watch("costCents");
  const landedCostFactor = watch("landedCostFactor");

  // Auto-calculate landed cost
  function handleCostChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cost = Math.round(parseFloat(e.target.value || "0") * 100);
    setValue("costCents", cost);
    setValue("landedCostCents", Math.round(cost * landedCostFactor));
  }

  function handleFactorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const factor = parseFloat(e.target.value || "1");
    setValue("landedCostFactor", factor);
    setValue("landedCostCents", Math.round(costCents * factor));
  }

  function onSubmit(data: ProductFormData) {
    onSave({ ...data, sizeCurve });
  }

  const supplierOptions = [
    { value: "", label: "— No supplier —" },
    ...suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
  ];

  const watchedCategory = watch("category");
  const showSizeCurve = SIZE_CURVE_CATEGORIES.has(watchedCategory);

  const analogousOptions = [
    { value: "", label: "— None —" },
    ...products
      .filter((p) => !p.isNewToMarket && p.id !== editingProduct?.id)
      .map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
  ];

  return (
    <Card className="border border-brand-red/20">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-700">{editingProduct ? "Edit Product" : "New Product"}</h3>
        <button onClick={onClose}>
          <X className="h-4 w-4 text-brand-dark-gray hover:text-brand-black" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input label="SKU *" id="sku" error={errors.sku?.message} {...register("sku", { required: "Required" })} />
          <Input label="Product Name *" id="name" error={errors.name?.message} {...register("name", { required: "Required" })} className="lg:col-span-2" />
          <Select
            label="Category *"
            id="category"
            options={CATEGORY_OPTIONS}
            error={errors.category?.message}
            {...register("category", { required: "Required" })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Select label="Supplier" id="supplierId" options={supplierOptions} {...register("supplierId")} className="lg:col-span-2" />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input
            label="RRP ($)"
            id="rrpCents"
            type="number"
            step="0.01"
            defaultValue={(defaultValues.rrpCents / 100).toFixed(2)}
            onChange={(e) => setValue("rrpCents", Math.round(parseFloat(e.target.value || "0") * 100))}
          />
          <Input
            label="Cost Price ($)"
            id="costCents"
            type="number"
            step="0.01"
            defaultValue={(defaultValues.costCents / 100).toFixed(2)}
            onChange={handleCostChange}
          />
          <Input
            label="Landed Factor (e.g. 1.15)"
            id="landedCostFactor"
            type="number"
            step="0.01"
            defaultValue={defaultValues.landedCostFactor}
            onChange={handleFactorChange}
            hint="Applied to cost price"
          />
          <Input
            label="Landed Cost ($)"
            id="landedCostCents"
            type="number"
            step="0.01"
            defaultValue={(defaultValues.landedCostCents / 100).toFixed(2)}
            onChange={(e) => setValue("landedCostCents", Math.round(parseFloat(e.target.value || "0") * 100))}
          />
        </div>

        {/* Box Dimensions */}
        <div>
          <p className="mb-2 text-xs font-600 uppercase tracking-wide text-brand-dark-gray">
            Box Dimensions (Carton)
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Input label="Length (mm)" id="lengthMm" type="number" {...register("boxDimensions.lengthMm", { valueAsNumber: true })} />
            <Input label="Width (mm)" id="widthMm" type="number" {...register("boxDimensions.widthMm", { valueAsNumber: true })} />
            <Input label="Height (mm)" id="heightMm" type="number" {...register("boxDimensions.heightMm", { valueAsNumber: true })} />
            <Input label="Weight (g)" id="weightGrams" type="number" {...register("boxDimensions.weightGrams", { valueAsNumber: true })} />
            <Input label="Units / Carton" id="unitsPerCarton" type="number" {...register("unitsPerCarton", { valueAsNumber: true, min: 1 })} />
          </div>
        </div>

        {/* Flags */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isActive")} className="accent-brand-red" />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isNewToMarket")} className="accent-brand-red" />
            New to Market
          </label>
        </div>

        {isNewToMarket && (
          <Select
            label="Analogous Product (for velocity prediction)"
            id="analogousProductId"
            options={analogousOptions}
            {...register("analogousProductId")}
          />
        )}

        {/* Size curve — only for Apparel / Footwear */}
        {showSizeCurve && (
          <SizeCurveEditor value={sizeCurve} onChange={setSizeCurve} />
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save Product</Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Size Curve Editor
// ---------------------------------------------------------------------------

const DEFAULT_CURVES: SizeCurve[] = [
  { label: "AU Apparel (XS-3XL)", sizes: [{ size: "XS", pct: 5 }, { size: "S", pct: 15 }, { size: "M", pct: 30 }, { size: "L", pct: 30 }, { size: "XL", pct: 15 }, { size: "2XL", pct: 5 }] },
  { label: "AU Footwear (6-12)", sizes: [{ size: "6", pct: 5 }, { size: "7", pct: 10 }, { size: "8", pct: 15 }, { size: "9", pct: 20 }, { size: "10", pct: 20 }, { size: "11", pct: 15 }, { size: "12", pct: 10 }, { size: "13", pct: 5 }] },
  { label: "Youth (S-XL)", sizes: [{ size: "S", pct: 25 }, { size: "M", pct: 35 }, { size: "L", pct: 25 }, { size: "XL", pct: 15 }] },
];

function SizeCurveEditor({ value, onChange }: { value?: SizeCurve; onChange: (v: SizeCurve | undefined) => void }) {
  const [custom, setCustom] = useState<SizeCurve>(
    value ?? { label: "Custom", sizes: [{ size: "", pct: 0 }] }
  );

  const total = custom.sizes.reduce((s, r) => s + (r.pct || 0), 0);

  function updateSize(i: number, field: "size" | "pct", val: string) {
    const updated = custom.sizes.map((s, idx) =>
      idx === i ? { ...s, [field]: field === "pct" ? Number(val) : val } : s
    );
    const next = { ...custom, sizes: updated };
    setCustom(next);
    onChange(next);
  }

  function addRow() {
    const next = { ...custom, sizes: [...custom.sizes, { size: "", pct: 0 }] };
    setCustom(next);
    onChange(next);
  }

  function removeRow(i: number) {
    const next = { ...custom, sizes: custom.sizes.filter((_, idx) => idx !== i) };
    setCustom(next);
    onChange(next.sizes.length ? next : undefined);
  }

  function applyPreset(curve: SizeCurve) {
    setCustom(curve);
    onChange(curve);
  }

  return (
    <div className="rounded-sm border border-gray-200 p-4">
      <p className="mb-2 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">
        Size Curve Distribution
      </p>
      {/* Presets */}
      <div className="mb-3 flex flex-wrap gap-2">
        {DEFAULT_CURVES.map((curve) => (
          <button
            key={curve.label}
            type="button"
            onClick={() => applyPreset(curve)}
            className="rounded-none border border-gray-300 px-3 py-1 text-xs font-500 hover:border-brand-red hover:text-brand-red"
          >
            {curve.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="rounded-none border border-gray-300 px-3 py-1 text-xs font-500 text-brand-dark-gray hover:border-red-400 hover:text-red-600"
        >
          Clear
        </button>
      </div>

      {/* Size rows */}
      <div className="space-y-1">
        {custom.sizes.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="w-20 rounded-none border border-gray-300 px-2 py-1 text-xs focus:border-brand-red focus:outline-none"
              placeholder="Size"
              value={row.size}
              onChange={(e) => updateSize(i, "size", e.target.value)}
            />
            <input
              className="w-16 rounded-none border border-gray-300 px-2 py-1 font-mono text-xs focus:border-brand-red focus:outline-none"
              type="number"
              min={0}
              max={100}
              value={row.pct}
              onChange={(e) => updateSize(i, "pct", e.target.value)}
            />
            <span className="text-xs text-brand-dark-gray">%</span>
            <button type="button" onClick={() => removeRow(i)} className="text-brand-dark-gray hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-xs text-brand-dark-gray hover:text-brand-black">
          <Plus className="h-3 w-3" /> Add size
        </button>
        <span className={`font-mono text-xs font-700 ${total === 100 ? "text-green-600" : "text-red-600"}`}>
          Total: {total}% {total !== 100 && "(must equal 100%)"}
        </span>
      </div>
    </div>
  );
}
