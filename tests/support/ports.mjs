// fetch 規範封鎖的埠號（只列 1024 以上；系統配發的臨時埠號只會落在這一段）。
// Windows 的臨時埠號範圍可能包含這些值，fetch 遇到時會直接以 "bad port" 拒絕連線，造成測試偶發失敗。
const FETCH_BLOCKED = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export function isFetchBlocked(port) {
  return FETCH_BLOCKED.has(port);
}

// 讓伺服器聽在系統配發、且 fetch 可連線的埠號上；拿到被封鎖的埠號就關掉重來。
export async function listenFetchable(server, host = '127.0.0.1') {
  for (;;) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const { port } = server.address();
    if (!isFetchBlocked(port)) return port;
    await new Promise(resolve => server.close(resolve));
  }
}
