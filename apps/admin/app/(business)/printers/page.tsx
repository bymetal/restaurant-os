"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Badge, Button, Card, EmptyState, type BadgeTone } from "@restaurant-os/ui";
import { ApiError } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { PrintDevice } from "../../../lib/printer-types";
import { RegisterPrinterForm } from "./_components/RegisterPrinterForm";

const statusTone: Record<PrintDevice["status"], BadgeTone> = {
  online: "success",
  offline: "neutral"
};

const statusLabel: Record<PrintDevice["status"], string> = {
  online: "Çevrimiçi",
  offline: "Çevrimdışı"
};

const roleLabel: Record<PrintDevice["role"], string> = {
  KITCHEN: "Mutfak",
  CASHIER: "Kasa"
};

export default function PrintersPage() {
  const { authorizedFetch } = useAuth();
  const [devices, setDevices] = useState<PrintDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(() => {
    authorizedFetch<{ devices: PrintDevice[] }>("/v1/printers/devices").then((response) => setDevices(response.devices));
  }, [authorizedFetch]);

  useEffect(loadDevices, [loadDevices]);

  async function revoke(deviceId: string) {
    setError(null);
    try {
      await authorizedFetch(`/v1/printers/devices/${deviceId}`, { method: "DELETE" });
      loadDevices();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Cihaz kaldırılamadı.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Yazıcılar</h1>

      <RegisterPrinterForm onCreated={loadDevices} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card title="Cihazlar">
        {devices.length === 0 ? (
          <EmptyState
            icon={<Printer size={24} />}
            title="Henüz yazıcı cihazı yok"
            description="Mutfağa otomatik fiş basmak için yukarıdan bir cihaz ekleyin ve print-agent'ı restoran bilgisayarında çalıştırın."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{device.name}</p>
                  <p className="text-xs text-slate-500">{roleLabel[device.role]}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone[device.status]}>{statusLabel[device.status]}</Badge>
                  <Button variant="outline" onClick={() => void revoke(device.id)}>
                    Kaldır
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
