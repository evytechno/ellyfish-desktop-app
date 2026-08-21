/** Mirrors backend `order-live-access` for board / excel / quick-chat UX. */

export function getOrderActiveUserId(order) {
  if (!order) return null;
  if (order.activeUserId != null) return Number(order.activeUserId);
  const ids = (order.assignedUsers || []).map((u) => Number(u.id)).filter(Boolean);
  if (!ids.length) return null;
  return ids[0];
}

export function isStaffOrderRole(role) {
  return role === "master" || role === "admin" || role === "manager";
}

/** role=user assigned but not the live Active owner */
export function isOldOrderAssignee(user, order) {
  if (!user || !order) return false;
  if (isStaffOrderRole(user.role)) return false;
  if (user.role !== "user") return false;
  if (order._oldAssigneeView) return true;
  const assigned = (order.assignedUsers || []).some(
    (u) => Number(u.id) === Number(user.id),
  );
  if (!assigned) return false;
  const activeId = getOrderActiveUserId(order);
  return activeId != null && Number(activeId) !== Number(user.id);
}

export function canMutateOrder(user, order) {
  if (!user) return false;
  if (isStaffOrderRole(user.role)) return true;
  return !isOldOrderAssignee(user, order);
}
