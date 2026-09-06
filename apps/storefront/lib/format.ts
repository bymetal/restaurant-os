export function formatMoney(minor: number): string {
  const major = minor / 100;
  const hasFraction = Math.round(major * 100) % 100 !== 0;
  return `${major.toLocaleString("tr-TR", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2
  })}₺`;
}
