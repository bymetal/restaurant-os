import type { LucideIcon } from "lucide-react";

export function ProductImage({ photoUrl, name, icon: Icon }: { photoUrl: string | null; name: string; icon: LucideIcon }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 text-brand-300">
      <Icon size={28} />
    </div>
  );
}
