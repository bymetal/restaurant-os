"use client";

import { Badge, type BadgeTone } from "@restaurant-os/ui";
import { formatDateTime, formatMoney } from "../../../lib/format";
import type { BusinessRow } from "../../../lib/platform-types";

const planTone: Record<string, BadgeTone> = { pro: "brand", growth: "success", starter: "neutral" };

export function BusinessActivityTable({ businesses }: { businesses: BusinessRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-2">Restoran</th>
            <th className="pb-2">Plan</th>
            <th className="pb-2">Şube</th>
            <th className="pb-2">30 Günlük Sipariş</th>
            <th className="pb-2">30 Günlük GMV</th>
            <th className="pb-2">WhatsApp</th>
            <th className="pb-2">Son Aktivite</th>
            <th className="pb-2">Durum</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((business) => (
            <tr key={business.id} className="border-b border-slate-50">
              <td className="py-2.5">
                <p className="font-semibold text-slate-900">{business.name}</p>
                <p className="text-xs text-slate-400">{business.slug}</p>
              </td>
              <td className="py-2.5">
                {business.planCode ? (
                  <Badge tone={planTone[business.planCode] ?? "neutral"}>{business.planName}</Badge>
                ) : (
                  <span className="text-xs text-slate-400">Plan yok</span>
                )}
              </td>
              <td className="py-2.5">{business.branchCount}</td>
              <td className="py-2.5">{business.orders30d}</td>
              <td className="py-2.5">{formatMoney(business.gmv30dMinor)}</td>
              <td className="py-2.5">
                <Badge tone={business.whatsappStatus === "connected" ? "success" : "danger"}>
                  {business.whatsappStatus === "connected" ? "Bağlı" : "Bağlantı yok"}
                </Badge>
              </td>
              <td className="py-2.5 text-xs text-slate-500">
                {business.lastActivityAt ? formatDateTime(business.lastActivityAt) : "—"}
              </td>
              <td className="py-2.5">
                <Badge tone={business.active ? "success" : "neutral"}>{business.active ? "Aktif" : "Pasif"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
