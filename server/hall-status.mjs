// 大廳狀態判定：請假優先，其次看當日是否有任何工時。
export function memberStatus(entries, leaveWorkPackageId) {
  if (entries.some(entry => entry.workPackageId === leaveWorkPackageId)) return 'resting';
  return entries.length ? 'working' : 'idle';
}

// 把成員名單與當日工時組成大廳狀態；成員維持加入順序，不屬於任何成員的工時會被忽略。
export function buildHall(date, members, entries, leaveWorkPackageId) {
  const byUser = new Map(members.map(member => [member.userId, []]));
  for (const entry of entries) byUser.get(entry.userId)?.push(entry);
  return {
    date,
    members: members.map(({ userId, name }) => {
      const own = byUser.get(userId);
      return {
        userId, name,
        status: memberStatus(own, leaveWorkPackageId),
        totalHours: Math.round(own.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100,
        entries: own.map(({ id, workPackageId, workPackageSubject, hours, activityName, comment }) =>
          ({ id, workPackageId, workPackageSubject, hours, activityName, comment })),
      };
    }),
  };
}
