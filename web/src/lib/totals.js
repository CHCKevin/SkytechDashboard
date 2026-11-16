export function sumHours(entries) {
  return Math.round(entries.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100;
}

export function progressPercent(total, target) {
  if (!(target > 0)) return 0;
  return Math.min(100, Math.round((total / target) * 100));
}
