/**
 * Sync history investigation state to the URL so admins can bookmark / share.
 * Uses replaceState to avoid polluting browser history on every keystroke.
 */

/** @param {URLSearchParams} params */
export function applyHistoryUrlParams(params, setters) {
  const {
    setChatType,
    setUserId,
    setSelectedFilter,
    setCustomStart,
    setCustomEnd,
    setActiveTab,
    setAuthEvent,
    setAuthEmail,
    setAuthIp,
    setAuthFilter,
    setAuthStart,
    setAuthEnd,
    setSortOrder,
    setAuthSortOrder,
  } = setters;

  if (params.get("chatType")) setChatType(params.get("chatType"));
  if (params.get("byUserId")) setUserId(Number(params.get("byUserId")));
  if (params.get("filter")) setSelectedFilter(params.get("filter"));
  if (params.get("start")) setCustomStart(params.get("start"));
  if (params.get("end")) setCustomEnd(params.get("end"));
  if (params.get("tab")) setActiveTab(params.get("tab"));
  if (params.get("event")) setAuthEvent(params.get("event"));
  if (params.get("email")) setAuthEmail(params.get("email"));
  if (params.get("ip")) setAuthIp(params.get("ip"));
  if (params.get("authFilter")) setAuthFilter(params.get("authFilter"));
  if (params.get("authStart")) setAuthStart(params.get("authStart"));
  if (params.get("authEnd")) setAuthEnd(params.get("authEnd"));
  if (params.get("sort") === "ASC" || params.get("sort") === "DESC") {
    setSortOrder(params.get("sort"));
  }
  if (params.get("authSort") === "ASC" || params.get("authSort") === "DESC") {
    setAuthSortOrder(params.get("authSort"));
  }
}

/** @param {Record<string, string|number|null|undefined>} state */
export function writeHistoryUrlParams(state) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  const set = (key, val) => {
    if (val === null || val === undefined || val === "") return;
    q.set(key, String(val));
  };

  set("tab", state.tab);
  set("filter", state.filter);
  set("start", state.start);
  set("end", state.end);
  set("byUserId", state.byUserId);
  set("chatType", state.chatType);
  set("q", state.q);
  set("sort", state.sort);
  set("event", state.event);
  set("email", state.email);
  set("ip", state.ip);
  set("authFilter", state.authFilter);
  set("authStart", state.authStart);
  set("authEnd", state.authEnd);
  set("authSort", state.authSort);

  const qs = q.toString();
  const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (next !== cur) {
    window.history.replaceState({}, "", next);
  }
}

export async function copyText(text) {
  const value = text == null ? "" : String(text);
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
