"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { EmptyState } from "@restaurant-os/ui";
import { formatMoney } from "../../../../lib/format";
import { useCart } from "../../../../lib/use-cart";

export function CartView({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const branchSlug = searchParams.get("branch") ?? "";
  const { cart, loading } = useCart(slug, branchSlug);

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
            <p className="mt-6 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
              Ödeme ve teslimat bilgisi akışı yakında burada tamamlanacak.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
