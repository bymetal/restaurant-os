"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { Button, Card, StampProgress } from "@restaurant-os/ui";
import { ApiError } from "../../../../../lib/api-client";
import { useAuth } from "../../../../../lib/auth-context";
import type { LoyaltyStatus } from "../../../../../lib/customer-types";

export function LoyaltyTab({ customerId, refreshToken, onChanged }: { customerId: string; refreshToken: number; onChanged: () => void }) {
  const { authorizedFetch } = useAuth();
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authorizedFetch<{ loyalty: LoyaltyStatus }>(`/v1/customers/${customerId}/loyalty`).then((response) =>
      setLoyalty(response.loyalty)
    );
  }, [customerId, authorizedFetch, refreshToken]);

  async function handleRedeem() {
    setBusy(true);
    setError(null);
    try {
      await authorizedFetch(`/v1/customers/${customerId}/loyalty/redeem`, {
        method: "POST",
        idempotencyKey: `admin-redeem-${customerId}-${Date.now()}`
      });
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Ödül kullanılamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (!loyalty) return <Card title="Sadakat Programı">Yükleniyor...</Card>;

  if (!loyalty.linked || !loyalty.program || !loyalty.account) {
    return (
      <Card title="Sadakat Programı">
        <p className="text-sm text-slate-500">Bu restoran için henüz bir sadakat programı yapılandırılmamış.</p>
      </Card>
    );
  }

  return (
    <Card title="Sadakat Programı">
      <div className="space-y-4">
        <StampProgress
          icon={<Gift size={18} />}
          title={loyalty.program.name}
          subtitle={loyalty.program.rewardDescription}
          balance={loyalty.account.balance}
          goalCount={loyalty.program.goalCount}
        />
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-slate-500">Toplam Kazanılan</p>
            <p className="text-lg font-bold text-slate-900">{loyalty.account.lifetimeEarned}</p>
          </div>
          <div>
            <p className="text-slate-500">Toplam Kullanılan</p>
            <p className="text-lg font-bold text-slate-900">{loyalty.account.lifetimeRedeemed}</p>
          </div>
          <div>
            <p className="text-slate-500">Ödüle Kalan</p>
            <p className="text-lg font-bold text-slate-900">{loyalty.account.stampsUntilReward}</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button disabled={!loyalty.account.rewardAvailable || busy} onClick={() => void handleRedeem()}>
          Ödülü Kullan
        </Button>
      </div>
    </Card>
  );
}
