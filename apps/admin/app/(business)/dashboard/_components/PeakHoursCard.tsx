"use client";

import { useEffect, useState } from "react";
import { BarLineChart, Card } from "@restaurant-os/ui";
import { rangeToQuery } from "../../../../lib/analytics-query";
import { useAuth } from "../../../../lib/auth-context";

interface PeakHour {
  hour: number;
  orderCount: number;
}

export function PeakHoursCard({ from, to }: { from: string; to: string }) {
  const { authorizedFetch } = useAuth();
  const [hours, setHours] = useState<PeakHour[]>([]);

  useEffect(() => {
    authorizedFetch<{ hours: PeakHour[] }>(`/v1/analytics/peak-hours?${rangeToQuery(from, to)}`).then((response) =>
      setHours(response.hours)
    );
  }, [from, to, authorizedFetch]);

  const data = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour}`,
    orders: hours.find((entry) => entry.hour === hour)?.orderCount ?? 0
  }));

  return (
    <Card title="Yoğun Saatler">
      <BarLineChart data={data} xKey="hour" barKey="orders" height={220} />
    </Card>
  );
}
