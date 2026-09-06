"use client";

import { useEffect, useState } from "react";
import { Card } from "@restaurant-os/ui";
import { rangeToQuery } from "../../../../lib/analytics-query";
import { useAuth } from "../../../../lib/auth-context";
import { formatMoney } from "../../../../lib/format";

interface CampaignPerformance {
  campaignId: string;
  name: string;
  redemptionCount: number;
  revenueMinor: number;
  discountMinor: number;
}

export function CampaignRevenueCard({ from, to }: { from: string; to: string }) {
  const { authorizedFetch } = useAuth();
  const [performance, setPerformance] = useState<CampaignPerformance[]>([]);

  useEffect(() => {
    authorizedFetch<{ performance: CampaignPerformance[] }>(`/v1/campaigns/performance/summary?${rangeToQuery(from, to)}`).then(
      (response) => setPerformance(response.performance.filter((item) => item.redemptionCount > 0))
    );
  }, [from, to, authorizedFetch]);

  const totalRevenue = performance.reduce((sum, item) => sum + item.revenueMinor, 0);

  return (
    <Card title="Kampanya Geliri">
      <p className="text-2xl font-bold text-slate-900">{formatMoney(totalRevenue)}</p>
      {performance.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Bu tarih aralığında kampanya kullanımı yok.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {performance.map((item) => (
            <li key={item.campaignId} className="flex items-center justify-between text-sm">
              <span className="truncate text-slate-700">{item.name}</span>
              <span className="font-semibold text-slate-900">{formatMoney(item.revenueMinor)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
