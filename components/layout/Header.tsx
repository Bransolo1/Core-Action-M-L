"use client";

import { usePathname } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { useSession, signOut } from "next-auth/react";
import { Wifi, WifiOff, Loader2, LogOut, ChevronDown } from "lucide-react";
import { useState } from "react";

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
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = PAGE_TITLES[pathname] ?? "Core Action ML";

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="text-lg font-700 tracking-tight text-brand-black">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Sync status */}
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

        {/* User menu */}
        {session?.user && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-sm border border-gray-200 px-3 py-1.5 text-xs font-500 hover:bg-brand-gray"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-black text-[10px] font-700 text-white">
                {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
              </div>
              <span className="max-w-[120px] truncate text-brand-black">
                {session.user.name ?? session.user.email}
              </span>
              <span className="rounded-sm bg-brand-gray px-1 py-0.5 text-[9px] uppercase tracking-wider text-brand-dark-gray">
                {session.user.role}
              </span>
              <ChevronDown className="h-3 w-3 text-brand-dark-gray" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="text-xs font-600 text-brand-black">{session.user.name ?? "User"}</p>
                    <p className="text-[10px] text-brand-dark-gray">{session.user.email}</p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-brand-dark-gray hover:bg-brand-gray hover:text-brand-black"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
