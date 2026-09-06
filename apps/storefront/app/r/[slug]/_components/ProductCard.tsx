"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@restaurant-os/ui";
import { iconForCategoryName } from "../../../../lib/category-icon";
import { formatMoney } from "../../../../lib/format";
import type { MenuProduct } from "../../../../lib/menu-types";
import { ProductImage } from "./ProductImage";

export function ProductCard({
  product,
  categoryName,
  onAdd
}: {
  product: MenuProduct;
  categoryName: string;
  onAdd: () => Promise<void>;
}) {
  const [favorite, setFavorite] = useState(false);
  const [adding, setAdding] = useState(false);
  const Icon = iconForCategoryName(categoryName);

  async function handleAdd() {
    setAdding(true);
    try {
      await onAdd();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white">
      <div className="relative h-28 w-full">
        <ProductImage photoUrl={product.photoUrl} name={product.name} icon={Icon} />
        <button
          type="button"
          onClick={() => setFavorite((current) => !current)}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm"
          aria-label="Favorilere ekle"
        >
          <Heart size={14} className={favorite ? "fill-brand-600 text-brand-600" : "text-slate-400"} />
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-900">{product.name}</p>
        {product.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{product.description}</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">{formatMoney(product.basePrice)}</span>
          <Button size="sm" variant="soft" onClick={() => void handleAdd()} disabled={adding}>
            + Ekle
          </Button>
        </div>
      </div>
    </div>
  );
}
