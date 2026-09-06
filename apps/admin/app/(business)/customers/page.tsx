"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Avatar, Badge, Card, type BadgeTone } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import type { CustomerSummary } from "../../../lib/customer-types";

const segmentTone: Record<string, BadgeTone> = { vip: "gold", regular: "brand", new: "neutral", at_risk: "warning" };
const segmentLabel: Record<string, string> = { vip: "VIP", regular: "Düzenli", new: "Yeni", at_risk: "Risk Altında" };

export default function CustomersPage() {
  const { authorizedFetch } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      authorizedFetch<{ customers: CustomerSummary[] }>(`/v1/customers?${params.toString()}`)
        .then((response) => setCustomers(response.customers))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, authorizedFetch]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Müşteriler</h1>
      <Card>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="İsim veya telefon ile ara..."
            className="w-full text-sm outline-none"
          />
        </div>
        {loading && <p className="text-sm text-slate-500">Yükleniyor...</p>}
        {!loading && customers.length === 0 && <p className="text-sm text-slate-500">Müşteri bulunamadı.</p>}
        <ul className="divide-y divide-slate-100">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/customers/${customer.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name ?? customer.phone} size={36} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{customer.name ?? "İsimsiz Müşteri"}</p>
                    <p className="text-xs text-slate-500">{customer.phone}</p>
                  </div>
                </div>
                <Badge tone={segmentTone[customer.segment] ?? "neutral"}>
                  {segmentLabel[customer.segment] ?? customer.segment}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
