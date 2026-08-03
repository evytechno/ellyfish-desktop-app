/**
 * Append date range params to a URLSearchParams and return a display label.
 * @param {string} selFilter
 * @param {string|null} custStart
 * @param {string|null} custEnd
 * @param {URLSearchParams} q
 * @returns {string}
 */
export function buildDateParams(selFilter, custStart, custEnd, q) {
  let startDateFilter;
  let endDateFilter = new Date();
  const formatDisplayDate = (d) =>
    d.toLocaleDateString("en-CA", { day: "2-digit", month: "short", year: "numeric" });
  const formatLocalDate = (d) => d.toLocaleDateString("en-CA");
  let label = "All time";

  if (selFilter === "last7days") {
    startDateFilter = new Date();
    startDateFilter.setDate(startDateFilter.getDate() - 7);
    label = `${formatDisplayDate(startDateFilter)} → ${formatDisplayDate(new Date())}`;
  } else if (selFilter === "last30days") {
    startDateFilter = new Date();
    startDateFilter.setDate(startDateFilter.getDate() - 30);
    label = `${formatDisplayDate(startDateFilter)} → ${formatDisplayDate(new Date())}`;
  } else if (selFilter === "today") {
    startDateFilter = new Date();
    startDateFilter.setHours(0, 0, 0, 0);
    endDateFilter.setHours(23, 59, 59, 999);
    label = "Today";
  } else if (selFilter === "custom" && custStart && custEnd) {
    q.append("startDate", custStart);
    q.append("endDate", custEnd);
    label = `${formatDisplayDate(new Date(custStart))} → ${formatDisplayDate(new Date(custEnd))}`;
  }

  if (startDateFilter && selFilter !== "custom") {
    q.append("startDate", formatLocalDate(startDateFilter));
    q.append("endDate", formatLocalDate(endDateFilter));
  }
  return label;
}
