import type { ReactNode } from "react";
import { Card, EmptyState } from "@restaurant-os/ui";

export function ComingSoon({ title, icon, description }: { title: string; icon: ReactNode; description: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <Card>
        <EmptyState icon={icon} title="Yakında" description={description} />
      </Card>
    </div>
  );
}
