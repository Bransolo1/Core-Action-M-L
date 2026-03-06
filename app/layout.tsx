import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/store/app-store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Core Action ML — Inventory Forecast",
  description:
    "AI-powered inventory forecasting and purchase order optimisation for Core Action Sports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-barlow min-h-screen bg-brand-gray">
        <AppProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
            </div>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
