import { writable, get } from "svelte/store";
import { goto } from "$app/navigation";
import Swal from "sweetalert2";
import { authApiFetch } from "$lib/api/client";
import { API_ROUTES } from "$lib/constants/apiRoutes";
import { errorHandle } from "$lib/utils/errorHandle";
import { checkAuth } from "$lib/utils/auth";
import { statusNamesStore } from "$lib/stores/statusNames";
import { usersAllStore, categoriesAllStore } from "$lib/stores/dataStores";
import {
  maskAssignedName as _maskAssignedName,
  maskAuthorName as _maskAuthorName,
} from "$lib/utils/maskUser";
import { STATUSES, FEEDBACK_TRIGGER_STATUSES } from "../constants.js";
import { closeModalManual, closeOffcanvas } from "../lib/dom.js";
import { addActivityToGroupedActivities as mergeActivity } from "../lib/activities.js";
import {
  fetchOrderCore,
  fetchOrderRelations,
  fetchOrderFull as fetchOrderFullApi,
  updateOrder as updateOrderApi,
  deleteOrder as deleteOrderApi,
  createOrderChat as createOrderChatApi,
  deleteOrderChat as deleteOrderChatApi,
  createOrderReminder as createOrderReminderApi,
  deleteOrderReminder as deleteOrderReminderApi,
  createOrderAttachment as createOrderAttachmentApi,
  deleteOrderAttachment as deleteOrderAttachmentApi,
  loadOrderQueries as loadOrderQueriesApi,
  createOrderQuery as createOrderQueryApi,
  updateOrderQuery as updateOrderQueryApi,
  loadOrderFeedbacks as loadOrderFeedbacksApi,
  createOrderFeedback as createOrderFeedbackApi,
  deleteOrderFeedback as deleteOrderFeedbackApi,
  loadOrderVisits as loadOrderVisitsApi,
  createOrderVisit as createOrderVisitApi,
  linkOrderContact as linkOrderContactApi,
  unlinkOrderContact as unlinkOrderContactApi,
  setPrimaryOrderContact as setPrimaryOrderContactApi,
  createChildOrder as createChildOrderApi,
  updateChildOrder as updateChildOrderApi,
  deleteChildOrder as deleteChildOrderApi,
  deleteOrderClient as deleteOrderClientApi,
} from "../api/orderDetailApi.js";

/**
 * Store-based composable for the Order Detail view (Svelte 3 — no runes).
 *
 * `getOrderId` must be a function returning the *current* order id, so that
 * `afterNavigate`/reactive callers always read the latest id even though this
 * factory is only invoked once per component instance.
 */
