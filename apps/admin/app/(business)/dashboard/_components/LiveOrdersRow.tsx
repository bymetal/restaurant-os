"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@restaurant-os/ui";
import { useAuth } from "../../../../lib/auth-context";

interface LiveCounts {
  newCount: number;
  preparingCount: number;
  readyCount: number;
  outForDeliveryCount: number;
}

export function LiveOrdersRow() {
  const { authorizedFetch } = useAuth();
  const [counts, setCounts] = useState<LiveCounts | null>(null);

  useEffect(() => {
    authorizedFetch<{ counts: LiveCounts }>("/v1/orders/live-counts").then((response) => setCounts(response.counts));
  }, [authorizedFetch]);

  const items = [
    { label: "Yeni Sipariş", value: counts?.newCount ?? 0 },
    { label: "Hazırlanıyor", value: counts?.preparingCount ?? 0 },
    { label: "Hazır", value: counts?.readyCount ?? 0 },
    { label: "Yolda", value: counts?.outForDeliveryCount ?? 0 }
  ];

  return (
    <Card
      title="Canlı İşleyiş"
      action={
        <Link href="/orders" className="text-sm font-semibold text-brand-600">
          Tüm Siparişleri Gör →
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
