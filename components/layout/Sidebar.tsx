"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  ShoppingCart,
  BarChart2,
  Settings,
  Truck,
  Upload,
} from "lucide-react";
import { clsx } from "clsx";

const NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/products", label: "Products", icon: Package },
      { href: "/sales", label: "Sales History", icon: BarChart2 },
      { href: "/forecasting", label: "Forecasting", icon: TrendingUp },
      { href: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: Truck },
      { href: "/import", label: "Import Data", icon: Upload },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-col bg-brand-black text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center bg-brand-red">
          <span className="text-xs font-800 tracking-tight text-white">CA</span>
        </div>
        <div>
          <p className="text-sm font-700 leading-tight tracking-tight">CORE ACTION</p>
          <p className="text-[10px] font-500 uppercase tracking-widest text-white/50">
            Inventory ML
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-700 uppercase tracking-widest text-white/30">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={clsx(
                        "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-500 transition-colors",
                        active
                          ? "bg-brand-red text-white"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-6 py-4">
        <p className="text-[10px] text-white/30">
          © {new Date().getFullYear()} Core Action Sports
        </p>
        <p className="text-[10px] text-white/20">Born and raised in skateparks</p>
      </div>
    </aside>
  );
}
