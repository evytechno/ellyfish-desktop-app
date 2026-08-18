import { canSeeSalesUserName } from "$lib/utils/auth";

export function gcRoleLabel(subRole, role) {
  if (subRole === "telecaller") return "Telecaller";
  if (subRole === "tech") return "Tech";
  if (subRole === "tech_helper") return "Sr. Tech";
  if (role === "manager") return "Manager";
  if (role === "admin") return "Admin";
  if (role === "master") return "Master";
  return "Member";
}

/**
 * Same masking as backend group-chat.service maskName().
 * Restricted admins (allowedSalesUserIds) see role labels, not real names.
 */
export function resolveGroupChatSenderLabel(viewer, msg) {
  const senderId = msg?.senderId ?? msg?.userId;
  const senderRole = msg?.senderRole ?? msg?.role;
  const senderSubRole = msg?.senderSubRole ?? msg?.subRole;
  const nameReal = msg?.senderNameReal ?? msg?.nameReal ?? msg?.name;
  const nameMasked = msg?.senderNameMasked ?? msg?.nameMasked ?? gcRoleLabel(senderSubRole, senderRole);

  if (!viewer) return nameMasked;
  if (senderId != null && Number(senderId) === Number(viewer.id)) {
    return nameReal || "You";
  }

  const canSee = canSeeSalesUserName(viewer, senderId);
  if (senderRole === "master") return canSee ? "Master" : "Admin";
  if (canSee && nameReal) return `${nameReal} (${gcRoleLabel(senderSubRole, senderRole)})`;
  return nameMasked;
}
