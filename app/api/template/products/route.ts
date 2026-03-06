import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const filePath = join(process.cwd(), "data", "templates", "products.csv");
  const csv = readFileSync(filePath, "utf-8");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=products-template.csv",
    },
  });
}
