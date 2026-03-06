"use client";

import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/products": "Products",
  "/sales": "Sales History",
  "/forecasting": "Forecasting",
  "/purchase-orders": "Purchase Orders",
  "/suppliers": "Suppliers",
  "/import": "Import Data",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const { syncStatus } = useAppStore();
  const title = PAGE_TITLES[pathname] ?? "Core Action ML";

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="text-lg font-700 tracking-tight text-brand-black">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {syncStatus === "syncing" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-dark-gray" />
              <span className="text-[10px] text-brand-dark-gray">Syncing…</span>
            </>
          )}
          {syncStatus === "idle" && (
            <>
              <Wifi className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[10px] text-green-600">Synced</span>
            </>
          )}
          {syncStatus === "error" && (
            <>
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] text-amber-600">Local only</span>
            </>
          )}
        </div>
        <span className="rounded-sm bg-brand-red px-2 py-0.5 text-[10px] font-700 uppercase tracking-widest text-white">
          #RIDECORE
        </span>
      </div>
    </header>
  );
}
