"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/products": "Products",
  "/sales": "Sales History",
  "/forecasting": "Forecasting",
  "/purchase-orders": "Purchase Orders",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Core Action ML";

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="text-lg font-700 tracking-tight text-brand-black">{title}</h1>
      <div className="flex items-center gap-2">
        <span className="rounded-sm bg-brand-red px-2 py-0.5 text-[10px] font-700 uppercase tracking-widest text-white">
          #RIDECORE
        </span>
      </div>
    </header>
  );
}
