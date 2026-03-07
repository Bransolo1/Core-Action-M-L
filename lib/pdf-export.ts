/**
 * PDF purchase order export using jsPDF + jspdf-autotable.
 * Call generatePOPdf(po, cycle) on the client side — it triggers a download.
 */
import type { PurchaseOrder } from "@/types/purchase-order";
import type { OrderCycle } from "@/types/purchase-order";
import { formatCurrency, formatPct } from "@/lib/costs";
import { formatCBM } from "@/lib/volumetrics";

export async function generatePOPdf(po: PurchaseOrder, cycle?: OrderCycle): Promise<void> {
  // Dynamic imports keep the bundle lean — jsPDF is ~500kb
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const BRAND_RED: [number, number, number] = [227, 7, 19]; // #E30713
  const BRAND_BLACK: [number, number, number] = [10, 10, 10]; // #0A0A0A
  const LIGHT_GRAY: [number, number, number] = [244, 244, 244]; // #F4F4F4

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, 297, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CORE ACTION SPORTS", 10, 9);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PURCHASE ORDER", 10, 15);
  doc.text("#RIDECORE", 10, 20);

  // PO reference + status top-right
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(po.reference, 287, 10, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(po.status.toUpperCase(), 287, 16, { align: "right" });
  doc.text(new Date(po.createdAt).toLocaleDateString("en-AU"), 287, 21, { align: "right" });

  // ── Meta block ────────────────────────────────────────────────────────────
  doc.setTextColor(...BRAND_BLACK);
  doc.setFontSize(8);

  const metaY = 28;
  const col1 = 10;
  const col2 = 100;
  const col3 = 200;

  const label = (text: string, x: number, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(107, 107, 107);
    doc.text(text, x, y);
  };
  const value = (text: string, x: number, y: number) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND_BLACK);
    doc.text(text, x, y);
  };

  label("SUPPLIER", col1, metaY);
  value(po.supplierName ?? "—", col1, metaY + 4);

  if (cycle) {
    label("ORDER DATE", col1, metaY + 10);
    value(cycle.orderDate || "—", col1, metaY + 14);
    label("DELIVERY DATE", col1, metaY + 20);
    value(cycle.expectedDeliveryDate || "—", col1, metaY + 24);
    label("SEASON", col1, metaY + 30);
    value(`${cycle.seasonStart} → ${cycle.seasonEnd}`, col1, metaY + 34);
  }

  label("BUDGET", col2, metaY);
  value(formatCurrency(po.budgetCents), col2, metaY + 4);
  label("PO VALUE", col2, metaY + 10);
  value(formatCurrency(po.optimisedValueCents), col2, metaY + 14);
  label("FORECAST REVENUE", col2, metaY + 20);
  value(formatCurrency(po.totalRevenueCents), col2, metaY + 24);
  label("FORECAST GP", col2, metaY + 30);
  value(formatCurrency(po.totalGrossProfitCents), col2, metaY + 34);

  label("OVERALL GM%", col3, metaY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_RED);
  doc.text(`${po.overallGrossMarginPct.toFixed(1)}%`, col3, metaY + 8);
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_BLACK);

  if (po.totalVolumeCBM) {
    label("TOTAL VOLUME", col3, metaY + 15);
    value(formatCBM(po.totalVolumeCBM), col3, metaY + 19);
  }

  // ── Line items table ──────────────────────────────────────────────────────
  const includedLines = po.lines
    .filter((l) => l.isIncluded)
    .sort((a, b) => a.priorityRank - b.priorityRank);

  const tableRows = includedLines.flatMap((line) => {
    const mainRow = [
      line.priorityRank.toString(),
      line.sku,
      line.productName,
      line.category,
      line.forecastedQty.toString(),
      line.orderedQty.toString(),
      line.cartons.toString(),
      formatCurrency(line.landedCostPerUnitCents),
      formatCurrency(line.totalLandedCostCents),
      formatCurrency(line.totalForecastedRevenueCents),
      `${line.grossMarginPct.toFixed(1)}%`,
      line.volumeCBM ? formatCBM(line.volumeCBM) : "—",
    ];
    const rows = [mainRow];

    // Size breakdown sub-rows for apparel/footwear
    if (line.sizeBreakdown && line.sizeBreakdown.length > 0) {
      const sizeStr = line.sizeBreakdown
        .map((s) => `${s.size}: ${s.qty}`)
        .join("  |  ");
      rows.push(["", "", `  ↳ ${sizeStr}`, "", "", "", "", "", "", "", "", ""]);
    }

    return rows;
  });

  autoTable(doc, {
    startY: metaY + 42,
    head: [["#", "SKU", "Product", "Category", "Fcst Qty", "Order Qty", "Ctns", "Landed/Unit", "Total Cost", "Fcst Revenue", "GM%", "Vol CBM"]],
    body: tableRows,
    theme: "striped",
    headStyles: {
      fillColor: BRAND_BLACK,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
    },
    bodyStyles: { fontSize: 7, textColor: BRAND_BLACK },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: 22, font: "courier" },
      2: { cellWidth: 55 },
      3: { cellWidth: 22 },
      4: { halign: "right", cellWidth: 14 },
      5: { halign: "right", cellWidth: 16, fontStyle: "bold" },
      6: { halign: "right", cellWidth: 12 },
      7: { halign: "right", cellWidth: 20 },
      8: { halign: "right", cellWidth: 22 },
      9: { halign: "right", cellWidth: 22 },
      10: { halign: "right", cellWidth: 14, fontStyle: "bold" },
      11: { halign: "right", cellWidth: 16 },
    },
    didParseCell: (data) => {
      // Highlight excluded (size breakdown) rows
      if (data.row.index > 0 && data.cell.raw === "") {
        data.cell.styles.fillColor = [255, 252, 220];
      }
      // Colour GM% column
      if (data.column.index === 10 && data.section === "body") {
        const val = parseFloat(String(data.cell.raw));
        if (!isNaN(val)) {
          data.cell.styles.textColor = val >= 50 ? [34, 197, 94] : val >= 35 ? [245, 158, 11] : [239, 68, 68];
        }
      }
    },
  });

  // ── Totals footer ─────────────────────────────────────────────────────────
  const finalY: number = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  doc.setFillColor(...BRAND_BLACK);
  doc.rect(0, finalY, 297, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL LINES: ${includedLines.length}`, 10, finalY + 5);
  doc.text(
    `TOTAL UNITS: ${includedLines.reduce((s, l) => s + l.orderedQty, 0).toLocaleString()}`,
    10, finalY + 10
  );
  doc.text(`PO VALUE: ${formatCurrency(po.optimisedValueCents)}`, 120, finalY + 5);
  doc.text(`FORECAST REVENUE: ${formatCurrency(po.totalRevenueCents)}`, 120, finalY + 10);
  doc.setTextColor(...BRAND_RED);
  doc.setFontSize(10);
  doc.text(`GM: ${formatPct(po.overallGrossMarginPct)}`, 250, finalY + 8);

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`${po.reference}.pdf`);
}
