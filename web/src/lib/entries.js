// 工時列下方的小字：活動與備註。備註保留換行（畫面用 white-space: pre-line 顯示），
// 只統一 CRLF 並去掉前後空白行，避免多行備註串成一行難以閱讀。
export function entryMeta({ activityName, comment }) {
  const note = (comment ?? '').replace(/\r\n?/g, '\n').trim();
  return [activityName, note].filter(Boolean).join(' · ');
}
