"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, QrCode as QrCodeIcon } from "lucide-react";
import { Badge, Button, Card, EmptyState, type BadgeTone } from "@restaurant-os/ui";
import { ApiError } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { QrCode, WhatsAppConnection } from "../../../lib/integration-types";
import { CreateQrCodeForm } from "./_components/CreateQrCodeForm";

const connectionTone: Record<WhatsAppConnection["connectionState"], BadgeTone> = {
  connected: "success",
  connecting: "warning",
  disconnected: "neutral"
};

const connectionLabel: Record<WhatsAppConnection["connectionState"], string> = {
  connected: "Bağlı",
  connecting: "Bağlanıyor",
  disconnected: "Bağlı değil"
};

export default function IntegrationsPage() {
  const { authorizedFetch } = useAuth();
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodes, setQrCodes] = useState<QrCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnection = useCallback(() => {
    authorizedFetch<{ connection: WhatsAppConnection | null }>("/v1/integrations/whatsapp").then((response) =>
      setConnection(response.connection)
    );
  }, [authorizedFetch]);

  const loadQrCodes = useCallback(() => {
    authorizedFetch<{ qrCodes: QrCode[] }>("/v1/qr-codes").then((response) => setQrCodes(response.qrCodes));
  }, [authorizedFetch]);

  useEffect(loadConnection, [loadConnection]);
  useEffect(loadQrCodes, [loadQrCodes]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const response = await authorizedFetch<{ connection: WhatsAppConnection & { qrCode: string | null } }>(
        "/v1/integrations/whatsapp/connect",
        { method: "POST" }
      );
      setConnection(response.connection);
      setQrCode(response.connection.qrCode);
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "WhatsApp bağlantısı kurulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await authorizedFetch("/v1/integrations/whatsapp/disconnect", { method: "POST" });
      setQrCode(null);
      loadConnection();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Bağlantı kesilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Entegrasyonlar</h1>

      <Card title="WhatsApp">
        {!connection || connection.connectionState === "disconnected" ? (
          <div className="space-y-3">
            <EmptyState
              icon={<MessageCircle size={24} />}
              title="WhatsApp bağlı değil"
              description="Müşterilerinizi WhatsApp üzerinden CRM'inize almak ve otomatik bildirim göndermek için bağlantı kurun."
            />
            {qrCode && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4">
                <img src={qrCode} alt="WhatsApp QR kodu" className="h-48 w-48" />
                <p className="text-xs text-slate-500">WhatsApp uygulamanızla bu kodu tarayın.</p>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={() => void connect()} disabled={busy}>
              {busy ? "Bağlanıyor..." : "WhatsApp'ı Bağla"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={connectionTone[connection.connectionState]}>{connectionLabel[connection.connectionState]}</Badge>
              {connection.phone && <span className="text-sm text-slate-600">{connection.phone}</span>}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadConnection}>
                Durumu Yenile
              </Button>
              <Button variant="outline" onClick={() => void disconnect()} disabled={busy}>
                Bağlantıyı Kes
              </Button>
            </div>
          </div>
        )}
      </Card>

      <CreateQrCodeForm onCreated={loadQrCodes} />

      <Card title="QR Kodları">
        {qrCodes.length === 0 ? (
          <EmptyState icon={<QrCodeIcon size={24} />} title="Henüz QR kod yok" description="Müşteri kazanımı için yukarıdan bir QR kod oluşturun." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {qrCodes.map((qr) => (
              <li key={qr.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{qr.source}</p>
                  <p className="text-xs text-slate-500">
                    {qr.type} • WhatsApp mesajı: <span className="font-mono">KATIL {qr.sourceToken}</span>
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{qr.scanCount} tarama</p>
                  <p>{qr.customerCount} yeni müşteri</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
