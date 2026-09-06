"use client";

import { useState } from "react";
import { MessageCircle, Phone, Plus } from "lucide-react";
import { Avatar, Badge, Button } from "@restaurant-os/ui";
import { useAuth } from "../../../../../lib/auth-context";
import { formatTenure } from "../../../../../lib/format";
import type { CustomerDetail } from "../../../../../lib/customer-types";

export function CustomerHeader({ customer, onAdjusted }: { customer: CustomerDetail; onAdjusted: () => void }) {
  const { authorizedFetch } = useAuth();
  const [adjusting, setAdjusting] = useState(false);

  async function handleAddPoint() {
    setAdjusting(true);
    try {
      await authorizedFetch(`/v1/customers/${customer.id}/loyalty/adjust`, {
        method: "POST",
        idempotencyKey: `admin-adjust-${customer.id}-${Date.now()}`,
        body: { amount: 1, direction: "ADD", reason: "Manuel puan ekleme (yönetim paneli)" }
      });
      onAdjusted();
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl2 border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-4">
        <Avatar name={customer.name ?? customer.phone} size={64} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{customer.name ?? "İsimsiz Müşteri"}</h1>
            {customer.segment === "vip" && <Badge tone="gold">VIP</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <Phone size={14} /> {customer.phone}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Restoranımızla {formatTenure(customer.createdAt)} birlikte
            {customer.lastSeenAt && ` • Son görülme: ${new Date(customer.lastSeenAt).toLocaleString("tr-TR")}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" icon={<MessageCircle size={16} />} disabled title="WhatsApp entegrasyonu yakında">
          Mesaj Gönder
        </Button>
        <Button icon={<Plus size={16} />} onClick={() => void handleAddPoint()} disabled={adjusting}>
          Puan Ekle
        </Button>
      </div>
    </div>
  );
}
