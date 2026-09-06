"use client";

import { useEffect, useState } from "react";
import { Card } from "@restaurant-os/ui";
import { rangeToQuery } from "../../../../lib/analytics-query";
import { useAuth } from "../../../../lib/auth-context";

interface TopProduct {
  productId: string;
  productName: string;
  quantity: number;
}

export function TopProductsCard({ from, to }: { from: string; to: string }) {
  const { authorizedFetch } = useAuth();
  const [products, setProducts] = useState<TopProduct[]>([]);

  useEffect(() => {
    authorizedFetch<{ products: TopProduct[] }>(`/v1/analytics/top-products?${rangeToQuery(from, to)}`).then((response) =>
      setProducts(response.products)
    );
  }, [from, to, authorizedFetch]);

  const max = Math.max(1, ...products.map((product) => product.quantity));

  return (
    <Card title="En Çok Satan Ürünler">
      {products.length === 0 && <p className="text-sm text-slate-500">Bu tarih aralığında veri yok.</p>}
      <ul className="space-y-2">
        {products.map((product, index) => (
          <li key={product.productId} className="flex items-center gap-2 text-sm">
            <span className="w-4 text-slate-400">{index + 1}</span>
            <span className="flex-1 truncate text-slate-700">{product.productName}</span>
            <div className="h-1.5 w-20 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(product.quantity / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right text-xs text-slate-400">{product.quantity}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
