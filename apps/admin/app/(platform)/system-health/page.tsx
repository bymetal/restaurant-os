"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge, Card, EmptyState, type BadgeTone } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime } from "../../../lib/format";
import type { SystemIssue } from "../../../lib/platform-types";

const severityTone: Record<string, BadgeTone> = { info: "info", warning: "warning", critical: "danger" };
const issueLabel: Record<string, string> = {
  whatsapp_disconnected: "WhatsApp Bağlantısı Kesildi",
  printer_offline: "Yazıcı Çevrimdışı",
  subscription_payment_failed: "Abonelik Ödemesi Başarısız",
  webhook_error: "Webhook Hatası"
};

export default function SystemHealthPage() {
  const { authorizedFetch } = useAuth();
  const [issues, setIssues] = useState<SystemIssue[] | null>(null);

  useEffect(() => {
    authorizedFetch<{ issues: SystemIssue[] }>("/v1/platform/analytics/system-issues").then((response) =>
      setIssues(response.issues)
    );
  }, [authorizedFetch]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Sistem Sağlığı</h1>
      <Card title="Açık Sorunlar">
        {issues === null && <p className="text-sm text-slate-500">Yükleniyor...</p>}
        {issues && issues.length === 0 && (
          <EmptyState icon={<CheckCircle2 size={28} />} title="Tüm sistemler çalışıyor" description="Şu anda açık bir sistem sorunu yok." />
        )}
        {issues && issues.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {issues.map((issue) => (
              <li key={issue.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{issueLabel[issue.issueType] ?? issue.issueType}</p>
                    <p className="text-xs text-slate-500">{issue.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={severityTone[issue.severity] ?? "neutral"}>{issue.severity}</Badge>
                  <span className="text-xs text-slate-400">{formatDateTime(issue.occurredAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
