import { SourceError } from './openproject/errors.mjs';

const NUM = '(\\d+(?:\\.\\d+)?)';
const PATTERN = new RegExp(`^P(?:${NUM}D)?(?:T(?:${NUM}H)?(?:${NUM}M)?(?:${NUM}S)?)?$`);

// 呼叫端已驗證 hours 為 0～24、最多兩位小數，OpenProject 接受十進位小時（實測 PT2.5H）。
export function toDuration(hours) {
  return `PT${hours}H`;
}

// OpenProject 回傳 PT2H30M、PT45M 等形式；轉成十進位小時並四捨五入到兩位。
export function fromDuration(text) {
  const match = typeof text === 'string' ? PATTERN.exec(text) : null;
  if (!match || text === 'P' || text.endsWith('T')) throw new SourceError('invalid_response');
  const [days, hours, minutes, seconds] = match.slice(1).map(value => Number(value ?? 0));
  return Math.round((days * 24 + hours + minutes / 60 + seconds / 3600) * 100) / 100;
}
