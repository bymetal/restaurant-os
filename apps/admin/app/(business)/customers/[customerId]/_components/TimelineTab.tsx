"use client";

import { useEffect, useState } from "react";
import { Gift, Heart, ShoppingBag } from "lucide-react";
import { Card, TimelineFeed } from "@restaurant-os/ui";
import { useAuth } from "../../../../../lib/auth-context";
import { formatDateTime } from "../../../../../lib/format";
import type { TimelineEntry } from "../../../../../lib/customer-types";

function timelineTitle(entry: TimelineEntry): string {
  if (entry.kind === "note") return `Not eklendi: ${entry.detail}`;
  if (entry.kind === "loyalty") {
    if (entry.detail === "EARN") return `+${entry.amount ?? 1} Sadakat Damgası`;
    if (entry.detail === "REDEEM") return "Ödül Kullanıldı";
    if (entry.detail === "ADJUSTMENT_ADD") return `+${entry.amount ?? 1} Puan Eklendi`;
    if (entry.detail === "ADJUSTMENT_REMOVE") return `${entry.amount ?? 1} Puan Silindi`;
    return "Sadakat İşlemi";
  }
  return `Sipariş ${entry.detail}`;
}

export function TimelineTab({ customerId }: { customerId: string }) {
  const { authorizedFetch } = useAuth();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    authorizedFetch<{ timeline: TimelineEntry[] }>(`/v1/customers/${customerId}/timeline`).then((response) =>
      setTimeline(response.timeline)
    );
  }, [customerId, authorizedFetch]);

  return (
    <Card title="İletişim Geçmişi">
      <TimelineFeed
        entries={timeline.map((entry) => ({
          id: `${entry.kind}-${entry.createdAt}-${entry.refId ?? ""}`,
          title: timelineTitle(entry),
          timestamp: formatDateTime(entry.createdAt),
          tone: entry.kind === "loyalty" ? "brand" : entry.kind === "note" ? "neutral" : "success",
          icon: entry.kind === "loyalty" ? <Gift size={14} /> : entry.kind === "note" ? <Heart size={14} /> : <ShoppingBag size={14} />
        }))}
      />
    </Card>
  );
}
