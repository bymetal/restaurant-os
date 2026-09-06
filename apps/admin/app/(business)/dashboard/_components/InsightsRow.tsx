"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card } from "@restaurant-os/ui";
import { rangeToQuery } from "../../../../lib/analytics-query";
import { useAuth } from "../../../../lib/auth-context";

export function InsightsRow({ from, to }: { from: string; to: string }) {
  const { authorizedFetch } = useAuth();
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    authorizedFetch<{ insights: string[] }>(`/v1/analytics/insights?${rangeToQuery(from, to)}`).then((response) =>
      setInsights(response.insights)
    );
  }, [from, to, authorizedFetch]);

  if (insights.length === 0) return null;

  return (
    <Card title="Bugünün İçgörüleri">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {insights.map((insight) => (
          <div key={insight} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <p className="text-sm text-slate-600">{insight}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
