/**
 * Always label as Remarks. If body starts with "Price Terms:", strip that
 * prefix so print does not show a double heading.
 */
const TITLE_RE =
  /^\s*(?:<(?:p|div|h[1-6]|span)[^>]*>\s*)*(?:<strong>|<b>)?\s*Price\s*Terms\s*:?\s*(?:<\/(?:strong|b)>)?\s*(?:<\/(?:p|div|h[1-6]|span)>\s*)?/i;

export function splitRemarksTitle(value) {
  const raw = value == null ? "" : String(value);
  if (!raw.trim()) {
    return { label: "Remarks", body: "" };
  }

  if (TITLE_RE.test(raw)) {
    const body = raw.replace(TITLE_RE, "").replace(/^\s*(?:<br\s*\/?>\s*)+/i, "");
    return { label: "Remarks", body: body.trim() ? body : raw };
  }

  return { label: "Remarks", body: raw };
}
