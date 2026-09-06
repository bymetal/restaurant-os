export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
      <input
        type="date"
        value={from}
        max={to}
        onChange={(event) => onChange({ from: event.target.value, to })}
        className="outline-none"
      />
      <span className="text-slate-400">–</span>
      <input
        type="date"
        value={to}
        min={from}
        onChange={(event) => onChange({ from, to: event.target.value })}
        className="outline-none"
      />
    </div>
  );
}
