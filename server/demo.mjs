import { SourceError } from './openproject/errors.mjs';

const WORK_PACKAGES = [
  [1234, '前端登入頁改版', '示例專案'], [2051, '週會與進度回報', '示例專案'], [1877, '客戶 A 維運支援', '維運'],
  [1990, 'Code review', '示例專案'], [2310, '匯出報表效能問題', '維運'], [2318, 'SSO 設定調整', '維運'],
  [2333, '新人教育訓練', '行政'], [2205, '登入頁 E2E 測試', '示例專案'], [200, '請假', '行政'],
].map(([id, subject, project]) => ({ id, subject, project }));

const ACTIVITIES = [
  { id: 1, name: 'Management', default: true }, { id: 3, name: 'Development', default: false },
  { id: 4, name: 'Testing', default: false }, { id: 5, name: 'Support', default: false }, { id: 6, name: 'Other', default: false },
];

const ME = 1;
const USERS = [
  [ME, '示例冒險者'], [11, '劍士 小華'], [12, '法師 怡君'], [13, '弓手 志豪'], [14, '盜賊 阿明'], [15, '牧師 雅婷'],
  [16, '商人 Gary'], [17, '學徒 小安'], [18, '騎士 大雄'], [19, '藥師 佩珊'], [20, '獵人 Kevin'], [21, '鍛造師 阿國'],
  [22, '吟遊詩人 小美'], [23, '書記官 淑芬'], [24, '馴獸師 建宏'], [25, '槍手 俊傑'], [26, '占星師 欣怡'], [27, '巡邏官 志明'],
].map(([id, name]) => ({ id, name }));

// 示例模式第一次啟動時預先在大廳裡的成員。
export const DEMO_HALL_MEMBERS = [ME, 11, 12, 13, 14].map(id => {
  const user = USERS.find(item => item.id === id);
  return { userId: user.id, name: user.name };
});

function localToday() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 記憶體內的假 OpenProject，介面與 time-tracking.mjs 相同；重啟即重置。
export function createDemoSource({ today = localToday() } = {}) {
  const entries = new Map();
  // 每筆工時的擁有者；任務欄只看得到、也只改得動示例冒險者本人的工時。
  const owners = new Map();
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

  function save(id, input, userId = ME) {
    const wp = workPackage(input.workPackageId);
    const act = activity(input.activityId);
    const entry = {
      id, workPackageId: wp.id, workPackageSubject: wp.subject, date: input.date, hours: input.hours,
      activityId: act?.id ?? null, activityName: act?.name ?? null, comment: input.comment,
    };
    entries.set(id, entry);
    owners.set(id, userId);
    return { ...entry };
  }

  function existing(id) {
    const entry = entries.get(id);
    if (!entry || owners.get(id) !== ME) throw new SourceError('not_found');
    return entry;
  }

  save(nextId++, { workPackageId: 1234, date: today, hours: 2.5, activityId: 3, comment: '調整表單驗證' });
  save(nextId++, { workPackageId: 2051, date: today, hours: 1, activityId: 1, comment: '' });
  // 其他成員今天的狀況：11 請假、12 與 14 工作中、13 還沒有記工時。
  save(nextId++, { workPackageId: 200, date: today, hours: 8, activityId: null, comment: '特休' }, 11);
  save(nextId++, { workPackageId: 1990, date: today, hours: 3, activityId: 3, comment: '審查登入頁改版' }, 12);
  save(nextId++, { workPackageId: 2310, date: today, hours: 2, activityId: 4, comment: '' }, 12);
  save(nextId++, { workPackageId: 1877, date: today, hours: 4, activityId: 5, comment: '客戶現場問題排查' }, 14);

  return {
    async getMe() { return { ...USERS[0] }; },
    async listEntries(date) {
      return [...entries.values()].filter(entry => entry.date === date && owners.get(entry.id) === ME)
        .sort((a, b) => a.id - b.id).map(entry => ({ ...entry }));
    },
    async createEntry(input) { return save(nextId++, input); },
    async updateEntry(id, patch) {
      const current = existing(id);
      return save(id, { ...current, ...patch }, ME);
    },
    async deleteEntry(id) {
      existing(id);
      entries.delete(id);
      owners.delete(id);
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
    async searchUsers(term) {
      if (!term) return [];
      return USERS.filter(user => user.name.includes(term)).slice(0, 10).map(user => ({ ...user }));
    },
    async getUser(id) {
      const user = USERS.find(item => item.id === id);
      if (!user) throw new SourceError('not_found');
      return { ...user };
    },
    async listEntriesForUsers(date, userIds) {
      return [...entries.values()].filter(entry => entry.date === date && userIds.includes(owners.get(entry.id)))
        .sort((a, b) => a.id - b.id).map(entry => ({ userId: owners.get(entry.id), ...entry }));
    },
  };
}
