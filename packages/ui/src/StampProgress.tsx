import type { ReactNode } from "react";
import clsx from "clsx";

export interface StampProgressProps {
  title: string;
  subtitle: string;
  balance: number;
  goalCount: number;
  icon?: ReactNode;
}

export function StampProgress({ title, subtitle, balance, goalCount, icon }: StampProgressProps) {
  const stamps = Array.from({ length: goalCount }, (_, index) => index < balance);
  return (
    <div className="rounded-xl2 border border-brand-100 bg-brand-50 px-4 py-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-slate-700">
          {balance}/{goalCount}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {stamps.map((filled, index) => (
          <span
            key={index}
            className={clsx("h-3.5 w-3.5 rounded-full", filled ? "bg-brand-600" : "border border-slate-300")}
          />
        ))}
      </div>
    </div>
  );
}
