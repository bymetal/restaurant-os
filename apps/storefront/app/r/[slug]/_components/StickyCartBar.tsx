"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { formatMoney } from "../../../../lib/format";
import type { Cart } from "../../../../lib/use-cart";

export function StickyCartBar({ slug, branchSlug, cart }: { slug: string; branchSlug: string; cart: Cart | null }) {
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  if (!cart || itemCount === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-center justify-between gap-3 bg-brand-600 px-4 py-3 text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <ShoppingCart size={16} />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-brand-600">
            {itemCount}
          </span>
        </span>
        <span className="text-sm font-semibold">
          {itemCount} ürün • {formatMoney(cart.totalMinor)}
        </span>
      </div>
      <Link
        href={`/r/${slug}/cart?branch=${branchSlug}`}
        className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-bold text-brand-600"
      >
        Sepeti Gör
      </Link>
    </div>
  );
}
