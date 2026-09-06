import type { ReactNode } from "react";
import clsx from "clsx";

export interface MetricCardProps {
  label: string;
  value: string;
  trendPct?: number;
  trendLabel?: string;
  icon?: ReactNode;
  chart?: ReactNode;
}

export function MetricCard({ label, value, trendPct, trendLabel, icon, chart }: MetricCardProps) {
  const isPositive = (trendPct ?? 0) >= 0;
  return (
    <div className="rounded-xl2 border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {icon && <span className="text-brand-600">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs">
          {trendPct !== undefined && (
            <span
              className={clsx("font-semibold", isPositive ? "text-emerald-600" : "text-red-600")}
            >
              {isPositive ? "↑" : "↓"} %{Math.abs(trendPct)}
            </span>
          )}
          {trendLabel && <span className="font-normal text-slate-400">{trendLabel}</span>}
        </span>
        {chart && <div className="h-8 w-20">{chart}</div>}
      </div>
    </div>
  );
}
