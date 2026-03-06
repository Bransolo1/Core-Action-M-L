export interface Supplier {
  id: string;
  /** Short code used on PO references, e.g. "CORE-AU" */
  code: string;
  name: string;
  country: string;
  currency: string;
  /** Typical lead time from order placement to warehouse arrival, in days */
  leadTimeDays: number;
  /** Days before the cycle delivery date to raise the alert flag */
  leadTimeAlertDays: number;
  /** e.g. "Net 30", "50% deposit / 50% on shipment" */
  paymentTerms?: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SupplierFormData = Omit<Supplier, "id" | "createdAt" | "updatedAt">;
