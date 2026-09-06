"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@restaurant-os/ui";
import { ApiError } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";

export function CreateCampaignForm({ onCreated }: { onCreated: () => void }) {
  const { authorizedFetch } = useAuth();
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [couponCode, setCouponCode] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const discountValueMinor =
        discountType === "percentage" ? Number(discountValue) : Math.round(Number(discountValue) * 100);
      await authorizedFetch("/v1/campaigns", {
        method: "POST",
        body: {
          name,
          discountType,
          discountValue: discountValueMinor,
          couponCode,
          minOrderAmountMinor: Math.round(Number(minOrderAmount) * 100),
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined
        }
      });
      setName("");
      setCouponCode("");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Kampanya oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <Card title="Yeni Kampanya">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kampanya adı" className={inputClass} />
        <input
          required
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          placeholder="Kupon Kodu (örn. EFSANE20)"
          className={inputClass}
        />
        <select value={discountType} onChange={(e) => setDiscountType(e.target.value as typeof discountType)} className={inputClass}>
          <option value="percentage">Yüzde İndirim</option>
          <option value="fixed_amount">Sabit Tutar İndirim</option>
        </select>
        <input
          required
          type="number"
          min={1}
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          placeholder={discountType === "percentage" ? "İndirim yüzdesi" : "İndirim tutarı (₺)"}
          className={inputClass}
        />
        <input
          type="number"
          min={0}
          value={minOrderAmount}
          onChange={(e) => setMinOrderAmount(e.target.value)}
          placeholder="Minimum sepet tutarı (₺)"
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          value={maxRedemptions}
          onChange={(e) => setMaxRedemptions(e.target.value)}
          placeholder="Maksimum kullanım (opsiyonel)"
          className={inputClass}
        />
        <label className="text-xs text-slate-500">
          Başlangıç
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs text-slate-500">
          Bitiş (opsiyonel)
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Oluşturuluyor..." : "Kampanya Oluştur"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
