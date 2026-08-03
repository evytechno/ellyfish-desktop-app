import { getOrderFlags, getAuthFlags } from "./flags.js";

/** Escape a CSV cell (RFC-style quoting). */
function csvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\r\n");
}

function triggerDownload(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** @param {any[]} activities */
export function exportOrderActivitiesCsv(activities) {
  const headers = [
    "id",
    "when",
    "title",
    "user",
    "orderId",
    "orderPid",
    "orderTitle",
    "description",
    "flags",
  ];
  const rows = (activities || []).map((a) => ({
    id: a.id,
    when: a.createdAt ? new Date(a.createdAt).toISOString() : "",
    title: a.title || "",
    user: a.user?.name || "",
    orderId: a.order?.id || "",
    orderPid: a.order?.pId || "",
    orderTitle: a.order?.title || "",
    description: a.description || "",
    flags: getOrderFlags(a)
      .map((f) => f.label)
      .join(" | "),
  }));
  triggerDownload(`order-history-${stamp()}.csv`, rowsToCsv(headers, rows));
  return rows.length;
}

/** @param {any[]} authRows */
export function exportAuthActivitiesCsv(authRows) {
  const list = authRows || [];
  const headers = [
    "id",
    "when",
    "event",
    "userName",
    "userEmail",
    "ipAddress",
    "city",
    "locationLabel",
    "deviceName",
    "device",
    "browser",
    "os",
    "failReason",
    "flags",
  ];
  const rows = list.map((a) => ({
    id: a.id,
    when: a.createdAt ? new Date(a.createdAt).toISOString() : "",
    event: a.event || "",
    userName: a.user?.name || "",
    userEmail: a.userEmail || "",
    ipAddress: a.ipAddress || "",
    city: a.city || "",
    locationLabel: a.locationLabel || "",
    deviceName: a.deviceName || "",
    device: a.device || "",
    browser: a.browser || "",
    os: a.os || "",
    failReason: a.failReason || "",
    flags: getAuthFlags(a, list)
      .map((f) => f.label)
      .join(" | "),
  }));
  triggerDownload(`auth-history-${stamp()}.csv`, rowsToCsv(headers, rows));
  return rows.length;
}
