"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShoppingBag } from "lucide-react";
import { Button, EmptyState } from "@restaurant-os/ui";
import { formatMoney } from "../../../../lib/format";
import { useCart } from "../../../../lib/use-cart";
import { CheckoutForm, type ConfirmedOrder } from "./CheckoutForm";

export function CartView({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const branchSlug = searchParams.get("branch") ?? "";
  const { cart, loading } = useCart(slug, branchSlug);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);

  if (confirmedOrder) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 size={48} className="text-emerald-500" />
        <h1 className="mt-4 text-lg font-bold text-slate-900">Siparişiniz alındı!</h1>
        <p className="mt-1 text-sm text-slate-500">Sipariş No: #{confirmedOrder.orderNumber}</p>
        <p className="mt-4 text-2xl font-bold text-slate-900">{formatMoney(confirmedOrder.totalMinor)}</p>
        {confirmedOrder.discountMinor > 0 && (
          <p className="text-sm text-emerald-600">Kampanya indirimi: -{formatMoney(confirmedOrder.discountMinor)}</p>
        )}
        <Link href={`/r/${slug}`} className="mt-6">
          <Button variant="outline">Menüye Dön</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
        <Link href={`/r/${slug}`} aria-label="Menüye dön" className="text-slate-500">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-base font-bold text-slate-900">Sepetim</h1>
      </header>

      <div className="p-4">
        {loading && <p className="text-sm text-slate-500">Yükleniyor...</p>}

        {!loading && (!cart || cart.items.length === 0) && (
          <EmptyState
            icon={<ShoppingBag size={28} />}
            title="Sepetiniz boş"
            description="Menüden ürün ekleyerek sipariş oluşturabilirsiniz."
          />
        )}

        {!loading && cart && cart.items.length > 0 && (
          <>
            <ul className="divide-y divide-slate-100">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.quantity}× {item.productName}
                    </p>
                    {item.variantName && <p className="text-xs text-slate-500">{item.variantName}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-900">{formatMoney(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="text-sm font-semibold text-slate-600">Ara Toplam</span>
              <span className="text-lg font-bold text-slate-900">{formatMoney(cart.totalMinor)}</span>
            </div>
            <CheckoutForm slug={slug} onSuccess={setConfirmedOrder} />
          </>
        )}
      </div>
    </div>
  );
}