export function createOrderDetail({ getOrderId }) {
  // ── Core state ─────────────────────────────────────────────────────────
  const order = writable(null);
  const loadingData = writable(true);
  const relationsLoading = writable(true);
  const errorMessage = writable("");
  const loading = writable(false);
  const formErrors = writable({});
  const users = writable([]);
  const categories = writable([]);
  const currentUser = writable(null);

  // ── Edit form ──────────────────────────────────────────────────────────
  const title = writable("");
  const category = writable("");
  const orderDate = writable(null);
  const startDate = writable(null);
  const deadlineDate = writable(null);
  const price = writable(null);
  const currency = writable("INR");
  const priceTerms = writable(null);
  const source = writable(null);
  const description = writable("");
  const company = writable("");
  const gstNumber = writable("");
  const workOrderNumber = writable("");
  const importStatus = writable("false");
  const selectedUsers = writable([]);
  const userSearch = writable("");
  const orderTitle = writable("");
  const orderWorkOrderNumber = writable("");
  const childOrderId = writable(null);

  // ── UI ─────────────────────────────────────────────────────────────────
  const activeTab = writable("Activity");
  const activeDate = writable(new Date().toISOString().split("T")[0]);
  const orderInfoExpanded = writable(false);
  const showChangeClientModal = writable(false);
  const showNewClientModal = writable(false);
  const showAddContactModal = writable(false);
  const showEditClientModal = writable(false);
  const piwotiOpen = writable(false);
  const piwotiType = writable("PI");
  const showImages = writable([]);
  const showImagesStart = writable(0);

  // ── Queries ────────────────────────────────────────────────────────────
  const orderQueries = writable([]);
  const orderQueriesLoading = writable(false);
  const showQueryModal = writable(false);
  const querySubject = writable("");
  const queryDescription = writable("");
  const raisingQuery = writable(false);
  const queryError = writable("");
  const showEditQueryModal = writable(false);
  const editingQuery = writable(null);
  const editQuerySubject = writable("");
  const editQueryDescription = writable("");
  const editingQueryLoading = writable(false);
  const editQueryError = writable("");

  // ── Visits ─────────────────────────────────────────────────────────────
  const orderVisits = writable([]);
  const showVisitListModal = writable(false);
  const showVisitModal = writable(false);
  const visitLoading = writable(false);
  const visitError = writable("");
  const visitFormErrors = writable({});
  const visitType = writable("outgoing");
  const visitDate = writable(new Date().toISOString().slice(0, 10));
  const visitStartTime = writable("");
  const visitEndTime = writable("");
  const visitTransport = writable("");
  const visitPurpose = writable("");
  const visitOutcome = writable("");
  const visitNextFollowUp = writable("");
  const visitFeedback = writable("");
  const visitNotes = writable("");
  const visitTerms = writable("");
  const visitClientContacts = writable([]);
  const visitSelectedContactIds = writable([]);
  const visitAttendees = writable([]);
  const visitCompanies = writable([]);
  const visitCompanyId = writable("");

  // ── Feedback ───────────────────────────────────────────────────────────
  const showFeedbackModal = writable(false);
  const feedbackTriggerStatus = writable(null);
  const feedbackLoading = writable(false);
  const feedbacks = writable([]);
  const loadingFeedbacks = writable(false);
  const pendingStatusAfterFeedback = writable(null);

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Merge a new activity into `order.groupedActivities` and persist the update to the store. */
  function addActivityToGroupedActivities(newActivity) {
    let updatedGrouped;
    order.update((o) => {
      if (!o) return o;
      updatedGrouped = mergeActivity(o.groupedActivities || [], newActivity);
      return { ...o, groupedActivities: updatedGrouped };
    });
    return updatedGrouped;
  }

  function maskAssignedName(assignedUser) {
    return _maskAssignedName(assignedUser, get(currentUser));
  }

  function maskAuthorName(authorUser) {
    return _maskAuthorName(authorUser, get(currentUser));
  }

  const closeModalMenual = closeModalManual;

  // ── Load order / lookups ───────────────────────────────────────────────

  async function loadOrder() {
    const orderId = getOrderId();
    if (!orderId) return;
    currentUser.set(checkAuth());
    loadingData.set(true);
    relationsLoading.set(true);
    order.set(null);
    orderQueries.set([]);
    selectedUsers.set([]);
    try {
      // ── Wave 1: Core order only (fast — no heavy joins) ──────────────
      const data = await fetchOrderCore(orderId);
      order.set({
        ...data,
        orderChats: [],
        orderAttachments: [],
        orderReminders: [],
        orderClients: data.orderClients ?? [],
        orderContacts: [],
        orderActivities: [],
        groupedActivities: [],
        childOrders: [],
        invoices: data.invoices ?? [],
        orderPayments: data.orderPayments ?? [],
        workOrders: data.workOrders ?? [],
      });
      // populate form fields immediately
      title.set(data?.title);
      category.set(data?.category);
      orderDate.set(data?.orderDate ? new Date(data.orderDate).toISOString().substring(0, 10) : "");
      startDate.set(data?.startDate ? new Date(data.startDate).toISOString().substring(0, 10) : "");
      deadlineDate.set(
        data?.deadlineDate ? new Date(data.deadlineDate).toISOString().substring(0, 10) : "",
      );
      price.set(data?.price);
      priceTerms.set(data?.priceTerms);
      currency.set(data?.currency);
      source.set(data?.source);
      description.set(data?.description);
      gstNumber.set(data?.gstNumber);
      workOrderNumber.set(data?.workOrderNumber);
      importStatus.set(data?.importStatus);
      company.set(data?.company);
      const su = [];
      data?.assignedUsers?.forEach((user) => {
        if (user?.role == "user") su.push(user?.id);
      });
      selectedUsers.set(su);
      loadingData.set(false); // page renders now — user sees content
      loadOrderVisits();

      // ── Wave 2: Load all heavy relations in parallel ─────────────────
      const [chats, attachments, reminders, clients, contacts, activities, childOrders] =
        await fetchOrderRelations(orderId);
      order.update((o) => {
        if (!o) return o;
        const next = { ...o };
        if (chats.status === "fulfilled") {
          const raw = Array.isArray(chats.value) ? chats.value : (chats.value?.data ?? []);
          next.orderChats = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        if (attachments.status === "fulfilled") {
          const raw = Array.isArray(attachments.value)
            ? attachments.value
            : (attachments.value?.data ?? []);
          next.orderAttachments = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        if (reminders.status === "fulfilled") {
          const raw = Array.isArray(reminders.value)
            ? reminders.value
            : (reminders.value?.data ?? []);
          next.orderReminders = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        if (clients.status === "fulfilled") {
          const raw = Array.isArray(clients.value) ? clients.value : (clients.value?.data ?? []);
          next.orderClients = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        if (contacts.status === "fulfilled") {
          next.orderContacts = Array.isArray(contacts.value)
            ? contacts.value
            : (contacts.value?.data ?? []);
        }
        if (activities.status === "fulfilled") {
          // full order response has groupedActivities + childOrders + invoices
          const full = activities.value;
          next.groupedActivities = full.groupedActivities ?? [];
          next.childOrders = full.childOrders ?? [];
          next.invoices = full.invoices ?? [];
          next.orderLabels = full.orderLabels ?? [];
        }
        return next;
      });
    } catch (err) {
      errorMessage.set("Failed to load order data.");
      loadingData.set(false);
    } finally {
      relationsLoading.set(false);
    }
    getAllCategories();
    loadOrderQueries();
  }

  async function getAllCategories() {
    const cached = get(categoriesAllStore);
    if (cached && cached.length > 0 && typeof cached[0] === "object" && cached[0].label) {
      categories.set(cached);
      loadingData.set(false);
      return;
    }
    loadingData.set(true);
    try {
      const data = await authApiFetch(API_ROUTES.CATEGORY + "/all");
      const mapped = data.map((parent) => ({
        label: parent.name,
        options:
          parent.children && parent.children.length > 0
            ? parent.children.map((c) => c.name)
            : [parent.name],
      }));
      categories.set(mapped);
      categoriesAllStore.set(mapped);
    } catch (err) {
      errorMessage.set("Failed to load category data.");
    } finally {
      setTimeout(() => {
        loadingData.set(false);
      }, 500);
    }
  }

  async function loadUsers() {
    try {
      const cached = get(usersAllStore);
      if (cached && cached.length > 0) {
        users.set(cached);
        loadingData.set(false);
      } else {
        const data = await authApiFetch(API_ROUTES.USER + "/all");
        users.set(data);
        usersAllStore.set(data);
      }
    } catch (err) {
      errorMessage.set("Failed to load user data.");
    } finally {
      setTimeout(() => {
        loadingData.set(false);
      }, 500);
    }
  }

  // ── Edit order form ────────────────────────────────────────────────────

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage.set("");
    loading.set(true);
    formErrors.set({});
    const o = get(order);
    const t = get(title);
    const updatePayload = {
      title: t,
      price: get(price),
      currency: get(currency),
      priceTerms: get(priceTerms),
      source: get(source),
      description: get(description),
      company: get(company),
      gstNumber: get(gstNumber),
      workOrderNumber: get(workOrderNumber),
      importStatus: get(importStatus),
    };
    const cat = get(category);
    updatePayload.category = cat || "";
    const oDate = get(orderDate);
    if (oDate) updatePayload.orderDate = oDate;
    const sDate = get(startDate);
    if (sDate) updatePayload.startDate = sDate;
    const dDate = get(deadlineDate);
    if (dDate) updatePayload.deadlineDate = dDate;
    const pr = get(price);
    if (pr) updatePayload.price = Number(pr);
    updatePayload.orderActivity = {
      title: "Order Updated",
      description: `Order details have been updated.`,
    };
    if (t == "") {
      formErrors.set({ title: ["Title is required."] });
      loading.set(false);
      return;
    }
    try {
      const data = await updateOrderApi(o.id, updatePayload);
      order.update((cur) => ({ ...cur, ...data.data }));
      Swal.fire("Success!", data.message, "success");
      closeOffcanvas();
    } catch (error) {
      loading.set(false);
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors.set(validationErrors);
      } else {
        errorMessage.set("An unexpected error occurred.");
      }
    } finally {
      loading.set(false);
    }
  }

  async function deleteOrder(id) {
    try {
      Swal.fire({
        title: "Archive Confirmation",
        text: "Are you sure you want to archive this record.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, archive it!",
      }).then(async (result) => {
        if (result.isConfirmed) {
          const data = await deleteOrderApi(id);
          Swal.fire("Deleted!", data.message, "success");
          goto("/admin/order");
        }
      });
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors.set(validationErrors);
      } else {
        errorMessage.set("An unexpected error occurred.");
      }
    } finally {
    }
  }

  async function deleteClient(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await deleteOrderClientApi(id);
          order.update((cur) => ({
            ...cur,
            orderClients: (cur.orderClients || []).filter((client) => client.id !== id),
          }));
          Swal.fire("Deleted!", data.message, "success");
          const newActivity = {
            title: "Order Client Deleted",
            description: "Order client has been archived.",
            data: data?.data,
            createdAt: new Date().toISOString(),
          };
          addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors.set(validationErrors);
          } else {
            errorMessage.set("An unexpected error occurred.");
          }
        } finally {
          loading.set(false);
        }
      }
    });
  }

  // ── Queries ────────────────────────────────────────────────────────────

  async function loadOrderQueries() {
    const orderId = getOrderId();
    if (!orderId) return;
    orderQueriesLoading.set(true);
    try {
      const res = await loadOrderQueriesApi(orderId);
      orderQueries.set(Array.isArray(res) ? res : []);
    } catch (_) {
      orderQueries.set([]);
    } finally {
      orderQueriesLoading.set(false);
    }
  }

  function openQueryModal() {
    if (!get(querySubject).trim()) querySubject.set(get(order)?.title ?? "");
    showQueryModal.set(true);
  }

  async function submitOrderQuery() {
    queryError.set("");
    const subj = get(querySubject);
    if (!subj.trim()) {
      queryError.set("Subject is required.");
      return;
    }
    raisingQuery.set(true);
    try {
      await createOrderQueryApi({
        subject: subj,
        description: get(queryDescription),
        orderId: getOrderId(),
      });
      showQueryModal.set(false);
      querySubject.set("");
      queryDescription.set("");
      Swal.fire({
        icon: "success",
        title: "Query raised successfully",
        timer: 1500,
        showConfirmButton: false,
      });
      loadOrderQueries();
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") {
        queryError.set(msg);
      } else if (Array.isArray(msg)) {
        queryError.set(msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" • "));
      } else {
        queryError.set("Failed to raise query.");
      }
    } finally {
      raisingQuery.set(false);
    }
  }

  function openEditQueryModal(q) {
    editingQuery.set(q);
    editQuerySubject.set(q.subject ?? "");
    editQueryDescription.set(q.description ?? "");
    editQueryError.set("");
    showEditQueryModal.set(true);
  }

  async function submitEditQuery() {
    editQueryError.set("");
    const subj = get(editQuerySubject);
    if (!subj.trim()) {
      editQueryError.set("Subject is required.");
      return;
    }
    editingQueryLoading.set(true);
    try {
      const eq = get(editingQuery);
      await updateOrderQueryApi(eq.id, {
        subject: subj,
        description: get(editQueryDescription),
      });
      showEditQueryModal.set(false);
      editingQuery.set(null);
      Swal.fire({ icon: "success", title: "Query updated", timer: 1200, showConfirmButton: false });
      loadOrderQueries();
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") editQueryError.set(msg);
      else if (Array.isArray(msg))
        editQueryError.set(msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" • "));
      else editQueryError.set("Failed to update query.");
    } finally {
      editingQueryLoading.set(false);
    }
  }

  // ── Visits ─────────────────────────────────────────────────────────────

  async function loadOrderVisits() {
    const orderId = getOrderId();
    if (!orderId) return;
    try {
      const res = await loadOrderVisitsApi(orderId);
      orderVisits.set(res?.data ?? []);
    } catch (_) {}
  }

  function openVisitModal() {
    const o = get(order);
    const orderId = getOrderId();
    if (!o?.clientId) {
      Swal.fire({
        icon: "warning",
        title: "No Client Linked",
        text: "Please link a client to this order before creating a visit.",
        confirmButtonText: "Link Client",
        showCancelButton: true,
        cancelButtonText: "Cancel",
      }).then((r) => {
        if (r.isConfirmed) showChangeClientModal.set(true);
      });
      return;
    }
    const params = new URLSearchParams();
    params.set("orderId", String(orderId));
    if (o.clientId) params.set("clientId", String(o.clientId));
    goto(`/admin/client-visit/add?${params.toString()}`);
  }

  function toggleVisitContact(id) {
    visitSelectedContactIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  function addVisitAttendee() {
    visitAttendees.update((list) => [...list, { userId: "", isLead: false }]);
  }

  function removeVisitAttendee(i) {
    visitAttendees.update((list) => list.filter((_, idx) => idx !== i));
  }

  async function submitVisitModal() {
    visitError.set("");
    visitFormErrors.set({});
    const companyId = get(visitCompanyId);
    const purpose = get(visitPurpose);
    if (!companyId) {
      visitFormErrors.set({ companyId: "Company is required." });
      return;
    }
    if (!purpose.trim()) {
      visitFormErrors.set({ purpose: "Purpose is required." });
      return;
    }
    visitLoading.set(true);
    try {
      const o = get(order);
      const orderId = getOrderId();
      const payload = {
        visitType: get(visitType),
        visitDate: get(visitDate),
        startTime: get(visitStartTime) || undefined,
        endTime: get(visitEndTime) || undefined,
        transportMedium: get(visitTransport) || undefined,
        companyId: Number(companyId),
        clientId: o?.clientId || undefined,
        orderId: Number(orderId),
        clientContactIds: get(visitSelectedContactIds),
        purpose: purpose.trim(),
        outcome: get(visitOutcome) || undefined,
        nextFollowUpDate: get(visitNextFollowUp) || undefined,
        clientFeedback: get(visitFeedback) || undefined,
        notes: get(visitNotes) || undefined,
        terms: get(visitTerms) || undefined,
        attendees: get(visitAttendees)
          .filter((a) => a.userId)
          .map((a) => ({ userId: Number(a.userId), isLead: a.isLead })),
      };
      const res = await createOrderVisitApi(payload);
      const newId = res?.data?.id ?? res?.id;
      showVisitModal.set(false);
      loadOrderVisits();
      Swal.fire({
        icon: "success",
        title: "Visit Created!",
        html: `Visit saved. <a href="/admin/client-visit/edit/${newId}">Add job details</a> from the visit page.`,
        timer: 3500,
        showConfirmButton: true,
        confirmButtonText: "Go to Visit",
      }).then((r) => {
        if (r.isConfirmed && newId) goto(`/admin/client-visit/edit/${newId}`);
      });
    } catch (err) {
      const e = errorHandle(err);
      if (e && typeof e === "object") visitFormErrors.set(e);
      else visitError.set("Failed to save visit. Please try again.");
    } finally {
      visitLoading.set(false);
    }
  }

  async function handleSubmitVisitModal(payload) {
    await submitVisitModal(payload);
  }

  // ── Contacts ───────────────────────────────────────────────────────────

  async function linkContact(contact) {
    try {
      const o = get(order);
      const res = await linkOrderContactApi(o.id, contact.id);
      order.update((cur) => ({
        ...cur,
        orderContacts: [...(cur.orderContacts || []), res.data],
      }));
      addActivityToGroupedActivities({
        title: "Contact Added",
        description: `${contact.name} linked to order.`,
        createdAt: new Date().toISOString(),
      });
      Swal.fire("Success!", "Contact linked.", "success");
    } catch (e) {
      Swal.fire("Error!", "Failed to link contact.", "error");
    }
  }

  async function setPrimaryContact(ocId) {
    try {
      await setPrimaryOrderContactApi(ocId);
      order.update((cur) => ({
        ...cur,
        orderContacts: (cur.orderContacts || []).map((oc) => ({
          ...oc,
          isPrimary: oc.id === ocId,
        })),
      }));
    } catch (e) {
      Swal.fire("Error!", "Failed to set primary contact.", "error");
    }
  }

  async function unlinkContact(orderContactId, contactName) {
    Swal.fire({
      title: "Remove Contact?",
      text: `Remove ${contactName} from this order?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, remove",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await unlinkOrderContactApi(orderContactId);
          order.update((cur) => ({
            ...cur,
            orderContacts: (cur.orderContacts || []).filter((oc) => oc.id !== orderContactId),
          }));
          addActivityToGroupedActivities({
            title: "Contact Removed",
            description: `${contactName} removed from order.`,
            createdAt: new Date().toISOString(),
          });
          Swal.fire("Removed!", "Contact unlinked.", "success");
        } catch (e) {
          Swal.fire("Error!", "Failed to remove contact.", "error");
        }
      }
    });
  }

  function setAssignedUsers() {
    const o = get(order);
    const su = [];
    userSearch.set("");
    o?.assignedUsers?.forEach((user) => {
      if (user?.role === "user") {
        su.push(user?.id);
      }
    });
    selectedUsers.set(su);
  }

  async function handleAddAssignedUser(selectedUserIds) {
    loading.set(true);
    formErrors.set({});
    const allUsers = get(users);
    const o = get(order);
    const newAssigned = selectedUserIds.map((id) => allUsers.find((u) => u.id === id)).filter(Boolean);
    const existingAdmins = (o.assignedUsers || []).filter((u) => u.role === "admin");
    const assignedUsers = [...newAssigned, ...existingAdmins];
    if (!assignedUsers.length) {
      Swal.fire("Warning!", "Please select at least one user.", "warning");
      loading.set(false);
      return;
    }
    try {
      const data = await updateOrderApi(o.id, {
        assignedUsers,
        orderActivity: {
          title: "Assigned Users Updated",
          description: "Assigned users updated.",
        },
      });
      order.update((cur) => ({
        ...cur,
        assignedUsers: data.data?.assignedUsers ?? cur.assignedUsers,
      }));
      Swal.fire("Success!", data.message, "success");
      closeModalManual("#add_contact");
    } catch (err) {
      errorHandle(err);
    } finally {
      loading.set(false);
    }
  }

  // ── Child orders / components ────────────────────────────────────────

  async function deleteComponent(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await deleteChildOrderApi(id);
          order.update((cur) => ({
            ...cur,
            childOrders: (cur.childOrders || []).filter((child) => child.id !== id),
          }));
          Swal.fire("Deleted!", data.message, "success");
          const newActivity = {
            title: "Order Deleted",
            description: "Order has been archived.",
            data: data?.data,
            createdAt: new Date().toISOString(),
          };
          addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors.set(validationErrors);
          } else {
            errorMessage.set("An unexpected error occurred.");
          }
        } finally {
          loading.set(false);
        }
      }
    });
  }

  async function cerateChildOrder() {
    errorMessage.set("");
    loading.set(true);
    formErrors.set({});
    const o = get(order);
    const componentPayload = {};
    if (o) {
      componentPayload.title = o.title;
      componentPayload.parentId = o.id;
      componentPayload.status = o.status;
    }
    try {
      const data = await createChildOrderApi(componentPayload);
      formErrors.set({});
      if (data) {
        order.update((cur) => ({
          ...cur,
          childOrders: [data.data, ...(cur.childOrders || [])],
        }));
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");
        const newActivity = {
          title: "Order Component Added",
          description: "A new component has been added to the order.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors.set(validationErrors);
      } else {
        errorMessage.set("An unexpected error occurred.");
      }
    } finally {
      loading.set(false);
    }
  }

  async function editChildOrder(component) {
    childOrderId.set(component?.id);
    orderTitle.set(component?.title);
    orderWorkOrderNumber.set(component?.workOrderNumber);
  }

  async function handleEditComponentCompat({ orderTitle: t, orderWorkOrderNumber: wo }) {
    loading.set(true);
    formErrors.set({});
    try {
      const cid = get(childOrderId);
      const data = await updateChildOrderApi(cid, { title: t, workOrderNumber: wo });
      if (data) {
        order.update((cur) => ({
          ...cur,
          childOrders: (cur.childOrders || []).map((c) =>
            c.id === cid ? { ...c, title: t, workOrderNumber: wo } : c,
          ),
        }));
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");
      }
    } catch (err) {
      const ve = errorHandle(err);
      if (ve) formErrors.set(ve);
    } finally {
      loading.set(false);
    }
  }

  // ── Feedback ───────────────────────────────────────────────────────────

  async function loadFeedbacks() {
    const o = get(order);
    if (!o?.id) return;
    loadingFeedbacks.set(true);
    try {
      const res = await loadOrderFeedbacksApi(o.id);
      feedbacks.set(res?.data ?? []);
    } catch (_) {
    } finally {
      loadingFeedbacks.set(false);
    }
  }

  async function submitFeedback({ satisfactionLevel, reason, remarks, triggerStatus }) {
    feedbackLoading.set(true);
    try {
      const o = get(order);
      const res = await createOrderFeedbackApi({
        orderId: o.id,
        satisfactionLevel,
        reason,
        remarks,
        triggerStatus,
      });
      feedbacks.update((list) => [res.data, ...list]);
      Swal.fire("Success!", "Feedback submitted.", "success");
    } catch (err) {
      errorHandle(err);
    } finally {
      feedbackLoading.set(false);
      showFeedbackModal.set(false);
      feedbackTriggerStatus.set(null);
    }
  }

  async function deleteFeedback(id) {
    const r = await Swal.fire({
      title: "Delete Feedback?",
      text: "This will remove the feedback record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete!",
    });
    if (!r.isConfirmed) return;
    try {
      await deleteOrderFeedbackApi(id);
      feedbacks.update((list) => list.filter((f) => f.id !== id));
      Swal.fire("Deleted!", "Feedback removed.", "success");
    } catch (err) {
      errorHandle(err);
    }
  }

  function openFeedbackModal(show = true) {
    if (show === false) {
      feedbackTriggerStatus.set(null);
      showFeedbackModal.set(false);
      return;
    }
    feedbackTriggerStatus.set(null);
    showFeedbackModal.set(true);
  }

  // ── Accordion / status / pin ──────────────────────────────────────────

  function toggleAccordion(date) {
    activeDate.update((cur) => (cur === date ? null : date));
  }

  function togglePin(id) {
    const o = get(order);
    let pinstatus = o?.pinStatus === "true" ? "false" : "true";
    Swal.fire({
      title: "Change Pin Status",
      text: "Are you sure you want to change the pin status of this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, change it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          setOrderPinStatus(pinstatus);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors.set(validationErrors);
          } else {
            errorMessage.set("An unexpected error occurred.");
          }
        } finally {
          loading.set(false);
        }
      }
    });
  }

  async function changeOrderStatus(newStatus) {
    const o = get(order);
    if (o.status === newStatus) return;
    const prevStatus = o.status;
    const statusNames = get(statusNamesStore);
    const prevLabel = statusNames[prevStatus]?.name ?? prevStatus;
    const newLabel = statusNames[newStatus]?.name ?? newStatus;
    const result = await Swal.fire({
      title: "Change Status?",
      text: `Change status from "${prevLabel}" to "${newLabel}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, change it!",
    });
    if (!result.isConfirmed) return;
    order.update((cur) => ({ ...cur, status: newStatus })); // optimistic update
    try {
      await updateOrderApi(o.id, {
        status: newStatus,
        orderActivity: {
          title: "Status Changed",
          description: `Status changed from "${prevLabel}" to "${newLabel}".`,
        },
      });
      const newActivity = {
        title: "Status Changed",
        description: `Status changed from "${prevLabel}" to "${newLabel}".`,
        createdAt: new Date().toISOString(),
      };
      addActivityToGroupedActivities(newActivity);
      Swal.fire("Success!", `Status changed to "${newLabel}".`, "success");
      // Trigger feedback modal for relevant statuses
      if (FEEDBACK_TRIGGER_STATUSES.includes(newStatus)) {
        feedbackTriggerStatus.set(newLabel);
        showFeedbackModal.set(true);
      }
    } catch (error) {
      order.update((cur) => ({ ...cur, status: prevStatus })); // revert on error
      Swal.fire("Error!", "Failed to change status.", "error");
    }
  }

  async function setOrderPinStatus(status) {
    errorMessage.set("");
    loading.set(true);
    formErrors.set({});
    try {
      const o = get(order);
      const data = await updateOrderApi(o.id, { pinStatus: status });
      order.update((cur) => ({ ...cur, pinStatus: status }));
      Swal.fire("Success!", "Pin Status updated successfully.", "success");
    } catch (error) {
      loading.set(false);
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors.set(validationErrors);
      } else {
        errorMessage.set("An unexpected error occurred.");
      }
    } finally {
      loading.set(false);
    }
  }

  // ── Chats / reminders / attachments ───────────────────────────────────

  async function handleAddChat({ type, message: msg }) {
    loading.set(true);
    formErrors.set({});
    try {
      const data = await createOrderChatApi(getOrderId(), { type, message: msg });
      if (data) {
        order.update((cur) => ({
          ...cur,
          orderChats: [data.data, ...(cur.orderChats || [])],
        }));
        Swal.fire("Success!", data.message, "success");
        const act = {
          title: "Order Chat Added",
          description: "A new chat has been added.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        addActivityToGroupedActivities(act);
      }
    } catch (err) {
      errorHandle(err);
    } finally {
      loading.set(false);
    }
  }

  async function handleDeleteChat(id) {
    const r = await Swal.fire({
      title: "Delete Confirmation",
      text: "Delete this chat?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!r.isConfirmed) return;
    try {
      const data = await deleteOrderChatApi(id);
      order.update((cur) => ({
        ...cur,
        orderChats: (cur.orderChats || []).map((c) =>
          c.id === id ? { ...c, deletedAt: new Date().toISOString() } : c,
        ),
      }));
      if (data?.message) Swal.fire("Success!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }

  async function handleAddReminder({ reminderTime: rt, message: msg }) {
    loading.set(true);
    formErrors.set({});
    try {
      const data = await createOrderReminderApi(getOrderId(), { reminderTime: rt, message: msg });
      if (data) {
        order.update((cur) => ({
          ...cur,
          orderReminders: [data.data, ...(cur.orderReminders || [])],
        }));
        Swal.fire("Success!", data.message, "success");
        const act = {
          title: "Order Reminder Added",
          description: "A new reminder added.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        addActivityToGroupedActivities(act);
      }
    } catch (err) {
      errorHandle(err);
    } finally {
      loading.set(false);
    }
  }

  async function handleDeleteReminder(id) {
    const r = await Swal.fire({
      title: "Delete Confirmation",
      text: "Delete this reminder?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!r.isConfirmed) return;
    try {
      const data = await deleteOrderReminderApi(id);
      order.update((cur) => ({
        ...cur,
        orderReminders: (cur.orderReminders || []).map((rem) =>
          rem.id === id ? { ...rem, deletedAt: new Date().toISOString() } : rem,
        ),
      }));
      if (data?.message) Swal.fire("Success!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }

  async function handleAddAttachment({ aTitle: t, link: l, files: fs }) {
    loading.set(true);
    formErrors.set({});
    try {
      const data = await createOrderAttachmentApi(getOrderId(), { title: t, link: l, files: fs });
      if (data) {
        order.update((cur) => ({
          ...cur,
          orderAttachments: [data.data, ...(cur.orderAttachments || [])],
        }));
        Swal.fire("Success!", data.message, "success");
        const act = {
          title: "Order Attachment Added",
          description: "A new attachment added.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        addActivityToGroupedActivities(act);
      }
    } catch (err) {
      const ve = errorHandle(err);
      if (ve) formErrors.set(ve);
    } finally {
      loading.set(false);
    }
  }

  async function handleDeleteAttachment(id) {
    const r = await Swal.fire({
      title: "Delete Confirmation",
      text: "Delete this attachment?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!r.isConfirmed) return;
    try {
      const data = await deleteOrderAttachmentApi(id);
      order.update((cur) => ({
        ...cur,
        orderAttachments: (cur.orderAttachments || []).map((a) =>
          a.id === id ? { ...a, deletedAt: new Date().toISOString() } : a,
        ),
      }));
      if (data?.message) Swal.fire("Success!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }

  // ── Lightbox / attachments ────────────────────────────────────────────

  function openImageLightbox(urls, index = 0) {
    showImagesStart.set(index);
    showImages.set(Array.isArray(urls) ? urls : [urls]);
  }

  function openAttachment(url, mime, name) {
    const isImg = mime
      ? mime.startsWith("image/")
      : /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name ?? "");
    if (isImg) {
      openImageLightbox([url], 0);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // ── PI/WO/TI refresh ───────────────────────────────────────────────────

  async function onPIWOTIRefresh() {
    try {
      const orderId = getOrderId();
      const updated = await fetchOrderFullApi(orderId);
      order.update((cur) => ({
        ...cur,
        orderPayments: updated.orderPayments ?? [],
        workOrders: updated.workOrders ?? [],
        invoices: updated.invoices ?? [],
      }));
    } catch {}
  }

  return {
    // stores
    order,
    loadingData,
    relationsLoading,
    errorMessage,
    loading,
    formErrors,
    users,
    categories,
    currentUser,
    // edit form
    title,
    category,
    orderDate,
    startDate,
    deadlineDate,
    price,
    currency,
    priceTerms,
    source,
    description,
    company,
    gstNumber,
    workOrderNumber,
    importStatus,
    selectedUsers,
    userSearch,
    orderTitle,
    orderWorkOrderNumber,
    childOrderId,
    // UI
    activeTab,
    activeDate,
    orderInfoExpanded,
    showChangeClientModal,
    showNewClientModal,
    showAddContactModal,
    showEditClientModal,
    piwotiOpen,
    piwotiType,
    showImages,
    showImagesStart,
    // queries
    orderQueries,
    orderQueriesLoading,
    showQueryModal,
    querySubject,
    queryDescription,
    raisingQuery,
    queryError,
    showEditQueryModal,
    editingQuery,
    editQuerySubject,
    editQueryDescription,
    editingQueryLoading,
    editQueryError,
    // visits
    orderVisits,
    showVisitListModal,
    showVisitModal,
    visitLoading,
    visitError,
    visitFormErrors,
    visitType,
    visitDate,
    visitStartTime,
    visitEndTime,
    visitTransport,
    visitPurpose,
    visitOutcome,
    visitNextFollowUp,
    visitFeedback,
    visitNotes,
    visitTerms,
    visitClientContacts,
    visitSelectedContactIds,
    visitAttendees,
    visitCompanies,
    visitCompanyId,
    // feedback
    showFeedbackModal,
    feedbackTriggerStatus,
    feedbackLoading,
    feedbacks,
    loadingFeedbacks,
    pendingStatusAfterFeedback,
    // constants
    statuses: STATUSES,
    // actions
    loadOrder,
    getAllCategories,
    loadUsers,
    handleSubmit,
    deleteOrder,
    deleteClient,
    loadOrderQueries,
    openQueryModal,
    submitOrderQuery,
    openEditQueryModal,
    submitEditQuery,
    loadOrderVisits,
    openVisitModal,
    toggleVisitContact,
    addVisitAttendee,
    removeVisitAttendee,
    submitVisitModal,
    handleSubmitVisitModal,
    linkContact,
    setPrimaryContact,
    unlinkContact,
    setAssignedUsers,
    handleAddAssignedUser,
    deleteComponent,
    cerateChildOrder,
    editChildOrder,
    handleEditComponentCompat,
    loadFeedbacks,
    submitFeedback,
    deleteFeedback,
    openFeedbackModal,
    toggleAccordion,
    togglePin,
    changeOrderStatus,
    setOrderPinStatus,
    handleAddChat,
    handleDeleteChat,
    handleAddReminder,
    handleDeleteReminder,
    handleAddAttachment,
    handleDeleteAttachment,
    openImageLightbox,
    openAttachment,
    onPIWOTIRefresh,
    addActivityToGroupedActivities,
    maskAssignedName,
    maskAuthorName,
    closeModalMenual,
  };
}
