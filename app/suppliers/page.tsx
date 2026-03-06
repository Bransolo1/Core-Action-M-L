"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Supplier, SupplierFormData } from "@/types/supplier";
import { nanoid } from "@/lib/nanoid";
import { differenceInCalendarDays } from "date-fns";
import { Plus, Pencil, Trash2, X, AlertTriangle, Clock } from "lucide-react";
import { useForm } from "react-hook-form";

const COUNTRIES = [
  "Australia", "China", "USA", "Canada", "UK", "Germany", "France",
  "Italy", "Spain", "Japan", "South Korea", "Taiwan", "Vietnam",
  "Bangladesh", "India", "New Zealand", "Indonesia",
].map((c) => ({ value: c, label: c }));

export default function SuppliersPage() {
  const { state, dispatch } = useAppStore();
  const { suppliers, products, orderCycles } = state;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    if (confirm("Delete this supplier?")) {
      dispatch({ type: "DELETE_SUPPLIER", id });
    }
  }

  function handleSave(data: SupplierFormData) {
    if (editingId) {
      dispatch({
        type: "UPSERT_SUPPLIER",
        supplier: {
          ...data,
          id: editingId,
          createdAt: suppliers.find((s) => s.id === editingId)!.createdAt,
          updatedAt: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: "UPSERT_SUPPLIER",
        supplier: {
          ...data,
          id: nanoid(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }
    setShowForm(false);
    setEditingId(null);
  }

  // Lead time alerts: flag active cycles where delivery is too soon for a supplier
  const leadTimeAlerts: { supplier: Supplier; cycle: typeof orderCycles[0]; daysShort: number }[] = [];
  for (const supplier of suppliers) {
    for (const cycle of orderCycles.filter((c) => c.isActive)) {
      if (!cycle.orderDate || !cycle.expectedDeliveryDate) continue;
      const daysAvailable = differenceInCalendarDays(
        new Date(cycle.expectedDeliveryDate),
        new Date(cycle.orderDate)
      );
      const daysShort = supplier.leadTimeDays - daysAvailable;
      if (daysShort > 0) {
        leadTimeAlerts.push({ supplier, cycle, daysShort });
      }
    }
  }

  // Products per supplier
  const supplierProductCount = new Map(
    suppliers.map((s) => [s.id, products.filter((p) => p.supplierId === s.id).length])
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditingId(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      {/* Lead time alerts */}
      {leadTimeAlerts.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>
              <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-600" />
              Lead Time Alerts
            </CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {leadTimeAlerts.map(({ supplier, cycle, daysShort }) => (
              <div key={`${supplier.id}-${cycle.id}`} className="flex items-center justify-between rounded-sm bg-amber-100 px-3 py-2 text-sm">
                <div>
                  <span className="font-600">{supplier.name}</span>
                  <span className="mx-2 text-amber-700">→</span>
                  <span>{cycle.name}</span>
                </div>
                <Badge variant="warning">
                  {daysShort}d short — lead time {supplier.leadTimeDays}d, window {differenceInCalendarDays(
                    new Date(cycle.expectedDeliveryDate),
                    new Date(cycle.orderDate)
                  )}d
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showForm && (
        <SupplierForm
          editingSupplier={editingId ? suppliers.find((s) => s.id === editingId) : undefined}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSave={handleSave}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Suppliers ({suppliers.length})</CardTitle>
        </CardHeader>
        {suppliers.length === 0 ? (
          <p className="py-8 text-center text-sm text-brand-dark-gray">
            No suppliers yet. Add your first supplier to link products and track lead times.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {["Code", "Name", "Country", "Currency", "Lead Time", "Alert Threshold", "Payment Terms", "Products", "Status", ""].map((h) => (
                    <th key={h} className="py-2 pr-4 text-xs font-600 uppercase tracking-wider text-brand-dark-gray">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-gray/30">
                    <td className="py-2.5 pr-4 font-mono text-xs font-700">{s.code}</td>
                    <td className="py-2.5 pr-4 font-500">{s.name}</td>
                    <td className="py-2.5 pr-4 text-xs text-brand-dark-gray">{s.country}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{s.currency}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-brand-dark-gray" />
                        <span className="font-mono text-xs font-700">{s.leadTimeDays}d</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{s.leadTimeAlertDays}d</td>
                    <td className="py-2.5 pr-4 text-xs text-brand-dark-gray">{s.paymentTerms ?? "—"}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{supplierProductCount.get(s.id) ?? 0}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={s.isActive ? "success" : "default"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(s)} className="text-brand-dark-gray hover:text-brand-black">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(s.id)} className="text-brand-dark-gray hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier Form
// ---------------------------------------------------------------------------

function SupplierForm({
  editingSupplier,
  onClose,
  onSave,
}: {
  editingSupplier?: Supplier;
  onClose: () => void;
  onSave: (data: SupplierFormData) => void;
}) {
  const defaultValues: SupplierFormData = editingSupplier
    ? {
        code: editingSupplier.code,
        name: editingSupplier.name,
        country: editingSupplier.country,
        currency: editingSupplier.currency,
        leadTimeDays: editingSupplier.leadTimeDays,
        leadTimeAlertDays: editingSupplier.leadTimeAlertDays,
        paymentTerms: editingSupplier.paymentTerms,
        contactName: editingSupplier.contactName,
        contactEmail: editingSupplier.contactEmail,
        notes: editingSupplier.notes,
        isActive: editingSupplier.isActive,
      }
    : {
        code: "",
        name: "",
        country: "China",
        currency: "USD",
        leadTimeDays: 90,
        leadTimeAlertDays: 14,
        isActive: true,
      };

  const { register, handleSubmit, formState: { errors } } = useForm<SupplierFormData>({ defaultValues });

  const currencyOptions = ["USD", "AUD", "EUR", "GBP", "CNY", "JPY", "NZD"].map((c) => ({ value: c, label: c }));

  return (
    <Card className="border border-brand-red/20">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-700">{editingSupplier ? "Edit Supplier" : "New Supplier"}</h3>
        <button onClick={onClose}><X className="h-4 w-4 text-brand-dark-gray" /></button>
      </div>
      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input label="Supplier Code *" id="code" placeholder="e.g. GLOBE-US" error={errors.code?.message} {...register("code", { required: "Required" })} />
          <Input label="Supplier Name *" id="name" error={errors.name?.message} className="lg:col-span-2" {...register("name", { required: "Required" })} />
          <Select label="Country" id="country" options={[{ value: "", label: "— Select —" }, ...COUNTRIES]} {...register("country")} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Select label="Currency" id="currency" options={currencyOptions} {...register("currency")} />
          <Input label="Lead Time (days)" id="leadTimeDays" type="number" hint="Order to warehouse arrival" {...register("leadTimeDays", { valueAsNumber: true })} />
          <Input label="Alert Threshold (days)" id="leadTimeAlertDays" type="number" hint="Warn when window is shorter" {...register("leadTimeAlertDays", { valueAsNumber: true })} />
          <Input label="Payment Terms" id="paymentTerms" placeholder="e.g. Net 30" {...register("paymentTerms")} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Input label="Contact Name" id="contactName" {...register("contactName")} />
          <Input label="Contact Email" id="contactEmail" type="email" {...register("contactEmail")} />
          <Input label="Notes" id="notes" {...register("notes")} className="lg:col-span-2" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} className="accent-brand-red" />
          Active
        </label>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save Supplier</Button>
        </div>
      </form>
    </Card>
  );
}
