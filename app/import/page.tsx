"use client";

import { useRef, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseShopifyExport } from "@/lib/import/shopify";
import { parseWooCommerceExport } from "@/lib/import/woocommerce";
import { parseProductCSV, parseSalesCSV } from "@/lib/import/generic-csv";
import type { ImportResult as ShopifyResult } from "@/lib/import/shopify";
import type { ImportResult as WooResult } from "@/lib/import/woocommerce";
import type { ProductImportResult, SalesImportResult } from "@/lib/import/generic-csv";
import { nanoid } from "@/lib/nanoid";
import {
  Upload, CheckCircle, AlertTriangle, FileText,
  Download, Package, BarChart2, ShoppingCart,
} from "lucide-react";

type ImportMode = "products" | "sales" | "shopify" | "woocommerce";

const TABS: { id: ImportMode; label: string; icon: typeof Package; desc: string }[] = [
  { id: "products", label: "Products", icon: Package, desc: "Upload your product catalogue from a spreadsheet" },
  { id: "sales", label: "Sales History", icon: BarChart2, desc: "Upload historical sales periods from a spreadsheet" },
  { id: "shopify", label: "Shopify", icon: ShoppingCart, desc: "Import orders directly from a Shopify CSV export" },
  { id: "woocommerce", label: "WooCommerce", icon: ShoppingCart, desc: "Import orders from a WooCommerce CSV export" },
];

