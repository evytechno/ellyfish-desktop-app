import { authApiFetch } from "$lib/api/client";
import { API_ROUTES } from "$lib/constants/apiRoutes";

/** Wave 1: core order (fast — no heavy joins). */
export async function fetchOrderCore(orderId) {
  return authApiFetch(`${API_ROUTES.ORDER}/${orderId}/basic`);
}

/**
 * Wave 2: heavy relations in parallel.
 * Returns Promise.allSettled results:
 * [chats, attachments, reminders, clients, contacts, fullOrder, childOrders]
 */
export async function fetchOrderRelations(orderId) {
  return Promise.allSettled([
    authApiFetch(`${API_ROUTES.ORDER_CHAT}?orderId=${orderId}`),
    authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}?orderId=${orderId}`),
    authApiFetch(`${API_ROUTES.ORDER_REMINDER}?orderId=${orderId}`),
    authApiFetch(`${API_ROUTES.ORDER_CLIENT}?orderId=${orderId}`),
    authApiFetch(`${API_ROUTES.ORDER_CONTACT}/by-order/${orderId}`),
    authApiFetch(`${API_ROUTES.ORDER}/${orderId}`).then((d) => d),
    authApiFetch(`${API_ROUTES.ORDER}?status=all&parentId=${orderId}&limit=50`).catch(() => ({
      data: [],
    })),
  ]);
}

/** Full order (used e.g. for PI/WO/TI refresh). */
export async function fetchOrderFull(orderId) {
  return authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
}

export async function updateOrder(orderId, payload) {
  return authApiFetch(API_ROUTES.ORDER + "/" + orderId, {
    method: "PUT",
    data: JSON.stringify(payload),
  });
}

export async function deleteOrder(orderId) {
  return authApiFetch(API_ROUTES.ORDER + "/" + orderId, { method: "DELETE" });
}

export async function updatePinStatus(orderId, pinStatus) {
  return updateOrder(orderId, { pinStatus });
}

// ── Chats ──────────────────────────────────────────────────────────────────

export async function createOrderChat(orderId, { type, message }) {
  return authApiFetch(API_ROUTES.ORDER_CHAT, {
    method: "POST",
    data: JSON.stringify({ orderId: Number(orderId), type, message }),
  });
}

export async function deleteOrderChat(id) {
  return authApiFetch(`${API_ROUTES.ORDER_CHAT}/${id}`, { method: "DELETE" });
}

// ── Reminders ──────────────────────────────────────────────────────────────

export async function createOrderReminder(orderId, { reminderTime, message }) {
  return authApiFetch(API_ROUTES.ORDER_REMINDER, {
    method: "POST",
    data: JSON.stringify({ orderId: Number(orderId), reminderTime, message }),
  });
}

export async function deleteOrderReminder(id) {
  return authApiFetch(`${API_ROUTES.ORDER_REMINDER}/${id}`, { method: "DELETE" });
}

// ── Attachments ────────────────────────────────────────────────────────────

export async function createOrderAttachment(orderId, { title, link, files }) {
  const payload = new FormData();
  payload.append("title", title);
  payload.append("link", link);
  if (files && files.length) files.forEach((f) => payload.append("file", f));
  payload.append("orderId", Number(orderId));
  return authApiFetch(API_ROUTES.ORDER_ATTACHMENT, {
    method: "POST",
    data: payload,
  });
}

export async function deleteOrderAttachment(id) {
  return authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}/${id}`, { method: "DELETE" });
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function loadOrderQueries(orderId) {
  return authApiFetch(`${API_ROUTES.QUERY}/order/${orderId}`);
}

export async function createOrderQuery({ subject, description, orderId }) {
  return authApiFetch(`${API_ROUTES.QUERY}`, {
    method: "POST",
    data: JSON.stringify({
      subject,
      description: (description || "").trim() || null,
      orderId: Number(orderId),
    }),
  });
}

export async function updateOrderQuery(queryId, { subject, description }) {
  return authApiFetch(`${API_ROUTES.QUERY}/${queryId}`, {
    method: "PATCH",
    data: JSON.stringify({
      subject: (subject || "").trim(),
      description: (description || "").trim() || null,
    }),
  });
}

// ── Feedbacks ──────────────────────────────────────────────────────────────

export async function loadOrderFeedbacks(orderId) {
  return authApiFetch(`${API_ROUTES.ORDER_FEEDBACK}/order/${orderId}`);
}

export async function createOrderFeedback({
  orderId,
  satisfactionLevel,
  reason,
  remarks,
  triggerStatus,
}) {
  return authApiFetch(API_ROUTES.ORDER_FEEDBACK, {
    method: "POST",
    data: JSON.stringify({
      orderId,
      feedbackType: triggerStatus ? "TRIGGERED" : "FREE",
      triggerStatus: triggerStatus || null,
      satisfactionLevel,
      reason,
      remarks,
    }),
  });
}

export async function deleteOrderFeedback(id) {
  return authApiFetch(`${API_ROUTES.ORDER_FEEDBACK}/${id}`, { method: "DELETE" });
}

// ── Visits ─────────────────────────────────────────────────────────────────

export async function loadOrderVisits(orderId) {
  return authApiFetch(`${API_ROUTES.CLIENT_VISIT}?orderId=${orderId}&limit=50`);
}

export async function createOrderVisit(payload) {
  return authApiFetch(API_ROUTES.CLIENT_VISIT, { method: "POST", data: payload });
}

// ── Contacts ───────────────────────────────────────────────────────────────

export async function linkOrderContact(orderId, clientContactId) {
  return authApiFetch(API_ROUTES.ORDER_CONTACT, {
    method: "POST",
    data: JSON.stringify({ orderId, clientContactId }),
  });
}

export async function unlinkOrderContact(orderContactId) {
  return authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${orderContactId}`, { method: "DELETE" });
}

export async function setPrimaryOrderContact(orderContactId) {
  return authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${orderContactId}/set-primary`, {
    method: "PATCH",
  });
}

// ── Child orders / components ──────────────────────────────────────────────

export async function createChildOrder(payload) {
  return authApiFetch(API_ROUTES.ORDER + "/children", {
    method: "POST",
    data: JSON.stringify(payload),
  });
}

export async function updateChildOrder(childOrderId, payload) {
  return authApiFetch(API_ROUTES.ORDER + "/" + childOrderId, {
    method: "PUT",
    data: JSON.stringify(payload),
  });
}

export async function deleteChildOrder(id) {
  return authApiFetch(`${API_ROUTES.ORDER}/${id}`, { method: "DELETE" });
}

/** Legacy order-client unlink (ORDER_CLIENT). */
export async function deleteOrderClient(id) {
  return authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${id}`, { method: "DELETE" });
}
