"use client";

import { useEffect, useState } from "react";
import { Gift, Heart, ShoppingBag } from "lucide-react";
import { Card, MetricCard, StampProgress, TagChip, TimelineFeed } from "@restaurant-os/ui";
import { useAuth } from "../../../../../lib/auth-context";
import { formatDateTime, formatMoney } from "../../../../../lib/format";
import type {
  CustomerDetail,
  CustomerTag,
  FavoriteProduct,
  LoyaltyStatus,
  TimelineEntry
} from "../../../../../lib/customer-types";

const fulfillmentLabel: Record<string, string> = { delivery: "Adrese Teslim", pickup: "Gel-Al", dine_in: "Masada" };

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

export function OverviewTab({ customer, refreshToken }: { customer: CustomerDetail; refreshToken: number }) {
  const { authorizedFetch } = useAuth();
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [tags, setTags] = useState<CustomerTag[]>([]);

  useEffect(() => {
    authorizedFetch<{ loyalty: LoyaltyStatus }>(`/v1/customers/${customer.id}/loyalty`).then((r) => setLoyalty(r.loyalty));
    authorizedFetch<{ favorites: FavoriteProduct[] }>(`/v1/customers/${customer.id}/favorites`).then((r) =>
      setFavorites(r.favorites)
    );
    authorizedFetch<{ timeline: TimelineEntry[] }>(`/v1/customers/${customer.id}/timeline`).then((r) =>
      setTimeline(r.timeline.slice(0, 5))
    );
    authorizedFetch<{ tags: CustomerTag[] }>(`/v1/customers/${customer.id}/tags`).then((r) => setTags(r.tags));
  }, [customer.id, authorizedFetch, refreshToken]);

  const maxFavoriteCount = Math.max(1, ...favorites.map((item) => item.orderCount));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Toplam Harcama"
          value={formatMoney(customer.metrics.totalSpendMinor)}
          trendPct={customer.metrics.totalSpendTrendPct}
          trendLabel="Tüm zamanlar"
        />
        <MetricCard
          label="Sipariş"
          value={String(customer.metrics.orderCount)}
          trendPct={customer.metrics.orderCountTrendPct}
          trendLabel="Toplam sipariş sayısı"
        />
        <MetricCard
          label="Ortalama Sepet"
          value={formatMoney(customer.metrics.avgBasketMinor)}
          trendPct={customer.metrics.avgBasketTrendPct}
          trendLabel="Sipariş başına ortalama"
        />
        <MetricCard
          label="Son Sipariş"
          value={customer.metrics.lastOrder ? formatDateTime(customer.metrics.lastOrder.placedAt) : "—"}
          trendLabel={
            customer.metrics.lastOrder
              ? `${formatMoney(customer.metrics.lastOrder.totalMinor)} • ${customer.metrics.lastOrder.branchName}`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Sadakat Programı">
          {loyalty?.linked && loyalty.program && loyalty.account ? (
            <div className="space-y-3">
              <StampProgress
                icon={<Gift size={18} />}
                title={loyalty.program.name}
                subtitle={loyalty.program.rewardDescription}
                balance={loyalty.account.balance}
                goalCount={loyalty.program.goalCount}
              />
              <p className="text-xs text-slate-500">
                {loyalty.account.rewardAvailable
                  ? "Ödül kullanıma hazır!"
                  : `${loyalty.account.stampsUntilReward} damga sonra ödül kazanılacak.`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Bu restoran için henüz bir sadakat programı yapılandırılmamış.</p>
          )}
        </Card>

        <Card title="Müşteri Bilgileri">
          <dl className="space-y-2 text-sm">
            <Row label="Segment" value={customer.segment} />
            <Row label="İlk Kayıt" value={new Date(customer.createdAt).toLocaleDateString("tr-TR")} />
            {customer.birthday && <Row label="Doğum Günü" value={new Date(customer.birthday).toLocaleDateString("tr-TR")} />}
            {customer.preferredFulfillment && (
              <Row label="Tercih Edilen Teslimat" value={fulfillmentLabel[customer.preferredFulfillment] ?? customer.preferredFulfillment} />
            )}
            {customer.acquisitionSource && <Row label="Kazanım Kaynağı" value={customer.acquisitionSource} />}
          </dl>
        </Card>

        <Card title="Favori Ürünler">
          {favorites.length === 0 && <p className="text-sm text-slate-500">Henüz sipariş verisi yok.</p>}
          <ul className="space-y-2">
            {favorites.map((item, index) => (
              <li key={item.productId} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-slate-400">{index + 1}</span>
                <span className="flex-1 truncate text-slate-700">{item.productName}</span>
                <div className="h-1.5 w-16 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-brand-500"
                    style={{ width: `${(item.orderCount / maxFavoriteCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs text-slate-400">{item.orderCount}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Son Etkileşimler">
          <TimelineFeed
            entries={timeline.map((entry) => ({
              id: `${entry.kind}-${entry.createdAt}-${entry.refId ?? ""}`,
              title: timelineTitle(entry),
              timestamp: formatDateTime(entry.createdAt),
              tone: entry.kind === "loyalty" ? "brand" : entry.kind === "note" ? "neutral" : "success",
              icon:
                entry.kind === "loyalty" ? (
                  <Gift size={14} />
                ) : entry.kind === "note" ? (
                  <Heart size={14} />
                ) : (
                  <ShoppingBag size={14} />
                )
            }))}
          />
        </Card>

        <Card title="Tercihler & Davranışlar">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <TagChip key={tag.id} label={tag.label} />
            ))}
            {tags.length === 0 && <p className="text-sm text-slate-500">Henüz etiket eklenmemiş.</p>}
          </div>
        </Card>
      </div>

      {customer.segment === "vip" && (
        <Card title="Değerli Bir Müşterimiz">
          <p className="text-sm text-slate-600">
            {customer.name ?? "Bu müşteri"}, restoranınızın en sadık müşterilerinden biri. Özel kampanyalar ve yeni
            ürün duyurularında öncelikli bilgilendirilmesi önerilir.
          </p>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
