export function eventBadgeClass(event) {
  switch (event) {
    case "login":
      return "hx-badge hx-badge--ok";
    case "logout":
      return "hx-badge hx-badge--muted";
    case "failed_login":
    case "account_blocked":
    case "user_deleted":
      return "hx-badge hx-badge--danger";
    case "token_refresh":
      return "hx-badge hx-badge--info";
    case "location_blocked":
    case "time_blocked":
      return "hx-badge hx-badge--warn";
    case "password_changed":
    case "profile_updated":
    case "user_created":
      return "hx-badge hx-badge--primary";
    default:
      return "hx-badge";
  }
}

export function eventLabel(event) {
  return event?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "-";
}

export function eventIcon(event) {
  const map = {
    login: "ti-login-2",
    logout: "ti-logout",
    failed_login: "ti-x",
    token_refresh: "ti-refresh",
    location_blocked: "ti-map-pin-off",
    time_blocked: "ti-clock-off",
    account_blocked: "ti-lock",
    password_changed: "ti-key",
    profile_updated: "ti-user-edit",
    user_created: "ti-user-plus",
    user_deleted: "ti-user-minus",
    role_switched: "ti-switch-horizontal",
    user_impersonated: "ti-user-switch",
  };
  return map[event] || "ti-activity";
}

export function activityIcon(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("chat")) return "ti-message";
  if (t.includes("attachment") || t.includes("file")) return "ti-paperclip";
  if (t.includes("reminder")) return "ti-bell";
  if (t.includes("status")) return "ti-flag";
  if (t.includes("assign")) return "ti-users";
  if (t.includes("client") || t.includes("contact")) return "ti-address-book";
  if (t.includes("pin")) return "ti-pin";
  return "ti-activity";
}

export function formatWhen(val) {
  if (!val) return { absolute: "-", relative: "" };
  const d = new Date(val);
  const absolute = d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  let relative = "";
  if (mins < 1) relative = "Just now";
  else if (mins < 60) relative = `${mins}m ago`;
  else if (mins < 1440) relative = `${Math.floor(mins / 60)}h ago`;
  else if (mins < 10080) relative = `${Math.floor(mins / 1440)}d ago`;
  else relative = absolute;
  return { absolute, relative };
}

export function parseMeta(val) {
  try {
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}
