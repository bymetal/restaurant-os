"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CreditCard, DollarSign, MessageCircle, ShoppingCart, Users } from "lucide-react";
import { BarLineChart, Card, EmptyState, MetricCard } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import { formatMoney } from "../../../lib/format";
import type { BusinessRow, GmvPoint, PlatformOverview, SystemIssue } from "../../../lib/platform-types";
import { BusinessActivityTable } from "../_components/BusinessActivityTable";

const issueLabel: Record<string, string> = {
  whatsapp_disconnected: "Bağlantısı Kesilen WhatsApp'lar",
  printer_offline: "Çevrimdışı Yazıcılar",
  subscription_payment_failed: "Başarısız Abonelik Ödemeleri",
  webhook_error: "Webhook Hataları"
};

export default function PlatformOverviewPage() {
  const { user, authorizedFetch } = useAuth();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [series, setSeries] = useState<GmvPoint[]>([]);
  const [issues, setIssues] = useState<SystemIssue[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);

  useEffect(() => {
    authorizedFetch<{ overview: PlatformOverview }>("/v1/platform/analytics/overview").then((response) =>
      setOverview(response.overview)
    );
    authorizedFetch<{ series: GmvPoint[] }>("/v1/platform/analytics/gmv-series?days=31").then((response) =>
      setSeries(response.series)
    );
    authorizedFetch<{ issues: SystemIssue[] }>("/v1/platform/analytics/system-issues").then((response) => setIssues(response.issues));
    authorizedFetch<{ businesses: BusinessRow[] }>("/v1/platform/businesses").then((response) => setBusinesses(response.businesses));
  }, [authorizedFetch]);

  const issueGroups = Object.entries(
    issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.issueType] = (acc[issue.issueType] ?? 0) + 1;
      return acc;
    }, {})
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Hoş geldin, {user?.displayName?.split(" ")[0] ?? ""} 👋</h1>
        <p className="text-sm text-slate-500">Platformunun genel durumu, restoran performansı ve önemli gelişmeler burada.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          icon={<Building2 size={16} />}
          label="Toplam Restoran"
          value={String(overview?.totalBusinesses ?? 0)}
          trendPct={overview?.totalBusinessesTrendPct}
        />
        <MetricCard icon={<Building2 size={16} />} label="Aktif Restoran" value={String(overview?.activeBusinesses ?? 0)} />
        <MetricCard
          icon={<ShoppingCart size={16} />}
          label="Bugünkü Sipariş"
          value={String(overview?.todayOrders ?? 0)}
          trendPct={overview?.todayOrdersTrendPct}
        />
        <MetricCard
          icon={<DollarSign size={16} />}
          label="Bugünkü GMV"
          value={formatMoney(overview?.todayGmvMinor ?? 0)}
          trendPct={overview?.todayGmvTrendPct}
        />
        <MetricCard
          icon={<Users size={16} />}
          label="Toplam Müşteri"
          value={String(overview?.totalCustomers ?? 0)}
          trendPct={overview?.totalCustomersTrendPct}
        />
        <MetricCard icon={<CreditCard size={16} />} label="MRR" value={formatMoney(overview?.mrrMinor ?? 0)} />
        <MetricCard icon={<MessageCircle size={16} />} label="Bağlı WhatsApp" value={String(overview?.connectedWhatsapp ?? 0)} />
        <MetricCard
          icon={<AlertTriangle size={16} />}
          label="Sistem Sorunları"
          value={String(overview?.openIssues ?? 0)}
          trendPct={overview?.openIssuesTrendPct}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Platform GMV" className="lg:col-span-2">
          {series.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz veri yok.</p>
          ) : (
            <BarLineChart
              data={series.map((point) => ({
                date: point.date.slice(5),
                gmv: Math.round(point.gmvMinor / 100),
                orders: point.orderCount
              }))}
              xKey="date"
              barKey="gmv"
              lineKey="orders"
              dualAxis
            />
          )}
        </Card>
        <Card title="İlgi Gerektirenler">
          {issueGroups.length === 0 ? (
            <EmptyState icon={<AlertTriangle size={24} />} title="Her şey yolunda" description="Açık bir sistem sorunu yok." />
          ) : (
            <ul className="space-y-3">
              {issueGroups.map(([type, count]) => (
                <li key={type} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{issueLabel[type] ?? type}</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Restoran Aktivitesi">
        <BusinessActivityTable businesses={businesses} />
      </Card>
    </div>
  );
}
