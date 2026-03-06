import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/store/app-store";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Toaster } from "sonner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Core Action ML — Inventory Forecast",
  description:
    "AI-powered inventory forecasting and purchase order optimisation for Core Action Sports",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className="font-barlow min-h-screen bg-brand-gray">
        <SessionProvider session={session}>
          <AppProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                  <ErrorBoundary>{children}</ErrorBoundary>
                </main>
              </div>
            </div>
          </AppProvider>
        </SessionProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "rounded-none font-barlow text-sm",
              error: "border-l-4 border-brand-red",
              success: "border-l-4 border-green-500",
            },
          }}
        />
      </body>
    </html>
  );
}
