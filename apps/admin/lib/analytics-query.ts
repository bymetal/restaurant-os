export function rangeToQuery(from: string, to: string): string {
  const params = new URLSearchParams({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString()
  });
  return params.toString();
}
