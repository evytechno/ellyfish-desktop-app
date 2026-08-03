/**
 * Insert `newActivity` into grouped activities by date (YYYY-MM-DD).
 * Pure: does not mutate the input array; returns a new array.
 */
export function addActivityToGroupedActivities(groupedActivities, newActivity) {
  const formatDate = (dateStr) => new Date(dateStr).toISOString().split("T")[0];
  const activityDate = formatDate(newActivity.createdAt);
  const groups = (groupedActivities || []).map((g) => ({
    ...g,
    activities: [...(g.activities || [])],
  }));

  const group = groups.find((g) => formatDate(g.date) === activityDate);
  if (group) {
    group.activities.unshift(newActivity);
    group.activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    groups.unshift({
      date: activityDate,
      activities: [newActivity],
    });
  }
  return groups;
}
