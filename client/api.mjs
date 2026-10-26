async function getJson(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
}

export const fetchSnapshot = () => getJson('/api/snapshot');
export const fetchParticipants = id => getJson(`/api/work-packages/${encodeURIComponent(id)}/participants`);
