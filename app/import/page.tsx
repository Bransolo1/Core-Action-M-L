"use client";

import { useRef, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseShopifyExport } from "@/lib/import/shopify";
import { parseWooCommerceExport } from "@/lib/import/woocommerce";
import type { ImportResult as ShopifyResult } from "@/lib/import/shopify";
import type { ImportResult as WooResult } from "@/lib/import/woocommerce";
import { Upload, CheckCircle, AlertTriangle, FileText } from "lucide-react";

type Platform = "shopify" | "woocommerce";
type ImportResult = ShopifyResult | WooResult;

export default function ImportPage() {
  const { state, dispatch } = useAppStore();
  const [platform, setPlatform] = useState<Platform>("shopify");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<{ periods: ReturnType<typeof parseShopifyExport>["periods"] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    setPreview(null);

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

      let importResult: ImportResult;
      if (platform === "shopify") {
        importResult = parseShopifyExport(parsed.data as never, state.products);
      } else {
        importResult = parseWooCommerceExport(parsed.data as never, state.products);
      }

      setResult(importResult);
      setPreview({ periods: importResult.periods });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  function confirmImport() {
    if (!result) return;
    dispatch({ type: "UPSERT_SALES_PERIODS", periods: result.periods });
    setResult(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const productMap = new Map(state.products.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      {/* Platform selector */}
      <Card>
        <CardHeader>
          <CardTitle>Import Sales Data</CardTitle>
        </CardHeader>

        <div className="mb-4 rounded-sm bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-600">How it works</p>
          <ol className="mt-1 list-inside list-decimal space-y-1 text-xs">
            <li>Export your orders from Shopify or WooCommerce as CSV</li>
            <li>Upload the file below — sales are grouped by SKU per month</li>
            <li>Review the preview, then confirm to add to Sales History</li>
            <li>Products must already exist with matching SKUs</li>
          </ol>
        </div>

        <div className="mb-4 flex gap-3">
          {(["shopify", "woocommerce"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`rounded-none border px-4 py-2 text-sm font-600 capitalize transition-colors ${
                platform === p
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-gray-300 text-brand-black hover:border-brand-red"
              }`}
            >
              {p === "shopify" ? "Shopify" : "WooCommerce"}
            </button>
          ))}
        </div>

        {/* Export instructions per platform */}
        <div className="mb-4 rounded-sm bg-brand-gray px-4 py-3 text-xs text-brand-dark-gray">
          {platform === "shopify" ? (
            <>
              <strong className="text-brand-black">Shopify:</strong> Admin → Orders → Export → All orders → CSV for Excel.
              Required columns: <code>Name, Financial Status, Paid at, Lineitem sku, Lineitem quantity</code>
            </>
          ) : (
            <>
              <strong className="text-brand-black">WooCommerce:</strong> WP Admin → WooCommerce → Reports → Orders → Download CSV.
              Or use the "WooCommerce Order Export" plugin. Required columns: <code>Order Status, Date, SKU, Quantity</code>
            </>
          )}
        </div>

        {/* Drop zone */}
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

        {loading && (
          <p className="mt-3 text-center text-sm text-brand-dark-gray">Parsing file...</p>
        )}
        {error && (
          <div className="mt-3 rounded-sm bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            {error}
          </div>
        )}
      </Card>

      {/* Result summary */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              <CheckCircle className="mr-1 inline h-4 w-4 text-green-600" />
              Parse Complete
            </CardTitle>
          </CardHeader>

          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Rows Processed", value: result.rowsProcessed.toLocaleString() },
              { label: "Periods to Import", value: result.periodsCreated.toLocaleString() },
              { label: "Unmatched SKUs", value: result.unmatchedSkus.length.toString(), danger: result.unmatchedSkus.length > 0 },
            ].map(({ label, value, danger }) => (
              <div key={label} className="rounded-sm bg-brand-gray p-3">
                <p className="text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{label}</p>
                <p className={`font-mono text-xl font-700 ${danger ? "text-red-600" : "text-brand-black"}`}>{value}</p>
              </div>
            ))}
          </div>

          {result.unmatchedSkus.length > 0 && (
            <div className="mb-4 rounded-sm bg-amber-50 px-4 py-3">
              <p className="mb-1 text-xs font-600 uppercase tracking-wider text-amber-800">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                SKUs not found in product catalogue — rows skipped
              </p>
              <div className="flex flex-wrap gap-1">
                {result.unmatchedSkus.map((sku) => (
                  <Badge key={sku} variant="warning">{sku}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {preview && preview.periods.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    {["Product", "Period", "Units Sold", "Source"].map((h) => (
                      <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.periods.slice(0, 30).map((period) => {
                    const product = productMap.get(period.productId);
                    return (
                      <tr key={period.id} className="hover:bg-brand-gray/30">
                        <td className="py-2 pr-4">
                          <p className="font-500">{product?.name ?? "—"}</p>
                          <p className="font-mono text-xs text-brand-dark-gray">{product?.sku}</p>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {period.periodStart} → {period.periodEnd}
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs font-700">{period.unitsSold}</td>
                        <td className="py-2 pr-4 text-xs text-brand-dark-gray">{period.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview.periods.length > 30 && (
                <p className="mt-2 text-xs text-brand-dark-gray">
                  Showing 30 of {preview.periods.length} periods.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={confirmImport}>
              <FileText className="h-4 w-4" />
              Confirm Import ({result.periodsCreated} periods)
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResult(null);
                setPreview(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Tips */}
      <Card className="border-dashed border-gray-200 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle>After Import</CardTitle>
        </CardHeader>
        <ul className="space-y-2 text-sm text-brand-dark-gray">
          <li>• <strong>In-Stock Days</strong> defaults to full period length — edit any period in Sales History to adjust for known stockouts</li>
          <li>• <strong>Units Received</strong> is set to 0 — update manually if you track intake separately</li>
          <li>• Duplicate imports are safe — each import creates new records with unique IDs</li>
          <li>• Run a new Forecast after importing to update projections</li>
        </ul>
      </Card>
    </div>
  );
}
