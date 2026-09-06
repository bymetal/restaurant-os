"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@restaurant-os/ui";
import { ApiError, apiFetch } from "../../../../lib/api-client";

export interface ConfirmedOrder {
  id: string;
  orderNumber: number;
  status: string;
  totalMinor: number;
  discountMinor: number;
}

interface CheckoutResponse {
  order: ConfirmedOrder;
}

export function CheckoutForm({ slug, onSuccess }: { slug: string; onSuccess: (order: ConfirmedOrder) => void }) {
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressText, setAddressText] = useState("");
  const [district, setDistrict] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card_on_delivery" | "pay_at_restaurant">("cash");
  const [couponCode, setCouponCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        fulfillment,
        customer: { name, phone },
        payment: { method: paymentMethod }
      };
      if (note.trim()) body.note = note.trim();
      if (couponCode.trim()) body.couponCode = couponCode.trim();
      if (fulfillment === "delivery") {
        body.address = { addressText, district: district.trim() || undefined };
      }
      const response = await apiFetch<CheckoutResponse>(`/v1/public/restaurants/${slug}/checkout`, {
        method: "POST",
        idempotencyKey: `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        body
      });
      onSuccess(response.order);
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Sipariş oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-100 pt-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-700">Teslimat Şekli</p>
        <div className="flex gap-2">
          {(["pickup", "delivery"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFulfillment(option)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                fulfillment === option ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500"
              }`}
            >
              {option === "pickup" ? "Gel-Al" : "Adrese Teslim"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" className={inputClass} />
        <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" className={inputClass} />
      </div>

      {fulfillment === "delivery" && (
        <div className="space-y-3">
          <input
            required
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            placeholder="Adres"
            className={inputClass}
          />
          <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Mahalle / İlçe" className={inputClass} />
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-700">Ödeme Yöntemi</p>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className={inputClass}>
          <option value="cash">Kapıda Nakit</option>
          <option value="card_on_delivery">Kapıda Kart</option>
          <option value="pay_at_restaurant">Restoranda Öde</option>
        </select>
      </div>

      <input
        value={couponCode}
        onChange={(e) => setCouponCode(e.target.value)}
        placeholder="Kampanya Kodu (opsiyonel)"
        className={inputClass}
      />

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Sipariş notu (opsiyonel)"
        rows={2}
        className={inputClass}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Sipariş oluşturuluyor..." : "Siparişi Tamamla"}
      </Button>
    </form>
  );
}
