"use client";

import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from "react";
import type { Product } from "@/types/product";
import type { SalesPeriod } from "@/types/sales";
import type { ForecastRun } from "@/types/forecast";
import type { PurchaseOrder, OrderCycle } from "@/types/purchase-order";
import type { AppSettings } from "@/types/settings";
import type { Supplier } from "@/types/supplier";
import { DEFAULT_SETTINGS } from "@/types/settings";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AppState {
  products: Product[];
  salesPeriods: SalesPeriod[];
  forecastRuns: ForecastRun[];
  purchaseOrders: PurchaseOrder[];
  orderCycles: OrderCycle[];
  suppliers: Supplier[];
  settings: AppSettings;
}

export const INITIAL_STATE: AppState = {
  products: [],
  salesPeriods: [],
  forecastRuns: [],
  purchaseOrders: [],
  orderCycles: [],
  suppliers: [],
  settings: DEFAULT_SETTINGS,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "SET_PRODUCTS"; products: Product[] }
  | { type: "UPSERT_PRODUCT"; product: Product }
  | { type: "DELETE_PRODUCT"; id: string }
  | { type: "SET_SALES_PERIODS"; periods: SalesPeriod[] }
  | { type: "UPSERT_SALES_PERIOD"; period: SalesPeriod }
  | { type: "UPSERT_SALES_PERIODS"; periods: SalesPeriod[] }
  | { type: "DELETE_SALES_PERIOD"; id: string }
  | { type: "SET_FORECAST_RUNS"; runs: ForecastRun[] }
  | { type: "UPSERT_FORECAST_RUN"; run: ForecastRun }
  | { type: "DELETE_FORECAST_RUN"; id: string }
  | { type: "SET_PURCHASE_ORDERS"; orders: PurchaseOrder[] }
  | { type: "UPSERT_PURCHASE_ORDER"; order: PurchaseOrder }
  | { type: "DELETE_PURCHASE_ORDER"; id: string }
  | { type: "SET_ORDER_CYCLES"; cycles: OrderCycle[] }
  | { type: "UPSERT_ORDER_CYCLE"; cycle: OrderCycle }
  | { type: "DELETE_ORDER_CYCLE"; id: string }
  | { type: "SET_SUPPLIERS"; suppliers: Supplier[] }
  | { type: "UPSERT_SUPPLIER"; supplier: Supplier }
  | { type: "DELETE_SUPPLIER"; id: string }
  | { type: "UPDATE_SETTINGS"; settings: Partial<AppSettings> }
  | { type: "HYDRATE"; state: AppState };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((i) => i.id === item.id);
  return idx >= 0 ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item];
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return { ...INITIAL_STATE, ...action.state };
    case "SET_PRODUCTS":
      return { ...state, products: action.products };
    case "UPSERT_PRODUCT":
      return { ...state, products: upsert(state.products, action.product) };
    case "DELETE_PRODUCT":
      return { ...state, products: state.products.filter((p) => p.id !== action.id) };
    case "SET_SALES_PERIODS":
      return { ...state, salesPeriods: action.periods };
    case "UPSERT_SALES_PERIOD":
      return { ...state, salesPeriods: upsert(state.salesPeriods, action.period) };
    case "UPSERT_SALES_PERIODS":
      return {
        ...state,
        salesPeriods: action.periods.reduce(
          (acc, p) => upsert(acc, p),
          state.salesPeriods
        ),
      };
    case "DELETE_SALES_PERIOD":
      return { ...state, salesPeriods: state.salesPeriods.filter((p) => p.id !== action.id) };
    case "SET_FORECAST_RUNS":
      return { ...state, forecastRuns: action.runs };
    case "UPSERT_FORECAST_RUN":
      return { ...state, forecastRuns: upsert(state.forecastRuns, action.run) };
    case "DELETE_FORECAST_RUN":
      return { ...state, forecastRuns: state.forecastRuns.filter((r) => r.id !== action.id) };
    case "SET_PURCHASE_ORDERS":
      return { ...state, purchaseOrders: action.orders };
    case "UPSERT_PURCHASE_ORDER":
      return { ...state, purchaseOrders: upsert(state.purchaseOrders, action.order) };
    case "DELETE_PURCHASE_ORDER":
      return { ...state, purchaseOrders: state.purchaseOrders.filter((o) => o.id !== action.id) };
    case "SET_ORDER_CYCLES":
      return { ...state, orderCycles: action.cycles };
    case "UPSERT_ORDER_CYCLE":
      return { ...state, orderCycles: upsert(state.orderCycles, action.cycle) };
    case "DELETE_ORDER_CYCLE":
      return { ...state, orderCycles: state.orderCycles.filter((c) => c.id !== action.id) };
    case "SET_SUPPLIERS":
      return { ...state, suppliers: action.suppliers };
    case "UPSERT_SUPPLIER":
      return { ...state, suppliers: upsert(state.suppliers, action.supplier) };
    case "DELETE_SUPPLIER":
      return { ...state, suppliers: state.suppliers.filter((s) => s.id !== action.id) };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  syncStatus: "idle" | "syncing" | "error";
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "core-action-ml-state";
const SYNC_DEBOUNCE_MS = 1500;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [syncStatus, setSyncStatus] = React.useState<"idle" | "syncing" | "error">("idle");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydrating = useRef(true);

  // Hydrate: try server first, fall back to localStorage
  useEffect(() => {
    async function hydrate() {
      try {
        const res = await fetch("/api/sync");
        if (res.ok) {
          const serverState = await res.json() as AppState;
          // If server has data, use it; otherwise check localStorage
          const hasServerData = serverState.products.length > 0 ||
            serverState.salesPeriods.length > 0 ||
            serverState.suppliers.length > 0;

          if (hasServerData) {
            dispatch({ type: "HYDRATE", state: { ...INITIAL_STATE, ...serverState } });
            isHydrating.current = false;
            return;
          }
        }
      } catch {
        // server sync unavailable, fall through to localStorage
      }

      // localStorage fallback
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppState;
          dispatch({ type: "HYDRATE", state: { ...INITIAL_STATE, ...parsed } });
        }
      } catch {
        // ignore
      }
      isHydrating.current = false;
    }
    void hydrate();
  }, []);

  // Sync state to both localStorage and server (debounced)
  const syncToServer = useCallback((s: AppState) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        });
        setSyncStatus("idle");
      } catch {
        setSyncStatus("error");
      }
    }, SYNC_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (isHydrating.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota
    }
    syncToServer(state);
  }, [state, syncToServer]);

  return (
    <AppContext.Provider value={{ state, dispatch, syncStatus }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used inside AppProvider");
  return ctx;
}
