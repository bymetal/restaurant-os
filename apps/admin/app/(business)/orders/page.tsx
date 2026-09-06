"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, type BadgeTone } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime, formatMoney } from "../../../lib/format";

interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: "delivery" | "pickup" | "dine_in";
  customerName: string;
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

const statusLabel: Record<string, string> = {
  DRAFT: "Taslak",
  PLACED: "Yeni",
  ACCEPTED: "Kabul Edildi",
  PREPARING: "Hazırlanıyor",
  READY: "Hazır",
  OUT_FOR_DELIVERY: "Yolda",
  DELIVERED: "Teslim Edildi",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
  REFUNDED: "İade Edildi"
};

function nextStatus(order: OrderRow): string | null {
  switch (order.status) {
    case "PLACED":
      return "ACCEPTED";
    case "ACCEPTED":
      return "PREPARING";
    case "PREPARING":
      return "READY";
    case "READY":
      return order.fulfillmentType === "delivery" ? "OUT_FOR_DELIVERY" : "DELIVERED";
    case "OUT_FOR_DELIVERY":
      return "DELIVERED";
    default:
      return null;
  }
}

export default function OrdersPage() {
  const { authorizedFetch } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const load = useCallback(() => {
    authorizedFetch<{ orders: OrderRow[] }>("/v1/orders?limit=50").then((response) => setOrders(response.orders));
  }, [authorizedFetch]);

  useEffect(load, [load]);

  async function advance(order: OrderRow) {
    const toStatus = nextStatus(order);
    if (!toStatus) return;
    setBusyOrderId(order.id);
    try {
      await authorizedFetch(`/v1/orders/${order.id}/transition`, { method: "POST", body: { toStatus } });
      load();
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Siparişler</h1>
      <Card>
        {orders.length === 0 && <p className="text-sm text-slate-500">Henüz sipariş yok.</p>}
        <ul className="divide-y divide-slate-100">
          {orders.map((order) => {
            const next = nextStatus(order);
            return (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    #{order.orderNumber} • {order.customerName}
                  </p>
                  <p className="text-xs text-slate-400">{formatDateTime(order.createdAt)}</p>
                </div>
                <Badge tone={statusTone[order.status] ?? "neutral"}>{statusLabel[order.status] ?? order.status}</Badge>
                <span className="font-semibold text-slate-900">{formatMoney(order.totalMinor)}</span>
                {next && (
                  <Button size="sm" variant="outline" disabled={busyOrderId === order.id} onClick={() => void advance(order)}>
                    {statusLabel[next]}&apos;a al
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
