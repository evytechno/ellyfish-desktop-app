<script>
  import { onDestroy, onMount, afterUpdate } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { slide } from "svelte/transition";
  import { goto } from "$app/navigation";
  import jQuery from "jquery";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import SkeletonOrderDetail from "$lib/components/SkeletonOrderDetail.svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";
  let piwotiOpen = false;
  let piwotiType = "PI";
  async function onPIWOTIRefresh() {
    try {
      const updated = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
      order.orderPayments = updated.orderPayments ?? [];
      order.workOrders = updated.workOrders ?? [];
      order.invoices = updated.invoices ?? [];
      order = { ...order };
    } catch {}
  }
  let loadingData = true;
  import { usersAllStore, categoriesAllStore } from "$lib/stores/dataStores";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { get } from "svelte/store";
  import LightBox from "$lib/components/LightBox.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import {
    maskAssignedName as _maskAssignedName,
    maskAuthorName as _maskAuthorName,
  } from "$lib/utils/maskUser";
  import QuillEditor from "$lib/components/QuillEditor.svelte";
  import DOMPurify from "dompurify";
  import { open as openExternal } from "@tauri-apps/api/shell";
  let descCollapsed = true;
  let orderDescEl;
  afterUpdate(() => {
    if (!orderDescEl) return;
    orderDescEl.querySelectorAll("a[href]").forEach((a) => {
      if (a.__externalHandled) return;
      a.__externalHandled = true;
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (href && (href.startsWith("http") || href.startsWith("www"))) {
          e.preventDefault();
          openExternal(href.startsWith("www") ? "https://" + href : href);
        }
      });
    });
  });
  function isHtml(str) {
    return str ? /<[a-z][\s\S]*>/i.test(str) : false;
  }
  function safeHtml(str) {
    return DOMPurify.sanitize(str ?? "");
  }
  import DispatchProcess from "$lib/components/DispatchProcess.svelte"; // Split components
  import OrderActivityTab from "./components/OrderActivityTab.svelte";
  import OrderChatsTab from "./components/OrderChatsTab.svelte";
  import OrderFilesTab from "./components/OrderFilesTab.svelte";
  import OrderRemindersTab from "./components/OrderRemindersTab.svelte";
  import OrderLegacyClientsTab from "./components/OrderLegacyClientsTab.svelte";
  import OrderQueriesTab from "./components/OrderQueriesTab.svelte";
  import OrderComponentsTab from "./components/OrderComponentsTab.svelte";
  import OrderEditOffcanvas from "./components/OrderEditOffcanvas.svelte";
  import OrderAssignedUsersModal from "./components/OrderAssignedUsersModal.svelte";
  import OrderVisitModals from "./components/OrderVisitModals.svelte";
  import OrderQueryModals from "./components/OrderQueryModals.svelte";
  import OrderClientModals from "./components/OrderClientModals.svelte";
  import OrderHeader from "./components/OrderHeader.svelte";
  import OrderSidebar from "./components/OrderSidebar.svelte"; // Client modal visibility
  let showChangeClientModal = false;
  let showNewClientModal = false;
  let showAddContactModal = false;
  let showEditClientModal = false;
  let errorMessage = "";
  let order = null;
  let users = []; // Form state
  let title = "";
  let category = "";
  let orderDate = null;
  let startDate = null;
  let deadlineDate = null;
  let price = null;
  let currency = "INR";
  let priceTerms = null;
  let source = null;
  let description = "";
  let company = "";
  let gstNumber = "";
  let workOrderNumber = "";
  let importStatus = "false";
  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let address = "";
  let alternateMobile = "";
  let designation = "";
  let remark = "";
  let aTitle = "";
  let link = "";
  let files = [];
  let message = "";
  const CHAT_TYPES = ["Call", "WhatsApp", "Email"];
  let selectedTypes = []; // multi-select array for the form
  let chatTypeFilter = "All"; // Toggle a type in the form selector
  function toggleChatType(t) {
    if (t === "All") {
      selectedTypes = selectedTypes.length === CHAT_TYPES.length ? [] : [...CHAT_TYPES];
    } else {
      selectedTypes = selectedTypes.includes(t)
        ? selectedTypes.filter((x) => x !== t)
        : [...selectedTypes, t];
    }
  }
  $: allSelected = selectedTypes.length === CHAT_TYPES.length; // Normalize a single raw token
  function normalizeSingleType(raw) {
    if (!raw || raw.trim() === "") return null;
    const t = raw.trim().toLowerCase();
    if (t.includes("call")) return "Call";
    if (t.includes("whatsapp") || t.includes("whats app") || t === "wa") return "WhatsApp";
    if (t.includes("email") || t.includes("mail")) return "Email";
    return null;
  } // Parse comma-separated type string â†’ normalized array (no nulls)
  function normalizeTypes(typeStr) {
    if (!typeStr || typeStr.trim() === "") return [];
    return typeStr.split(",").map(normalizeSingleType).filter(Boolean);
  } // For single icon/color use (first type wins)
  function normalizeType(typeStr) {
    return normalizeTypes(typeStr)[0] ?? "Other";
  }
  $: filteredChats =
    chatTypeFilter === "All"
      ? (order?.orderChats ?? [])
      : (order?.orderChats ?? []).filter((c) => normalizeTypes(c.type).includes(chatTypeFilter));
  $: chatTypeCounts = CHAT_TYPES.reduce((acc, t) => {
    acc[t] = (order?.orderChats ?? []).filter((c) => normalizeTypes(c.type).includes(t)).length;
    return acc;
  }, {});
  let reminderTime = null;
  let reminderMessage = "";
  let selectedUsers = [];
  let userSearch = "";
  let categories = [];
  let orderTitle = "";
  let orderWorkOrderNumber = "";
  let childOrderId = null;
  let dispatchedDetails = null;
  let loading = false; // Field-specific error messages
  let formErrors = {};
  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length > 0) {
      files = [...files, ...selectedFiles];
    }
  }
  let isDragging = false;
  function handleDragOver(event) {
    event.preventDefault();
    isDragging = true;
  }
  function handleDragLeave() {
    isDragging = false;
  }
  function handleDrop(event) {
    event.preventDefault();
    isDragging = false;
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) {
      files = [...files, ...dropped];
    }
  }
  function handleFileChangePaste(file) {
    if (file) {
      files = [...files, file];
    }
  }
  function removeFile(fileToRemove) {
    files = files.filter((file) => file !== fileToRemove);
  }
  function closeModalMenual(id) {
    const $ = jQuery;
    $(id).removeClass("show d-block");
    $(".modal-backdrop").removeClass("show");
    setTimeout(() => {
      $(".modal-backdrop").remove();
      $(id).removeClass("d-block");
      $("body").removeClass("modal-open");
      $("body").css({ overflow: "", paddingRight: "" });
    }, 300);
  }
  function closeOffcanvas() {
    const $ = jQuery;
    $("#offcanvas_add").removeClass("show");
    $(".offcanvas-backdrop").remove();
    $("body").css({ overflow: "", paddingRight: "" });
  }
  function addActivityToGroupedActivities(newActivity) {
    let groupedActivities = order.groupedActivities || [];
    const formatDate = (dateStr) => new Date(dateStr).toISOString().split("T")[0]; // returns "YYYY-MM-DD"
    const activityDate = formatDate(newActivity.createdAt); // Normalize existing group dates for reliable comparison
    let group = groupedActivities.find((g) => formatDate(g.date) === activityDate);
    if (group) {
      group.activities.unshift(newActivity);
      group.activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      groupedActivities.unshift({
        date: activityDate, // normalized string "YYYY-MM-DD"
        activities: [newActivity],
      });
    }
    return groupedActivities;
  }
  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors
    const updateOrder = {
      title,
      price,
      currency,
      priceTerms,
      source,
      description,
      company,
      gstNumber,
      workOrderNumber,
      importStatus,
    };
    if (category) {
      updateOrder.category = category;
    } else {
      updateOrder.category = "";
    }
    if (orderDate) {
      updateOrder.orderDate = orderDate;
    }
    if (startDate) {
      updateOrder.startDate = startDate;
    }
    if (deadlineDate) {
      updateOrder.deadlineDate = deadlineDate;
    }
    if (price) {
      updateOrder.price = Number(price);
    }
    let newActivity = { title: "Order Updated", description: `Order details have been updated.` };
    updateOrder.orderActivity = newActivity;
    if (title == "") {
      formErrors.title = ["Title is required."];
      loading = false;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify(updateOrder),
      });
      order = { ...order, ...data.data };
      Swal.fire("Success!", data.message, "success");
      closeOffcanvas();
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  async function getAllCategories() {
    const cached = get(categoriesAllStore);
    if (cached && cached.length > 0 && typeof cached[0] === "object" && cached[0].label) {
      categories = cached;
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.CATEGORY + "/all");
      categories = data.map((parent) => ({
        label: parent.name,
        options:
          parent.children && parent.children.length > 0
            ? parent.children.map((c) => c.name)
            : [parent.name],
      }));
      categoriesAllStore.set(categories);
    } catch (err) {
      errorMessage = "Failed to load category data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }
  let orderId;
  $: orderId = $page.params.id;
  let currentUser =
    null; /** Returns the display name for an assigned user based on the viewer's role/subRole. */
  function maskAssignedName(assignedUser) {
    return _maskAssignedName(assignedUser, currentUser);
  }
  function maskAuthorName(authorUser) {
    return _maskAuthorName(authorUser, currentUser);
  } // Related Queries
  let orderQueries = [];
  let orderQueriesLoading = false;
  async function loadOrderQueries() {
    if (!orderId) return;
    orderQueriesLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/order/${orderId}`);
      orderQueries = Array.isArray(res) ? res : [];
    } catch (_) {
      orderQueries = [];
    } finally {
      orderQueriesLoading = false;
    }
  } // Raise Query from order detail
  let showQueryModal = false;
  let querySubject = "";
  let queryDescription = "";
  let raisingQuery = false;
  let queryError = ""; // â”€â”€ Order Visits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let orderVisits = [];
  async function loadOrderVisits() {
    if (!orderId) return;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}?orderId=${orderId}&limit=50`);
      orderVisits = res?.data ?? [];
    } catch (_) {}
  } // â”€â”€ Visit List Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let showVisitListModal = false; // â”€â”€ Create Visit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let showVisitModal = false;
  let visitLoading = false;
  let visitError = "";
  let visitFormErrors = {};
  let visitType = "outgoing";
  let visitDate = new Date().toISOString().slice(0, 10);
  let visitStartTime = "";
  let visitEndTime = "";
  let visitTransport = "";
  let visitPurpose = "";
  let visitOutcome = "";
  let visitNextFollowUp = "";
  let visitFeedback = "";
  let visitNotes = "";
  let visitTerms = "";
  let visitClientContacts = [];
  let visitSelectedContactIds = [];
  let visitAttendees = [];
  let visitCompanies = [];
  let visitCompanyId = "";
  async function openVisitModal() {
    if (!order?.clientId) {
      Swal.fire({
        icon: "warning",
        title: "No Client Linked",
        text: "Please link a client to this order before creating a visit.",
        confirmButtonText: "Link Client",
        showCancelButton: true,
        cancelButtonText: "Cancel",
      }).then((r) => {
        if (r.isConfirmed) showChangeClientModal = true;
      });
      return;
    }
    visitError = "";
    visitFormErrors = {};
    visitType = "outgoing";
    visitDate = new Date().toISOString().slice(0, 10);
    visitStartTime = "";
    visitEndTime = "";
    visitTransport = "";
    visitPurpose = "";
    visitOutcome = "";
    visitNextFollowUp = "";
    visitFeedback = "";
    visitNotes = "";
    visitTerms = "";
    visitClientContacts = [];
    visitSelectedContactIds = [];
    visitAttendees = [];
    visitCompanyId = "";
    showVisitModal = true;
    try {
      const [cc, comps] = await Promise.all([
        authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/by-client/${order.clientId}`),
        authApiFetch(API_ROUTES.COMPANY + "/all"),
      ]);
      visitClientContacts = cc?.data ?? cc ?? [];
      visitCompanies = comps || [];
      if (currentUser?.companyId) {
        const match = visitCompanies.find((c) => c.id === Number(currentUser.companyId));
        if (match) visitCompanyId = String(match.id);
      }
      if (!visitCompanyId && visitCompanies.length === 1)
        visitCompanyId = String(visitCompanies[0].id);
    } catch (_) {}
  }
  function toggleVisitContact(id) {
    if (visitSelectedContactIds.includes(id))
      visitSelectedContactIds = visitSelectedContactIds.filter((x) => x !== id);
    else visitSelectedContactIds = [...visitSelectedContactIds, id];
  }
  function addVisitAttendee() {
    visitAttendees = [...visitAttendees, { userId: "", isLead: false }];
  }
  function removeVisitAttendee(i) {
    visitAttendees = visitAttendees.filter((_, idx) => idx !== i);
  }
  async function submitVisitModal() {
    visitError = "";
    visitFormErrors = {};
    if (!visitCompanyId) {
      visitFormErrors.companyId = "Company is required.";
      return;
    }
    if (!visitPurpose.trim()) {
      visitFormErrors.purpose = "Purpose is required.";
      return;
    }
    visitLoading = true;
    try {
      const payload = {
        visitType,
        visitDate,
        startTime: visitStartTime || undefined,
        endTime: visitEndTime || undefined,
        transportMedium: visitTransport || undefined,
        companyId: Number(visitCompanyId),
        clientId: order?.clientId || undefined,
        orderId: Number(orderId),
        clientContactIds: visitSelectedContactIds,
        purpose: visitPurpose.trim(),
        outcome: visitOutcome || undefined,
        nextFollowUpDate: visitNextFollowUp || undefined,
        clientFeedback: visitFeedback || undefined,
        notes: visitNotes || undefined,
        terms: visitTerms || undefined,
        attendees: visitAttendees
          .filter((a) => a.userId)
          .map((a) => ({ userId: Number(a.userId), isLead: a.isLead })),
      };
      const res = await authApiFetch(API_ROUTES.CLIENT_VISIT, { method: "POST", data: payload });
      const newId = res?.data?.id ?? res?.id;
      showVisitModal = false;
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
      if (e && typeof e === "object") visitFormErrors = e;
      else visitError = "Failed to save visit. Please try again.";
    } finally {
      visitLoading = false;
    }
  }
  function openQueryModal() {
    if (!querySubject.trim()) querySubject = order?.title ?? "";
    showQueryModal = true;
  }
  async function submitOrderQuery() {
    queryError = "";
    if (!querySubject.trim()) {
      queryError = "Subject is required.";
      return;
    }
    raisingQuery = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}`, {
        method: "POST",
        data: JSON.stringify({
          subject: querySubject,
          description: queryDescription.trim() || null,
          orderId: Number(orderId),
        }),
      });
      showQueryModal = false;
      querySubject = "";
      queryDescription = "";
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
        queryError = msg;
      } else if (Array.isArray(msg)) {
        queryError = msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" â€¢ ");
      } else {
        queryError = "Failed to raise query.";
      }
    } finally {
      raisingQuery = false;
    }
  } // Edit Query from order detail
  let showEditQueryModal = false;
  let editingQuery = null;
  let editQuerySubject = "";
  let editQueryDescription = "";
  let editingQueryLoading = false;
  let editQueryError = "";
  function openEditQueryModal(q) {
    editingQuery = q;
    editQuerySubject = q.subject ?? "";
    editQueryDescription = q.description ?? "";
    editQueryError = "";
    showEditQueryModal = true;
  }
  async function submitEditQuery() {
    editQueryError = "";
    if (!editQuerySubject.trim()) {
      editQueryError = "Subject is required.";
      return;
    }
    editingQueryLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${editingQuery.id}`, {
        method: "PATCH",
        data: JSON.stringify({
          subject: editQuerySubject.trim(),
          description: editQueryDescription.trim() || null,
        }),
      });
      showEditQueryModal = false;
      editingQuery = null;
      Swal.fire({ icon: "success", title: "Query updated", timer: 1200, showConfirmButton: false });
      loadOrderQueries();
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") editQueryError = msg;
      else if (Array.isArray(msg))
        editQueryError = msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" â€¢ ");
      else editQueryError = "Failed to update query.";
    } finally {
      editingQueryLoading = false;
    }
  } // Loading states for each relation section
  let relationsLoading = true;
  async function loadOrder() {
    if (!orderId) return;
    loadingData = true;
    relationsLoading = true;
    order = null;
    orderQueries = [];
    selectedUsers = [];
    try {
      // â”€â”€ Wave 1: Core order only (fast â€” no heavy joins) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}/basic`);
      order = {
        ...data, // pre-fill empty arrays so template doesn't crash before wave 2
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
      }; // populate form fields immediately
      title = data?.title;
      category = data?.category;
      orderDate = data?.orderDate ? new Date(data.orderDate).toISOString().substring(0, 10) : "";
      startDate = data?.startDate ? new Date(data.startDate).toISOString().substring(0, 10) : "";
      deadlineDate = data?.deadlineDate
        ? new Date(data.deadlineDate).toISOString().substring(0, 10)
        : "";
      price = data?.price;
      priceTerms = data?.priceTerms;
      currency = data?.currency;
      source = data?.source;
      description = data?.description;
      gstNumber = data?.gstNumber;
      workOrderNumber = data?.workOrderNumber;
      importStatus = data?.importStatus;
      company = data?.company;
      data?.assignedUsers?.forEach((user) => {
        if (user?.role == "user") selectedUsers.push(user?.id);
      });
      loadingData = false; // page renders now â€” user sees content
      loadOrderVisits(); // â”€â”€ Wave 2: Load all heavy relations in parallel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const [chats, attachments, reminders, clients, contacts, activities, childOrders] =
        await Promise.allSettled([
          authApiFetch(`${API_ROUTES.ORDER_CHAT}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_REMINDER}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_CLIENT}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_CONTACT}/by-order/${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER}/${orderId}`).then((d) => d), // full order for activities
          authApiFetch(`${API_ROUTES.ORDER}?status=all&parentId=${orderId}&limit=50`).catch(() => ({
            data: [],
          })),
        ]); // merge results into order â€” only update if request succeeded
      if (chats.status === "fulfilled") {
        const raw = Array.isArray(chats.value) ? chats.value : (chats.value?.data ?? []);
        order.orderChats = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (attachments.status === "fulfilled") {
        const raw = Array.isArray(attachments.value)
          ? attachments.value
          : (attachments.value?.data ?? []);
        order.orderAttachments = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (reminders.status === "fulfilled") {
        const raw = Array.isArray(reminders.value)
          ? reminders.value
          : (reminders.value?.data ?? []);
        order.orderReminders = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (clients.status === "fulfilled") {
        const raw = Array.isArray(clients.value) ? clients.value : (clients.value?.data ?? []);
        order.orderClients = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (contacts.status === "fulfilled") {
        order.orderContacts = Array.isArray(contacts.value)
          ? contacts.value
          : (contacts.value?.data ?? []);
      }
      if (activities.status === "fulfilled") {
        // full order response has groupedActivities + childOrders + invoices
        const full = activities.value;
        order.groupedActivities = full.groupedActivities ?? [];
        order.childOrders = full.childOrders ?? [];
        order.invoices = full.invoices ?? [];
        order.orderLabels = full.orderLabels ?? [];
      }
      order = { ...order }; // trigger Svelte reactivity
    } catch (err) {
      errorMessage = "Failed to load order data.";
      loadingData = false;
    } finally {
      relationsLoading = false;
    }
    getAllCategories();
    loadOrderQueries();
  }
  onMount(async () => {
    currentUser = checkAuth();
    await loadOrder();
    try {
      const cached = get(usersAllStore);
      if (cached && cached.length > 0) {
        users = cached;
        loadingData = false;
      } else {
        const data = await authApiFetch(API_ROUTES.USER + "/all");
        users = data;
        usersAllStore.set(data);
      }
    } catch (err) {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
    const checkModalAndAttachPaste = () => {
      const modal = document.getElementById("new_file");
      if (modal?.classList.contains("show")) {
        document.addEventListener("paste", handlePaste);
      } else {
        document.removeEventListener("paste", handlePaste);
      }
    };
    const modal = document.getElementById("new_file");
    if (modal) {
      observer = new MutationObserver(checkModalAndAttachPaste);
      observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
    }
  });
  afterNavigate(async () => {
    currentUser = checkAuth();
    await loadOrder();
  });
  function getAvatarText(title) {
    if (!title) return "";
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      return words[0][0].toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
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
          const data = await authApiFetch(API_ROUTES.ORDER + "/" + id, { method: "DELETE" });
          Swal.fire("Deleted!", data.message, "success");
          goto("/admin/order");
        }
      });
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
    }
  }
  async function addAttachment(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};
    const attachmentPayload = new FormData();
    attachmentPayload.append("title", aTitle);
    attachmentPayload.append("link", link);
    if (files && files.length > 0) {
      files.forEach((file) => {
        attachmentPayload.append("file", file);
      });
    }
    if (orderId) {
      const parsedOrderId = parseInt(orderId, 10);
      if (isNaN(parsedOrderId)) {
        formErrors.orderId = ["Order ID must be a number."];
      } else {
        attachmentPayload.append("orderId", parsedOrderId);
      }
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_ATTACHMENT, {
        method: "POST",
        data: attachmentPayload, // Send FormData
      });
      // Reset Form
      aTitle = "";
      link = "";
      files = [];
      formErrors = {};
      if (data) {
        order.orderAttachments = [data.data, ...order.orderAttachments];
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#new_file");
        let newActivity = {
          title: "Order Attachment Added",
          description: "A new attachment has been added to the order.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  async function deleteAttachment(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}/${id}`, {
            method: "DELETE",
          });
          order.orderAttachments = order.orderAttachments.filter(
            (attachment) => attachment.id !== id,
          );
          Swal.fire("Deleted!", data.message, "success");
          let newActivity = {
            title: "Order Attachment Deleted",
            description: "Order attachment has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
          }
        } finally {
          loading = false;
        }
      }
    });
  }
  async function addChat(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};
    const chatPayload = { type: selectedTypes.join(","), message };
    if (order) {
      chatPayload.orderId = order.id;
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify(chatPayload),
      }); // Reset Form
      selectedTypes = [];
      message = "";
      formErrors = {};
      if (data) {
        order.orderChats = [data.data, ...order.orderChats];
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_call");
        let newActivity = {
          title: "Order Chat Added",
          description: "A new message has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  async function deleteChat(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER_CHAT}/${id}`, { method: "DELETE" });
          order.orderChats = order.orderChats.filter((chat) => chat.id !== id);
          Swal.fire("Deleted!", data.message, "success");
          let newActivity = {
            title: "Order Chat Deleted",
            description: "Order chat has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
          }
        } finally {
          loading = false;
        }
      }
    });
  }
  async function addReminder(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};
    const reminderPayload = {
      reminderTime: reminderTime ? new Date(reminderTime).toISOString() : null,
      message: reminderMessage,
    };
    if (order) {
      reminderPayload.orderId = order.id;
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_REMINDER, {
        method: "POST",
        data: JSON.stringify(reminderPayload),
      }); // Reset Form
      reminderTime = null;
      reminderMessage = "";
      formErrors = {};
      if (data) {
        order.orderReminders = [data.data, ...order.orderReminders];
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_reminder");
        let newActivity = {
          title: "Order Reminder Added",
          description: "A new reminder has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  async function deleteReminder(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER_REMINDER}/${id}`, {
            method: "DELETE",
          });
          order.orderReminders = order.orderReminders.filter((reminder) => reminder.id !== id);
          Swal.fire("Deleted!", data.message, "success");
          let newActivity = {
            title: "Order Reminder Deleted",
            description: "Order reminder has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
          }
        } finally {
          loading = false;
        }
      }
    });
  }
  async function addClient(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};
    const clientPayload = { name, mobile, whatsapp, address, alternateMobile, designation, remark };
    if (order) {
      clientPayload.orderId = order.id;
    }
    if (email || email != "") {
      clientPayload.email = email;
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CLIENT, {
        method: "POST",
        data: JSON.stringify(clientPayload),
      }); // Reset Form
      name = "";
      mobile = "";
      whatsapp = "";
      address = "";
      alternateMobile = "";
      designation = "";
      remark = "";
      formErrors = {};
      if (data) {
        order.orderClients = [data.data, ...order.orderClients];
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_client");
        let newActivity = {
          title: "Order Client Added",
          description: "A new client has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
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
          const data = await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${id}`, { method: "DELETE" });
          order.orderClients = order.orderClients.filter((client) => client.id !== id);
          Swal.fire("Deleted!", data.message, "success");
          let newActivity = {
            title: "Order Client Deleted",
            description: "Order client has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
          }
        } finally {
          loading = false;
        }
      }
    });
  }
  let orderInfoExpanded = false;
  async function linkContact(contact) {
    try {
      const res = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({ orderId: order.id, clientContactId: contact.id }),
      });
      if (!order.orderContacts) order.orderContacts = [];
      order.orderContacts = [...order.orderContacts, res.data];
      order.groupedActivities = addActivityToGroupedActivities({
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
      await authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${ocId}/set-primary`, { method: "PATCH" });
      order.orderContacts = order.orderContacts.map((oc) => ({ ...oc, isPrimary: oc.id === ocId }));
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
          await authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${orderContactId}`, { method: "DELETE" });
          order.orderContacts = order.orderContacts.filter((oc) => oc.id !== orderContactId);
          order.groupedActivities = addActivityToGroupedActivities({
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
  async function editComponent(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};
    const componentPayload = {
      title: orderTitle,
      workOrderNumber: orderWorkOrderNumber,
      status: order.status,
    };
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + childOrderId, {
        method: "PUT",
        data: JSON.stringify(componentPayload),
      });
      if (data) {
        const index = order.childOrders.findIndex((o) => o.id === childOrderId);
        if (index !== -1) {
          order.childOrders[index] = { ...order.childOrders[index], ...componentPayload };
        }
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");
        let newActivity = {
          title: "Order Updated",
          description: `Order details have been updated.`,
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString(); // order.groupedActivities = addActivityToGroupedActivities(newActivity);
        // Reset Form
        orderTitle = "";
        orderWorkOrderNumber = "";
        childOrderId = null;
        formErrors = {};
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
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
          const data = await authApiFetch(`${API_ROUTES.ORDER}/${id}`, { method: "DELETE" });
          order.childOrders = order.childOrders.filter((child) => child.id !== id);
          Swal.fire("Deleted!", data.message, "success");
          let newActivity = {
            title: "Order Deleted",
            description: "Order has been archived.",
            data: data?.data,
          };
          newActivity.createdAt = new Date().toISOString();
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
        } catch (error) {
          const validationErrors = errorHandle(error);
          if (validationErrors && typeof validationErrors === "object") {
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
          }
        } finally {
          loading = false;
        }
      }
    });
  }
  async function addAssignedUser(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};
    const updateOrder = { title };
    let newAssignedUsers = [];
    newAssignedUsers = selectedUsers.map((id) => users.find((u) => u.id === id)).filter(Boolean);
    const existingAdminUsers = order.assignedUsers.filter((user) => user.role === "admin");
    updateOrder.assignedUsers = [...newAssignedUsers, ...existingAdminUsers];
    const prevUserIds = order.assignedUsers.filter((u) => u.role === "user").map((u) => u.id);
    const addedUsers = newAssignedUsers.filter((u) => !prevUserIds.includes(u.id));
    const removedUsers = order.assignedUsers.filter(
      (u) => u.role === "user" && !selectedUsers.includes(u.id),
    );
    const parts = [];
    if (addedUsers.length) parts.push(`Assigned: ${addedUsers.map((u) => u.name).join(", ")}`);
    if (removedUsers.length) parts.push(`Removed: ${removedUsers.map((u) => u.name).join(", ")}`);
    let newActivity = {
      title: "Assigned Users Updated",
      description: parts.length ? parts.join(". ") + "." : "Assigned users updated.",
    };
    updateOrder.orderActivity = newActivity;
    if (!updateOrder?.assignedUsers?.length) {
      Swal.fire("Warning!", "Please select one user for assign.", "warning");
      loading = false;
    } else {
      try {
        const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
          method: "PUT",
          data: JSON.stringify(updateOrder),
        });
        order = { ...order, assignedUsers: data.data?.assignedUsers ?? order.assignedUsers };
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#add_contact");
      } catch (error) {
        loading = false;
        const validationErrors = errorHandle(error);
        if (validationErrors && typeof validationErrors === "object") {
          formErrors = validationErrors;
        } else {
          errorMessage = "An unexpected error occurred.";
        }
      } finally {
        loading = false;
      }
    }
  }
  async function cerateChildOrder() {
    errorMessage = "";
    loading = true;
    formErrors = {};
    const componentPayload = {};
    if (order) {
      componentPayload.title = order.title;
      componentPayload.parentId = order.id;
      componentPayload.status = order.status;
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/children", {
        method: "POST",
        data: JSON.stringify(componentPayload),
      }); // Reset Form
      formErrors = {};
      if (data) {
        order.childOrders = [data.data, ...order.childOrders];
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");
        let newActivity = {
          title: "Order Component Added",
          description: "A new component has been added to the order.",
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        order.groupedActivities = addActivityToGroupedActivities(newActivity);
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  let activeTab = "Activity";
  let statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
  };
  function setAssignedUsers() {
    selectedUsers = [];
    userSearch = "";
    order?.assignedUsers.forEach((user) => {
      if (user?.role === "user") {
        selectedUsers.push(user?.id);
      }
    });
  }
  const statuses = [
    "New Lead",
    "Contacted",
    "Quotation Sent",
    "Follow Up",
    "Needs Assessment",
    "Qualified",
    "Negotiation In Progress",
    "Deal Won",
    "Unqualified",
    "Deal Lost",
  ];
  let activeDate = new Date().toISOString().split("T")[0];
  function toggleAccordion(date) {
    activeDate = activeDate === date ? null : date;
  }
  function shortenFileName(name, keepStart = 8, keepEnd = 12) {
    if (name.length <= keepStart + keepEnd) return name;
    return name.slice(0, keepStart) + "..." + name.slice(-keepEnd);
  }
  function convertDate(rawTimestamp, format) {
    if (!rawTimestamp) return "";
    let s = String(rawTimestamp);
    if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
    return new Date(s).toLocaleString("en-GB", format);
  }
  let observer;
  function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") === 0) {
        const blob = item.getAsFile();
        if (blob) {
          handleFileChangePaste(blob);
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(blob);
          document.getElementById("attachmentFile").files = dataTransfer.files;
        }
      }
    }
  }
  async function editChildOrder(component) {
    childOrderId = component?.id;
    orderTitle = component?.title;
    orderWorkOrderNumber = component?.workOrderNumber;
  }
  onDestroy(() => {
    observer?.disconnect();
    if (typeof document !== "undefined") {
      document.removeEventListener("paste", handlePaste);
    }
  });
  function newDateFormate(date, format) {
    let formattedDate;
    if (typeof date === "string" && date.includes(".") && !date.endsWith("Z")) {
      const [datePart, msPart] = date.split(".");
      const trimmedMs = msPart.slice(0, 3);
      const isoFormatted = `${datePart}.${trimmedMs}Z`;
      formattedDate = new Date(isoFormatted);
    } else {
      formattedDate = new Date(date);
    }
    if (isNaN(formattedDate)) {
      return "Invalid date";
    }
    return formattedDate.toLocaleString("en-GB", format);
  }
  const currencies = [
    { code: "INR", symbol: "â‚¹" },
    { code: "USD", symbol: "$" },
  ];
  function togglePin(id) {
    let pinstatus = "false";
    if (order?.pinStatus === "true") {
      pinstatus = "false";
    } else {
      pinstatus = "true";
    }
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
            formErrors = validationErrors;
          } else {
            errorMessage = "An unexpected error occurred.";
          }
        } finally {
          loading = false;
        }
      }
    });
  }
  async function changeOrderStatus(newStatus) {
    if (order.status === newStatus) return;
    const prevStatus = order.status;
    const prevLabel = $statusNamesStore[prevStatus]?.name ?? prevStatus;
    const newLabel = $statusNamesStore[newStatus]?.name ?? newStatus;
    const result = await Swal.fire({
      title: "Change Status?",
      text: `Change status from "${prevLabel}" to "${newLabel}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, change it!",
    });
    if (!result.isConfirmed) return;
    order.status = newStatus; // optimistic update
    try {
      await authApiFetch(`${API_ROUTES.ORDER}/${order.id}`, {
        method: "PUT",
        data: JSON.stringify({
          status: newStatus,
          orderActivity: {
            title: "Status Changed",
            description: `Status changed from "${prevLabel}" to "${newLabel}".`,
          },
        }),
      });
      let newActivity = {
        title: "Status Changed",
        description: `Status changed from "${prevLabel}" to "${newLabel}".`,
        createdAt: new Date().toISOString(),
      };
      order.groupedActivities = addActivityToGroupedActivities(newActivity);
      Swal.fire("Success!", `Status changed to "${newLabel}".`, "success");
    } catch (error) {
      order.status = prevStatus; // revert on error
      Swal.fire("Error!", "Failed to change status.", "error");
    }
  }
  async function setOrderPinStatus(status) {
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors
    const updateOrder = { pinStatus: status };
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify(updateOrder),
      });
      order = { ...order, pinStatus: updateOrder.pinStatus };
      Swal.fire("Success!", "Pin Status updated successfully.", "success");
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  let visibilityMap = {};
  function toggleVisibility(index) {
    visibilityMap[index] = !visibilityMap[index];
  }
  const sources = ["Whatsapp", "Website", "Mail"];
  let showImages = []; // â”€â”€ Component-compatible wrapper functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleAddChat({ type, message: msg }) {
    loading = true;
    formErrors = {};
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify({ orderId: Number(orderId), type, message: msg }),
      });
      if (data) {
        order.orderChats = [data.data, ...order.orderChats];
        Swal.fire("Success!", data.message, "success");
        let act = {
          title: "Order Chat Added",
          description: "A new chat has been added.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        order.groupedActivities = addActivityToGroupedActivities(act);
      }
    } catch (err) {
      errorHandle(err);
    } finally {
      loading = false;
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
      const data = await authApiFetch(`${API_ROUTES.ORDER_CHAT}/${id}`, { method: "DELETE" });
      order.orderChats = order.orderChats.map((c) =>
        c.id === id ? { ...c, deletedAt: new Date().toISOString() } : c,
      );
      if (data?.message) Swal.fire("Success!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }
  async function handleAddReminder({ reminderTime: rt, message: msg }) {
    loading = true;
    formErrors = {};
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_REMINDER, {
        method: "POST",
        data: JSON.stringify({ orderId: Number(orderId), reminderTime: rt, message: msg }),
      });
      if (data) {
        order.orderReminders = [data.data, ...order.orderReminders];
        Swal.fire("Success!", data.message, "success");
        let act = {
          title: "Order Reminder Added",
          description: "A new reminder added.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        order.groupedActivities = addActivityToGroupedActivities(act);
      }
    } catch (err) {
      errorHandle(err);
    } finally {
      loading = false;
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
      const data = await authApiFetch(`${API_ROUTES.ORDER_REMINDER}/${id}`, { method: "DELETE" });
      order.orderReminders = order.orderReminders.map((rem) =>
        rem.id === id ? { ...rem, deletedAt: new Date().toISOString() } : rem,
      );
      if (data?.message) Swal.fire("Success!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }
  async function handleAddAttachment({ aTitle: t, link: l, files: fs }) {
    loading = true;
    formErrors = {};
    const payload = new FormData();
    payload.append("title", t);
    payload.append("link", l);
    if (fs && fs.length) fs.forEach((f) => payload.append("file", f));
    payload.append("orderId", Number(orderId));
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_ATTACHMENT, {
        method: "POST",
        data: payload,
      });
      if (data) {
        order.orderAttachments = [data.data, ...order.orderAttachments];
        Swal.fire("Success!", data.message, "success");
        let act = {
          title: "Order Attachment Added",
          description: "A new attachment added.",
          data: data?.data,
          createdAt: new Date().toISOString(),
        };
        order.groupedActivities = addActivityToGroupedActivities(act);
      }
    } catch (err) {
      const ve = errorHandle(err);
      if (ve) formErrors = ve;
    } finally {
      loading = false;
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
      const data = await authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}/${id}`, { method: "DELETE" });
      order.orderAttachments = order.orderAttachments.map((a) =>
        a.id === id ? { ...a, deletedAt: new Date().toISOString() } : a,
      );
      if (data?.message) Swal.fire("Success!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }
  async function handleAddAssignedUser(selectedUserIds) {
    loading = true;
    formErrors = {};
    const newAssigned = selectedUserIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
    const existingAdmins = order.assignedUsers.filter((u) => u.role === "admin");
    const assignedUsers = [...newAssigned, ...existingAdmins];
    if (!assignedUsers.length) {
      Swal.fire("Warning!", "Please select at least one user.", "warning");
      loading = false;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify({
          assignedUsers,
          orderActivity: {
            title: "Assigned Users Updated",
            description: "Assigned users updated.",
          },
        }),
      });
      order = { ...order, assignedUsers: data.data?.assignedUsers ?? order.assignedUsers };
      Swal.fire("Success!", data.message, "success");
      closeModalMenual("#add_contact");
    } catch (err) {
      errorHandle(err);
    } finally {
      loading = false;
    }
  }
  async function handleEditComponentCompat({ orderTitle: t, orderWorkOrderNumber: wo }) {
    loading = true;
    formErrors = {};
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + childOrderId, {
        method: "PUT",
        data: JSON.stringify({ title: t, workOrderNumber: wo }),
      });
      if (data) {
        order.childOrders = order.childOrders.map((c) =>
          c.id === childOrderId ? { ...c, title: t, workOrderNumber: wo } : c,
        );
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");
      }
    } catch (err) {
      const ve = errorHandle(err);
      if (ve) formErrors = ve;
    } finally {
      loading = false;
    }
  }
  async function handleSubmitVisitModal(payload) {
    await submitVisitModal(payload);
  }
  let showImagesStart = 0;
  function openImageLightbox(urls, index = 0) {
    showImagesStart = index;
    showImages = Array.isArray(urls) ? urls : [urls];
  } // Open image in lightbox; open other files in a new tab
  function openAttachment(url, mime, name) {
    const isImg = mime
      ? mime.startsWith("image/")
      : /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name ?? "");
    if (isImg) {
      openImageLightbox([url], 0);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } // Return { icon, bg } based on mime type or filename
  function fileIcon(mime, name) {
    const m = mime ?? "";
    const n = (name ?? "").toLowerCase();
    if (m.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(n))
      return { icon: "ti-photo", bg: "bg-success" };
    if (m === "application/pdf" || n.endsWith(".pdf"))
      return { icon: "ti-file-type-pdf", bg: "bg-danger" };
    if (m.includes("word") || /\.(doc|docx)$/.test(n))
      return { icon: "ti-file-type-doc", bg: "bg-primary" };
    if (m.includes("excel") || m.includes("spreadsheet") || /\.(xls|xlsx|csv)$/.test(n))
      return { icon: "ti-file-spreadsheet", bg: "bg-success" };
    if (m.includes("zip") || m.includes("rar") || /\.(zip|rar|7z|tar|gz)$/.test(n))
      return { icon: "ti-file-zip", bg: "bg-warning" };
    return { icon: "ti-file", bg: "bg-secondary" };
  }
</script>

{#if loadingData && !order}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button
          class="btn btn-outline-secondary btn-sm"
          on:click={() => (history.length > 2 ? history.back() : goto("/admin/order"))}
        >
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/order">Orders</a></li>
              <li class="breadcrumb-item active" aria-current="page">{order?.title || "Order"}</li>
            </ol>
          </nav>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <button class="btn btn-warning" on:click={() => deleteOrder(order?.id)}>
          <i class="ti ti-archive me-1"></i>Archive Order
        </button>
        <a
          href="#offcanvas_add"
          class="btn btn-primary"
          data-bs-toggle="offcanvas"
          data-bs-target="#offcanvas_add"
        >
          <i class="ti ti-square-rounded-plus-filled me-1"></i>Edit Order
        </a>
        {#if currentUser?.subRole === "telecaller" || (currentUser?.role === "user" && !currentUser?.subRole)}
          <button class="btn btn-info text-white" on:click={openQueryModal}>
            <i class="ti ti-help-circle me-1"></i>Raise Query
          </button>
        {/if}
      </div>
    </div>
    <!-- End Page Header -->
    {#if !loadingData}
      {#if order}
        <LightBox data={showImages} startIndex={showImagesStart} />
        <div class="row">
          <div class="col-md-12">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-3"><div></div></div>
            <!-- Query Modals -->
            <OrderQueryModals
              bind:showQueryModal
              bind:showEditQueryModal
              bind:querySubject
              bind:queryDescription
              bind:editQuerySubject
              bind:editQueryDescription
              {queryError}
              {raisingQuery}
              {editQueryError}
              {editingQueryLoading}
              {submitOrderQuery}
              {submitEditQuery}
            />
            <OrderHeader
              {order}
              {statuses}
              {togglePin}
              {changeOrderStatus}
              bind:piwotiOpen
              bind:piwotiType
              {orderVisits}
              {openVisitModal}
              bind:showVisitListModal
            />
            <!-- /Contact User -->
          </div>
          <OrderSidebar
            {order}
            bind:orderInfoExpanded
            bind:showChangeClientModal
            bind:showAddContactModal
            bind:showNewClientModal
            bind:showEditClientModal
            {linkContact}
            {setPrimaryContact}
            {unlinkContact}
            {setAssignedUsers}
          />
          <!-- /Contact Sidebar -->
          <!-- Contact Details -->
          <div class="col-xl-8">
            <!-- 
<div class="mb-3 pb-3 border-bottom">            <h5 class="mb-3">Order Pipeline Status</h5>            
<div class="step-progress d-flex flex-wrap gap-2">              
{#each statuses as status}                
<div class={`step bg-indigo ${statusesColors[status] || "bg-gray"}`}>{$statusNamesStore[status]?.name ?? status}
</div>              
{/each}            
</div>          
</div> -->
            <div class="card mb-3">
              <div class="card-body pb-0 pt-2 px-2">
                <ul class="nav nav-tabs nav-bordered border-0 mb-0">
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_1"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link active border-3"
                      class:active={activeTab === "Activity"}
                      on:click|preventDefault={() => (activeTab = "Activity")}
                      aria-selected={activeTab === "Activity"}
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-alarm-minus me-1"></i>Activities
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_2"
                      data-bs-toggle="tab"
                      aria-expanded="true"
                      class="nav-link border-3"
                      class:active={activeTab === "Files"}
                      on:click|preventDefault={() => (activeTab = "Files")}
                      aria-selected={activeTab === "Files"}
                      role="tab"
                      tabindex="-1"
                    >
                      <span class="d-md-inline-block"> <i class="ti ti-file me-1"></i>Files </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_3"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Chats"}
                      on:click|preventDefault={() => (activeTab = "Chats")}
                      aria-selected={activeTab === "Chats"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-brand-hipchat me-1"></i>Chats
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_6"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Client"}
                      on:click|preventDefault={() => (activeTab = "Client")}
                      aria-selected={activeTab === "Client"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-user me-1"></i>Clients
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_7"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Reminders"}
                      on:click|preventDefault={() => (activeTab = "Reminders")}
                      aria-selected={activeTab === "Reminders"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-alarm-snooze me-1"></i>Reminders
                      </span>
                    </a>
                  </li>
                  <li class="nav-item" role="presentation">
                    <a
                      href="#tab_10"
                      data-bs-toggle="tab"
                      aria-expanded="false"
                      class="nav-link border-3"
                      class:active={activeTab === "Queries"}
                      on:click|preventDefault={() => {
                        activeTab = "Queries";
                        loadOrderQueries();
                      }}
                      aria-selected={activeTab === "Queries"}
                      tabindex="-1"
                      role="tab"
                    >
                      <span class="d-md-inline-block">
                        <i class="ti ti-help-circle me-1"></i>Queries
                        {#if currentUser?.subRole === "tech"}
                          {@const myCount = orderQueries.filter(
                            (q) => q.assignedTo?.id === currentUser?.id,
                          ).length}
                          {#if myCount > 0}
                            <span class="badge bg-success ms-1" style="font-size:10px;"
                              >{myCount}</span
                            >
                          {/if}
                        {:else if orderQueries.length > 0}
                          <span class="badge bg-primary ms-1" style="font-size:10px;"
                            >{orderQueries.length}</span
                          >
                        {/if}
                      </span>
                    </a>
                  </li>
                  {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
                    <li class="nav-item" role="presentation">
                      <a
                        href="#tab_8"
                        data-bs-toggle="tab"
                        aria-expanded="false"
                        class="nav-link border-3"
                        class:active={activeTab === "Components"}
                        on:click|preventDefault={() => (activeTab = "Components")}
                        aria-selected={activeTab === "Components"}
                        tabindex="-1"
                        role="tab"
                      >
                        <span class="d-md-inline-block">
                          <i class="ti ti-stack me-1"></i>Multiple Orders
                        </span>
                      </a>
                    </li>
                  {/if}
                  {#if ["Dispatched", "Completed"].includes(order?.status)}
                    <li class="nav-item" role="presentation">
                      <a
                        href="#tab_9"
                        data-bs-toggle="tab"
                        aria-expanded="false"
                        class="nav-link border-3"
                        class:active={activeTab === "Installation"}
                        on:click|preventDefault={() => (activeTab = "Installation")}
                        aria-selected={activeTab === "Installation"}
                        tabindex="-1"
                        role="tab"
                      >
                        <span class="d-md-inline-block">
                          <i class="ti ti-truck-delivery me-1"></i>Dispatched
                        </span>
                      </a>
                    </li>
                  {/if}
                </ul>
              </div>
            </div>
            <!-- Tab Content -->
            <div class="tab-content pt-0">
              {#if activeTab === "Activity"}
                <OrderActivityTab {order} {currentUser} {activeDate} {toggleAccordion} />
                <!-- Activities (inline backup â€” replaced by component above) -->
              {/if}
              {#if activeTab === "Files"}
                <OrderFilesTab
                  {order}
                  {maskAuthorName}
                  addAttachment={handleAddAttachment}
                  deleteAttachment={handleDeleteAttachment}
                  {openAttachment}
                  {openImageLightbox}
                />
                <!-- Files (legacy inline â€” replaced by component) -->
              {/if}
              {#if activeTab === "Chats"}
                <OrderChatsTab
                  {order}
                  {currentUser}
                  {maskAuthorName}
                  addChat={handleAddChat}
                  deleteChat={handleDeleteChat}
                />
                <!-- Chats (legacy inline â€” replaced by component) -->
              {/if}
              {#if activeTab === "Client"}
                <OrderLegacyClientsTab {order} {deleteClient} />
              {/if}
              {#if activeTab === "Reminders"}
                <OrderRemindersTab
                  {order}
                  {maskAuthorName}
                  addReminder={handleAddReminder}
                  deleteReminder={handleDeleteReminder}
                />
              {/if}
              {#if activeTab === "Queries"}
                <OrderQueriesTab
                  {order}
                  {currentUser}
                  {orderQueries}
                  {orderQueriesLoading}
                  {maskAssignedName}
                  {openQueryModal}
                  {openEditQueryModal}
                />
              {/if}
              {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
                {#if activeTab === "Components"}
                  <OrderComponentsTab
                    {order}
                    {cerateChildOrder}
                    {editChildOrder}
                    {deleteComponent}
                    editComponent={handleEditComponentCompat}
                  />
                  <!-- Components (legacy inline â€” replaced by component) -->
                {/if}
              {/if}
              {#if ["Dispatched", "Completed"].includes(order?.status)}
                {#if activeTab === "Installation"}
                  <DispatchProcess {order} />
                {/if}
              {/if}
            </div>
            <!-- /Tab Content -->
          </div>
          <!-- /Contact Details -->
        </div>
      {:else}
        <!-- Order failed to load -->
        <div class="row">
          <div class="col-md-12">
            <div
              class="d-flex flex-column align-items-center justify-content-center text-center"
              style="min-height:50vh; gap:1rem;"
            >
              <div style="font-size:3rem;">⚠️</div>
              <h4 class="fw-semibold mb-1">Order Not Found</h4>
              <p class="text-muted mb-3" style="max-width:380px;">
                {errorMessage || "This order could not be loaded. It may have been deleted or you may not have access."}
              </p>
              <div class="d-flex gap-2 flex-wrap justify-content-center">
                <button class="btn btn-primary" on:click={() => location.reload()}>
                  <i class="ti ti-refresh me-1"></i>Retry
                </button>
                <a href="/admin/order" class="btn btn-outline-secondary">
                  <i class="ti ti-arrow-left me-1"></i>Back to Orders
                </a>
              </div>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <!-- Skeleton while loading -->
      <SkeletonOrderDetail />
    {/if}
    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>
<!-- Add Canvas (component) --><OrderEditOffcanvas
  {order}
  {categories}
  {handleSubmit}
  bind:title
  bind:category
  bind:orderDate
  bind:startDate
  bind:deadlineDate
  bind:price
  bind:currency
  bind:priceTerms
  bind:source
  bind:description
  bind:workOrderNumber
  bind:formErrors
  bind:loading
  bind:errorMessage
/><!-- Add Canvas (legacy inline â€” replaced by component) --><!-- Add Attachment (now in OrderFilesTab component) --><!-- Create Chat (now in OrderChatsTab component) --><!-- Create Reminder (now in OrderRemindersTab component) --><!-- Manage Assigned Users (component) --><OrderAssignedUsersModal
  {order}
  {currentUser}
  {users}
  addAssignedUser={handleAddAssignedUser}
/><!-- Manage Assigned Users (legacy inline) --><!-- New Client + Contact Modal (for unlinked orders) --><!-- Edit Client Modal --><OrderVisitModals
  {order}
  {users}
  {orderVisits}
  bind:showVisitModal
  bind:showVisitListModal
  {openVisitModal}
  submitVisitModal={handleSubmitVisitModal}
/><OrderClientModals
  bind:order
  {addActivityToGroupedActivities}
  bind:showChangeClientModal
  bind:showNewClientModal
  bind:showAddContactModal
  bind:showEditClientModal
/><!-- Create Client -->
<div class="modal fade" id="create_client" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Client</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form on:submit={addClient} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="name">
                Name
                <span class="text-danger">* </span>
              </label>
              <input
                type="text"
                name="name"
                class="form-control"
                class:is-invalid={formErrors.name}
                bind:value={name}
                required
                id="name"
                placeholder="Name"
              />
              {#if formErrors.name}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.name[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="designation"> Designation </label>
              <input
                type="text"
                name="designation"
                class="form-control"
                class:is-invalid={formErrors.designation}
                bind:value={designation}
                id="designation"
                placeholder="Designation"
              />
              {#if formErrors.designation}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.designation[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="email"> Email </label>
              <input
                type="email"
                name="email"
                class="form-control"
                class:is-invalid={formErrors.email}
                bind:value={email}
                id="email"
                placeholder="Email"
              />
              {#if formErrors.email}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.email[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="mobile"> Mobile </label>
              <input
                type="text"
                name="mobile"
                class="form-control"
                class:is-invalid={formErrors.mobile}
                bind:value={mobile}
                id="mobile"
                placeholder="Mobile"
              />
              {#if formErrors.mobile}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.mobile[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="alternateMobile"> Alternate Mobile </label>
              <input
                type="text"
                name="alternateMobile"
                class="form-control"
                class:is-invalid={formErrors.alternateMobile}
                bind:value={alternateMobile}
                id="alternateMobile"
                placeholder="Alternate Mobile"
              />
              {#if formErrors.alternateMobile}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.alternateMobile[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="whatsapp"> Whatsapp </label>
              <input
                type="text"
                name="whatsapp"
                class="form-control"
                class:is-invalid={formErrors.whatsapp}
                bind:value={whatsapp}
                id="whatsapp"
                placeholder="Whatsapp"
              />
              {#if formErrors.whatsapp}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.whatsapp[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="address">
                Address
                <span class="text-danger">* </span>
              </label>
              <textarea
                id="address"
                name="address"
                class="form-control"
                rows="2"
                bind:value={address}
                class:is-invalid={formErrors.address}
                required
              ></textarea>
              {#if formErrors.address}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.address[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Client --><!-- Create Component (now in OrderComponentsTab) --><!-- /Create Client --><PIWOTIModal
  open={piwotiOpen}
  type={piwotiType}
  {order}
  on:close={() => (piwotiOpen = false)}
  on:refresh={onPIWOTIRefresh}
/>

<style>
  .order-header-card {
    border: none;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
    overflow: visible;
  }
  .order-header-card .card-body {
    overflow: visible;
  }
  .order-header-actions .dropdown-menu {
    z-index: 1050;
  }
  .order-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .order-header-identity {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    min-width: 0;
    flex: 1;
  }
  .order-header-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #212529;
    line-height: 1.35;
  }
  .order-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .order-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.55rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: #495057;
    background: #f8fafc;
    border: 1px solid #e8edf2;
    border-radius: 999px;
    line-height: 1.2;
  }
  .order-header-chip i {
    font-size: 0.8125rem;
    color: #6c757d;
  }
  .order-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .order-header-docs {
    padding-top: 0.875rem;
    border-top: 1px solid #eef1f4;
  }
  .order-header-docs-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6c757d;
    margin-bottom: 0.625rem;
  }
  .order-header-docs-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }
  .order-header-doc-item {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .order-header-doc-type {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.375rem;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #6c757d;
    background: #f1f3f5;
    border-radius: 0.375rem;
    flex-shrink: 0;
  }
  .order-header-doc-sep {
    width: 1px;
    height: 1.25rem;
    background: #dee2e6;
    flex-shrink: 0;
  }
  .order-header-doc-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    line-height: 1.3;
  }
  .order-header-doc-link--success {
    color: #198754;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
  }
  .order-header-doc-link--success:hover {
    background: #dcfce7;
    color: #157347;
  }
  .order-header-doc-link--warning {
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
  }
  .order-header-doc-link--warning:hover {
    background: #fef3c7;
    color: #92400e;
  }
  .order-header-doc-action {
    display: inline-flex;
    align-items: center;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--bs-primary, #3554d1);
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    border: 1px dashed #c7d2fe;
    border-radius: 0.375rem;
    background: #f8faff;
  }
  .order-header-doc-action:hover {
    background: #eef2ff;
    color: #2a43a8;
  }
  .order-header-doc-action--warning {
    color: #b45309;
    border-color: #fde68a;
    background: #fffbeb;
  }
  .order-header-doc-action--warning:hover {
    background: #fef3c7;
    color: #92400e;
  }
  .order-header-doc-muted {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    color: #adb5bd;
    font-style: italic;
  }
  .order-header-doc-badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.2em 0.45em;
  }
  @media (max-width: 575.98px) {
    .order-header-doc-sep {
      display: none;
    }
    .order-header-doc-item {
      width: 100%;
    }
  }
  .order-sidebar {
    border: none;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
    overflow: hidden;
  }
  .order-sidebar-section {
    padding: 1rem 1.125rem;
    border-bottom: 1px solid #eef1f4;
  }
  .order-sidebar-section:last-child {
    border-bottom: none;
  }
  .order-sidebar-section-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.875rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #344767;
  }
  .order-sidebar-section-head > i {
    color: var(--bs-primary, #3554d1);
    font-size: 1rem;
    line-height: 1;
  }
  .order-sidebar-actions {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    justify-content: flex-end;
  }
  .order-sidebar-meta-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .order-sidebar-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.4;
    padding: 5px 0;
  }
  .order-sidebar-label {
    color: #6c757d;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    max-width: 52%;
  }
  .order-sidebar-label i {
    font-size: 0.875rem;
    opacity: 0.8;
  }
  .order-sidebar-value {
    color: #212529;
    text-align: right;
    word-break: break-word;
  }
  .order-sidebar-expand {
    text-align: right;
    margin-top: 1rem;
    padding-top: 0.25rem;
  }
  .order-sidebar-client-card {
    background: #f8fafc;
    border: 1px solid #e8edf2;
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .order-sidebar-client-name {
    display: block;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--bs-primary, #3554d1);
    text-decoration: none;
    line-height: 1.35;
  }
  .order-sidebar-client-name:hover {
    text-decoration: underline;
  }
  .order-sidebar-client-gst {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6c757d;
  }
  .order-sidebar-contact {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: #fff;
    border: 1px solid #e8edf2;
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .order-sidebar-contact-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #212529;
    line-height: 1.35;
  }
  .order-sidebar-contact-role {
    font-size: 0.6875rem;
    font-weight: 400;
    color: #6c757d;
    margin-left: 0.125rem;
  }
  .order-sidebar-contact-detail {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: #6c757d;
    margin-top: 0.2rem;
    text-decoration: none;
    word-break: break-all;
  }
  .order-sidebar-contact-detail:hover {
    color: var(--bs-primary, #3554d1);
  }
  .order-sidebar-contact-actions {
    display: flex;
    gap: 0.125rem;
    flex-shrink: 0;
  }
  .order-sidebar-empty {
    font-size: 0.8125rem;
    color: #6c757d;
    font-style: italic;
  }
  .order-sidebar-empty-state {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f8fafc;
    border: 1px dashed #dee2e6;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    color: #6c757d;
  }
  .order-sidebar-empty-state i {
    font-size: 1.125rem;
    opacity: 0.65;
  }
  .order-sidebar-chip-section {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px dashed #e8edf2;
  }
  .order-sidebar-chip-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #6c757d;
    margin-bottom: 0.5rem;
  }
  .order-sidebar-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .order-sidebar-user {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0;
    font-size: 0.8125rem;
  }
  .order-sidebar-user-name {
    font-weight: 500;
    color: #212529;
  }
  .order-sidebar-badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.2em 0.45em;
  }
  .order-sidebar-alert {
    font-size: 0.75rem;
  }
  .order-sidebar-audit {
    padding-top: 0.75rem;
    border-top: 1px dashed #e8edf2;
  }
  .order-sidebar-doc-group {
    margin-bottom: 0.875rem;
  }
  .order-sidebar-doc-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6c757d;
    margin-bottom: 0.375rem;
  }
  .order-sidebar-doc-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--bs-primary, #3554d1);
    text-decoration: none;
    padding: 0.3rem 0;
    line-height: 1.35;
  }
  .order-sidebar-doc-link:hover {
    text-decoration: underline;
  }
  .order-sidebar-doc-link i {
    font-size: 0.9375rem;
    opacity: 0.85;
  }
  .ribbon {
    position: absolute;
    overflow: hidden;
    width: 75px;
    height: 75px;
    z-index: 99;
  }
  .ribbon-top-right {
    top: -3px;
    right: -3px;
  }
  .ribbon-top-left {
    top: -3px;
    left: -3px;
  }
  .ribbon span {
    position: absolute;
    display: block;
    width: 100px;
    padding: 4px 0;
    color: #fff;
    font-size: 8px;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  }
  .ribbon-top-left span {
    left: -25px;
    top: 15px;
    transform: rotate(-45deg);
  }
</style>
