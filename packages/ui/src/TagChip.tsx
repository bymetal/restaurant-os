export interface TagChipProps {
  label: string;
  onRemove?: () => void;
}

export function TagChip({ label, onRemove }: TagChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-slate-400 hover:text-slate-600"
          aria-label={`${label} etiketini kaldır`}
        >
          ×
        </button>
      )}
    </span>
  );
}
