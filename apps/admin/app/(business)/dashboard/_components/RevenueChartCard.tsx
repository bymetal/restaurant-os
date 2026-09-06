"use client";

import { useEffect, useState } from "react";
import { BarLineChart, Card } from "@restaurant-os/ui";
import { rangeToQuery } from "../../../../lib/analytics-query";
import { useAuth } from "../../../../lib/auth-context";

interface RevenuePoint {
  date: string;
  revenueMinor: number;
  orderCount: number;
}

export function RevenueChartCard({ from, to }: { from: string; to: string }) {
  const { authorizedFetch } = useAuth();
  const [series, setSeries] = useState<RevenuePoint[]>([]);

  useEffect(() => {
    authorizedFetch<{ series: RevenuePoint[] }>(`/v1/analytics/revenue-series?${rangeToQuery(from, to)}`).then((response) =>
      setSeries(response.series)
    );
  }, [from, to, authorizedFetch]);

  return (
    <Card title="Ciro ve Sipariş Grafiği" className="lg:col-span-2">
      {series.length === 0 ? (
        <p className="text-sm text-slate-500">Bu tarih aralığında veri yok.</p>
      ) : (
        <BarLineChart
          data={series.map((point) => ({
            date: point.date.slice(5),
            orders: point.orderCount,
            revenue: Math.round(point.revenueMinor / 100)
          }))}
          xKey="date"
          barKey="orders"
          lineKey="revenue"
          dualAxis
        />
      )}
    </Card>
  );
}
