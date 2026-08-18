import { parseMeta } from "./format.js";

export function isAfterHours(dateVal) {
  if (!dateVal) return false;
  const h = new Date(dateVal).getHours();
  return h < 8 || h >= 20;
}

export function isDestructiveTitle(title) {
  const t = (title || "").toLowerCase();
  return t.includes("deleted") || t.includes("archived") || t.includes("permanently");
}

/** @returns {{ id: string, label: string, level: 'critical'|'warn'|'info'|'ok', hint?: string }[]} */
export function getAuthFlags(row, pageRows = []) {
  const flags = [];
  const ev = row?.event;
  const meta = parseMeta(row?.metadata);

  if (ev === "failed_login") {
    flags.push({
      id: "failed",
      label: "Failed login",
      level: "warn",
      hint: "Wrong credentials or rejected attempt",
    });
  }
  if (ev === "location_blocked") {
    flags.push({
      id: "location",
      label: "Location blocked",
      level: "critical",
      hint: "Attempt from outside allowed IPs/locations",
    });
  }
  if (ev === "time_blocked") {
    flags.push({
      id: "after_hours",
      label: "After hours",
      level: "warn",
      hint: "Outside allowed login time window",
    });
  }
  if (ev === "account_blocked") {
    flags.push({
      id: "locked",
      label: "Account locked",
      level: "critical",
      hint: "Login disabled — confirm if intentional",
    });
  }
  if (ev === "password_changed") {
    const byAdmin = meta?.changedBy === "admin";
    flags.push({
      id: byAdmin ? "admin_reset" : "pwd_change",
      label: byAdmin ? "Admin reset" : "Password changed",
      level: byAdmin ? "warn" : "info",
      hint: byAdmin
        ? "Password changed by an admin — verify with the user"
        : "User changed their own password",
    });
  }
  if (ev === "user_deleted") {
    flags.push({
      id: "user_deleted",
      label: "User deleted",
      level: "critical",
      hint: "Account removal — confirm authorization",
    });
  }
  if (ev === "user_created") {
    flags.push({
      id: "user_created",
      label: "User created",
      level: "info",
      hint: "New account provisioned",
    });
  }
  if (ev === "role_switched") {
    flags.push({
      id: "role_switch",
      label: "Role switch",
      level: "info",
      hint: meta?.selectedRole ? `Switched to ${meta.selectedRole}` : "Role context changed",
    });
  }
  if (ev === "user_impersonated") {
    flags.push({
      id: "user_switch",
      label: "User switch",
      level: "info",
      hint: meta?.targetUserName
        ? `Master viewed as ${meta.targetUserName}`
        : "Master switched into another user",
    });
  }
  if (ev === "login" && !row?.deviceName) {
    flags.push({
      id: "unknown_device",
      label: "Unknown device",
      level: "warn",
      hint: "No device name on successful login",
    });
  }
  if (ev === "login" && isAfterHours(row?.createdAt)) {
    flags.push({
      id: "after_hours",
      label: "Odd hours",
      level: "info",
      hint: "Successful login outside typical office hours",
    });
  }

  const key = row?.userEmail || row?.ipAddress;
  if (key && (ev === "failed_login" || ev === "location_blocked" || ev === "time_blocked")) {
    const repeats = pageRows.filter(
      (r) =>
        (r.userEmail === row.userEmail || r.ipAddress === row.ipAddress) &&
        ["failed_login", "location_blocked", "time_blocked", "account_blocked"].includes(r.event),
    ).length;
    if (repeats >= 2) {
      flags.push({
        id: "repeat",
        label: `Repeat ×${repeats}`,
        level: "critical",
        hint: "Multiple blocked/failed attempts for same actor/IP on this page",
      });
    }
  }

  if (!flags.length && ev === "login") {
    flags.push({ id: "ok", label: "OK", level: "ok", hint: "Successful login" });
  }
  return flags;
}

