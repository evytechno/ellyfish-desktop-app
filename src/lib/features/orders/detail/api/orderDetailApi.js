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

// ── Samples ────────────────────────────────────────────────────────────────

export async function loadOrderSamples(orderId) {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/order/${orderId}`);
}

/** Step images for one movement (optional step filter). */
export async function loadOrderSampleStepImages(orderSampleId, step) {
  const q =
    step != null && String(step).trim() !== ""
      ? `?step=${encodeURIComponent(String(step).trim())}`
      : "";
  return authApiFetch(
    `${API_ROUTES.ORDER_SAMPLE}/${orderSampleId}/step-images${q}`,
  );
}

/** Allowed mediaType list (backend SAMPLE_MEDIA_TYPES). */
export async function loadOrderSampleMediaTypes() {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/media-types`);
}

export async function setOrderSampleFlag(orderId, isSample, sampleCompanyId) {
  const body = { isSample };
  if (isSample && sampleCompanyId != null) {
    body.sampleCompanyId = Number(sampleCompanyId);
  }
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/order/${orderId}/flag`, {
    method: "PUT",
    data: JSON.stringify(body),
  });
}

export async function setOrderSampleCompany(orderId, sampleCompanyId) {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/order/${orderId}/company`, {
    method: "PUT",
    data: JSON.stringify({ sampleCompanyId: Number(sampleCompanyId) }),
  });
}

export async function createOrderSample(payload) {
  return authApiFetch(API_ROUTES.ORDER_SAMPLE, {
    method: "POST",
    data: JSON.stringify(payload),
  });
}

export async function markOrderSampleReceived(id, { receivedDate, delayRemark } = {}) {
  const body = {};
  if (receivedDate) body.receivedDate = receivedDate;
  if (delayRemark) body.delayRemark = delayRemark;
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/${id}/received`, {
    method: "PATCH",
    data: JSON.stringify(body),
  });
}

export async function deleteOrderSample(id) {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/${id}`, { method: "DELETE" });
}

export async function updateOrderSample(id, payload) {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/${id}`, {
    method: "PUT",
    data: JSON.stringify(payload),
  });
}

/** Change movement status; optional image-step event + files in one request. */
export async function changeOrderSampleStatus(id, payload = {}, files = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  for (const file of files || []) {
    if (file) form.append("images", file);
  }
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/${id}/status`, {
    method: "PATCH",
    data: form,
  });
}

export async function approveOrderSample(orderId, note) {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/order/${orderId}/approve`, {
    method: "POST",
    data: JSON.stringify({ note: note || undefined }),
  });
}

export async function rejectOrderSample(orderId, note) {
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/order/${orderId}/reject`, {
    method: "POST",
    data: JSON.stringify({ note: note || undefined }),
  });
}

export async function approveSampleDelayRemark(eventId, reply) {
  return authApiFetch(
    `${API_ROUTES.ORDER_SAMPLE}/events/${eventId}/approve-delay`,
    {
      method: "POST",
      data: JSON.stringify(reply != null && String(reply).trim() !== "" ? { reply: String(reply).trim() } : {}),
    },
  );
}

export async function returnSampleDelayRemark(eventId, reply) {
  return authApiFetch(
    `${API_ROUTES.ORDER_SAMPLE}/events/${eventId}/return-delay`,
    {
      method: "POST",
      data: JSON.stringify(reply != null && String(reply).trim() !== "" ? { reply: String(reply).trim() } : {}),
    },
  );
}

export async function createOrderSampleEvent(
  sampleId,
  { note, type, status, delayRemark, mediaType } = {},
  files = [],
) {
  const form = new FormData();
  if (note) form.append("note", note);
  if (type) form.append("type", type);
  if (status) form.append("status", status);
  if (delayRemark) form.append("delayRemark", delayRemark);
  if (mediaType) form.append("mediaType", mediaType);
  for (const file of files || []) {
    if (file) form.append("images", file);
  }
  return authApiFetch(`${API_ROUTES.ORDER_SAMPLE}/events/${sampleId}`, {
    method: "POST",
    data: form,
  });
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
