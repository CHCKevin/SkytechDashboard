// 錯誤訊息固定，不含 token、網址或來源回應內容，可安全顯示在前端。
// 唯一例外：validation（OpenProject 422）只轉傳 OpenProject 錯誤物件的 message 字串。
const messages = {
  unauthorized: 'OpenProject 驗證失敗，請確認 API token',
  forbidden: 'OpenProject 拒絕存取（權限不足）',
  not_found: 'OpenProject 找不到資源',
  validation: 'OpenProject 拒絕了這筆資料',
  rate_limited: 'OpenProject 請求過於頻繁，請稍後再試',
  upstream_error: 'OpenProject 伺服器錯誤',
  timeout: '連線 OpenProject 逾時',
  network: '無法連線到 OpenProject',
  unexpected_redirect: 'OpenProject 回應了未預期的重新導向',
  invalid_response: 'OpenProject 回應格式無法解讀',
  unsafe_link: 'OpenProject 連結指向設定以外的位置',
  unsafe_write: '不允許的 OpenProject 寫入操作',
  pagination_loop: 'OpenProject 分頁連結重複',
  pagination_incomplete: 'OpenProject 分頁資料不完整',
};

const statuses = { validation: 422, not_found: 404, forbidden: 403, timeout: 504, unsafe_write: 500 };

export class SourceError extends Error {
  constructor(code, detail) {
    super(code === 'validation' && typeof detail === 'string' && detail ? detail : messages[code]);
    this.name = 'SourceError';
    this.code = code;
  }
}

export function statusFor(code) {
  return statuses[code] ?? 502;
}

export function errorInfo(error) {
  return error instanceof SourceError
    ? { code: error.code, message: error.message }
    : { code: 'internal_error', message: '伺服器內部錯誤' };
}
