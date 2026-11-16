export const QUICK_HOURS = [0.5, 1, 2, 4];

// 與後端驗證一致：大於 0、不超過 24、最多兩位小數。
export function parseHoursInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { error: '請輸入時數，例如 1 或 2.5（最多兩位小數）' };
  const value = Number(trimmed);
  if (value <= 0 || value > 24) return { error: '時數必須大於 0、不超過 24' };
  return { value };
}
