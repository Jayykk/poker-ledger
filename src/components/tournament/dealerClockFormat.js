export function formatNumber(value) {
  if (value == null) return '0';
  return Number(value).toLocaleString();
}
