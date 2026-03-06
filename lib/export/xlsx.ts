/**
 * XLSX export utility using SheetJS (xlsx).
 * All exports are client-side — no server required.
 */

export async function exportToXlsx(
  sheets: { name: string; data: object[] }[],
  filename: string
): Promise<void> {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  for (const { name, data } of sheets) {
    if (data.length === 0) continue;
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-width columns
    const colWidths = Object.keys(data[0]).map((key) => ({
      wch: Math.max(
        key.length,
        ...data.map((row) => String((row as Record<string, unknown>)[key] ?? "").length)
      ),
    }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel tab max 31 chars
  }

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Format a PO into XLSX-friendly flat rows */
export function poToXlsxRows(po: import("@/types/purchase-order").PurchaseOrder) {
  return po.lines
    .filter((l) => l.isIncluded)
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .map((l) => ({
      Rank: l.priorityRank,
      SKU: l.sku,
      Product: l.productName,
      Category: l.category,
      "Forecast Qty": l.forecastedQty,
      "Order Qty": l.orderedQty,
      Cartons: l.cartons,
      "Landed Cost/Unit ($)": (l.landedCostPerUnitCents / 100).toFixed(2),
      "Total Cost ($)": (l.totalLandedCostCents / 100).toFixed(2),
      "Forecast Revenue ($)": (l.totalForecastedRevenueCents / 100).toFixed(2),
      "Gross Profit ($)": (l.grossProfitCents / 100).toFixed(2),
      "GM%": l.grossMarginPct.toFixed(1),
      "Vol CBM": l.volumeCBM?.toFixed(3) ?? "",
      Sizes: l.sizeBreakdown?.map((s) => `${s.size}:${s.qty}`).join(", ") ?? "",
      Notes: l.notes ?? "",
    }));
}