/** @returns {{ id: string, label: string, level: 'critical'|'warn'|'info'|'ok', hint?: string }[]} */
export function getOrderFlags(row) {
  const flags = [];
  const title = row?.title || "";
  const t = title.toLowerCase();

  if (isDestructiveTitle(title)) {
    flags.push({
      id: "destructive",
      label: "Destructive",
      level: "critical",
      hint: "Delete/archive action — confirm intent",
    });
  }
  if (t.includes("transfer")) {
    flags.push({
      id: "transfer",
      label: "Transfer",
      level: "warn",
      hint: "Order ownership/context transferred",
    });
  }
  if (t.includes("status")) {
    flags.push({
      id: "status",
      label: "Status",
      level: "info",
      hint: row?.data?.newStatus
        ? `${row.data.oldStatus || "?"} → ${row.data.newStatus}`
        : "Status updated",
    });
  }
  if (t.includes("payment")) {
    flags.push({
      id: "payment",
      label: "Payment",
      level: "info",
      hint: "Payment-related change",
    });
  }
  if (t.includes("assign")) {
    flags.push({
      id: "assign",
      label: "Assignment",
      level: "info",
      hint: "Assignee changed",
    });
  }
  if (t.includes("chat")) {
    flags.push({
      id: "chat",
      label: "Chat",
      level: "ok",
      hint: "Order conversation activity",
    });
  }
  if (t.includes("client")) {
    flags.push({
      id: "client",
      label: "Client",
      level: "info",
      hint: "Client link or details changed",
    });
  }
  if (isAfterHours(row?.createdAt)) {
    flags.push({
      id: "after_hours",
      label: "Odd hours",
      level: "warn",
      hint: "Activity outside typical office hours (8am–8pm)",
    });
  }
  return flags;
}

