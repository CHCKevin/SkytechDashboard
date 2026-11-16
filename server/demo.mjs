import { SourceError } from './openproject/errors.mjs';

const WORK_PACKAGES = [
  [1234, '前端登入頁改版', '示例專案'], [2051, '週會與進度回報', '示例專案'], [1877, '客戶 A 維運支援', '維運'],
  [1990, 'Code review', '示例專案'], [2310, '匯出報表效能問題', '維運'], [2318, 'SSO 設定調整', '維運'],
  [2333, '新人教育訓練', '行政'], [2205, '登入頁 E2E 測試', '示例專案'],
].map(([id, subject, project]) => ({ id, subject, project }));

const ACTIVITIES = [
  { id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false },
  { id: 4, name: 'Testing', default: false }, { id: 5, name: 'Support', default: false }, { id: 6, name: 'Other', default: false },
];

function localToday() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 記憶體內的假 OpenProject，介面與 time-tracking.mjs 相同；重啟即重置。
export function createDemoSource({ today = localToday() } = {}) {
  const entries = new Map();
  let nextId = 1;

  function workPackage(id) {
    const wp = WORK_PACKAGES.find(item => item.id === id);
    if (!wp) throw new SourceError('not_found');
    return wp;
  }

  function activity(id) {
    if (id === null) return null;
    const found = ACTIVITIES.find(item => item.id === id);
    if (!found) throw new SourceError('validation', 'Activity is not set to one of the allowed values.');
    return found;
  }

  function save(id, input) {
    const wp = workPackage(input.workPackageId);
    const act = activity(input.activityId);
    const entry = {
      id, workPackageId: wp.id, workPackageSubject: wp.subject, date: input.date, hours: input.hours,
      activityId: act?.id ?? null, activityName: act?.name ?? null, comment: input.comment,
    };
    entries.set(id, entry);
    return { ...entry };
  }

  function existing(id) {
    const entry = entries.get(id);
    if (!entry) throw new SourceError('not_found');
    return entry;
  }

  save(nextId++, { workPackageId: 1234, date: today, hours: 2.5, activityId: 3, comment: '調整表單驗證' });
  save(nextId++, { workPackageId: 2051, date: today, hours: 1, activityId: 1, comment: '' });

  return {
    async getMe() { return { id: 1, name: '示例冒險者' }; },
    async listEntries(date) {
      return [...entries.values()].filter(entry => entry.date === date).sort((a, b) => a.id - b.id).map(entry => ({ ...entry }));
    },
    async createEntry(input) { return save(nextId++, input); },
    async updateEntry(id, patch) {
      const current = existing(id);
      return save(id, { ...current, ...patch });
    },
    async deleteEntry(id) {
      existing(id);
      entries.delete(id);
    },
    async getWorkPackage(id) { return { ...workPackage(id) }; },
    async searchWorkPackages(term) {
      if (!term) return [];
      const matches = WORK_PACKAGES.filter(wp => String(wp.id).includes(term) || wp.subject.includes(term));
      matches.sort((a, b) => (String(b.id) === term) - (String(a.id) === term));
      return matches.slice(0, 10).map(wp => ({ ...wp }));
    },
    async listActivities(workPackageId) {
      workPackage(workPackageId);
      return ACTIVITIES.map(item => ({ ...item }));
    },
  };
}
