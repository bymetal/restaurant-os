"use client";

import clsx from "clsx";
import { iconForCategoryName } from "../../../../lib/category-icon";
import type { MenuCategory } from "../../../../lib/menu-types";

export function CategoryTabs({
  categories,
  activeId,
  onSelect
}: {
  categories: MenuCategory[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {categories.map((category) => {
        const Icon = iconForCategoryName(category.name);
        const active = category.id === activeId;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
              active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            )}
          >
            <Icon size={15} />
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
