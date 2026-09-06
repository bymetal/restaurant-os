import type { HTMLAttributes } from "react";
import clsx from "clsx";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand" | "gold";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700",
  brand: "bg-brand-100 text-brand-700",
  gold: "bg-amber-100 text-amber-800"
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        toneClasses[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
