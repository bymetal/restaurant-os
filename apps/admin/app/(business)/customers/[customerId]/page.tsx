"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tabs } from "@restaurant-os/ui";
import { useAuth } from "../../../../lib/auth-context";
import type { CustomerDetail } from "../../../../lib/customer-types";
import { CampaignsTab } from "./_components/CampaignsTab";
import { CustomerHeader } from "./_components/CustomerHeader";
import { LoyaltyTab } from "./_components/LoyaltyTab";
import { NotesTab } from "./_components/NotesTab";
import { OrdersTab } from "./_components/OrdersTab";
import { OverviewTab } from "./_components/OverviewTab";
import { TimelineTab } from "./_components/TimelineTab";

const tabs = [
  { id: "overview", label: "Genel Bakış" },
  { id: "orders", label: "Siparişler" },
  { id: "loyalty", label: "Sadakat" },
  { id: "notes", label: "Notlar" },
  { id: "campaigns", label: "Kampanyalar" },
  { id: "timeline", label: "İletişim Geçmişi" }
];

export default function CustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const { authorizedFetch } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshToken, setRefreshToken] = useState(0);

  const loadCustomer = useCallback(() => {
    authorizedFetch<{ customer: CustomerDetail }>(`/v1/customers/${customerId}`).then((response) =>
      setCustomer(response.customer)
    );
  }, [customerId, authorizedFetch]);

  useEffect(loadCustomer, [loadCustomer]);

  function handleChanged() {
    setRefreshToken((token) => token + 1);
    loadCustomer();
  }

  if (!customer) return <p className="text-sm text-slate-500">Yükleniyor...</p>;

  return (
    <div className="space-y-4">
      <nav className="text-sm text-slate-500">
        <Link href="/customers" className="hover:text-slate-700">
          Müşteriler
        </Link>
        <span className="mx-1">›</span>
        <span className="text-slate-900">{customer.name ?? customer.phone}</span>
      </nav>
      <CustomerHeader customer={customer} onAdjusted={handleChanged} />
      <Tabs items={tabs} activeId={activeTab} onChange={setActiveTab} />
      {activeTab === "overview" && <OverviewTab customer={customer} refreshToken={refreshToken} />}
      {activeTab === "orders" && <OrdersTab customerId={customer.id} />}
      {activeTab === "loyalty" && (
        <LoyaltyTab customerId={customer.id} refreshToken={refreshToken} onChanged={handleChanged} />
      )}
      {activeTab === "notes" && <NotesTab customerId={customer.id} />}
      {activeTab === "campaigns" && <CampaignsTab />}
      {activeTab === "timeline" && <TimelineTab customerId={customer.id} />}
    </div>
  );
}
