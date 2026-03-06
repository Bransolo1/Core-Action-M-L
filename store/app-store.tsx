"use client";

import React, { createContext, useContext, useEffect, useReducer } from "react";
import type { Product } from "@/types/product";
import type { SalesPeriod } from "@/types/sales";
import type { ForecastRun } from "@/types/forecast";
import type { PurchaseOrder, OrderCycle } from "@/types/purchase-order";
import type { AppSettings } from "@/types/settings";
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
  settings: AppSettings;
}

const INITIAL_STATE: AppState = {
  products: [],
  salesPeriods: [],
  forecastRuns: [],
  purchaseOrders: [],
  orderCycles: [],
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
  | { type: "UPDATE_SETTINGS"; settings: Partial<AppSettings> }
  | { type: "HYDRATE"; state: AppState };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;
    case "SET_PRODUCTS":
      return { ...state, products: action.products };
    case "UPSERT_PRODUCT": {
      const exists = state.products.find((p) => p.id === action.product.id);
      return {
        ...state,
        products: exists
          ? state.products.map((p) => (p.id === action.product.id ? action.product : p))
          : [...state.products, action.product],
      };
    }
    case "DELETE_PRODUCT":
      return { ...state, products: state.products.filter((p) => p.id !== action.id) };
    case "SET_SALES_PERIODS":
      return { ...state, salesPeriods: action.periods };
    case "UPSERT_SALES_PERIOD": {
      const exists = state.salesPeriods.find((p) => p.id === action.period.id);
      return {
        ...state,
        salesPeriods: exists
          ? state.salesPeriods.map((p) => (p.id === action.period.id ? action.period : p))
          : [...state.salesPeriods, action.period],
      };
    }
    case "DELETE_SALES_PERIOD":
      return { ...state, salesPeriods: state.salesPeriods.filter((p) => p.id !== action.id) };
    case "SET_FORECAST_RUNS":
      return { ...state, forecastRuns: action.runs };
    case "UPSERT_FORECAST_RUN": {
      const exists = state.forecastRuns.find((r) => r.id === action.run.id);
      return {
        ...state,
        forecastRuns: exists
          ? state.forecastRuns.map((r) => (r.id === action.run.id ? action.run : r))
          : [...state.forecastRuns, action.run],
      };
    }
    case "DELETE_FORECAST_RUN":
      return { ...state, forecastRuns: state.forecastRuns.filter((r) => r.id !== action.id) };
    case "SET_PURCHASE_ORDERS":
      return { ...state, purchaseOrders: action.orders };
    case "UPSERT_PURCHASE_ORDER": {
      const exists = state.purchaseOrders.find((o) => o.id === action.order.id);
      return {
        ...state,
        purchaseOrders: exists
          ? state.purchaseOrders.map((o) => (o.id === action.order.id ? action.order : o))
          : [...state.purchaseOrders, action.order],
      };
    }
    case "DELETE_PURCHASE_ORDER":
      return { ...state, purchaseOrders: state.purchaseOrders.filter((o) => o.id !== action.id) };
    case "SET_ORDER_CYCLES":
      return { ...state, orderCycles: action.cycles };
    case "UPSERT_ORDER_CYCLE": {
      const exists = state.orderCycles.find((c) => c.id === action.cycle.id);
      return {
        ...state,
        orderCycles: exists
          ? state.orderCycles.map((c) => (c.id === action.cycle.id ? action.cycle : c))
          : [...state.orderCycles, action.cycle],
      };
    }
    case "DELETE_ORDER_CYCLE":
      return { ...state, orderCycles: state.orderCycles.filter((c) => c.id !== action.id) };
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
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "core-action-ml-state";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        dispatch({ type: "HYDRATE", state: { ...INITIAL_STATE, ...parsed } });
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // Persist to localStorage on every state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used inside AppProvider");
  return ctx;
}
