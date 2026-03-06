"use client";

import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { AlertTriangle, RefreshCw } from "lucide-react";

function FallbackUI({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-red-200 bg-red-50 p-8 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
      <h2 className="mb-1 text-sm font-700 text-red-800">Something went wrong</h2>
      <p className="mb-4 text-xs text-red-600">{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        className="flex items-center gap-2 rounded-none bg-brand-red px-4 py-2 text-xs font-700 uppercase tracking-wider text-white hover:opacity-90"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try Again
      </button>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary FallbackComponent={FallbackUI}>
      {children}
    </ReactErrorBoundary>
  );
}