export function flagsHtml(flags) {
  if (!flags?.length) return `<span class="hx-muted">—</span>`;
  return `<div class="hx-flags">${flags
    .slice(0, 3)
    .map(
      (f) =>
        `<span class="hx-flag hx-flag--${f.level}" title="${(f.hint || f.label).replace(/"/g, "&quot;")}">${f.label}</span>`,
    )
    .join("")}${flags.length > 3 ? `<span class="hx-flag hx-flag--more">+${flags.length - 3}</span>` : ""}</div>`;
}

export function flagLevelRank(level) {
  return { critical: 4, warn: 3, info: 2, ok: 1 }[level] || 0;
}

export function flagFilterLabel(id) {
  const map = {
    failed: "Failed logins",
    location: "Location blocks",
    after_hours: "Odd / after hours",
    locked: "Account locks",
    repeat: "Repeat actors",
    unknown_device: "Unknown devices",
    admin_reset: "Admin resets",
    destructive: "Destructive",
    transfer: "Transfers",
    status: "Status changes",
    payment: "Payments",
    chat: "Chats",
    client: "Client",
    assign: "Assignments",
  };
  return map[id] || id;
}

export function buildAuthInsights(rows) {
  const list = rows || [];
  const failed = list.filter((r) => r.event === "failed_login").length;
  const location = list.filter((r) => r.event === "location_blocked").length;
  const time = list.filter((r) => r.event === "time_blocked").length;
  const locked = list.filter((r) => r.event === "account_blocked").length;
  const repeats = new Set();
  const byKey = {};
  for (const r of list) {
    if (!["failed_login", "location_blocked", "time_blocked", "account_blocked"].includes(r.event))
      continue;
    const k = r.userEmail || r.ipAddress || "";
    if (!k) continue;
    byKey[k] = (byKey[k] || 0) + 1;
    if (byKey[k] >= 2) repeats.add(k);
  }
  const unknownDevice = list.filter((r) => r.event === "login" && !r.deviceName).length;
  const adminResets = list.filter((r) => {
    if (r.event !== "password_changed") return false;
    return parseMeta(r.metadata)?.changedBy === "admin";
  }).length;

  return [
    {
      id: "failed",
      label: "Failed logins",
      count: failed,
      level: failed >= 3 ? "critical" : failed ? "warn" : "ok",
      event: "failed_login",
      action: "Review credential attacks or typos",
    },
    {
      id: "location",
      label: "Location blocks",
      count: location,
      level: location ? "critical" : "ok",
      event: "location_blocked",
      action: "Confirm remote access or tighten allowlist",
    },
    {
      id: "after_hours",
      label: "Time blocks",
      count: time,
      level: time ? "warn" : "ok",
      event: "time_blocked",
      action: "Adjust hours or grant emergency login",
    },
    {
      id: "locked",
      label: "Account locks",
      count: locked,
      level: locked ? "critical" : "ok",
      event: "account_blocked",
      action: "Check if online status / ban is intentional",
    },
    {
      id: "repeat",
      label: "Repeat actors",
      count: repeats.size,
      level: repeats.size ? "critical" : "ok",
      flag: "repeat",
      action: "Investigate same email/IP with multiple failures",
    },
    {
      id: "unknown_device",
      label: "Unknown devices",
      count: unknownDevice,
      level: unknownDevice ? "warn" : "ok",
      flag: "unknown_device",
      action: "Ask user to name trusted devices",
    },
    {
      id: "admin_reset",
      label: "Admin resets",
      count: adminResets,
      level: adminResets ? "warn" : "ok",
      flag: "admin_reset",
      action: "Verify password resets with the employee",
    },
  ].filter((i) => i.count > 0);
}

export function buildOrderInsights(rows) {
  const list = rows || [];
  const destructive = list.filter((r) => isDestructiveTitle(r.title)).length;
  const transfers = list.filter((r) => /transfer/i.test(r.title || "")).length;
  const status = list.filter((r) => /status/i.test(r.title || "")).length;
  const payments = list.filter((r) => /payment/i.test(r.title || "")).length;
  const oddHours = list.filter((r) => isAfterHours(r.createdAt)).length;
  return [
    {
      id: "destructive",
      label: "Destructive",
      count: destructive,
      level: destructive ? "critical" : "ok",
      flag: "destructive",
      action: "Confirm deletes/archives were intentional",
    },
    {
      id: "transfer",
      label: "Transfers",
      count: transfers,
      level: transfers ? "warn" : "ok",
      flag: "transfer",
      action: "Review ownership changes",
    },
    {
      id: "status",
      label: "Status changes",
      count: status,
      level: "info",
      flag: "status",
      action: "Track pipeline movement",
    },
    {
      id: "payment",
      label: "Payments",
      count: payments,
      level: "info",
      flag: "payment",
      action: "Cross-check payment activity",
    },
    {
      id: "after_hours",
      label: "Odd hours",
      count: oddHours,
      level: oddHours ? "warn" : "ok",
      flag: "after_hours",
      action: "Spot after-hours edits",
    },
  ].filter((i) => i.count > 0);
}

export function decisionTips(kind, row, authActivities = []) {
  const tips = [];
  if (kind === "auth") {
    const flags = getAuthFlags(row, authActivities);
    for (const f of flags) {
      if (f.hint && f.level !== "ok") tips.push(f.hint);
    }
    if (row?.event === "failed_login" || row?.event === "location_blocked") {
      tips.push("If legitimate, consider allowlisting IP/location or enabling emergency login.");
    }
    if (row?.event === "account_blocked") {
      tips.push("Check system online status and whether this user should regain access.");
    }
    if (row?.userEmail) tips.push("Use “Same email” below to see their recent auth trail.");
  } else {
    const flags = getOrderFlags(row);
    for (const f of flags) {
      if (f.hint && f.level !== "ok") tips.push(f.hint);
    }
    if (row?.order?.id) tips.push("Open the order to verify current status and assignees.");
  }
  return [...new Set(tips)].slice(0, 4);
}
