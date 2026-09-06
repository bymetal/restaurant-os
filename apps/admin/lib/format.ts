export function formatMoney(minor: number): string {
  const major = minor / 100;
  return `₺${major.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatTenure(createdAt: string): string {
  const months = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30))
  );
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} aydır`;
  if (remainingMonths === 0) return `${years} yıldır`;
  return `${years} yıl ${remainingMonths} aydır`;
}
