"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, type BadgeTone } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import type { BusinessRow } from "../../../lib/platform-types";

const plans = [
  { code: "starter", label: "Starter" },
  { code: "growth", label: "Growth" },
  { code: "pro", label: "Pro" }
] as const;

const planTone: Record<string, BadgeTone> = { pro: "brand", growth: "success", starter: "neutral" };

export default function SubscriptionsPage() {
  const { authorizedFetch } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    authorizedFetch<{ businesses: BusinessRow[] }>("/v1/platform/businesses").then((response) => setBusinesses(response.businesses));
  }, [authorizedFetch]);

  useEffect(load, [load]);

  async function assignPlan(businessId: string, planCode: string) {
    setBusyId(businessId);
    try {
      await authorizedFetch(`/v1/platform/businesses/${businessId}/subscription`, { method: "PUT", body: { planCode } });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Abonelikler</h1>
      <Card>
        <ul className="divide-y divide-slate-100">
          {businesses.map((business) => (
            <li key={business.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{business.name}</p>
                {business.planCode ? (
                  <Badge tone={planTone[business.planCode] ?? "neutral"}>{business.planName}</Badge>
                ) : (
                  <span className="text-xs text-slate-400">Plan atanmamış</span>
                )}
              </div>
              <div className="flex gap-2">
                {plans.map((plan) => (
                  <button
                    key={plan.code}
                    type="button"
                    disabled={busyId === business.id || business.planCode === plan.code}
                    onClick={() => void assignPlan(business.id, plan.code)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {plan.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
