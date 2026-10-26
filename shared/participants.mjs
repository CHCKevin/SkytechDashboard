export function collectParticipants(author, assignee, activityAuthors = []) {
  const people = new Map();
  const entries = [author, assignee, ...activityAuthors];
  entries.forEach((person, index) => {
    if (!person) return;
    const id = person.id == null ? null : String(person.id);
    const key = id === null ? `unknown:${index}` : `user:${id}`;
    const name = typeof person.name === 'string' && person.name.trim()
      ? person.name.trim() : '未知使用者';
    if (!people.has(key)) people.set(key, { key, id, name });
  });
  return [...people.values()];
}
