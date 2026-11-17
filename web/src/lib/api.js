// 唯一呼叫本機 /api 的模組；寫入一律帶 X-Quest-Board 標頭（伺服器的 CSRF 檢查）。
export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-Quest-Board'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    // 後端一次請求最多可能連續呼叫 OpenProject 兩次（各 10 秒）並重試讀取，所以放寬到 45 秒。
    res = await fetch(path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    // 逾時時請求可能已送達，訊息要提醒使用者先確認結果。
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ApiError(0, 'timeout', '本機伺服器回應逾時，請重新整理確認結果');
    }
    throw new ApiError(0, 'network', '無法連線到本機伺服器，請確認伺服器仍在執行');
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(res.status, error?.code ?? 'http_error', error?.message ?? `伺服器回應錯誤（${res.status}）`, error?.field);
  }
  return data;
}

export const getMe = () => request('/api/me');
export const getConfig = () => request('/api/config');
export const listEntries = date => request(`/api/time-entries?date=${encodeURIComponent(date)}`);
export const createEntry = input => request('/api/time-entries', { method: 'POST', body: input });
export const updateEntry = (id, patch) => request(`/api/time-entries/${id}`, { method: 'PATCH', body: patch });
export const deleteEntry = id => request(`/api/time-entries/${id}`, { method: 'DELETE' });
export const searchWorkPackages = query => request(`/api/work-packages/search?q=${encodeURIComponent(query)}`);
export const listActivities = workPackageId => request(`/api/activities?workPackageId=${workPackageId}`);
export const listQuests = () => request('/api/quests');
export const pinQuest = input => request('/api/quests', { method: 'POST', body: input });
export const unpinQuest = workPackageId => request(`/api/quests/${workPackageId}`, { method: 'DELETE' });
export const searchUsers = query => request(`/api/users/search?q=${encodeURIComponent(query)}`);
export const getHall = date => request(`/api/hall?date=${encodeURIComponent(date)}`);
export const addHallMember = userId => request('/api/hall/members', { method: 'POST', body: { userId } });
export const removeHallMember = userId => request(`/api/hall/members/${userId}`, { method: 'DELETE' });
