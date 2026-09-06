export interface AvatarProps {
  name: string;
  size?: number;
  src?: string | null;
}

const palette = ["#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#0891B2", "#4F46E5", "#9333EA", "#DB2777"];

function colorForName(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? "#DC2626";
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 40, src }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: colorForName(name), fontSize: size * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      aria-label={name}
    >
      {initialsForName(name)}
    </div>
  );
}
