// 本機 API 的輸入驗證；錯誤帶欄位名稱，由 http.mjs 轉成 400。
export class InputError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'InputError';
    this.code = 'invalid_input';
    this.field = field;
  }
}

const MAX_ID = 2 ** 31 - 1;
const ENTRY_KEYS = ['workPackageId', 'date', 'hours', 'activityId', 'comment'];
const QUEST_KEYS = ['workPackageId', 'activityId'];

export function parseDate(value, field = 'date') {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return value;
  }
  throw new InputError(field, '日期格式必須是有效的 YYYY-MM-DD');
}

export function parsePathId(value, field) {
  if (typeof value === 'string' && /^\d{1,10}$/.test(value)) {
    const id = Number(value);
    if (id >= 1 && id <= MAX_ID) return id;
  }
  throw new InputError(field, '編號必須是正整數');
}

function parseId(value, field) {
  if (Number.isInteger(value) && value >= 1 && value <= MAX_ID) return value;
  throw new InputError(field, '編號必須是正整數');
}

function parseActivityId(value) {
  if (value === null) return null;
  return parseId(value, 'activityId');
}

function parseHours(value) {
  const ok = typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 24
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
  if (!ok) throw new InputError('hours', '時數必須大於 0、不超過 24，最多兩位小數');
  return value;
}

function parseComment(value) {
  if (typeof value !== 'string') throw new InputError('comment', '備註必須是文字');
  if (value.length > 1000) throw new InputError('comment', '備註最多 1000 字');
  return value;
}

function assertObject(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('body', '請求內容必須是 JSON 物件');
  const unknown = Object.keys(body).find(key => !keys.includes(key));
  if (unknown) throw new InputError(unknown, `不支援的欄位：${unknown}`);
}

const parsers = {
  workPackageId: value => parseId(value, 'workPackageId'),
  date: value => parseDate(value),
  hours: parseHours,
  activityId: parseActivityId,
  comment: parseComment,
};

export function parseEntryInput(body, { partial = false } = {}) {
  assertObject(body, ENTRY_KEYS);
  if (partial) {
    const keys = ENTRY_KEYS.filter(key => body[key] !== undefined);
    if (!keys.length) throw new InputError('body', '至少要修改一個欄位');
    return Object.fromEntries(keys.map(key => [key, parsers[key](body[key])]));
  }
  for (const key of ['workPackageId', 'date', 'hours']) {
    if (body[key] === undefined) throw new InputError(key, `缺少欄位：${key}`);
  }
  return {
    workPackageId: parsers.workPackageId(body.workPackageId),
    date: parsers.date(body.date),
    hours: parsers.hours(body.hours),
    activityId: body.activityId === undefined ? null : parseActivityId(body.activityId),
    comment: body.comment === undefined ? '' : parseComment(body.comment),
  };
}

export function parseQuestInput(body) {
  assertObject(body, QUEST_KEYS);
  if (body.workPackageId === undefined) throw new InputError('workPackageId', '缺少欄位：workPackageId');
  return {
    workPackageId: parseId(body.workPackageId, 'workPackageId'),
    activityId: body.activityId === undefined ? null : parseActivityId(body.activityId),
  };
}

export function parseHallMemberInput(body) {
  assertObject(body, ['userId']);
  if (body.userId === undefined) throw new InputError('userId', '缺少欄位：userId');
  return { userId: parseId(body.userId, 'userId') };
}

// 去除前後空白與開頭的 #；空字串代表「不搜尋」。
export function parseSearchTerm(value) {
  const term = (typeof value === 'string' ? value : '').trim().replace(/^#/, '').trim();
  if (term.length > 100) throw new InputError('q', '搜尋文字最多 100 字');
  return term;
}
