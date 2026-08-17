export function maskMobile(m) {
  if (!m) return "—";
  const s = String(m).replace(/\s/g, "");
  if (s.length <= 4) return s;
  return "•".repeat(s.length - 4) + s.slice(-4);
}

/** Order `#pId — title` plus client name, or masked mobile, for the queries-list ORDER column. */
export function queryOrderColumn(order) {
  if (!order?.id) return null;
  const pIdLabel = order.pId != null ? `#${order.pId}` : "";
  const orderTitle = (order.title || "").trim();
  const heading = [pIdLabel, orderTitle].filter(Boolean).join(" — ");
  const company = (order.companyName || order.client?.name || order.company || "").trim();
  const rawName = (order.clientName || "").trim();
  const rawMobile = (order.clientMobile || "").trim();
  const client = rawName
    ? rawName
    : rawMobile
      ? rawMobile.includes("•")
        ? rawMobile
        : maskMobile(rawMobile)
      : "";
  const titleParts = [heading, company, client].filter(
    (part, i, arr) => part && arr.indexOf(part) === i,
  );
  return { heading, client, company, title: titleParts.join(" · ") };
}

export function maskEmail(e) {
  if (!e) return "—";
  const [user, domain] = String(e).split("@");
  if (!domain) return e;
  const visible =
    user.length > 2
      ? user[0] + "•".repeat(user.length - 2) + user.slice(-1)
      : user[0] + "•";
  return `${visible}@${domain}`;
}

const ROLE_LABELS = new Set(["Telecaller", "Tech", "Senior Tech", "User", "Team Member", "Manager"]);

export function isMaskedRoleLabel(name) {
  return ROLE_LABELS.has(name);
}

/**
 * Query-page name masking: role users hide other people's names as role
 * labels; master privacy toggles and admin queryAccess flags hide telecaller /
 * tech / tech helper names.
 */
export function queryNamePrivacy(currentUser, privacy = {}) {
  const isMaster = currentUser?.role === "master";
  return {
    telecaller: isMaster
      ? !!privacy.telecaller
      : currentUser?.queryAccessTelecaller === false,
    tech: isMaster
      ? !!privacy.tech
      : currentUser?.queryAccessTech === false,
    techHelper: isMaster
      ? !!privacy.techHelper
      : currentUser?.queryAccessTechHelper === false,
  };
}

export function maskQueryPersonName(person, currentUser, privacy = {}) {
  if (!person) return "—";
  const name = person.name;
  const sub = person.subRole ?? (person.role === "telecaller" || person.role === "tech" || person.role === "tech_helper" ? person.role : null);
  if (!name) return "—";

  const isRoleUser = currentUser?.role === "user";
  const flags = queryNamePrivacy(currentUser, privacy);
  const isOwn =
    (person.id != null && person.id === currentUser?.id) ||
    name === currentUser?.name;

  if (isRoleUser && !isOwn) {
    if (sub === "telecaller") return "Telecaller";
    if (sub === "tech_helper") return "Senior Tech";
    if (sub === "tech") return "Tech";
    return "User";
  }
  if (!isOwn && flags.telecaller && sub === "telecaller") return "Telecaller";
  if (!isOwn && flags.tech && sub === "tech") return "Tech";
  if (!isOwn && flags.techHelper && sub === "tech_helper") return "Senior Tech";

  return maskAssignedName(person, currentUser) || name;
}

/**
 * Returns the display name for a user based on the viewer's role/subRole.
 * Role users never see another person's real name.
 */
export function maskAssignedName(assignedUser, currentUser) {
  if (!assignedUser) return "";
  if (!currentUser) return assignedUser?.name ?? "";
  if (["master", "admin", "manager"].includes(currentUser.role)) {
    return assignedUser?.name ?? "";
  }
  const isOwn =
    (assignedUser.id != null && assignedUser.id === currentUser.id) ||
    (assignedUser.name && assignedUser.name === currentUser.name);
  if (isOwn) return assignedUser?.name ?? "";
  const sub = assignedUser.subRole;
  if (sub === "telecaller") return "Telecaller";
  if (sub === "tech") return "Tech";
  if (sub === "tech_helper") return "Senior Tech";
  return "User";
}

/**
 * For activity/chat/file/reminder authors:
 * - admin/master/manager → always see real name
 * - user role → only see their own name; others show as "User"
 */
export function maskAuthorName(authorUser, currentUser) {
  if (!currentUser) return authorUser?.name ?? '';
  if (['master', 'admin', 'manager'].includes(currentUser.role)) return authorUser?.name ?? '';
  if (currentUser.role === 'user') {
    return authorUser?.id === currentUser.id ? (authorUser?.name ?? '') : 'User';
  }
  return authorUser?.name ?? '';
}
