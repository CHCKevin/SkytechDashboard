import { createParticipantsLoader } from './activities.mjs';
import { createClient } from './openproject/client.mjs';
import { createSnapshotLoader } from './snapshot.mjs';

// 與示例來源相同的介面；token 只交給 client，不往外傳。
export function createLiveSource({ baseUrl, apiToken }) {
  const client = createClient({ baseUrl, apiToken });
  const snapshots = createSnapshotLoader({ client, baseUrl });
  const participants = createParticipantsLoader({ client });
  return { getSnapshot: snapshots.getSnapshot, getParticipants: participants.getParticipants };
}
