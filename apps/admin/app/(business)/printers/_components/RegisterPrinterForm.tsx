"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Card } from "@restaurant-os/ui";
import { ApiError } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import type { Branch, PrintDevice, PrintDeviceRole } from "../../../../lib/printer-types";

const roleOptions: Array<{ value: PrintDeviceRole; label: string }> = [
  { value: "KITCHEN", label: "Mutfak" },
  { value: "CASHIER", label: "Kasa" }
];

export function RegisterPrinterForm({ onCreated }: { onCreated: () => void }) {
  const { authorizedFetch } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<PrintDeviceRole>("KITCHEN");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  useEffect(() => {
    authorizedFetch<{ branches: Branch[] }>("/v1/branches").then((response) => {
      setBranches(response.branches);
      setBranchId((current) => current || (response.branches[0]?.id ?? ""));
    });
  }, [authorizedFetch]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await authorizedFetch<{ device: PrintDevice; deviceKey: string }>("/v1/printers/devices", {
        method: "POST",
        body: { branchId, name, role }
      });
      setIssuedKey(response.deviceKey);
      setName("");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Cihaz eklenemedi.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <Card title="Yeni Yazıcı Cihazı">
      <div className="space-y-3">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cihaz adı (örn. Mutfak Yazıcısı)"
            className={inputClass}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as PrintDeviceRole)} className={inputClass}>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={submitting || !branchId}>
            {submitting ? "Ekleniyor..." : "Cihaz Ekle"}
          </Button>
          {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
        </form>
        {issuedKey && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Cihaz anahtarı (bir daha gösterilmeyecek):</p>
            <p className="mt-1 break-all font-mono text-xs">{issuedKey}</p>
            <p className="mt-1 text-xs">
              Bu anahtarı print-agent&apos;ın çalıştığı cihazda <span className="font-mono">PRINT_AGENT_DEVICE_KEY</span> ortam
              değişkenine kopyalayın.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