export default function ImportPage() {
  const { state, dispatch } = useAppStore();
  const [mode, setMode] = useState<ImportMode>("products");
  const [productResult, setProductResult] = useState<ProductImportResult | null>(null);
  const [salesResult, setSalesResult] = useState<(ShopifyResult | WooResult | SalesImportResult) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setProductResult(null);
    setSalesResult(null);
    setError(null);
    setImportDone(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setProductResult(null);
    setSalesResult(null);
    setImportDone(false);

    try {
      const text = await file.text();
      const { default: Papa } = await import("papaparse");

      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        transform: (v) => v.trim(),
      });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        setError(`CSV parse error: ${parsed.errors[0].message}`);
        return;
      }

      if (mode === "products") {
        const result = parseProductCSV(parsed.data);
        setProductResult(result);
      } else if (mode === "sales") {
        const result = parseSalesCSV(parsed.data, state.products);
        setSalesResult(result);
      } else if (mode === "shopify") {
        const result = parseShopifyExport(parsed.data as never, state.products);
        setSalesResult(result);
      } else {
        const result = parseWooCommerceExport(parsed.data as never, state.products);
        setSalesResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  function confirmProductImport() {
    if (!productResult) return;
    for (const p of productResult.products) {
      dispatch({
        type: "UPSERT_PRODUCT",
        product: {
          ...p,
          id: nanoid(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }
    setImportDone(true);
  }

  function confirmSalesImport() {
    if (!salesResult) return;
    dispatch({ type: "UPSERT_SALES_PERIODS", periods: salesResult.periods });
    setImportDone(true);
  }

  const productMap = new Map(state.products.map((p) => [p.id, p]));
  const salesErrors = salesResult && "errors" in salesResult ? (salesResult as SalesImportResult).errors : [];

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        <span className="flex h-6 w-6 items-center justify-center bg-brand-red text-xs font-700 text-white">1</span>
        <span className="font-600">Choose format</span>
        <span className="mx-2 text-brand-dark-gray">→</span>
        <span className="flex h-6 w-6 items-center justify-center bg-brand-red text-xs font-700 text-white">2</span>
        <span className="font-600">Upload CSV</span>
        <span className="mx-2 text-brand-dark-gray">→</span>
        <span className="flex h-6 w-6 items-center justify-center bg-brand-red text-xs font-700 text-white">3</span>
        <span className="font-600">Review & confirm</span>
      </div>

      {/* Tab selector */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TABS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => { setMode(id); reset(); }}
            className={`rounded-sm border p-4 text-left transition-colors ${
              mode === id
                ? "border-brand-red bg-red-50/50"
                : "border-gray-200 hover:border-brand-red/50"
            }`}
          >
            <Icon className={`mb-2 h-5 w-5 ${mode === id ? "text-brand-red" : "text-brand-dark-gray"}`} />
            <p className={`text-sm font-600 ${mode === id ? "text-brand-red" : "text-brand-black"}`}>{label}</p>
            <p className="mt-0.5 text-xs text-brand-dark-gray">{desc}</p>
          </button>
        ))}
      </div>

      {/* Template download + instructions */}
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "products" ? "Upload Products" :
             mode === "sales" ? "Upload Sales History" :
             mode === "shopify" ? "Import from Shopify" :
             "Import from WooCommerce"}
          </CardTitle>
        </CardHeader>

        {/* Downloadable template */}
        {(mode === "products" || mode === "sales") && (
          <div className="mb-4 flex items-center gap-4 rounded-sm bg-green-50 px-4 py-3">
            <Download className="h-5 w-5 flex-shrink-0 text-green-700" />
            <div className="flex-1">
              <p className="text-sm font-600 text-green-900">
                {mode === "products" ? "Download the Products template" : "Download the Sales History template"}
              </p>
              <p className="text-xs text-green-700">
                Open in Excel / Google Sheets, fill in your data, save as CSV, then upload below.
              </p>
            </div>
            <a
              href={mode === "products" ? "/api/template/products" : "/api/template/sales"}
              download={mode === "products" ? "products-template.csv" : "sales-history-template.csv"}
              className="flex items-center gap-1 bg-green-700 px-4 py-2 text-xs font-600 text-white hover:bg-green-800"
            >
              <Download className="h-3.5 w-3.5" /> Download Template
            </a>
          </div>
        )}

        {/* Platform-specific instructions */}
        {mode === "products" && (
          <div className="mb-4 rounded-sm bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-600">How to prepare your data</p>
            <ol className="mt-1 list-inside list-decimal space-y-1 text-xs">
              <li>Download the template CSV above</li>
              <li>Open it in Excel or Google Sheets</li>
              <li>Replace the example rows with your products — keep the header row</li>
              <li><strong>Required columns:</strong> SKU, Product Name, Category, RRP, Cost Price</li>
              <li>Save as CSV (File → Save As → CSV)</li>
              <li>Upload the file below</li>
            </ol>
          </div>
        )}

        {mode === "sales" && (
          <div className="mb-4 rounded-sm bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-600">How to prepare your data</p>
            <ol className="mt-1 list-inside list-decimal space-y-1 text-xs">
              <li>Download the template CSV above</li>
              <li><strong>Products must already be imported</strong> (SKUs must match)</li>
              <li>Each row = one product for one time period (e.g. Q3 2024)</li>
              <li><strong>Key field:</strong> &quot;In Stock Days&quot; — if the product was out of stock for part of the period, enter only the days it was available. This prevents the forecast from underestimating demand.</li>
              <li>Set &quot;Had Stockout&quot; to Yes for any period where stock ran out</li>
              <li>Save as CSV and upload below</li>
            </ol>
          </div>
        )}

        {mode === "shopify" && (
          <div className="mb-4 rounded-sm bg-blue-50 px-4 py-3 text-xs text-blue-800">
            <strong>Shopify:</strong> Admin → Orders → Export → All orders → CSV for Excel.
            Required columns: <code>Name, Financial Status, Paid at, Lineitem sku, Lineitem quantity</code>.
            Products must already exist with matching SKUs.
          </div>
        )}

        {mode === "woocommerce" && (
          <div className="mb-4 rounded-sm bg-blue-50 px-4 py-3 text-xs text-blue-800">
            <strong>WooCommerce:</strong> WP Admin → WooCommerce → Reports → Orders → Download CSV.
            Required columns: <code>Order Status, Date, SKU, Quantity</code>.
            Products must already exist with matching SKUs.
          </div>
        )}

        {/* Drop zone */}
        {!importDone && (
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed border-gray-300 py-12 transition-colors hover:border-brand-red"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
          >
            <Upload className="mb-3 h-8 w-8 text-brand-dark-gray" />
            <p className="font-600 text-brand-black">Drop CSV here or click to browse</p>
            <p className="mt-1 text-xs text-brand-dark-gray">Accepts .csv files only</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        )}

        {loading && <p className="mt-3 text-center text-sm text-brand-dark-gray">Parsing file...</p>}
        {error && (
          <div className="mt-3 rounded-sm bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mr-1 inline h-4 w-4" /> {error}
          </div>
        )}

        {/* Import success message */}
        {importDone && (
          <div className="rounded-sm bg-green-50 px-4 py-8 text-center">
            <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-600" />
            <p className="text-lg font-700 text-green-900">Import complete!</p>
            <p className="mt-1 text-sm text-green-700">
              {mode === "products"
                ? `${productResult?.products.length ?? 0} products added. Go to Products to view them.`
                : `${salesResult?.periodsCreated ?? 0} sales periods added. Go to Sales History to view them.`
              }
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button onClick={reset}>Import More</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Product import results */}
      {productResult && !importDone && (
        <Card>
          <CardHeader>
            <CardTitle>
              <CheckCircle className="mr-1 inline h-4 w-4 text-green-600" />
              {productResult.products.length} Products Ready to Import
            </CardTitle>
          </CardHeader>

          {productResult.errors.length > 0 && (
            <div className="mb-4 rounded-sm bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              {productResult.errors.length} rows had issues:
              <ul className="mt-1 list-inside list-disc">
                {productResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {productResult.errors.length > 10 && <li>... and {productResult.errors.length - 10} more</li>}
              </ul>
            </div>
          )}

          {productResult.products.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    {["SKU", "Name", "Category", "RRP", "Cost", "Landed", "Units/Ctn", "Active"].map((h) => (
                      <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {productResult.products.slice(0, 30).map((p, i) => (
                    <tr key={i} className="hover:bg-brand-gray/30">
                      <td className="py-2 pr-4 font-mono text-xs">{p.sku}</td>
                      <td className="py-2 pr-4 font-500">{p.name}</td>
                      <td className="py-2 pr-4 text-xs text-brand-dark-gray">{p.category}</td>
                      <td className="py-2 pr-4 font-mono text-xs">${(p.rrpCents / 100).toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">${(p.costCents / 100).toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">${(p.landedCostCents / 100).toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{p.unitsPerCarton}</td>
                      <td className="py-2 pr-4"><Badge variant={p.isActive ? "success" : "default"}>{p.isActive ? "Yes" : "No"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={confirmProductImport} disabled={productResult.products.length === 0}>
              <FileText className="h-4 w-4" /> Confirm Import ({productResult.products.length} products)
            </Button>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Sales import results */}
      {salesResult && !importDone && (
        <Card>
          <CardHeader>
            <CardTitle>
              <CheckCircle className="mr-1 inline h-4 w-4 text-green-600" />
              {salesResult.periodsCreated} Sales Periods Ready to Import
            </CardTitle>
          </CardHeader>

          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Rows Processed", value: salesResult.rowsProcessed.toLocaleString() },
              { label: "Periods to Import", value: salesResult.periodsCreated.toLocaleString() },
              { label: "Unmatched SKUs", value: salesResult.unmatchedSkus.length.toString(), danger: salesResult.unmatchedSkus.length > 0 },
            ].map(({ label, value, danger }) => (
              <div key={label} className="rounded-sm bg-brand-gray p-3">
                <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
                <p className={`font-mono text-xl font-700 ${danger ? "text-red-600" : "text-brand-black"}`}>{value}</p>
              </div>
            ))}
          </div>

          {salesResult.unmatchedSkus.length > 0 && (
            <div className="mb-4 rounded-sm bg-amber-50 px-4 py-3">
              <p className="mb-1 text-xs font-600 uppercase tracking-wider text-amber-800">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                SKUs not found — import products first, or check spelling
              </p>
              <div className="flex flex-wrap gap-1">
                {salesResult.unmatchedSkus.map((sku) => (
                  <Badge key={sku} variant="warning">{sku}</Badge>
                ))}
              </div>
            </div>
          )}

          {salesErrors.length > 0 && (
            <div className="mb-4 rounded-sm bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              {salesErrors.length} rows had issues:
              <ul className="mt-1 list-inside list-disc">
                {salesErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {salesResult.periods.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    {["Product", "Period", "Sold", "Received", "In-Stock Days", "Stockout"].map((h) => (
                      <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {salesResult.periods.slice(0, 30).map((period) => {
                    const product = productMap.get(period.productId);
                    return (
                      <tr key={period.id} className="hover:bg-brand-gray/30">
                        <td className="py-2 pr-4">
                          <p className="font-500">{product?.name ?? "—"}</p>
                          <p className="font-mono text-xs text-brand-dark-gray">{product?.sku}</p>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">{period.periodStart} → {period.periodEnd}</td>
                        <td className="py-2 pr-4 font-mono text-xs font-700">{period.unitsSold}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{period.unitsReceived}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{period.inStockDays} / {period.totalDays}</td>
                        <td className="py-2 pr-4">
                          {period.hadStockout && <Badge variant="danger">Yes</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {salesResult.periods.length > 30 && (
                <p className="mt-2 text-xs text-brand-dark-gray">Showing 30 of {salesResult.periods.length} periods.</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={confirmSalesImport} disabled={salesResult.periodsCreated === 0}>
              <FileText className="h-4 w-4" /> Confirm Import ({salesResult.periodsCreated} periods)
            </Button>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
