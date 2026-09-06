"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@restaurant-os/ui";
import { ApiError } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import type { QrCodeType } from "../../../../lib/integration-types";

const typeOptions: Array<{ value: QrCodeType; label: string }> = [
  { value: "ACQUISITION", label: "Müşteri Kazanımı" },
  { value: "TABLE", label: "Masa" },
  { value: "CAMPAIGN", label: "Kampanya" }
];

export function CreateQrCodeForm({ onCreated }: { onCreated: () => void }) {
  const { authorizedFetch } = useAuth();
  const [type, setType] = useState<QrCodeType>("ACQUISITION");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authorizedFetch("/v1/qr-codes", { method: "POST", body: { type, source } });
      setSource("");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "QR kod oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <Card title="Yeni QR Kod">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select value={type} onChange={(e) => setType(e.target.value as QrCodeType)} className={inputClass}>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          required
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Kaynak (örn. Masa 4, Vitrin, Instagram)"
          className={inputClass}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Oluşturuluyor..." : "QR Kod Oluştur"}
        </Button>
        {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      </form>
    </Card>
  );
}
