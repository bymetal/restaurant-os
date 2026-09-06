"use client";

import { useEffect, useState } from "react";
import { Card } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import type { BusinessRow } from "../../../lib/platform-types";
import { BusinessActivityTable } from "../_components/BusinessActivityTable";

export default function BusinessesPage() {
  const { authorizedFetch } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);

  useEffect(() => {
    authorizedFetch<{ businesses: BusinessRow[] }>("/v1/platform/businesses").then((response) => setBusinesses(response.businesses));
  }, [authorizedFetch]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Restoranlar</h1>
      <Card>
        <BusinessActivityTable businesses={businesses} />
      </Card>
    </div>
  );
}
