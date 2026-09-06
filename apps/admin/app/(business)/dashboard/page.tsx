"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Megaphone } from "lucide-react";
import { Button, Card, DateRangePicker, DonutChart, MetricCard } from "@restaurant-os/ui";
import { rangeToQuery } from "../../../lib/analytics-query";
import { useAuth } from "../../../lib/auth-context";
import { formatMoney } from "../../../lib/format";
import { CampaignRevenueCard } from "./_components/CampaignRevenueCard";
import { InsightsRow } from "./_components/InsightsRow";
import { LiveOrdersRow } from "./_components/LiveOrdersRow";
import { PeakHoursCard } from "./_components/PeakHoursCard";
import { RevenueChartCard } from "./_components/RevenueChartCard";
import { TopProductsCard } from "./_components/TopProductsCard";

interface Overview {
  revenueMinor: number;
  orderCount: number;
  avgBasketMinor: number;
  customerCount: number;
}

interface CustomerMix {
  newCount: number;
  returningCount: number;
}

interface LoyaltySummary {
  activeMembers: number;
  trendPct: number;
}

function isoDate(date: Date): string {
  const value = date.toISOString();
  return value.slice(0, 10);
}

export default function DashboardPage() {
  const { user, authorizedFetch } = useAuth();
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from: isoDate(from), to: isoDate(to) };
  });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [mix, setMix] = useState<CustomerMix | null>(null);
  const [repeatRatePct, setRepeatRatePct] = useState<number | null>(null);
  const [loyaltySummary, setLoyaltySummary] = useState<LoyaltySummary | null>(null);

  const query = useMemo(() => rangeToQuery(range.from, range.to), [range]);

  useEffect(() => {
    authorizedFetch<{ overview: Overview }>(`/v1/analytics/overview?${query}`).then((response) => setOverview(response.overview));
    authorizedFetch<{ mix: CustomerMix }>(`/v1/analytics/customer-mix?${query}`).then((response) => setMix(response.mix));
    authorizedFetch<{ repeatRate: { repeatRatePct: number } }>(`/v1/analytics/repeat-rate?${query}`).then((response) =>
      setRepeatRatePct(response.repeatRate.repeatRatePct)
    );
    authorizedFetch<{ summary: LoyaltySummary }>("/v1/analytics/loyalty-summary").then((response) => setLoyaltySummary(response.summary));
  }, [query, authorizedFetch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Merhaba {user?.displayName?.split(" ")[0] ?? ""},</h1>
          <p className="text-sm text-slate-500">Bugün her şey yolunda! 🍕</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
          <Button variant="outline" icon={<Edit3 size={16} />}>
            Menüyü Düzenle
          </Button>
          <Button icon={<Megaphone size={16} />}>Kampanya Oluştur</Button>
        </div>
      </div>

      <LiveOrdersRow />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Ciro" value={formatMoney(overview?.revenueMinor ?? 0)} />
        <MetricCard label="Sipariş" value={String(overview?.orderCount ?? 0)} />
        <MetricCard label="Ortalama Sepet" value={formatMoney(overview?.avgBasketMinor ?? 0)} />
        <MetricCard label="Müşteri" value={String(overview?.customerCount ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RevenueChartCard from={range.from} to={range.to} />
        <Card title="Yeni vs Tekrar Gelen Müşteri">
          {mix && mix.newCount + mix.returningCount > 0 ? (
            <DonutChart
              data={[
                { name: "Yeni Müşteri", value: mix.newCount, color: "#dc2626" },
                { name: "Tekrar Gelen", value: mix.returningCount, color: "#fca5a5" }
              ]}
              height={180}
            />
          ) : (
            <p className="text-sm text-slate-500">Bu tarih aralığında veri yok.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard label="Tekrar Sipariş Oranı" value={repeatRatePct !== null ? `%${repeatRatePct}` : "—"} />
        <MetricCard
          label="Sadakat Üyeleri"
          value={String(loyaltySummary?.activeMembers ?? 0)}
          trendPct={loyaltySummary?.trendPct}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopProductsCard from={range.from} to={range.to} />
        <PeakHoursCard from={range.from} to={range.to} />
        <CampaignRevenueCard from={range.from} to={range.to} />
      </div>

      <InsightsRow from={range.from} to={range.to} />
    </div>
  );
}
