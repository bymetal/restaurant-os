"use client";

import { useEffect, useState } from "react";
import { Badge, Card, type BadgeTone } from "@restaurant-os/ui";
import { useAuth } from "../../../../../lib/auth-context";
import { formatDateTime, formatMoney } from "../../../../../lib/format";

interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: string;
  totalMinor: number;
  createdAt: string;
}

const statusTone: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  PLACED: "info",
  ACCEPTED: "info",
  PREPARING: "brand",
  READY: "brand",
  OUT_FOR_DELIVERY: "brand",
  DELIVERED: "success",
  REJECTED: "danger",
  CANCELLED: "danger",
  REFUNDED: "warning"
};

export function OrdersTab({ customerId }: { customerId: string }) {
  const { authorizedFetch } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    authorizedFetch<{ orders: OrderRow[] }>(`/v1/orders?customerId=${customerId}`).then((response) =>
      setOrders(response.orders)
    );
  }, [customerId, authorizedFetch]);

  return (
    <Card title="Siparişler">
      {orders === null && <p className="text-sm text-slate-500">Yükleniyor...</p>}
      {orders && orders.length === 0 && <p className="text-sm text-slate-500">Bu müşterinin henüz siparişi yok.</p>}
      {orders && orders.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">#{order.orderNumber}</p>
                <p className="text-xs text-slate-400">{formatDateTime(order.createdAt)}</p>
              </div>
              <Badge tone={statusTone[order.status] ?? "neutral"}>{order.status}</Badge>
              <span className="font-semibold text-slate-900">{formatMoney(order.totalMinor)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
