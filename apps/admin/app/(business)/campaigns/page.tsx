"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, type BadgeTone } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import type { Campaign, CampaignPerformance, CampaignStatus } from "../../../lib/campaign-types";
import { formatMoney } from "../../../lib/format";
import { CreateCampaignForm } from "./_components/CreateCampaignForm";

const statusTone: Record<CampaignStatus, BadgeTone> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  completed: "brand",
  archived: "neutral"
};

const statusLabel: Record<CampaignStatus, string> = {
  draft: "Taslak",
  scheduled: "Zamanlanmış",
  active: "Aktif",
  paused: "Duraklatıldı",
  completed: "Tamamlandı",
  archived: "Arşivlendi"
};

const nextActions: Record<CampaignStatus, Array<{ label: string; status: CampaignStatus }>> = {
  draft: [
    { label: "Aktifleştir", status: "active" },
    { label: "Arşivle", status: "archived" }
  ],
  scheduled: [
    { label: "Aktifleştir", status: "active" },
    { label: "Arşivle", status: "archived" }
  ],
  active: [
    { label: "Duraklat", status: "paused" },
    { label: "Tamamla", status: "completed" }
  ],
  paused: [
    { label: "Aktifleştir", status: "active" },
    { label: "Tamamla", status: "completed" }
  ],
  completed: [],
  archived: []
};

export default function CampaignsPage() {
  const { authorizedFetch } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<CampaignPerformance[]>([]);

  const load = useCallback(() => {
    authorizedFetch<{ campaigns: Campaign[] }>("/v1/campaigns").then((response) => setCampaigns(response.campaigns));
    authorizedFetch<{ performance: CampaignPerformance[] }>("/v1/campaigns/performance/summary").then((response) =>
      setPerformance(response.performance)
    );
  }, [authorizedFetch]);

  useEffect(load, [load]);

  async function transition(campaignId: string, status: CampaignStatus) {
    await authorizedFetch(`/v1/campaigns/${campaignId}`, { method: "PUT", body: { status } });
    load();
  }

  const performanceByCampaign = new Map(performance.map((item) => [item.campaignId, item]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Kampanyalar</h1>
      <CreateCampaignForm onCreated={load} />
      <Card title="Kampanyalar">
        {campaigns.length === 0 && <p className="text-sm text-slate-500">Henüz kampanya oluşturulmadı.</p>}
        <ul className="divide-y divide-slate-100">
          {campaigns.map((campaign) => {
            const stats = performanceByCampaign.get(campaign.id);
            return (
              <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{campaign.name}</p>
                    <Badge tone={statusTone[campaign.status]}>{statusLabel[campaign.status]}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Kod: <span className="font-mono font-semibold">{campaign.couponCode}</span> •{" "}
                    {campaign.discountType === "percentage"
                      ? `%${campaign.discountValue}`
                      : formatMoney(campaign.discountValue)}
                    {campaign.maxRedemptions ? ` • ${campaign.redemptionCount}/${campaign.maxRedemptions} kullanıldı` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {stats && (
                    <div className="text-right text-xs text-slate-500">
                      <p className="font-semibold text-slate-900">{formatMoney(stats.revenueMinor)}</p>
                      <p>
                        {stats.redemptionCount} sipariş • -{formatMoney(stats.discountMinor)}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {nextActions[campaign.status].map((action) => (
                      <Button
                        key={action.status}
                        size="sm"
                        variant="outline"
                        onClick={() => void transition(campaign.id, action.status)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
