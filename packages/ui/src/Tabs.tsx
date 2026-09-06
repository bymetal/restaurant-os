import clsx from "clsx";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export function Tabs({ items, activeId, onChange }: TabsProps) {
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-slate-200">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={clsx(
              "shrink-0 border-b-2 pb-3 text-sm font-semibold transition-colors",
              active ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
