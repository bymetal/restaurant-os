import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  action?: ReactNode;
}

export function Card({ title, action, className, children, ...rest }: CardProps) {
  return (
    <div className={clsx("rounded-xl2 border border-slate-200 bg-white p-5 shadow-sm", className)} {...rest}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
