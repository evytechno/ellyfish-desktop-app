<script>
  import { onDestroy, onMount } from "svelte";
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
  import { statusNamesStore } from "$lib/stores/statusNames";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";

  let piwotiOpen = false;
  let piwotiType = "PI";

  async function onPIWOTIRefresh() {
    try {
      const updated = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
      order.orderPayments = updated.orderPayments ?? [];
      order.workOrders    = updated.workOrders    ?? [];
      order.invoices      = updated.invoices      ?? [];
      order = { ...order };
    } catch {}
  }
  let loadingData = true;
  import { usersAllStore, categoriesAllStore } from "$lib/stores/dataStores";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { get } from "svelte/store";
  import LightBox from "$lib/components/LightBox.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { maskAssignedName as _maskAssignedName } from '$lib/utils/maskUser';
  import QuillEditor from "$lib/components/QuillEditor.svelte";
  import DOMPurify from "dompurify";

  function isHtml(str) {
    return str ? /<[a-z][\s\S]*>/i.test(str) : false;
  }
  function safeHtml(str) {
    return DOMPurify.sanitize(str ?? '');
  }
  import DispatchProcess from "$lib/components/DispatchProcess.svelte";

  let errorMessage = "";
  let order = null;
  let users = [];

  // Form state
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
  let selectedTypes = [];   // multi-select array for the form
  let chatTypeFilter = "All";

  // Toggle a type in the form selector
  function toggleChatType(t) {
    if (t === "All") {
      selectedTypes = selectedTypes.length === CHAT_TYPES.length ? [] : [...CHAT_TYPES];
    } else {
      selectedTypes = selectedTypes.includes(t)
        ? selectedTypes.filter((x) => x !== t)
        : [...selectedTypes, t];
    }
  }
  $: allSelected = selectedTypes.length === CHAT_TYPES.length;

  // Normalize a single raw token
  function normalizeSingleType(raw) {
    if (!raw || raw.trim() === "") return null;
    const t = raw.trim().toLowerCase();
    if (t.includes("call")) return "Call";
    if (t.includes("whatsapp") || t.includes("whats app") || t === "wa") return "WhatsApp";
    if (t.includes("email") || t.includes("mail")) return "Email";
    return null;
  }

  // Parse comma-separated type string → normalized array (no nulls)
  function normalizeTypes(typeStr) {
    if (!typeStr || typeStr.trim() === "") return [];
    return typeStr.split(",").map(normalizeSingleType).filter(Boolean);
  }

  // For single icon/color use (first type wins)
  function normalizeType(typeStr) {
    return normalizeTypes(typeStr)[0] ?? "Other";
  }

  $: filteredChats = chatTypeFilter === "All"
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

  let loading = false;

  // Field-specific error messages
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

    const formatDate = (dateStr) =>
      new Date(dateStr).toISOString().split("T")[0]; // returns "YYYY-MM-DD"

    const activityDate = formatDate(newActivity.createdAt);

    // Normalize existing group dates for reliable comparison
    let group = groupedActivities.find(
      (g) => formatDate(g.date) === activityDate,
    );

    if (group) {
      group.activities.unshift(newActivity);
      group.activities.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
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

    let newActivity = {
      title: "Order Updated",
      description: `Order details have been updated.`,
    };
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
      console.log("formErrors : ", formErrors);

      loading = false;
    }
  }

  async function getAllCategories() {
    const cached = get(categoriesAllStore);
    if (
      cached &&
      cached.length > 0 &&
      typeof cached[0] === "object" &&
      cached[0].label
    ) {
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
  let currentUser = null;

  /** Returns the display name for an assigned user based on the viewer's role/subRole. */
  function maskAssignedName(assignedUser) {
    return _maskAssignedName(assignedUser, currentUser);
  }

  // Related Queries
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
  }

  // Raise Query from order detail
  let showQueryModal = false;
  let querySubject = "";
  let queryDescription = "";
  let raisingQuery = false;
  let queryError = "";

  // ── Order Visits ────────────────────────────────────────────────────────────
  let orderVisits = [];

  async function loadOrderVisits() {
    if (!orderId) return;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}?orderId=${orderId}&limit=50`);
      orderVisits = res?.data ?? [];
    } catch (_) {}
  }

  // ── Visit List Modal ────────────────────────────────────────────────────────
  let showVisitListModal = false;

  // ── Create Visit Modal ──────────────────────────────────────────────────────
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
      }).then((r) => { if (r.isConfirmed) showChangeClientModal = true; });
      return;
    }
    visitError = "";
    visitFormErrors = {};
    visitType = "outgoing";
    visitDate = new Date().toISOString().slice(0, 10);
    visitStartTime = ""; visitEndTime = ""; visitTransport = "";
    visitPurpose = ""; visitOutcome = ""; visitNextFollowUp = "";
    visitFeedback = ""; visitNotes = ""; visitTerms = "";
    visitClientContacts = []; visitSelectedContactIds = [];
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
      if (!visitCompanyId && visitCompanies.length === 1) visitCompanyId = String(visitCompanies[0].id);
    } catch (_) {}
  }

  function toggleVisitContact(id) {
    if (visitSelectedContactIds.includes(id))
      visitSelectedContactIds = visitSelectedContactIds.filter((x) => x !== id);
    else visitSelectedContactIds = [...visitSelectedContactIds, id];
  }

  function addVisitAttendee() { visitAttendees = [...visitAttendees, { userId: "", isLead: false }]; }
  function removeVisitAttendee(i) { visitAttendees = visitAttendees.filter((_, idx) => idx !== i); }

  async function submitVisitModal() {
    visitError = "";
    visitFormErrors = {};
    if (!visitCompanyId) { visitFormErrors.companyId = "Company is required."; return; }
    if (!visitPurpose.trim()) { visitFormErrors.purpose = "Purpose is required."; return; }
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
        attendees: visitAttendees.filter((a) => a.userId).map((a) => ({ userId: Number(a.userId), isLead: a.isLead })),
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
      }).then((r) => { if (r.isConfirmed && newId) goto(`/admin/client-visit/edit/${newId}`); });
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
        queryError = msg
          .flatMap((m) => Object.values(m.constraints ?? {}))
          .join(" • ");
      } else {
        queryError = "Failed to raise query.";
      }
    } finally {
      raisingQuery = false;
    }
  }

  // Edit Query from order detail
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
      else if (Array.isArray(msg)) editQueryError = msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" • ");
      else editQueryError = "Failed to update query.";
    } finally {
      editingQueryLoading = false;
    }
  }

  // Loading states for each relation section
  let relationsLoading = true;

  async function loadOrder() {
    if (!orderId) return;
    loadingData = true;
    relationsLoading = true;
    order = null;
    orderQueries = [];
    selectedUsers = [];

    try {
      // ── Wave 1: Core order only (fast — no heavy joins) ──────────────────
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}/basic`);
      order = {
        ...data,
        // pre-fill empty arrays so template doesn't crash before wave 2
        orderChats:       [],
        orderAttachments: [],
        orderReminders:   [],
        orderClients:     data.orderClients ?? [],
        orderContacts:    [],
        orderActivities:  [],
        groupedActivities:[],
        childOrders:      [],
        invoices:         data.invoices ?? [],
        orderPayments:    data.orderPayments ?? [],
        workOrders:       data.workOrders ?? [],
      };

      // populate form fields immediately
      title           = data?.title;
      category        = data?.category;
      orderDate       = data?.orderDate ? new Date(data.orderDate).toISOString().substring(0, 10) : "";
      startDate       = data?.startDate ? new Date(data.startDate).toISOString().substring(0, 10) : "";
      deadlineDate    = data?.deadlineDate ? new Date(data.deadlineDate).toISOString().substring(0, 10) : "";
      price           = data?.price;
      priceTerms      = data?.priceTerms;
      currency        = data?.currency;
      source          = data?.source;
      description     = data?.description;
      gstNumber       = data?.gstNumber;
      workOrderNumber = data?.workOrderNumber;
      importStatus    = data?.importStatus;
      company         = data?.company;

      data?.assignedUsers?.forEach((user) => {
        if (user?.role == "user") selectedUsers.push(user?.id);
      });

      loadingData = false; // page renders now — user sees content

      loadOrderVisits();

      // ── Wave 2: Load all heavy relations in parallel ─────────────────────
      const [chats, attachments, reminders, clients, contacts, activities, childOrders] =
        await Promise.allSettled([
          authApiFetch(`${API_ROUTES.ORDER_CHAT}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_REMINDER}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_CLIENT}?orderId=${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER_CONTACT}/by-order/${orderId}`),
          authApiFetch(`${API_ROUTES.ORDER}/${orderId}`).then(d => d), // full order for activities
          authApiFetch(`${API_ROUTES.ORDER}?status=all&parentId=${orderId}&limit=50`).catch(() => ({ data: [] })),
        ]);

      // merge results into order — only update if request succeeded
      if (chats.status === 'fulfilled') {
        const raw = Array.isArray(chats.value) ? chats.value : (chats.value?.data ?? []);
        order.orderChats = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (attachments.status === 'fulfilled') {
        const raw = Array.isArray(attachments.value) ? attachments.value : (attachments.value?.data ?? []);
        order.orderAttachments = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (reminders.status === 'fulfilled') {
        const raw = Array.isArray(reminders.value) ? reminders.value : (reminders.value?.data ?? []);
        order.orderReminders = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (clients.status === 'fulfilled') {
        const raw = Array.isArray(clients.value) ? clients.value : (clients.value?.data ?? []);
        order.orderClients = raw.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      if (contacts.status === 'fulfilled') {
        order.orderContacts = Array.isArray(contacts.value) ? contacts.value : (contacts.value?.data ?? []);
      }
      if (activities.status === 'fulfilled') {
        // full order response has groupedActivities + childOrders + invoices
        const full = activities.value;
        order.groupedActivities = full.groupedActivities ?? [];
        order.childOrders       = full.childOrders ?? [];
        order.invoices          = full.invoices ?? [];
        order.orderLabels       = full.orderLabels ?? [];
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
  });

  afterNavigate(async () => {
    currentUser = checkAuth();
    await loadOrder();
  });

  onMount(async () => {
    try {
      const cached = get(usersAllStore);
      if (cached && cached.length > 0) {
        users = cached;
        loadingData = false;
        return;
      }
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
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
          const data = await authApiFetch(API_ROUTES.ORDER + "/" + id, {
            method: "DELETE",
          });
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
      console.log("formErrors : ", formErrors);
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
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
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
          const data = await authApiFetch(
            `${API_ROUTES.ORDER_ATTACHMENT}/${id}`,
            {
              method: "DELETE",
            },
          );

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
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
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

    const chatPayload = {
      type: selectedTypes.join(","),
      message,
    };
    if (order) {
      chatPayload.orderId = order.id;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify(chatPayload),
      });

      // Reset Form
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
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
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
          const data = await authApiFetch(`${API_ROUTES.ORDER_CHAT}/${id}`, {
            method: "DELETE",
          });

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
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
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
      });

      // Reset Form
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
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
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
          const data = await authApiFetch(
            `${API_ROUTES.ORDER_REMINDER}/${id}`,
            {
              method: "DELETE",
            },
          );

          order.orderReminders = order.orderReminders.filter(
            (reminder) => reminder.id !== id,
          );
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
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
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

    const clientPayload = {
      name,
      mobile,
      whatsapp,
      address,
      alternateMobile,
      designation,
      remark,
    };
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
      });

      // Reset Form
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
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
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
          const data = await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${id}`, {
            method: "DELETE",
          });

          order.orderClients = order.orderClients.filter(
            (client) => client.id !== id,
          );
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
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  let orderInfoExpanded = false;

  // ── Edit Client ──────────────────────────────────────────────────────────────
  let showEditClientModal = false;
  let editClientData = { name: "", email: "", mobile: "", whatsapp: "", address: "", gstNumber: "", remark: "" };
  let savingClient = false;
  let editClientErrors = {};

  function openEditClientModal() {
    const c = order.client;
    editClientData = {
      name:       c.name       ?? "",
      email:      c.email      ?? "",
      mobile:     c.mobile     ?? "",
      whatsapp:   c.whatsapp   ?? "",
      address:    c.address    ?? "",
      gstNumber:  c.gstNumber  ?? "",
      remark:     c.remark     ?? "",
    };
    editClientErrors = {};
    showEditClientModal = true;
  }

  async function saveEditClient() {
    if (!editClientData.name?.trim()) {
      editClientErrors = { name: "Client name is required." };
      return;
    }
    savingClient = true;
    editClientErrors = {};
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/${order.client.id}`, {
        method: "PUT",
        data: JSON.stringify(editClientData),
      });
      order = { ...order, client: { ...order.client, ...editClientData } };
      showEditClientModal = false;
    } catch (e) {
      const errs = e?.data?.message;
      if (typeof errs === "object") editClientErrors = errs;
      else editClientErrors = { name: errs ?? "Failed to update client." };
    } finally {
      savingClient = false;
    }
  }

  // ── Change Client ────────────────────────────────────────────────────────────
  let showChangeClientModal = false;
  let changeClientQuery = "";
  let changeClientResults = [];
  let changeClientLoading = false;
  let changeClientTimer = null;
  let changeClientDropdown = false;

  // Legacy contacts checkboxes (shown only when no clientId + orderClients exist)
  let legacyChecked = []; // array of checked orderClient ids
  $: legacyContacts =
    !order?.clientId && order?.orderClients?.length > 0
      ? order.orderClients.filter((oc) => !oc.deletedAt)
      : [];

  // Init all checked when modal opens
  function initLegacyChecked() {
    legacyChecked = legacyContacts.map((oc) => oc.id);
  }

  function toggleLegacy(id) {
    if (legacyChecked.includes(id))
      legacyChecked = legacyChecked.filter((i) => i !== id);
    else legacyChecked = [...legacyChecked, id];
  }

  // Helper — after linking client, also migrate checked legacy contacts
  async function migrateLegacyContacts(resolvedClient) {
    const toMigrate = legacyContacts.filter((oc) =>
      legacyChecked.includes(oc.id),
    );
    for (const oc of toMigrate) {
      try {
        // Create ClientContact under the linked client
        let contact = null;
        const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
          method: "POST",
          data: JSON.stringify({
            clientId: resolvedClient.id,
            name: oc.name,
            mobile: oc.mobile || undefined,
            email: oc.email || undefined,
            designation: oc.designation || undefined,
            whatsapp: oc.whatsapp || undefined,
            alternateMobile: oc.alternateMobile || undefined,
            address: oc.address || undefined,
          }),
        });
        contact = contactRes.data;

        // Create OrderContact link
        const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
          method: "POST",
          data: JSON.stringify({
            orderId: order.id,
            clientContactId: contact.id,
          }),
        });

        // Update local order state
        if (!order.orderContacts) order.orderContacts = [];
        order.orderContacts = [...order.orderContacts, ocRes.data];
        if (!resolvedClient.contacts) resolvedClient.contacts = [];
        resolvedClient.contacts = [...resolvedClient.contacts, contact];
      } catch (e) {
        console.error("Failed to migrate contact:", oc.name, e);
      }
    }
  }

  // Inline create new client inside Change/Link Client modal
  let ccSelectedExisting = null; // existing client selected from search results
  let ccInlineCreate = false;
  let ccNewName = "";
  let ccNewGst = "";
  let ccNewMobile = "";
  let ccNewEmail = "";
  let ccNewAddress = "";
  let ccCreateLoading = false;
  let ccCreateErrors = {};

  function ccOpenInlineCreate() {
    ccInlineCreate = true;
    ccNewName = changeClientQuery; // pre-fill with searched text
    ccNewGst = "";
    ccNewMobile = "";
    ccNewEmail = "";
    ccNewAddress = "";
    ccCreateErrors = {};
  }

  function ccCancelInlineCreate() {
    ccInlineCreate = false;
    ccNewName = "";
    ccNewGst = "";
    ccNewMobile = "";
    ccNewEmail = "";
    ccNewAddress = "";
    ccCreateErrors = {};
  }

  async function ccCreateAndLink() {
    ccCreateErrors = {};
    if (!ccNewName.trim()) {
      ccCreateErrors.name = "Company name is required.";
      return;
    }
    ccCreateLoading = true;
    try {
      // Create new client
      const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
        method: "POST",
        data: JSON.stringify({
          name: ccNewName.trim(),
          gstNumber: ccNewGst || undefined,
          mobile: ccNewMobile || undefined,
          email: ccNewEmail || undefined,
          address: ccNewAddress || undefined,
        }),
      });
      const newClient = clientRes.data;

      // Link to order (confirmChangeClient handles legacy migration too)
      await confirmChangeClient(newClient);

      ccCancelInlineCreate();
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") ccCreateErrors = errs;
      else Swal.fire("Error!", "Failed to create client.", "error");
    } finally {
      ccCreateLoading = false;
    }
  }

  async function searchChangeClient(q) {
    if (!q || q.trim().length < 1) {
      changeClientResults = [];
      changeClientDropdown = false;
      return;
    }
    changeClientLoading = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`,
        { method: "GET" },
      );
      changeClientResults = res.data || [];
      changeClientDropdown = true;
    } catch (e) {
      changeClientResults = [];
    }
    changeClientLoading = false;
  }

  function onChangeClientInput() {
    clearTimeout(changeClientTimer);
    changeClientTimer = setTimeout(
      () => searchChangeClient(changeClientQuery),
      300,
    );
  }

  async function confirmChangeClient(newClient) {
    try {
      const isFirstLink = !order.clientId; // first time linking

      const res = await authApiFetch(
        `${API_ROUTES.ORDER}/${order.id}/change-client`,
        {
          method: "PUT",
          data: JSON.stringify({ clientId: newClient.id }),
        },
      );

      order.client = newClient;
      order.clientId = newClient.id;
      order.orderContacts = [];

      // If first time linking and legacy contacts are checked — migrate them
      if (isFirstLink && legacyChecked.length > 0) {
        await migrateLegacyContacts(newClient);
      }

      showChangeClientModal = false;
      changeClientQuery = "";
      changeClientResults = [];
      changeClientDropdown = false;

      const desc = isFirstLink
        ? `Client "${newClient.name}" linked with ${legacyChecked.length} contact(s).`
        : `Client changed to "${newClient.name}".`;

      let newActivity = {
        title: isFirstLink ? "Client Linked" : "Client Changed",
        description: desc,
        createdAt: new Date().toISOString(),
      };
      order.groupedActivities = addActivityToGroupedActivities(newActivity);
      Swal.fire("Success!", res.message || desc, "success");
    } catch (error) {
      Swal.fire("Error!", "Failed to link client.", "error");
    }
  }

  // ── Link existing contact to this order ──────────────────────────────────────
  async function linkContact(contact) {
    try {
      const res = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          orderId: order.id,
          clientContactId: contact.id,
        }),
      });
      if (!order.orderContacts) order.orderContacts = [];
      order.orderContacts = [...order.orderContacts, res.data];
      let newActivity = {
        title: "Contact Added",
        description: `${contact.name} linked to order.`,
        createdAt: new Date().toISOString(),
      };
      order.groupedActivities = addActivityToGroupedActivities(newActivity);
      Swal.fire("Success!", "Contact linked.", "success");
    } catch (e) {
      Swal.fire("Error!", "Failed to link contact.", "error");
    }
  }

  async function setPrimaryContact(ocId) {
    try {
      await authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${ocId}/set-primary`, { method: "PATCH" });
      order.orderContacts = order.orderContacts.map(oc =>
        ({ ...oc, isPrimary: oc.id === ocId })
      );
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
          await authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${orderContactId}`, {
            method: "DELETE",
          });
          order.orderContacts = order.orderContacts.filter(
            (oc) => oc.id !== orderContactId,
          );
          let newActivity = {
            title: "Contact Removed",
            description: `${contactName} removed from order.`,
            createdAt: new Date().toISOString(),
          };
          order.groupedActivities = addActivityToGroupedActivities(newActivity);
          Swal.fire("Removed!", "Contact unlinked.", "success");
        } catch (e) {
          Swal.fire("Error!", "Failed to remove contact.", "error");
        }
      }
    });
  }

  // ── New Client + Contact Modal (for unlinked orders) ─────────────────────────
  let showNewClientModal = false;
  let newClientStep = 1; // 1 = search/create client, 2 = add contact

  // Step 1 — client search
  let ncSearchQuery = "";
  let ncSearchResults = [];
  let ncSearchLoading = false;
  let ncSearchTimer = null;
  let ncSearchDropdown = false;
  let ncSelectedClient = null; // existing client selected from search
  let ncCreateMode = false; // true = fill new client form

  // Step 1 — new client form fields
  let ncClientName = "";
  let ncClientGst = "";
  let ncClientMobile = "";
  let ncClientEmail = "";
  let ncClientAddress = "";

  // Step 2 — contact fields
  let ncContactName = "";
  let ncContactDesignation = "";
  let ncContactMobile = "";
  let ncContactEmail = "";
  let ncContactWhatsapp = "";
  let ncContactAltMobile = "";
  let ncSubmitLoading = false;
  let ncFormErrors = {};

  function openNewClientModal() {
    showNewClientModal = true;
    newClientStep = 1;
    ncSearchQuery = "";
    ncSearchResults = [];
    ncSearchDropdown = false;
    ncSelectedClient = null;
    ncCreateMode = false;
    ncClientName = "";
    ncClientGst = "";
    ncClientMobile = "";
    ncClientEmail = "";
    ncClientAddress = "";
    ncContactName = "";
    ncContactDesignation = "";
    ncContactMobile = "";
    ncContactEmail = "";
    ncContactWhatsapp = "";
    ncContactAltMobile = "";
    ncFormErrors = {};
  }

  async function ncSearchClients(q) {
    if (!q || q.trim().length < 1) {
      ncSearchResults = [];
      ncSearchDropdown = false;
      return;
    }
    ncSearchLoading = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`,
        { method: "GET" },
      );
      ncSearchResults = res.data || [];
      ncSearchDropdown = true;
    } catch (e) {
      ncSearchResults = [];
    }
    ncSearchLoading = false;
  }

  function ncOnSearchInput() {
    clearTimeout(ncSearchTimer);
    ncSelectedClient = null;
    ncCreateMode = false;
    ncSearchTimer = setTimeout(() => ncSearchClients(ncSearchQuery), 300);
  }

  function ncSelectClient(client) {
    ncSelectedClient = client;
    ncSearchQuery = client.name;
    ncSearchDropdown = false;
    ncCreateMode = false;
  }

  function ncGoToStep2() {
    ncFormErrors = {};
    if (!ncSelectedClient && !ncCreateMode) {
      ncFormErrors.step1 =
        "Please select an existing client or create a new one.";
      return;
    }
    if (ncCreateMode && !ncClientName.trim()) {
      ncFormErrors.ncClientName = "Company name is required.";
      return;
    }
    newClientStep = 2;
  }

  async function ncSubmit() {
    ncFormErrors = {};
    if (!ncContactName.trim()) {
      ncFormErrors.ncContactName = "Contact name is required.";
      return;
    }
    ncSubmitLoading = true;

    try {
      let resolvedClient = ncSelectedClient;

      // If creating new client
      if (!resolvedClient) {
        const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
          method: "POST",
          data: JSON.stringify({
            name: ncClientName.trim(),
            gstNumber: ncClientGst || undefined,
            mobile: ncClientMobile || undefined,
            email: ncClientEmail || undefined,
            address: ncClientAddress || undefined,
          }),
        });
        resolvedClient = clientRes.data;
      }

      // Create contact under client
      const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: resolvedClient.id,
          name: ncContactName.trim(),
          designation: ncContactDesignation || undefined,
          mobile: ncContactMobile || undefined,
          email: ncContactEmail || undefined,
          whatsapp: ncContactWhatsapp || undefined,
          alternateMobile: ncContactAltMobile || undefined,
        }),
      });
      const newContact = contactRes.data;

      // Link order to client
      await authApiFetch(`${API_ROUTES.ORDER}/${order.id}/change-client`, {
        method: "PUT",
        data: JSON.stringify({ clientId: resolvedClient.id }),
      });

      // Create OrderContact link
      const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          orderId: order.id,
          clientContactId: newContact.id,
        }),
      });

      // Update local order state
      order.client = resolvedClient;
      order.clientId = resolvedClient.id;
      order.orderContacts = [ocRes.data];
      if (!order.client.contacts) order.client.contacts = [];
      order.client.contacts = [...order.client.contacts, newContact];

      // Activity log
      let newActivity = {
        title: "Client Linked",
        description: `Client "${resolvedClient.name}" linked with contact "${newContact.name}".`,
        createdAt: new Date().toISOString(),
      };
      order.groupedActivities = addActivityToGroupedActivities(newActivity);

      showNewClientModal = false;
      Swal.fire(
        "Success!",
        `Client "${resolvedClient.name}" linked to this order.`,
        "success",
      );
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") ncFormErrors = errs;
      else Swal.fire("Error!", "Failed to link client.", "error");
    } finally {
      ncSubmitLoading = false;
    }
  }

  // ── Scenario 2: Add Contact to already-linked client ─────────────────────────
  let showAddContactModal = false;
  let acName = "";
  let acDesignation = "";
  let acMobile = "";
  let acEmail = "";
  let acWhatsapp = "";
  let acAltMobile = "";
  let acAddress = "";
  let acLoading = false;
  let acFormErrors = {};

  function openAddContactModal() {
    acName = "";
    acDesignation = "";
    acMobile = "";
    acEmail = "";
    acWhatsapp = "";
    acAltMobile = "";
    acAddress = "";
    acFormErrors = {};
    acLoading = false;
    showAddContactModal = true;
  }

  async function submitAddContact() {
    acFormErrors = {};
    if (!acName.trim()) {
      acFormErrors.acName = "Name is required.";
      return;
    }
    acLoading = true;
    try {
      // 1. Create ClientContact under existing linked client
      const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: order.client.id,
          name: acName.trim(),
          designation: acDesignation || undefined,
          mobile: acMobile || undefined,
          email: acEmail || undefined,
          whatsapp: acWhatsapp || undefined,
          alternateMobile: acAltMobile || undefined,
          address: acAddress || undefined,
        }),
      });
      const newContact = contactRes.data;

      // 2. Create OrderContact link
      const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          orderId: order.id,
          clientContactId: newContact.id,
        }),
      });

      // 3. Update local state
      if (!order.orderContacts) order.orderContacts = [];
      order.orderContacts = [...order.orderContacts, ocRes.data];
      if (!order.client.contacts) order.client.contacts = [];
      order.client.contacts = [...order.client.contacts, newContact];

      // 4. Activity log
      let newActivity = {
        title: "Contact Added",
        description: `Contact "${newContact.name}" added to order.`,
        createdAt: new Date().toISOString(),
      };
      order.groupedActivities = addActivityToGroupedActivities(newActivity);

      showAddContactModal = false;
      Swal.fire("Success!", `Contact "${newContact.name}" added.`, "success");
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") acFormErrors = errs;
      else Swal.fire("Error!", "Failed to add contact.", "error");
    } finally {
      acLoading = false;
    }
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
          order.childOrders[index] = {
            ...order.childOrders[index],
            ...componentPayload,
          };
        }

        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#edit_component");

        let newActivity = {
          title: "Order Updated",
          description: `Order details have been updated.`,
          data: data?.data,
        };
        newActivity.createdAt = new Date().toISOString();
        // order.groupedActivities = addActivityToGroupedActivities(newActivity);

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
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
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
          const data = await authApiFetch(`${API_ROUTES.ORDER}/${id}`, {
            method: "DELETE",
          });

          order.childOrders = order.childOrders.filter(
            (child) => child.id !== id,
          );
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
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
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

    const updateOrder = {
      title,
    };
    let newAssignedUsers = [];
    newAssignedUsers = selectedUsers
      .map((id) => users.find((u) => u.id === id))
      .filter(Boolean);
    const existingAdminUsers = order.assignedUsers.filter(
      (user) => user.role === "admin",
    );
    updateOrder.assignedUsers = [...newAssignedUsers, ...existingAdminUsers];

    const prevUserIds = order.assignedUsers
      .filter((u) => u.role === "user")
      .map((u) => u.id);
    const addedUsers = newAssignedUsers.filter(
      (u) => !prevUserIds.includes(u.id),
    );
    const removedUsers = order.assignedUsers.filter(
      (u) => u.role === "user" && !selectedUsers.includes(u.id),
    );
    const parts = [];
    if (addedUsers.length)
      parts.push(`Assigned: ${addedUsers.map((u) => u.name).join(", ")}`);
    if (removedUsers.length)
      parts.push(`Removed: ${removedUsers.map((u) => u.name).join(", ")}`);
    let newActivity = {
      title: "Assigned Users Updated",
      description: parts.length
        ? parts.join(". ") + "."
        : "Assigned users updated.",
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
        console.log("formErrors : ", formErrors);

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
      });

      // Reset Form
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
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
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

  onMount(() => {
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
      console.error("Invalid date format:", date);
      return "Invalid date";
    }

    return formattedDate.toLocaleString("en-GB", format);
  }

  const currencies = [
    { code: "INR", symbol: "₹" },
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
            console.error("Unexpected error:", error);
          }
        } finally {
          console.log("formErrors:", formErrors);
          loading = false;
        }
      }
    });
  }

  async function changeOrderStatus(newStatus) {
    if (order.status === newStatus) return;
    const prevStatus = order.status;
    const prevLabel = $statusNamesStore[prevStatus]?.name ?? prevStatus;
    const newLabel  = $statusNamesStore[newStatus]?.name  ?? newStatus;

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
  let showImages = [];
  let showImagesStart = 0;

  function openImageLightbox(urls, index = 0) {
    showImagesStart = index;
    showImages = Array.isArray(urls) ? urls : [urls];
  }

  // Open image in lightbox; open other files in a new tab
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

  // Return { icon, bg } based on mime type or filename
  function fileIcon(mime, name) {
    const m = mime ?? "";
    const n = (name ?? "").toLowerCase();
    if (m.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(n))
      return { icon: "ti-photo", bg: "bg-success" };
    if (m === "application/pdf" || n.endsWith(".pdf"))
      return { icon: "ti-file-type-pdf", bg: "bg-danger" };
    if (m.includes("word") || /\.(doc|docx)$/.test(n))
      return { icon: "ti-file-type-doc", bg: "bg-primary" };
    if (
      m.includes("excel") ||
      m.includes("spreadsheet") ||
      /\.(xls|xlsx|csv)$/.test(n)
    )
      return { icon: "ti-file-spreadsheet", bg: "bg-success" };
    if (
      m.includes("zip") ||
      m.includes("rar") ||
      /\.(zip|rar|7z|tar|gz)$/.test(n)
    )
      return { icon: "ti-file-zip", bg: "bg-warning" };
    return { icon: "ti-file", bg: "bg-secondary" };
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-outline-secondary btn-sm" on:click={() => history.length > 2 ? history.back() : goto("/admin/order")}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-1">{order?.title || "Order"}</h4>
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
        <a href="#offcanvas_add" class="btn btn-primary" data-bs-toggle="offcanvas" data-bs-target="#offcanvas_add">
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
            <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div></div>
            </div>

            <!-- Raise Query Modal -->
            {#if showQueryModal}
              <div
                style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
                on:click|self={() => (showQueryModal = false)}
              >
                <div
                  class="card shadow-lg p-4"
                  style="max-width:520px;width:100%;"
                >
                  <h5 class="fw-bold mb-3">Raise Query for This Order</h5>
                  {#if queryError}
                    <div class="alert alert-danger py-2">{queryError}</div>
                  {/if}
                  <div class="mb-3">
                    <label class="form-label"
                      >Subject <span class="text-danger">*</span></label
                    >
                    <input
                      type="text"
                      class="form-control"
                      bind:value={querySubject}
                      placeholder="Brief subject..."
                      maxlength="150"
                    />
                  </div>
                  <div class="mb-3">
                    <label class="form-label">
                      Requirement <span class="text-muted">(optional)</span>
                    </label>
                    <textarea
                      class="form-control"
                      rows="4"
                      bind:value={queryDescription}
                      placeholder="Describe your requirement in detail..."
                      style="resize:vertical;"
                    ></textarea>
                  </div>
                  <div class="d-flex gap-2 justify-content-end">
                    <button
                      class="btn btn-secondary btn-sm"
                      on:click={() => (showQueryModal = false)}>Cancel</button
                    >
                    <button
                      class="btn btn-primary btn-sm"
                      on:click={submitOrderQuery}
                      disabled={raisingQuery}
                    >
                      {raisingQuery ? "Submitting..." : "Submit Query"}
                    </button>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Edit Query Modal -->
            {#if showEditQueryModal}
              <div
                style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
                on:click|self={() => (showEditQueryModal = false)}
              >
                <div class="card shadow-lg p-4" style="max-width:520px;width:100%;">
                  <h5 class="fw-bold mb-3">Edit Query</h5>
                  {#if editQueryError}
                    <div class="alert alert-danger py-2">{editQueryError}</div>
                  {/if}
                  <div class="mb-3">
                    <label class="form-label">Subject <span class="text-danger">*</span></label>
                    <input
                      type="text"
                      class="form-control"
                      bind:value={editQuerySubject}
                      placeholder="Brief subject..."
                      maxlength="150"
                    />
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Requirement <span class="text-muted">(optional)</span></label>
                    <textarea
                      class="form-control"
                      rows="4"
                      bind:value={editQueryDescription}
                      placeholder="Describe your requirement in detail..."
                      style="resize:vertical;"
                    ></textarea>
                  </div>
                  <div class="d-flex gap-2 justify-content-end">
                    <button class="btn btn-secondary btn-sm" on:click={() => (showEditQueryModal = false)}>Cancel</button>
                    <button class="btn btn-primary btn-sm" on:click={submitEditQuery} disabled={editingQueryLoading}>
                      {editingQueryLoading ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            {/if}

            <div class="card order-header-card">
              <div class="card-body">
                <div class="order-header-top">
                  <div class="order-header-identity">
                    <div
                      class="order-header-avatar avatar avatar-xxl avatar-rounded border border-warning bg-soft-warning flex-shrink-0"
                    >
                      <h6 class="mb-0 text-warning">
                        {getAvatarText(order?.title)}
                      </h6>
                    </div>
                    <div class="min-w-0">
                      <h5 class="order-header-title capitalize mb-2">
                        {order?.title}
                      </h5>
                      <div class="order-header-meta">
                        <span class="order-header-chip">
                          <i class="ti ti-hash"></i>
                          {order?.financialYear}/{order?.pId
                            ?.toString()
                            .padStart(6, "0")}
                        </span>
                        {#if order?.workOrderNumber}
                          <span class="order-header-chip">
                            <i class="ti ti-file-description"></i>
                            {order.workOrderNumber}
                          </span>
                        {/if}
                        {#if order?.category}
                          <span class="order-header-chip">
                            <i class="ti ti-layout-grid"></i>{order.category}
                          </span>
                        {/if}
                        {#if order?.source}
                          <span class="order-header-chip capitalize">
                            <i class="ti ti-mailbox"></i>{order.source}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <div class="order-header-actions">
                    <button
                      type="button"
                      class="py-1 px-2 fs-12 bg-soft-danger rounded text-danger fw-medium border-0"
                      on:click={() => togglePin(order?.id)}
                    >
                      {#if order?.pinStatus === "true"}
                        <i class="ti ti-pinned me-1"></i>Pinned
                      {:else}
                        <i class="ti ti-pin me-1"></i>Pin
                      {/if}
                    </button>
                    <div class="dropdown">
                      <a
                        href="#status"
                        class={`btn btn-xs bg-success fs-12 py-1 px-2 fw-medium d-inline-flex align-items-center text-white text-nowrap ${statusesColors[order?.status] || "bg-gray"}`}
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i class="ti ti-thumb-up me-1"></i>
                        {$statusNamesStore[order?.status]?.name
                          ? $statusNamesStore[order?.status]?.name
                          : order?.status}
                        <i class="ti ti-chevron-down ms-1"></i>
                      </a>
                      <div class="dropdown-menu dropdown-menu-right">
                        {#each statuses as status}
                          <a
                            class="dropdown-item"
                            class:active={order.status === status}
                            href={`#${status}`}
                            on:click|preventDefault={() =>
                              changeOrderStatus(status)}
                          >
                            <span>{$statusNamesStore[status]?.name ?? status}</span>
                          </a>
                        {/each}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="order-header-docs">
                  <div class="order-header-docs-label">
                    <i class="ti ti-files"></i>Linked Documents
                  </div>
                  <div class="order-header-docs-row">
                    <div class="order-header-doc-item">
                      <span class="order-header-doc-type">PI</span>
                      {#if order?.orderPayments?.length > 0}
                        <a
                          href="/admin/invoice/{order.orderPayments[0].id}"
                          class="order-header-doc-link order-header-doc-link--success"
                        >
                          <i class="ti ti-receipt"></i>
                          {order.orderPayments[0].financialYear}/{String(
                            order.orderPayments[0].invoiceNo,
                          ).padStart(6, "0")}
                          {#if order.orderPayments.length > 1}
                            <span class="badge bg-success ms-1 order-header-doc-badge"
                              >+{order.orderPayments.length - 1}</span
                            >
                          {/if}
                        </a>
                      {:else}
                        <button
                          class="order-header-doc-action border-0 bg-transparent p-0"
                          on:click={() => { piwotiType = 'PI'; piwotiOpen = true; }}
                        >
                          <i class="ti ti-plus me-1"></i>Create
                        </button>
                      {/if}
                    </div>

                    <span class="order-header-doc-sep" aria-hidden="true"></span>

                    <div class="order-header-doc-item">
                      <span class="order-header-doc-type">WO</span>
                      {#if order?.workOrders?.length > 0}
                        <a
                          href="/admin/workorder/{order.workOrders[0].id}"
                          class="order-header-doc-link order-header-doc-link--success"
                        >
                          <i class="ti ti-file-description"></i>
                          {order.workOrders[0].workOrderNo}
                          {#if order.workOrders.length > 1}
                            <span class="badge bg-success ms-1 order-header-doc-badge"
                              >+{order.workOrders.length - 1}</span
                            >
                          {/if}
                        </a>
                      {:else if order?.orderPayments?.length > 0}
                        <button
                          class="order-header-doc-action border-0 bg-transparent p-0"
                          on:click={() => { piwotiType = 'WO'; piwotiOpen = true; }}
                        >
                          <i class="ti ti-plus me-1"></i>Create
                        </button>
                      {:else}
                        <span class="order-header-doc-muted">
                          <i class="ti ti-lock me-1"></i>Needs PI
                        </span>
                      {/if}
                    </div>

                    <span class="order-header-doc-sep" aria-hidden="true"></span>

                    <div class="order-header-doc-item">
                      <span class="order-header-doc-type">TI</span>
                      {#if order?.invoices?.length > 0}
                        <a
                          href="/admin/invoice/tax/{order.invoices[0].id}"
                          class="order-header-doc-link order-header-doc-link--warning"
                        >
                          <i class="ti ti-file-invoice"></i>
                          {order.invoices[0].financialYear}/{String(
                            order.invoices[0].invoiceNo,
                          ).padStart(6, "0")}
                          {#if order.invoices[0].isLocked}
                            <span class="badge bg-success ms-1 order-header-doc-badge"
                              >Locked</span
                            >
                          {:else}
                            <span class="badge bg-warning text-dark ms-1 order-header-doc-badge"
                              >Draft</span
                            >
                          {/if}
                        </a>
                      {:else if order?.orderPayments?.length > 0 && order?.workOrders?.length > 0}
                        <button
                          class="order-header-doc-action order-header-doc-action--warning border-0 bg-transparent p-0"
                          on:click={() => { piwotiType = 'TI'; piwotiOpen = true; }}
                        >
                          <i class="ti ti-plus me-1"></i>Create
                        </button>
                      {:else}
                        <span class="order-header-doc-muted">
                          <i class="ti ti-lock me-1"></i>Needs PI &amp; WO
                        </span>
                      {/if}
                    </div>

                    <div class="order-header-doc-item ms-auto d-flex align-items-center gap-2">
                      {#if orderVisits.length === 0}
                        <button class="btn btn-success btn-sm" on:click={openVisitModal}>
                          <i class="ti ti-map-pin me-1"></i>Create Visit
                        </button>
                      {:else}
                        <button class="btn btn-outline-success btn-sm" on:click={() => showVisitListModal = true}>
                          <i class="ti ti-map-pin me-1"></i>Visit #{orderVisits[0].id}
                          {#if orderVisits.length > 1}
                            <span class="badge bg-success ms-1">+{orderVisits.length - 1}</span>
                          {/if}
                        </button>
                        <button class="btn btn-success btn-sm" on:click={openVisitModal} title="Add another visit">
                          <i class="ti ti-plus"></i>
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- /Contact User -->
          </div>

          <!-- Contact Sidebar -->
          <div class="col-xl-4">
            <div class="card order-sidebar !sticky top-[75px]">
              <div class="card-body p-0">
                <!-- Order Information -->
                <div class="order-sidebar-section">
                  <div class="order-sidebar-section-head">
                    <i class="ti ti-info-circle"></i>
                    <span>Order Information</span>
                  </div>
                  <div class="order-sidebar-meta-list">
                    <div class="order-sidebar-row">
                      <span class="order-sidebar-label"
                        ><i class="ti ti-hash"></i>Order ID</span
                      >
                      <span class="order-sidebar-value fw-semibold font-mono">
                        {order?.financialYear}/{order?.pId
                          ?.toString()
                          .padStart(6, "0")}
                      </span>
                    </div>
                    {#if order?.workOrderNumber}
                      <div class="order-sidebar-row">
                        <span class="order-sidebar-label"
                          ><i class="ti ti-file-description"></i>Work Order</span
                        >
                        <span class="order-sidebar-value">{order.workOrderNumber}</span>
                      </div>
                    {/if}
                    {#if order?.inqCode}
                      <div class="order-sidebar-row">
                        <span class="order-sidebar-label"
                          ><i class="ti ti-barcode"></i>Inq. Code</span
                        >
                        <span class="order-sidebar-value font-mono"
                          >{order.inqCode}</span
                        >
                      </div>
                    {/if}
                    <div class="order-sidebar-row">
                      <span class="order-sidebar-label"
                        ><i class="ti ti-calendar-event"></i>Order Date</span
                      >
                      <span class="order-sidebar-value">
                        {order?.orderDate &&
                          convertDate(order?.orderDate, {
                            timeZone: "Asia/Kolkata",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                      </span>
                    </div>
                    <div class="order-sidebar-row">
                      <span class="order-sidebar-label"
                        ><i class="ti ti-clock"></i>Created</span
                      >
                      <span class="order-sidebar-value">
                        {order?.createdAt &&
                          convertDate(order?.createdAt, {
                            timeZone: "Asia/Kolkata",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                      </span>
                    </div>
                    {#if orderInfoExpanded}
                      <div transition:slide={{ duration: 250 }} style="overflow:hidden;margin:0;padding:0;display:flex;flex-direction:column;">
                        <div class="order-sidebar-row">
                          <span class="order-sidebar-label"
                            ><i class="ti ti-file-text"></i>Price Terms</span
                          >
                          <span class="order-sidebar-value"
                            >{order?.priceTerms || "—"}</span
                          >
                        </div>
                        <div class="order-sidebar-row">
                          <span class="order-sidebar-label"
                            ><i class="ti ti-currency-rupee"></i>Price</span
                          >
                          <span class="order-sidebar-value fw-semibold text-success">
                            {new Intl.NumberFormat("en-IN", {
                              style: "currency",
                              currency: order?.currency || "INR",
                            })
                              .format(order?.price || 0)
                              .replace("₹", "₹ ")
                              .replace("$", "$ ")}
                          </span>
                        </div>
                        <div class="order-sidebar-row">
                          <span class="order-sidebar-label"
                            ><i class="ti ti-player-play"></i>Start Date</span
                          >
                          <span class="order-sidebar-value">
                            {order?.startDate
                              ? convertDate(order?.startDate, {
                                  timeZone: "Asia/Kolkata",
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </span>
                        </div>
                        <div class="order-sidebar-row">
                          <span class="order-sidebar-label"
                            ><i class="ti ti-flag"></i>Deadline</span
                          >
                          <span class="order-sidebar-value">
                            {order?.deadlineDate
                              ? convertDate(order?.deadlineDate, {
                                  timeZone: "Asia/Kolkata",
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </span>
                        </div>
                        <div class="order-sidebar-row">
                          <span class="order-sidebar-label"
                            ><i class="ti ti-source-code"></i>Source</span
                          >
                          <span class="order-sidebar-value capitalize"
                            >{order?.source || "—"}</span
                          >
                        </div>
                      </div>
                    {/if}
                  </div>
                  <div class="order-sidebar-expand">
                    <button
                      type="button"
                      class="btn btn-xs btn-outline-secondary"
                      on:click={() => (orderInfoExpanded = !orderInfoExpanded)}
                    >
                      {#if orderInfoExpanded}
                        <i class="ti ti-chevron-up me-1"></i>Show less
                      {:else}
                        <i class="ti ti-chevron-down me-1"></i>Show more
                      {/if}
                    </button>
                  </div>
                </div>

                <!-- Client -->
                <div class="order-sidebar-section">
                  <div class="order-sidebar-section-head">
                    <i class="ti ti-building-store"></i>
                    <span>Client</span>
                    <div class="order-sidebar-actions">
                      {#if order.client}
                        <button
                          type="button"
                          class="btn btn-xs btn-outline-warning"
                          on:click={() => {
                            showChangeClientModal = true;
                            changeClientQuery = "";
                            ccInlineCreate = false;
                            ccCreateErrors = {};
                            ccSelectedExisting = null;
                            initLegacyChecked();
                          }}
                        >
                          <i class="ti ti-replace me-1"></i>Change
                        </button>
                        <button
                          type="button"
                          class="btn btn-xs btn-outline-secondary"
                          on:click={openAddContactModal}
                        >
                          <i class="ti ti-plus me-1"></i>Contact
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="btn btn-xs btn-outline-primary"
                          on:click={() => {
                            showChangeClientModal = true;
                            changeClientQuery = "";
                            ccInlineCreate = false;
                            ccCreateErrors = {};
                            ccSelectedExisting = null;
                            initLegacyChecked();
                          }}
                        >
                          <i class="ti ti-link me-1"></i>Link
                        </button>
                        <button
                          type="button"
                          class="btn btn-xs btn-outline-secondary"
                          on:click={openNewClientModal}
                        >
                          <i class="ti ti-plus me-1"></i>Contact
                        </button>
                      {/if}
                    </div>
                  </div>

                  {#if order.client}
                    <div class="order-sidebar-client-card">
                      <div class="d-flex align-items-center justify-content-between gap-2">
                        <a
                          href="/admin/client/{order.client.id}"
                          class="order-sidebar-client-name"
                        >
                          <i class="ti ti-building-store me-1"></i>{order.client.name}
                        </a>
                        <button
                          type="button"
                          class="btn btn-xs btn-outline-secondary flex-shrink-0"
                          title="Edit client"
                          on:click={openEditClientModal}
                        >
                          <i class="ti ti-pencil"></i>
                        </button>
                      </div>
                      {#if order.client.gstNumber}
                        <div class="order-sidebar-client-gst">
                          GST: {order.client.gstNumber}
                        </div>
                      {/if}
                    </div>

                    {#if order.orderContacts?.length > 0}
                      {#each order.orderContacts as oc, index}
                        <div class="order-sidebar-contact">
                          <div class="d-flex align-items-start gap-2 min-w-0">
                            <span class="avatar avatar-xs rounded-circle flex-shrink-0">
                              <img
                                src="/assets/img/profiles/user.png"
                                alt=""
                                class="img-fluid rounded-circle w-auto h-auto"
                              />
                            </span>
                            <div class="min-w-0">
                              <div class="order-sidebar-contact-name capitalize d-flex align-items-center gap-1">
                                {#if oc.isPrimary}
                                  <i class="ti ti-star-filled text-warning" style="font-size:11px;flex-shrink:0;" title="Primary contact"></i>
                                {/if}
                                {oc.clientContact?.name}
                                {#if oc.clientContact?.designation}
                                  <span class="order-sidebar-contact-role"
                                    >({oc.clientContact.designation})</span
                                  >
                                {/if}
                              </div>
                              {#if visibilityMap[index]}
                                {#if oc.clientContact?.email}
                                  <a
                                    href="mailto:{oc.clientContact.email}"
                                    class="order-sidebar-contact-detail"
                                  >
                                    <i class="ti ti-mail"></i>{oc.clientContact.email}
                                  </a>
                                {/if}
                                {#if oc.clientContact?.mobile}
                                  <a
                                    href="tel:{oc.clientContact.mobile}"
                                    class="order-sidebar-contact-detail"
                                  >
                                    <i class="ti ti-phone"></i>{oc.clientContact.mobile}
                                  </a>
                                {/if}
                              {/if}
                            </div>
                          </div>
                          <div class="order-sidebar-contact-actions">
                            <button
                              type="button"
                              on:click={() => !oc.isPrimary && setPrimaryContact(oc.id)}
                              class="btn btn-icon btn-xs {oc.isPrimary ? 'btn-warning' : 'btn-outline-light'}"
                              title={oc.isPrimary ? "Primary contact" : "Set as primary"}
                              style={oc.isPrimary ? "pointer-events:none;" : ""}
                            >
                              <i class="ti {oc.isPrimary ? 'ti-star-filled' : 'ti-star'}"></i>
                            </button>
                            <button
                              type="button"
                              on:click={() => toggleVisibility(index)}
                              class="btn btn-icon btn-xs btn-outline-light"
                              title={visibilityMap[index]
                                ? "Hide details"
                                : "Show details"}
                            >
                              <i
                                class="ti {visibilityMap[index]
                                  ? 'ti-eye-off'
                                  : 'ti-eye'}"
                              ></i>
                            </button>
                            <button
                              type="button"
                              on:click={() =>
                                unlinkContact(oc.id, oc.clientContact?.name)}
                              class="btn btn-icon btn-xs btn-outline-light text-danger"
                              title="Remove contact"
                            >
                              <i class="ti ti-x"></i>
                            </button>
                          </div>
                        </div>
                      {/each}
                    {:else if order.orderClients?.filter(oc =>
                        !oc.deletedAt &&
                        !order.orderContacts?.some(linked =>
                          (linked.clientContact?.mobile && linked.clientContact.mobile === oc.mobile) ||
                          (linked.clientContact?.name?.toLowerCase() === oc.name?.toLowerCase())
                        )
                      ).length > 0}
                      <!-- Show unmatched orderClients not already in formal contacts -->
                      {#each order.orderClients.filter(oc =>
                        !oc.deletedAt &&
                        !order.orderContacts?.some(linked =>
                          (linked.clientContact?.mobile && linked.clientContact.mobile === oc.mobile) ||
                          (linked.clientContact?.name?.toLowerCase() === oc.name?.toLowerCase())
                        )
                      ) as oc}
                        <div class="order-sidebar-contact-item d-flex align-items-start gap-2 py-1">
                          <i class="ti ti-user text-muted mt-1" style="font-size:13px;"></i>
                          <div style="font-size:13px;">
                            <div class="fw-semibold">{oc.name || "—"}</div>
                            {#if oc.mobile}<div class="text-muted" style="font-size:12px;">📞 {oc.mobile}</div>{/if}
                            {#if oc.email}<div class="text-muted" style="font-size:12px;">✉ {oc.email}</div>{/if}
                          </div>
                        </div>
                      {/each}
                    {:else}
                      <p class="order-sidebar-empty mb-0">No contacts linked yet.</p>
                    {/if}

                    {#if order.client.contacts?.filter((c) => !order.orderContacts?.some((oc) => oc.clientContact?.id === c.id)).length > 0}
                      <div class="order-sidebar-chip-section">
                        <div class="order-sidebar-chip-label">
                          Quick add from {order.client.name}
                        </div>
                        <div class="order-sidebar-chip-list">
                          {#each order.client.contacts.filter((c) => !order.orderContacts?.some((oc) => oc.clientContact?.id === c.id)) as contact}
                            <button
                              type="button"
                              class="btn btn-xs btn-outline-secondary"
                              on:click={() => linkContact(contact)}
                            >
                              <i class="ti ti-plus me-1"></i>{contact.name}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  {:else if order.orderClients?.length > 0}
                    <p class="order-sidebar-chip-label mb-2">Legacy contacts</p>
                    {#each order.orderClients as orderClient, index}
                      {#if orderClient?.deletedAt == null}
                        <div class="order-sidebar-contact">
                          <div class="d-flex align-items-start gap-2 min-w-0">
                            <span class="avatar avatar-xs rounded-circle flex-shrink-0">
                              <img
                                src="/assets/img/profiles/user.png"
                                alt=""
                                class="img-fluid rounded-circle w-auto h-auto"
                              />
                            </span>
                            <div class="min-w-0">
                              <div class="order-sidebar-contact-name">
                                {orderClient?.name}
                                {#if orderClient?.designation}
                                  <span class="order-sidebar-contact-role"
                                    >({orderClient.designation})</span
                                  >
                                {/if}
                              </div>
                              {#if visibilityMap[index]}
                                {#if orderClient?.email}
                                  <span class="order-sidebar-contact-detail">
                                    <i class="ti ti-mail"></i>{orderClient.email}
                                  </span>
                                {/if}
                                {#if orderClient?.mobile}
                                  <span class="order-sidebar-contact-detail">
                                    <i class="ti ti-phone"></i>{orderClient.mobile}
                                  </span>
                                {/if}
                              {/if}
                            </div>
                          </div>
                          <button
                            type="button"
                            on:click={() => toggleVisibility(index)}
                            class="btn btn-icon btn-xs btn-outline-light flex-shrink-0"
                            title={visibilityMap[index]
                              ? "Hide details"
                              : "Show details"}
                          >
                            <i
                              class="ti {visibilityMap[index]
                                ? 'ti-eye-off'
                                : 'ti-eye'}"
                            ></i>
                          </button>
                        </div>
                      {/if}
                    {/each}
                  {:else}
                    <div class="order-sidebar-empty-state">
                      <i class="ti ti-link-off"></i>
                      <span>No client linked to this order.</span>
                    </div>
                  {/if}
                </div>

                <!-- Assigned Users -->
                <div class="order-sidebar-section">
                  <div class="order-sidebar-section-head">
                    <i class="ti ti-users"></i>
                    <span>Assigned Users</span>
                    <a
                      on:click={() => setAssignedUsers()}
                      href="#tag"
                      class="btn btn-xs btn-outline-primary ms-auto"
                      data-bs-toggle="modal"
                      data-bs-target="#add_contact"
                    >
                      <i class="ti ti-plus me-1"></i>Add
                    </a>
                  </div>

                  {#if order.assignedUsers?.some((u) => u.status === "banned")}
                    <div
                      class="alert alert-danger py-1 px-2 mb-2 d-flex align-items-center gap-1 order-sidebar-alert"
                    >
                      <i class="ti ti-alert-triangle"></i>
                      <span
                        >Some users are <strong>banned</strong> — consider reassigning.</span
                      >
                    </div>
                  {/if}
                  {#if order.assignedUsers?.some((u) => u.status === "inactive")}
                    <div
                      class="alert alert-warning py-1 px-2 mb-2 d-flex align-items-center gap-1 order-sidebar-alert"
                    >
                      <i class="ti ti-alert-circle"></i>
                      <span>Some users are <strong>inactive</strong>.</span>
                    </div>
                  {/if}

                  {#if order.assignedUsers?.length > 0}
                    {#each order.assignedUsers as assignedUser}
                      <div class="order-sidebar-user">
                        <span class="avatar avatar-xs rounded-circle flex-shrink-0">
                          <img
                            src="/assets/img/profiles/user.png"
                            alt=""
                            class="img-fluid rounded-circle w-auto h-auto"
                          />
                        </span>
                        <span class="order-sidebar-user-name">{maskAssignedName(assignedUser)}</span>
                        {#if assignedUser?.status === "banned"}
                          <span class="badge bg-danger order-sidebar-badge">Banned</span>
                        {:else if assignedUser?.status === "inactive"}
                          <span class="badge bg-secondary order-sidebar-badge"
                            >Inactive</span
                          >
                        {/if}
                      </div>
                    {/each}
                  {:else}
                    <p class="order-sidebar-empty mb-0">No users assigned.</p>
                  {/if}

                  <div class="order-sidebar-meta-list order-sidebar-audit mt-3">
                    <div class="order-sidebar-row">
                      <span class="order-sidebar-label"
                        ><i class="ti ti-history"></i>Last Modified</span
                      >
                      <span class="order-sidebar-value">
                        {order?.updatedAt &&
                          convertDate(order?.updatedAt, {
                            timeZone: "Asia/Kolkata",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                      </span>
                    </div>
                    {#if order?.assignedUsers?.[0]?.name}
                      <div class="order-sidebar-row">
                        <span class="order-sidebar-label"
                          ><i class="ti ti-user-edit"></i>Modified By</span
                        >
                        <span class="order-sidebar-value">{maskAssignedName(order.assignedUsers[0])}</span>
                      </div>
                    {/if}
                  </div>
                </div>

              </div>
            </div>
          </div>
          <!-- /Contact Sidebar -->

          <!-- Contact Details -->
          <div class="col-xl-8">
            <!-- <div class="mb-3 pb-3 border-bottom">
            <h5 class="mb-3">Order Pipeline Status</h5>
            <div class="step-progress d-flex flex-wrap gap-2">
              {#each statuses as status}
                <div class={`step bg-indigo ${statusesColors[status] || "bg-gray"}`}>{$statusNamesStore[status]?.name ?? status}</div>
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
                      <span class="d-md-inline-block">
                        <i class="ti ti-file me-1"></i>Files
                      </span>
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
                            <span
                              class="badge bg-success ms-1"
                              style="font-size:10px;">{myCount}</span
                            >
                          {/if}
                        {:else if orderQueries.length > 0}
                          <span
                            class="badge bg-primary ms-1"
                            style="font-size:10px;">{orderQueries.length}</span
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
                        on:click|preventDefault={() =>
                          (activeTab = "Components")}
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
                        on:click|preventDefault={() =>
                          (activeTab = "Installation")}
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
                <!-- Activities -->
                <div class="tab-pane active show" id="tab_1">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Activities</h5>
                    </div>
                    <div class="card-body">
                      {#if order?.groupedActivities?.length}
                        {#each order?.groupedActivities as dateActivity}
                          <button
                            on:click={() => toggleAccordion(dateActivity?.date)}
                            class="flex items-center justify-between gap-2 mb-3 w-full border-bottom pb-2"
                          >
                            <div class="badge badge-soft-info border-0">
                              <i class="ti ti-calendar-check me-1"></i>
                              {dateActivity?.date &&
                                convertDate(dateActivity?.date, {
                                  timeZone: "Asia/Kolkata",
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                            </div>
                            <div>
                              <i
                                class={`ti ${activeDate === dateActivity?.date ? "ti-chevron-up" : "ti-chevron-down"}`}
                              >
                              </i>
                            </div>
                          </button>

                          {#if activeDate === dateActivity?.date}
                            {#each dateActivity?.activities as activity}
                              <div class="card border shadow-none mb-3">
                                <div class="card-body p-3">
                                  <div
                                    class="d-flex align-items-center flex-lg-nowrap flex-wrap row-gap-2"
                                  >
                                    {#if activity.title == "Order Created"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-green-500 text-green-600"
                                      >
                                        <i class="ti ti-plus fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Updated"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-blue-500 text-blue-600"
                                      >
                                        <i class="ti ti-edit fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Status Changed"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-gray-500 text-gray-600"
                                      >
                                        <i class="ti ti-arrows-shuffle fs-20"
                                        ></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-red-500 text-red-600"
                                      >
                                        <i class="ti ti-trash fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Chat Added"}
                                      {@const nt = normalizeType(activity.data?.type)}
                                      <span class="avatar avatar-md flex-shrink-0 rounded me-2
                                        {nt === 'Call' ? 'bg-blue-500 text-blue-600' :
                                         nt === 'WhatsApp' ? 'bg-green-500 text-green-600' :
                                         nt === 'Email' ? 'bg-yellow-500 text-yellow-600' :
                                         'bg-cyan-500 text-cyan-600'}">
                                        <i class="fs-20
                                          {nt === 'Call' ? 'ti ti-phone' :
                                           nt === 'WhatsApp' ? 'ti ti-brand-whatsapp' :
                                           nt === 'Email' ? 'ti ti-mail' :
                                           'ti ti-message'}"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Chat Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-cyan-500 text-cyan-600"
                                      >
                                        <i class="ti ti-message-off fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Attachment Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-indigo-500 text-indigo-600"
                                      >
                                        <i class="ti ti-paperclip fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Attachment Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-indigo-500 text-indigo-600"
                                      >
                                        <i class="ti ti-link-off fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Client Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-purple-500 text-purple-600"
                                      >
                                        <i class="ti ti-user-plus fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Client Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-red-500 text-red-600"
                                      >
                                        <i class="ti ti-user-cancel fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Assigned to User"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600"
                                      >
                                        <i class="ti ti-user-pin fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Payment Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-green-500 text-green-600"
                                      >
                                        <i class="ti ti-credit-card fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Reminder Added"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600"
                                      >
                                        <i class="ti ti-alarm-snooze fs-20"></i>
                                      </span>
                                    {/if}
                                    {#if activity.title == "Order Reminder Deleted"}
                                      <span
                                        class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600"
                                      >
                                        <i class="ti ti-alarm-off fs-20"></i>
                                      </span>
                                    {/if}
                                    <div>
                                      <h6 class="fw-medium fs-14 mb-1">
                                        {#if currentUser?.subRole === 'telecaller' || currentUser?.subRole === 'tech' || currentUser?.subRole === 'tech_helper'}
                                          {activity?.title}
                                        {:else}
                                          {activity?.description}
                                        {/if}
                                      </h6>
                                      {#if activity.title == "Order Chat Added"}
                                        <p class="mb-1 d-flex align-items-center gap-1 flex-wrap">
                                          {#each normalizeTypes(activity?.data?.type) as nt}
                                            <span class="badge {nt === 'Call' ? 'bg-primary' : nt === 'WhatsApp' ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:10px;">
                                              {#if nt === 'Call'}<i class="ti ti-phone me-1"></i>{/if}
                                              {#if nt === 'WhatsApp'}<i class="ti ti-brand-whatsapp me-1"></i>{/if}
                                              {#if nt === 'Email'}<i class="ti ti-mail me-1"></i>{/if}
                                              {nt}
                                            </span>
                                          {/each}
                                          {activity?.data?.message}
                                        </p>
                                      {/if}
                                      {#if activity.title == "Order Attachment Added"}
                                        <p class="mb-1">
                                          {#await Promise.resolve() then _}
                                            {(() => {
                                              let description = "";
                                              const data = activity.data;
                                              const files = data?.files || [];
                                              if (data?.title) {
                                                description += ` Title: "${data.title}".`;
                                              }
                                              if (files.length) {
                                                description += ` File Names:`;
                                                files.forEach((file, i) => {
                                                  if (file?.originalName) {
                                                    description += ` "${file.originalName}"${i < files.length - 1 ? "," : "."}`;
                                                  }
                                                });
                                              }
                                              if (data?.link) {
                                                description += ` Link: ${data.link}.`;
                                              }
                                              return description;
                                            })()}
                                          {/await}
                                        </p>
                                      {/if}
                                      {#if activity.title == "Order Reminder Added"}
                                        <p class="mb-1">
                                          {#await Promise.resolve() then _}
                                            {(() => {
                                              let description = "";
                                              const data = activity.data;
                                              if (data?.reminderTime) {
                                                const date = new Date(
                                                  data.reminderTime,
                                                );
                                                const formattedTime =
                                                  date.toLocaleString("en-IN", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true,
                                                  });
                                                description += `Reminder Time: ${formattedTime}. `;
                                              }
                                              if (data?.message) {
                                                description += ` Message: ${data.message}.`;
                                              }
                                              return description;
                                            })()}
                                          {/await}
                                        </p>
                                      {/if}
                                      <p class="mb-0">
                                        {newDateFormate(activity?.createdAt, {
                                          timeZone: "Asia/Kolkata",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            {/each}
                          {/if}
                        {/each}
                      {:else}
                        <div>No activities found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Activities -->
              {/if}

              {#if activeTab === "Files"}
                <!-- Files -->
                <div class="tab-pane active show" id="tab_2">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Files</h5>

                      <div class="d-inline-flex align-items-center">
                        <button
                          href="#new_file"
                          data-bs-toggle="modal"
                          data-bs-target="#new_file"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</button
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      <div class="notes-activity">
                        {#if order?.orderAttachments.length}
                          {#each order.orderAttachments as attachment}
                            <div class="card mb-3 relative">
                              {#if attachment?.deletedAt}
                                <div class="ribbon ribbon-top-left">
                                  <span class="bg-red-500">Deleted</span>
                                </div>
                              {/if}
                              <div class="card-body">
                                {#if !attachment?.deletedAt}
                                  <div class="absolute top-5 right-5">
                                    <button
                                      on:click={deleteAttachment(
                                        attachment?.id,
                                      )}
                                      class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                    >
                                      <i class="ti ti-trash"></i>
                                    </button>
                                  </div>
                                {/if}
                                <div
                                  class="d-flex align-items-center justify-content-between flex-wrap row-gap-2 pb-2"
                                >
                                  <div
                                    class="d-inline-flex align-items-center mb-2"
                                  >
                                    <span
                                      class="avatar avatar-md me-2 flex-shrink-0"
                                    >
                                      <img
                                        src="/assets/img/profiles/user.png"
                                        alt="img"
                                      />
                                    </span>
                                    <div>
                                      <h6 class="fw-medium fs-14 mb-1">
                                        {maskAssignedName(attachment?.user)}
                                      </h6>
                                      <p class="mb-0 fs-13">
                                        {attachment?.createdAt &&
                                          convertDate(attachment?.createdAt, {
                                            timeZone: "Asia/Kolkata",
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                {#if attachment?.title}
                                  <h5 class="fw-medium fs-14 mb-1">
                                    {attachment?.title}
                                  </h5>
                                {/if}
                                {#if attachment?.link}
                                  <p class="mb-0">
                                    Attachment Link :
                                    <a href={attachment?.link} target="_blank">
                                      {attachment?.link}
                                    </a>
                                  </p>
                                {/if}
                                {#if attachment?.file}
                                  {@const fi = fileIcon(
                                    null,
                                    attachment?.fileName ?? attachment?.file,
                                  )}
                                  <div
                                    class="row"
                                    class:mt-3={attachment?.title ||
                                      attachment?.link}
                                  >
                                    <div class="col-xxl-4 col-lg-5">
                                      <div
                                        class="card mb-0"
                                        role="button"
                                        tabindex="0"
                                        aria-label="Open attachment"
                                        on:click={() =>
                                          openAttachment(
                                            ATTACHMENT_BASE_URL +
                                              attachment?.file,
                                            null,
                                            attachment?.fileName,
                                          )}
                                        on:keydown={(e) => {
                                          if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                          )
                                            openAttachment(
                                              ATTACHMENT_BASE_URL +
                                                attachment?.file,
                                              null,
                                              attachment?.fileName,
                                            );
                                        }}
                                        style="cursor:pointer;"
                                      >
                                        <div class="card-body p-2">
                                          <div
                                            class="d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                                          >
                                            <div
                                              class="d-flex align-items-center me-3"
                                            >
                                              <span class="avatar {fi.bg} me-2">
                                                <i class="ti {fi.icon} fs-20"
                                                ></i>
                                              </span>
                                              <div>
                                                <h6
                                                  class="fw-medium fs-14 mb-1 trank"
                                                  title={attachment?.fileName}
                                                >
                                                  {shortenFileName(
                                                    attachment?.fileName,
                                                  )}
                                                </h6>
                                              </div>
                                            </div>
                                            <button
                                              on:click|stopPropagation={() =>
                                                openAttachment(
                                                  ATTACHMENT_BASE_URL +
                                                    attachment?.file,
                                                  null,
                                                  attachment?.fileName,
                                                )}
                                              class="avatar avatar-xs rounded-circle bg-light text-dark"
                                              title="Open"
                                            >
                                              <i class="ti ti-external-link"
                                              ></i>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                {/if}
                                {#if attachment?.files}
                                  {@const attachImgUrls = attachment.files
                                    .filter(
                                      (f) =>
                                        f?.mimeType?.startsWith("image/") ||
                                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(
                                          f?.originalName ?? "",
                                        ),
                                    )
                                    .map((f) => ATTACHMENT_BASE_URL + f.url)}
                                  <div
                                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                                    class:mt-3={attachment?.title ||
                                      attachment?.link}
                                  >
                                    {#each attachment?.files as file}
                                      {@const fi = fileIcon(
                                        file?.mimeType,
                                        file?.originalName,
                                      )}
                                      {@const isImg =
                                        file?.mimeType?.startsWith("image/") ||
                                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(
                                          file?.originalName ?? "",
                                        )}
                                      {@const imgIdx = attachImgUrls.indexOf(
                                        ATTACHMENT_BASE_URL + file?.url,
                                      )}
                                      <div
                                        class="card mb-0"
                                        role="button"
                                        tabindex="0"
                                        aria-label="Open attachment"
                                        on:click={() =>
                                          isImg
                                            ? openImageLightbox(
                                                attachImgUrls,
                                                imgIdx,
                                              )
                                            : openAttachment(
                                                ATTACHMENT_BASE_URL + file?.url,
                                                file?.mimeType,
                                                file?.originalName,
                                              )}
                                        on:keydown={(e) => {
                                          if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                          )
                                            isImg
                                              ? openImageLightbox(
                                                  attachImgUrls,
                                                  imgIdx,
                                                )
                                              : openAttachment(
                                                  ATTACHMENT_BASE_URL +
                                                    file?.url,
                                                  file?.mimeType,
                                                  file?.originalName,
                                                );
                                        }}
                                        style="cursor:pointer;"
                                      >
                                        <div class="card-body p-2">
                                          <div
                                            class="d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                                          >
                                            <div
                                              class="d-flex align-items-center me-3"
                                            >
                                              {#if isImg}
                                                <span
                                                  class="avatar border me-2"
                                                >
                                                  <img
                                                    src={ATTACHMENT_BASE_URL +
                                                      file?.url}
                                                    alt={file?.originalName}
                                                    class="object-contain"
                                                  />
                                                </span>
                                              {:else}
                                                <span
                                                  class="avatar {fi.bg} me-2"
                                                >
                                                  <i class="ti {fi.icon} fs-20"
                                                  ></i>
                                                </span>
                                              {/if}
                                              <div>
                                                <h6
                                                  class="fw-medium lg:fs-14 fs-12 mb-1 trank"
                                                  title={file?.originalName}
                                                >
                                                  {shortenFileName(
                                                    file?.originalName,
                                                  )}
                                                </h6>
                                                <p class="mb-0 fs-12 md:fs-10">
                                                  {(file.size / 1024).toFixed(
                                                    2,
                                                  )} KB
                                                </p>
                                              </div>
                                            </div>
                                            <button
                                              on:click|stopPropagation={() =>
                                                isImg
                                                  ? openImageLightbox(
                                                      attachImgUrls,
                                                      imgIdx,
                                                    )
                                                  : openAttachment(
                                                      ATTACHMENT_BASE_URL +
                                                        file?.url,
                                                      file?.mimeType,
                                                      file?.originalName,
                                                    )}
                                              class="avatar avatar-xs rounded-circle bg-light text-dark"
                                              title="Open"
                                            >
                                              <i class="ti ti-external-link"
                                              ></i>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                              </div>
                            </div>
                          {/each}
                        {:else}
                          <div>No attachments found.</div>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
                <!-- /Notes -->
              {/if}

              {#if activeTab === "Chats"}
                <!-- Chats -->
                <div class="tab-pane active show" id="tab_3">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Chats</h5>
                      <div class="d-inline-flex align-items-center">
                        <a
                          href="#create_call"
                          data-bs-toggle="modal"
                          data-bs-target="#create_call"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</a
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      <!-- Filter tabs -->
                      <div class="d-flex gap-2 flex-wrap mb-3">
                        <button
                          type="button"
                          class="btn btn-sm {chatTypeFilter === 'All' ? 'btn-dark' : 'btn-outline-secondary'}"
                          on:click={() => (chatTypeFilter = 'All')}
                        >All ({order?.orderChats?.length ?? 0})</button>
                        {#each CHAT_TYPES as t}
                          <button
                            type="button"
                            class="btn btn-sm {chatTypeFilter === t
                              ? t === 'Call' ? 'btn-primary' : t === 'WhatsApp' ? 'btn-success' : 'btn-warning'
                              : 'btn-outline-secondary'}"
                            on:click={() => (chatTypeFilter = t)}
                          >{t} ({chatTypeCounts[t]})</button>
                        {/each}
                      </div>
                      {#if filteredChats.length}
                        {#each filteredChats as chat}
                          <div class="card mb-3 relative">
                            {#if chat?.deletedAt}
                              <div class="ribbon ribbon-top-left">
                                <span class="bg-red-500">Deleted</span>
                              </div>
                            {/if}
                            <div class="card-body">
                              {#if !chat?.deletedAt}
                                <div class="absolute top-5 right-5">
                                  <button
                                    on:click={deleteChat(chat?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button>
                                </div>
                              {/if}
                              <div
                                class="d-sm-flex align-items-center justify-content-between pb-2"
                              >
                                <div class="d-flex align-items-center mb-2">
                                  <span
                                    class="avatar avatar-md me-2 flex-shrink-0"
                                  >
                                    <img
                                      src="/assets/img/profiles/user.png"
                                      alt="img"
                                    />
                                  </span>
                                  <p class="mb-0">
                                    <span class="text-dark fw-medium"
                                      >{maskAssignedName(chat?.user)}</span
                                    >
                                    {#each normalizeTypes(chat?.type) as nt}
                                      <span class="badge ms-1 {nt === 'Call' ? 'bg-primary' : nt === 'WhatsApp' ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:10px;">
                                        {#if nt === 'Call'}<i class="ti ti-phone me-1"></i>{/if}
                                        {#if nt === 'WhatsApp'}<i class="ti ti-brand-whatsapp me-1"></i>{/if}
                                        {#if nt === 'Email'}<i class="ti ti-mail me-1"></i>{/if}
                                        {nt}
                                      </span>
                                    {/each}
                                    {#if chat?.user?.status === "banned"}
                                      <span
                                        class="badge bg-danger ms-1"
                                        style="font-size:10px;">Banned</span
                                      >
                                    {:else if chat?.user?.status === "inactive"}
                                      <span
                                        class="badge bg-secondary ms-1"
                                        style="font-size:10px;">Inactive</span
                                      >
                                    {/if}
                                    ........ on
                                    {chat?.createdAt &&
                                      convertDate(chat?.createdAt, {
                                        timeZone: "Asia/Kolkata",
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                  </p>
                                </div>
                                <div
                                  class="d-inline-flex align-items-center mb-2"
                                >
                                  <!-- <div class="dropdown me-2">
                                  <a
                                    href="#dropdown"
                                    class="btn btn-sm btn-outline-light"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                    >Busy<i class="ti ti-chevron-down ms-2"
                                    ></i></a
                                  >
                                  <div
                                    class="dropdown-menu dropdown-menu-right"
                                  >
                                    <a class="dropdown-item" href="#busy"
                                      >Busy</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >No Answer</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Unavailable</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Wrong Number</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Left Voice Message</a
                                    >
                                    <a class="dropdown-item" href="#tag"
                                      >Moving Forward</a
                                    >
                                  </div>
                                </div>
                                <div class="dropdown">
                                  <a
                                    href="#dropdown"
                                    class="action-icon btn btn-icon btn-sm btn-outline-light shadow"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                    ><i class="ti ti-dots-vertical"></i></a
                                  >
                                  <div
                                    class="dropdown-menu dropdown-menu-right"
                                  >
                                    <a
                                      class="dropdown-item"
                                      href="#tag"
                                      data-bs-toggle="modal"
                                      data-bs-target="#edit_call"
                                      ><i class="ti ti-edit me-1"></i>Edit</a
                                    >
                                    <a
                                      class="dropdown-item"
                                      href="#tag"
                                      data-bs-toggle="modal"
                                      data-bs-target="#delete_call"
                                      ><i class="ti ti-trash me-1"></i>Delete</a
                                    >
                                  </div>
                                </div> -->
                                </div>
                              </div>
                              <p class="mb-0">
                                {chat?.message}
                              </p>
                            </div>
                          </div>
                        {/each}
                      {:else}
                        <div>No chats found.</div>
                      {/if}
                      <!-- /Filter tabs -->
                    </div>
                  </div>
                </div>
                <!-- /Chats -->
              {/if}


              {#if activeTab === "Client"}
                <!-- Client -->
                <div class="tab-pane active show" id="tab_3">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Clients</h5>
                      <!-- Add New button removed — use sidebar client section instead -->
                      <div class="d-inline-flex align-items-center"></div>
                    </div>
                    <div class="card-body">
                      {#if order?.orderClients.length}
                        {#each order.orderClients as orderClient}
                          <div class="card mb-3 relative">
                            {#if orderClient?.deletedAt}
                              <div class="ribbon ribbon-top-left">
                                <span class="bg-red-500">Deleted</span>
                              </div>
                            {/if}
                            <div class="card-body">
                              {#if !orderClient?.deletedAt}
                                <div class="absolute top-5 right-5">
                                  <button
                                    on:click={deleteClient(orderClient?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button>
                                </div>
                              {/if}
                              <div
                                class="d-sm-flex align-items-center justify-content-between"
                              >
                                <div>
                                  {#if orderClient?.name}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-user fs-14"></i>
                                      </span>
                                      <p class="mb-0 capitalize">
                                        {orderClient?.name}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.designation}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-id fs-14"></i>
                                      </span>
                                      <p class="mb-0 capitalize">
                                        {orderClient?.designation}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.email}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-mail fs-14"></i>
                                      </span>
                                      <p class="mb-0">
                                        <a href="mailto:{orderClient?.email}"
                                          >{orderClient?.email}</a
                                        >
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.mobile}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-phone fs-14"></i>
                                      </span>
                                      <p class="mb-0">
                                        {orderClient?.mobile}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.alternateMobile}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-device-mobile fs-14"
                                        ></i>
                                      </span>
                                      <p class="mb-0">
                                        {orderClient?.alternateMobile}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.whatsapp}
                                    <div class="d-flex align-items-center mb-2">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-brand-whatsapp fs-14"
                                        ></i>
                                      </span>
                                      <p class="mb-0">
                                        {orderClient?.whatsapp}
                                      </p>
                                    </div>
                                  {/if}
                                  {#if orderClient?.address}
                                    <div class="d-flex align-items-center">
                                      <span
                                        class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                                      >
                                        <i class="ti ti-location-pin fs-14"></i>
                                      </span>
                                      <p class="mb-0 capitalize">
                                        {orderClient?.address}
                                      </p>
                                    </div>
                                  {/if}
                                </div>
                              </div>
                            </div>
                          </div>
                        {/each}
                      {:else}
                        <div>No clients found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Client -->
              {/if}

              {#if activeTab === "Reminders"}
                <!-- Reminders -->
                <div class="tab-pane active show" id="tab_7">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <h5 class="fw-semibold mb-0">Reminders</h5>
                      <div class="d-inline-flex align-items-center">
                        <a
                          href="#create_reminder"
                          data-bs-toggle="modal"
                          data-bs-target="#create_reminder"
                          class="link-primary fw-medium"
                          ><i class="ti ti-circle-plus me-1"></i>Add New</a
                        >
                      </div>
                    </div>
                    <div class="card-body">
                      {#if order?.orderReminders?.length}
                        {#each order.orderReminders as reminder}
                          <div class="card mb-3 relative">
                            {#if reminder?.deletedAt}
                              <div class="ribbon ribbon-top-left">
                                <span class="bg-red-500">Deleted</span>
                              </div>
                            {/if}
                            <div class="card-body">
                              {#if !reminder?.deletedAt}
                                <div class="absolute top-5 right-5">
                                  <button
                                    on:click={deleteReminder(reminder?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button>
                                </div>
                              {/if}
                              <div
                                class="d-sm-flex align-items-center justify-content-between pb-2"
                              >
                                <div class="d-flex align-items-center mb-2">
                                  <span
                                    class="avatar avatar-md me-2 flex-shrink-0"
                                  >
                                    <img
                                      src="/assets/img/profiles/user.png"
                                      alt="img"
                                    />
                                  </span>

                                  <div>
                                    <h6 class="fw-medium fs-14 mb-1">
                                      {maskAssignedName(reminder?.user)}
                                    </h6>
                                    <p class="mb-0 fs-13">
                                      {reminder?.createdAt &&
                                        convertDate(reminder?.createdAt, {
                                          timeZone: "Asia/Kolkata",
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                        })}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  class="d-inline-flex align-items-center mb-2"
                                ></div>
                              </div>
                              {#if reminder?.reminderTime}
                                <p class="mb-0">
                                  Reminder Time :
                                  <span class="text-black">
                                    {reminder?.reminderTime &&
                                      convertDate(reminder?.reminderTime, {
                                        timeZone: "Asia/Kolkata",
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                  </span>
                                </p>
                              {/if}
                              {#if reminder?.message}
                                <p class="mb-0">
                                  {reminder?.message}
                                </p>
                              {/if}
                            </div>
                          </div>
                        {/each}
                      {:else}
                        <div>No reminders found.</div>
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Chats -->
              {/if}
              {#if activeTab === "Queries"}
                <!-- Queries Tab -->
                <div class="tab-pane active show" id="tab_10">
                  <div class="card">
                    <div
                      class="card-header d-flex align-items-center justify-content-between py-2"
                    >
                      <h5 class="fw-semibold mb-0">
                        <i class="ti ti-help-circle me-1 text-primary"></i>
                        {#if currentUser?.subRole === "tech"}
                          My Assigned Queries
                        {:else}
                          Related Queries
                        {/if}
                      </h5>
                      {#if currentUser?.subRole === "telecaller" || (currentUser?.role === "user" && !currentUser?.subRole)}
                        <button
                          class="btn btn-sm btn-outline-warning"
                          on:click={openQueryModal}
                        >
                          <i class="ti ti-plus me-1"></i>Raise Query
                        </button>
                      {/if}
                    </div>
                    <div class="card-body p-0">
                      {#if orderQueriesLoading}
                        <div class="text-center py-4">
                          <span
                            class="spinner-border spinner-border-sm text-primary"
                          ></span>
                        </div>
                      {:else}
                        {@const visibleQueries =
                          currentUser?.subRole === "tech"
                            ? orderQueries.filter(
                                (q) => q.assignedTo?.id === currentUser?.id,
                              )
                            : currentUser?.subRole === "telecaller"
                              ? orderQueries
                              : orderQueries}
                        {#if visibleQueries.length === 0}
                          <div class="text-center py-4 text-muted small">
                            {#if currentUser?.subRole === "tech"}
                              <i class="ti ti-help-off me-1"></i>No queries
                              assigned to you for this order.
                            {:else if currentUser?.subRole === "telecaller"}
                              <i class="ti ti-help-off me-1"></i>You haven't
                              raised any queries for this order yet.
                            {:else}
                              <i class="ti ti-help-off me-1"></i>No queries
                              raised for this order yet.
                            {/if}
                          </div>
                        {:else}
                          <div class="table-responsive">
                            <table
                              class="table table-hover align-middle mb-0 small"
                            >
                              <thead class="table-light">
                                <tr>
                                  <th>Subject</th>
                                  {#if currentUser?.subRole === "tech"}
                                    <th>Raised By</th>
                                  {:else if currentUser?.subRole === "telecaller"}
                                    <th>Assigned To</th>
                                  {:else}
                                    <th>Raised By</th>
                                    <th>Assigned To</th>
                                  {/if}
                                  <th>Status</th>
                                  <th>Date</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {#each visibleQueries as q}
                                  <tr>
                                    <td class="fw-semibold">{q.subject}</td>
                                    {#if currentUser?.subRole === "tech"}
                                      <td>{maskAssignedName(q.raisedBy) ?? "-"}</td>
                                    {:else if currentUser?.subRole === "telecaller"}
                                      <td>
                                        {#if q.assignedTo}
                                          <span
                                            class="badge bg-success-subtle text-success-emphasis"
                                            >{maskAssignedName(q.assignedTo)}</span
                                          >
                                        {:else}
                                          <span class="text-muted"
                                            >Unassigned</span
                                          >
                                        {/if}
                                      </td>
                                    {:else}
                                      <td>
                                        {#if q.raisedBy}
                                          {#if q.raisedBy.name === "Telecaller"}
                                            <span class="text-muted small"
                                              ><i class="ti ti-lock me-1"
                                              ></i>Hidden</span
                                            >
                                          {:else}
                                            <div
                                              class="d-flex align-items-center gap-1"
                                            >
                                              <span>{q.raisedBy.name}</span>
                                              <span
                                                class="badge bg-warning-subtle text-warning-emphasis"
                                                style="font-size:10px;"
                                                >Telecaller</span
                                              >
                                            </div>
                                          {/if}
                                        {:else}-{/if}
                                      </td>
                                      <td>
                                        {#if q.assignedTo}
                                          {#if q.assignedTo.name === "Tech"}
                                            <span class="text-muted small"
                                              ><i class="ti ti-lock me-1"
                                              ></i>Hidden</span
                                            >
                                          {:else}
                                            <div
                                              class="d-flex align-items-center gap-1"
                                            >
                                              <span>{q.assignedTo.name}</span>
                                              <span
                                                class="badge bg-success-subtle text-success-emphasis"
                                                style="font-size:10px;"
                                                >Tech</span
                                              >
                                            </div>
                                          {/if}
                                        {:else}<span class="text-muted"
                                            >Unassigned</span
                                          >{/if}
                                      </td>
                                    {/if}
                                    <td>
                                      <span
                                        class="badge {q.status === 'open'
                                          ? 'bg-primary'
                                          : q.status === 'in_progress'
                                            ? 'bg-warning text-dark'
                                            : q.status === 'resolved'
                                              ? 'bg-success'
                                              : q.status === 'reopened'
                                                ? 'bg-danger'
                                                : 'bg-secondary'}"
                                      >
                                        {q.status?.replace("_", " ")}
                                      </span>
                                    </td>
                                    <td class="text-muted">
                                      {new Date(q.createdAt).toLocaleString(
                                        "en-IN",
                                        {
                                          day: "2-digit",
                                          month: "short",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        },
                                      )}
                                    </td>
                                    <td class="d-flex gap-1 align-items-center">
                                      <a
                                        href="/admin/query/{q.id}"
                                        class="btn btn-sm btn-outline-primary"
                                      >
                                        <i class="ti ti-eye"></i>
                                      </a>
                                      {#if (currentUser?.subRole === 'telecaller' && q.raisedBy?.id === currentUser?.id) || (!currentUser?.subRole && ['master','admin','manager'].includes(currentUser?.role))}
                                        <button
                                          class="btn btn-sm btn-outline-secondary"
                                          on:click={() => openEditQueryModal(q)}
                                          title="Edit Query"
                                        >
                                          <i class="ti ti-pencil"></i>
                                        </button>
                                      {/if}
                                    </td>
                                  </tr>
                                {/each}
                              </tbody>
                            </table>
                          </div>
                        {/if}
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- /Queries Tab -->
              {/if}
              {#if ["Deal Won", "Dispatched", "Completed"].includes(order?.status)}
                {#if activeTab === "Components"}
                  <!-- Components -->
                  <div class="tab-pane active show" id="tab_8">
                    <div class="card">
                      <div
                        class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                      >
                        <h5 class="fw-semibold mb-0">Multiple Orders</h5>
                        <div class="d-inline-flex align-items-center">
                          {#if order.status === "Deal Won"}
                            <button
                              on:click={() => cerateChildOrder()}
                              disabled={order.status === "Deal Won"}
                              class="link-primary fw-medium flex items-center"
                              ><i class="ti ti-circle-plus me-1"></i>Create New</button
                            >
                          {/if}
                        </div>
                      </div>
                      <div class="card-body">
                        {#if order?.childOrders?.length}
                          {#each order.childOrders as component}
                            <div class="card mb-3 relative">
                              {#if component?.deletedAt}
                                <div class="ribbon ribbon-top-left">
                                  <span class="bg-red-500">Deleted</span>
                                </div>
                              {/if}
                              <div class="card-body">
                                <div class="absolute top-5 right-14">
                                  <!-- <button
                                    on:click={editComponent(component?.id)}
                                    class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                  >
                                    <i class="ti ti-trash"></i>
                                  </button> -->
                                  <a
                                    href="#edit_component"
                                    data-bs-toggle="modal"
                                    data-bs-target="#edit_component"
                                    on:click={() => editChildOrder(component)}
                                    class="bg-secondary text-white text-md px-1.5 py-1.5 rounded"
                                  >
                                    <i class="ti ti-pencil"></i>
                                  </a>
                                </div>
                                {#if !component?.deletedAt}
                                  <div class="absolute top-4 right-5">
                                    <button
                                      on:click={deleteComponent(component?.id)}
                                      class="bg-red-500 text-white text-md px-1.5 py-1 rounded"
                                    >
                                      <i class="ti ti-trash"></i>
                                    </button>
                                  </div>
                                {/if}
                                <div
                                  class="d-sm-flex align-items-center justify-content-between"
                                >
                                  <div class="d-flex align-items-center">
                                    <div
                                      class="avatar avatar-lg avatar-rounded border border-warning bg-soft-warning me-1 flex-shrink-0"
                                    >
                                      <h6 class="mb-0 text-warning">
                                        {getAvatarText(component?.title)}
                                      </h6>
                                    </div>

                                    <div>
                                      <h6 class="fw-medium fs-14 mb-1">
                                        {component?.title} ({component?.workOrderNumber})
                                      </h6>
                                      <p class="mb-0 fs-13">
                                        {component?.createdAt &&
                                          convertDate(component?.createdAt, {
                                            timeZone: "Asia/Kolkata",
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          {/each}
                        {:else}
                          <div>No components found.</div>
                        {/if}
                      </div>
                    </div>
                  </div>
                  <!-- /Components -->
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
        <div class="row">
          <div class="col-md-12">No order details found.</div>
        </div>
      {/if}
    {:else}
      <div class="row">
        <div class="col-md-12">Loading order details...</div>
      </div>
    {/if}
    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>

<!-- Add Canvas -->
<div
  class="offcanvas offcanvas-end offcanvas-large"
  tabindex="-1"
  id="offcanvas_add"
>
  <div class="offcanvas-header border-bottom">
    <h5 class="mb-0">Update Order</h5>
    <button
      type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    >
    </button>
  </div>
  <div class="offcanvas-body">
    <form
      on:submit={handleSubmit}
      class="needs-validation space-y-4"
      novalidate
    >
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="form-label" for="title">
            Title <span class="text-danger">*</span>
          </label>
          <input
            type="text"
            name="title"
            class="form-control"
            class:is-invalid={formErrors.title}
            bind:value={title}
            required
            id="title"
            placeholder="Title"
          />
          {#if formErrors.title}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.title[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="category">Category</label>
          {#key categories.length}
            <TypeableSelect
              id="category"
              options={categories}
              grouped={true}
              value={category != "" ? category : null}
              placeholder="Select Category"
              on:change={(e) => (category = e.detail)}
            />
          {/key}
          <!-- <input
            type="text"
            name="category"
            class="form-control"
            class:is-invalid={formErrors.category}
            bind:value={category}
            id="category"
            placeholder="Category"
          /> -->
          {#if formErrors.category}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.category[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="workOrderNumber"
            >Work Order Number</label
          >
          <input
            type="text"
            name="workOrderNumber"
            class="form-control"
            class:is-invalid={formErrors.workOrderNumber}
            bind:value={workOrderNumber}
            id="workOrderNumber"
            placeholder="Work Order Number"
          />
          {#if formErrors.workOrderNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.workOrderNumber[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="orderDate">Order Date</label>
          <input
            type="date"
            name="orderDate"
            class="form-control"
            class:is-invalid={formErrors.orderDate}
            bind:value={orderDate}
            id="orderDate"
            placeholder="Order Date"
          />
          {#if formErrors.orderDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.orderDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="startDate">Start Date</label>
          <input
            type="date"
            name="startDate"
            class="form-control"
            class:is-invalid={formErrors.startDate}
            bind:value={startDate}
            id="startDate"
            placeholder="Start Date"
          />
          {#if formErrors.startDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.startDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="deadlineDate">Deadline Date</label>
          <input
            type="date"
            name="deadlineDate"
            class="form-control"
            class:is-invalid={formErrors.deadlineDate}
            bind:value={deadlineDate}
            id="deadlineDate"
            placeholder="Deadline Date"
          />
          {#if formErrors.deadlineDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.deadlineDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="price">Price</label>
          <!-- <input
            type="number"
            name="price"
            class="form-control"
            class:is-invalid={formErrors.price}
            bind:value={price}
            id="price"
            placeholder="Price"
          /> -->
          <div
            class="!flex items-center rounded-md bg-white !p-0 !pl-3 outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-indigo-600 form-control"
            class:is-invalid={formErrors.price}
            class:border={!formErrors.price}
          >
            <div
              class="shrink-0 text-base text-gray-500 select-none sm:text-sm/6"
            >
              {currencies.find((c) => c.code === currency)?.symbol}
            </div>
            <input
              id="price"
              type="number"
              name="price"
              bind:value={price}
              placeholder="0.00"
              class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base placeholder:text-gray-400 focus:outline-none sm:text-sm/6"
            />
            <div class="grid shrink-0 grid-cols-1 focus-within:relative">
              <select
                id="currency"
                name="currency"
                bind:value={currency}
                aria-label="Currency"
                class="col-start-1 row-start-1 w-full border-l appearance-none rounded-md rounded-l-[0px] py-1.5 pr-7 pl-3 text-base text-gray-500 placeholder:text-gray-400 focus:outline-0 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              >
                {#each currencies as currency}
                  <option value={currency.code}>{currency.code}</option>
                {/each}
              </select>
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                data-slot="icon"
                aria-hidden="true"
                class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
              >
                <path
                  d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                  clip-rule="evenodd"
                  fill-rule="evenodd"
                />
              </svg>
            </div>
          </div>
          {#if formErrors.price}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.price[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="priceTerms">Price Terms</label>
          <input
            type="text"
            name="priceTerms"
            class="form-control"
            class:is-invalid={formErrors.priceTerms}
            bind:value={priceTerms}
            id="priceTerms"
            placeholder="Price Terms"
          />
          {#if formErrors.priceTerms}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.priceTerms[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="source">Source</label>
          <TypeableSelect
            id="source"
            options={sources}
            value={source}
            placeholder="Select Source"
            on:change={(e) => (source = e.detail)}
          />
          {#if formErrors.source}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.source[0]}</li>
            </ul>
          {/if}
        </div>
      </div>
      <div class="col-span-2">
        <label class="form-label" for="description"> Description </label>
        <div class:is-invalid={formErrors.description} style="border-radius:6px;">
          <QuillEditor
            bind:value={description}
            placeholder="Description"
            height="180px"
            on:change={(e) => description = e.detail}
          />
        </div>

        {#if formErrors.description}
          <ul class="text-danger mt-1 text-xs capitalize">
            <li>{formErrors.description[0]}</li>
          </ul>
        {/if}
      </div>
      <div class="d-flex align-items-center justify-content-end mt-4">
        <button
          type="button"
          data-bs-dismiss="offcanvas"
          class="btn btn-light me-2">Cancel</button
        >

        <button class="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update Now"}
        </button>
      </div>
    </form>
  </div>
</div>
<!-- /Add Canvas -->

<!-- Add Attachment -->
<div class="modal fade" id="new_file" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Add New Attachment</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={addAttachment}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body space-y-4">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="title">
                Title <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="title"
                class="form-control"
                class:is-invalid={formErrors.title}
                bind:value={aTitle}
                required
                id="title"
                placeholder="Title"
              />
              {#if formErrors.title}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.title[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="link"> Link </label>
              <input
                type="text"
                name="link"
                class="form-control"
                class:is-invalid={formErrors.link}
                bind:value={link}
                id="link"
                placeholder="Link"
              />
              {#if formErrors.link}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.link[0]}</li>
                </ul>
              {/if}
            </div>
            <!-- File Upload -->
            <div>
              <label class="form-label" for="attachment">
                Attachment <span class="text-danger">*</span>
              </label>
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="file-upload drag-file w-100 d-flex border shadow align-items-center justify-content-center flex-column p-3 transition-all"
                class:bg-primary={isDragging}
                class:bg-light={!isDragging}
                style="border-style: dashed !important; border-color: {isDragging
                  ? '#4f46e5'
                  : '#dee2e6'} !important;"
                on:dragover={handleDragOver}
                on:dragleave={handleDragLeave}
                on:drop={handleDrop}
              >
                <span class="upload-img d-block mb-1">
                  <i
                    class="ti ti-folder-open fs-16 {isDragging
                      ? 'text-white'
                      : 'text-primary'}"
                  ></i>
                </span>
                <p class="mb-0 fs-14 {isDragging ? 'text-white' : 'text-dark'}">
                  {#if isDragging}
                    Release to upload files
                  {:else}
                    Drop your files here or
                    <a
                      href="#browse"
                      class="text-decoration-underline text-primary">browse</a
                    >
                  {/if}
                </p>

                <input
                  type="file"
                  name="file"
                  accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  id="attachmentFile"
                  multiple
                  on:change={handleFileChange}
                />
                <p class="fs-13 mb-0 {isDragging ? 'text-white' : ''}">
                  Maximum limit: 10 Files
                </p>
              </div>

              {#if formErrors.file}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.file[0]}</li>
                </ul>
              {/if}
            </div>
          </div>

          {#if files && files.length}
            <div class="grid grid-cols-2 gap-3">
              {#each files as file}
                <div class="card mb-0">
                  <div class="card-body p-2">
                    <div
                      class="d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                    >
                      <div class="d-flex align-items-center me-3">
                        {#if file.type && file.type.startsWith("image")}
                          <span class="avatar border me-2">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file?.name}
                              class="object-contain"
                            />
                          </span>
                        {:else}
                          <span class="avatar bg-success me-2">
                            <i class="ti ti-file-spreadsheet fs-20"></i>
                          </span>
                        {/if}
                        <div>
                          <h6
                            class="fw-medium fs-12 mb-1 trank"
                            title={file?.name}
                          >
                            {shortenFileName(file?.name, 4, 8)}
                          </h6>
                          <p class="mb-0 fs-10">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="avatar avatar-xs rounded-circle bg-danger text-white"
                        on:click={() => removeFile(file)}
                      >
                        <i class="ti ti-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          <div class="modal-footer">
            <a class="btn btn-light" href="#cancel" data-bs-dismiss="modal"
              >Cancel</a
            >
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Add Attachment -->

<!-- Create Chat -->
<div class="modal fade" id="create_call" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Chat</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form on:submit={addChat} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label">
                Type <span class="text-danger">*</span>
              </label>
              <div class="d-flex gap-2 flex-wrap">
                {#each CHAT_TYPES as t}
                  <button
                    type="button"
                    class="btn btn-sm {selectedTypes.includes(t)
                      ? t === 'Call' ? 'btn-primary' : t === 'WhatsApp' ? 'btn-success' : 'btn-warning'
                      : 'btn-outline-secondary'}"
                    on:click|stopPropagation={() => toggleChatType(t)}
                  >
                    {#if t === 'Call'}<i class="ti ti-phone me-1"></i>{/if}
                    {#if t === 'WhatsApp'}<i class="ti ti-brand-whatsapp me-1"></i>{/if}
                    {#if t === 'Email'}<i class="ti ti-mail me-1"></i>{/if}
                    {t}
                  </button>
                {/each}
                <button
                  type="button"
                  class="btn btn-sm {allSelected ? 'btn-dark' : 'btn-outline-secondary'}"
                  on:click|stopPropagation={() => toggleChatType('All')}
                >
                  <i class="ti ti-select-all me-1"></i>All
                </button>
              </div>
              {#if formErrors.type}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.type[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="message">
                Message <span class="text-danger">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                class="form-control"
                rows="4"
                bind:value={message}
                class:is-invalid={formErrors.message}
                required
              ></textarea>
              {#if formErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.message[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Chat -->

<!-- Create Reminder -->
<div class="modal fade" id="create_reminder" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Reminder</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={addReminder}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="reminderTime">
                Reminder Time <span class="text-danger">*</span>
              </label>
              <input
                type="datetime-local"
                name="reminderTime"
                class="form-control"
                class:is-invalid={formErrors.reminderTime}
                bind:value={reminderTime}
                required
                id="reminderTime"
                placeholder="Reminder Time"
              />
              {#if formErrors.reminderTime}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.reminderTime[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="reminderMessage">
                Message <span class="text-danger">*</span>
              </label>
              <textarea
                id="reminderMessage"
                name="reminderMessage"
                class="form-control"
                rows="4"
                bind:value={reminderMessage}
                class:is-invalid={formErrors.reminderMessage}
                required
              ></textarea>
              {#if formErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.message[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Reminder -->

<!-- Manage Assigned Users -->
<div class="modal custom-modal fade" id="add_contact" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h5 class="modal-title">Manage Assigned Users</h5>
          <small class="text-muted">
            {selectedUsers.length} user{selectedUsers.length === 1 ? "" : "s"} selected
          </small>
        </div>
        <button
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="modal-body">
        <form on:submit={addAssignedUser} class="needs-validation" novalidate>
          <!-- Search -->
          <div class="input-group mb-3">
            <span class="input-group-text bg-white border-end-0">
              <i class="ti ti-search text-muted"></i>
            </span>
            <input
              type="text"
              class="form-control border-start-0 ps-0"
              placeholder="Search users..."
              bind:value={userSearch}
            />
          </div>

          <!-- User list -->
          <div
            class="access-wrap"
            style="max-height: 300px; overflow-y: auto; overflow-x: hidden;"
          >
            {#if users.length}
              {@const filteredUsers = users
                .filter((u) => u.status !== "banned" && u.status !== "inactive")
                .filter((u) => {
                  if (['master','admin','manager'].includes(currentUser?.role)) return true;
                  if (currentUser?.subRole === 'telecaller') return u.subRole === 'telecaller';
                  if (currentUser?.subRole === 'tech' || currentUser?.subRole === 'tech_helper') return u.subRole === 'tech' || u.subRole === 'tech_helper';
                  return false;
                })
                .filter((u) =>
                  u.name?.toLowerCase().includes(userSearch.toLowerCase()),
                )}
              {#if filteredUsers.length}
                <div class="row g-2">
                  {#each filteredUsers as user}
                    <div class="col-6">
                      <label
                        class="checkboxs d-flex align-items-center p-2 rounded border h-100"
                        class:bg-light={selectedUsers.includes(user.id)}
                        class:border-primary={selectedUsers.includes(user.id)}
                        class:opacity-50={user.status === "inactive"}
                        style="cursor:{user.status === 'inactive'
                          ? 'not-allowed'
                          : 'pointer'}; transition: background 0.15s;"
                      >
                        <input
                          type="checkbox"
                          class="form-check-input me-2 mt-0 flex-shrink-0"
                          bind:group={selectedUsers}
                          value={user.id}
                          disabled={user.status === "inactive"}
                        />
                        <span
                          class="avatar avatar-xs rounded-circle me-2 flex-shrink-0"
                        >
                          <img
                            src="/assets/img/profiles/user.png"
                            alt="img"
                            class="rounded-circle"
                            style="width:28px;height:28px;object-fit:cover;"
                          />
                        </span>
                        <div class="overflow-hidden">
                          <p
                            class="fw-medium mb-0 text-truncate"
                            style="font-size:0.85rem;"
                          >
                            {maskAssignedName(user)}
                          </p>
                        </div>
                      </label>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-muted text-center py-3 mb-0">
                  No users match "{userSearch}"
                </p>
              {/if}
            {:else}
              <p class="text-muted text-center py-3 mb-0">No users available</p>
            {/if}
          </div>

          <div class="modal-btn text-end mt-3">
            <button
              type="button"
              class="btn btn-light me-2"
              data-bs-dismiss="modal"
            >
              Cancel
            </button>
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
<!-- /Manage Assigned Users -->

<!-- Add Contact Modal (Scenario 2 — order already has client linked) -->
{#if showAddContactModal}
  <div
    class="modal fade show d-block"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:9999;"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-user-plus me-2 text-primary"></i>Add Contact
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={() => (showAddContactModal = false)}
          ></button>
        </div>

        <div class="modal-body">
          <!-- Client info badge -->
          <div
            class="mb-3 p-2 bg-light rounded d-flex align-items-center gap-2 border"
          >
            <i class="ti ti-building-store text-primary"></i>
            <span class="fw-semibold">{order.client?.name}</span>
            {#if order.client?.gstNumber}
              <span class="text-muted small ms-1"
                >GST: {order.client.gstNumber}</span
              >
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label"
                >Name <span class="text-danger">*</span></label
              >
              <input
                type="text"
                class="form-control"
                class:is-invalid={acFormErrors.acName}
                bind:value={acName}
                placeholder="Contact name"
              />
              {#if acFormErrors.acName}
                <ul class="text-danger mt-1 text-xs">
                  <li>{acFormErrors.acName}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label">Designation</label>
              <input
                type="text"
                class="form-control"
                bind:value={acDesignation}
                placeholder="e.g. Manager, Director"
              />
            </div>
            <div>
              <label class="form-label">Mobile</label>
              <input
                type="text"
                class="form-control"
                bind:value={acMobile}
                placeholder="Mobile"
              />
            </div>
            <div>
              <label class="form-label">Email</label>
              <input
                type="email"
                class="form-control"
                bind:value={acEmail}
                placeholder="Email"
              />
            </div>
            <div>
              <label class="form-label">Whatsapp</label>
              <input
                type="text"
                class="form-control"
                bind:value={acWhatsapp}
                placeholder="Whatsapp"
              />
            </div>
            <div>
              <label class="form-label">Alternate Mobile</label>
              <input
                type="text"
                class="form-control"
                bind:value={acAltMobile}
                placeholder="Alternate mobile"
              />
            </div>
            <div class="col-span-2">
              <label class="form-label">Address</label>
              <input
                type="text"
                class="form-control"
                bind:value={acAddress}
                placeholder="Address"
              />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={() => (showAddContactModal = false)}>Cancel</button
          >
          <button
            type="button"
            class="btn btn-primary"
            on:click={submitAddContact}
            disabled={acLoading}
          >
            {acLoading ? "Saving..." : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- New Client + Contact Modal (for unlinked orders) -->
{#if showNewClientModal}
  <div
    class="modal fade show d-block"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:9999;"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-building-store me-2 text-primary"></i>
            {newClientStep === 1
              ? "Step 1 — Select or Create Client"
              : "Step 2 — Add Contact Person"}
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={() => (showNewClientModal = false)}
          ></button>
        </div>

        <div class="modal-body">
          <!-- Step indicator -->
          <div class="d-flex align-items-center gap-2 mb-4">
            <div class="d-flex align-items-center gap-1">
              <span
                class="badge rounded-pill {newClientStep >= 1
                  ? 'bg-primary'
                  : 'bg-secondary'} px-3 py-2">1</span
              >
              <span
                class="small fw-semibold {newClientStep >= 1
                  ? 'text-primary'
                  : 'text-muted'}">Client</span
              >
            </div>
            <div class="flex-grow-1 border-top mx-2"></div>
            <div class="d-flex align-items-center gap-1">
              <span
                class="badge rounded-pill {newClientStep >= 2
                  ? 'bg-primary'
                  : 'bg-secondary'} px-3 py-2">2</span
              >
              <span
                class="small fw-semibold {newClientStep >= 2
                  ? 'text-primary'
                  : 'text-muted'}">Contact</span
              >
            </div>
          </div>

          <!-- ── STEP 1 ── -->
          {#if newClientStep === 1}
            <!-- Search existing client -->
            {#if !ncSelectedClient && !ncCreateMode}
              <div class="mb-3 position-relative">
                <label class="form-label fw-semibold"
                  >Search Existing Client</label
                >
                <div class="input-group">
                  <input
                    type="text"
                    class="form-control"
                    placeholder="Type company name, mobile, email..."
                    bind:value={ncSearchQuery}
                    on:input={ncOnSearchInput}
                    autocomplete="off"
                  />
                  {#if ncSearchLoading}
                    <span class="input-group-text">
                      <span class="spinner-border spinner-border-sm"></span>
                    </span>
                  {/if}
                </div>

                {#if ncSearchDropdown && ncSearchResults.length > 0}
                  <div
                    class="border rounded bg-white position-absolute w-100 shadow"
                    style="z-index:9999;max-height:220px;overflow-y:auto;top:100%;"
                  >
                    {#each ncSearchResults as client}
                      <button
                        type="button"
                        class="d-block w-100 text-start px-3 py-2 border-bottom"
                        style="background:none;"
                        on:click={() => ncSelectClient(client)}
                      >
                        <div class="fw-semibold">
                          <i class="ti ti-building-store me-1 text-primary"
                          ></i>{client.name}
                        </div>
                        {#if client.gstNumber}
                          <div class="text-muted small">
                            GST: {client.gstNumber}
                          </div>
                        {/if}
                        {#if client.contacts?.length > 0}
                          <div class="text-muted small">
                            Contacts: {client.contacts
                              .map((c) => c.name)
                              .join(", ")}
                          </div>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}

                {#if ncSearchDropdown && ncSearchResults.length === 0 && ncSearchQuery.length > 1}
                  <div
                    class="border rounded bg-white position-absolute w-100 shadow px-3 py-2"
                    style="z-index:9999;top:100%;"
                  >
                    <div class="text-muted small mb-2">
                      No client found for "{ncSearchQuery}"
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      on:click={() => {
                        ncCreateMode = true;
                        ncClientName = ncSearchQuery;
                        ncSearchDropdown = false;
                      }}
                    >
                      <i class="ti ti-plus me-1"></i>Create New Client
                    </button>
                  </div>
                {/if}
              </div>

              <div class="text-center text-muted small my-3">— or —</div>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                on:click={() => {
                  ncCreateMode = true;
                  ncSearchDropdown = false;
                }}
              >
                <i class="ti ti-plus me-1"></i>Create New Client
              </button>
            {/if}

            <!-- Selected existing client -->
            {#if ncSelectedClient}
              <div class="border rounded p-3 bg-light mb-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <div class="fw-bold">
                      <i class="ti ti-building-store me-1 text-primary"
                      ></i>{ncSelectedClient.name}
                    </div>
                    {#if ncSelectedClient.gstNumber}
                      <div class="text-muted small">
                        GST: {ncSelectedClient.gstNumber}
                      </div>
                    {/if}
                    {#if ncSelectedClient.contacts?.length > 0}
                      <div class="text-muted small mt-1">
                        Existing contacts: {ncSelectedClient.contacts
                          .map((c) => c.name)
                          .join(", ")}
                      </div>
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    on:click={() => {
                      ncSelectedClient = null;
                      ncSearchQuery = "";
                    }}
                  >
                    <i class="ti ti-x"></i>
                  </button>
                </div>
              </div>
            {/if}

            <!-- Create new client form -->
            {#if ncCreateMode}
              <div class="border rounded p-3 bg-light mb-3">
                <div
                  class="d-flex justify-content-between align-items-center mb-3"
                >
                  <h6 class="mb-0 fw-semibold">New Client</h6>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    on:click={() => {
                      ncCreateMode = false;
                      ncClientName = "";
                    }}
                  >
                    <i class="ti ti-x"></i>
                  </button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label"
                      >Company Name <span class="text-danger">*</span></label
                    >
                    <input
                      type="text"
                      class="form-control"
                      class:is-invalid={ncFormErrors.ncClientName}
                      bind:value={ncClientName}
                      placeholder="Company name"
                    />
                    {#if ncFormErrors.ncClientName}
                      <ul class="text-danger mt-1 text-xs">
                        <li>{ncFormErrors.ncClientName}</li>
                      </ul>
                    {/if}
                  </div>
                  <div>
                    <label class="form-label">GST Number</label>
                    <input
                      type="text"
                      class="form-control"
                      bind:value={ncClientGst}
                      placeholder="GST number"
                    />
                  </div>
                  <div>
                    <label class="form-label">Mobile</label>
                    <input
                      type="text"
                      class="form-control"
                      bind:value={ncClientMobile}
                      placeholder="Mobile"
                    />
                  </div>
                  <div>
                    <label class="form-label">Email</label>
                    <input
                      type="email"
                      class="form-control"
                      bind:value={ncClientEmail}
                      placeholder="Email"
                    />
                  </div>
                  <div class="col-span-2">
                    <label class="form-label">Address</label>
                    <input
                      type="text"
                      class="form-control"
                      bind:value={ncClientAddress}
                      placeholder="Address"
                    />
                  </div>
                </div>
              </div>
            {/if}

            {#if ncFormErrors.step1}
              <div class="alert alert-warning py-2 small">
                {ncFormErrors.step1}
              </div>
            {/if}
          {/if}
          <!-- end step 1 -->

          <!-- ── STEP 2 ── -->
          {#if newClientStep === 2}
            <div
              class="mb-2 p-2 bg-light rounded border d-flex align-items-center gap-2"
            >
              <i class="ti ti-building-store text-primary"></i>
              <span class="fw-semibold"
                >{ncSelectedClient?.name || ncClientName}</span
              >
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary ms-auto"
                on:click={() => (newClientStep = 1)}
              >
                <i class="ti ti-edit me-1"></i>Change
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label class="form-label"
                  >Contact Name <span class="text-danger">*</span></label
                >
                <input
                  type="text"
                  class="form-control"
                  class:is-invalid={ncFormErrors.ncContactName}
                  bind:value={ncContactName}
                  placeholder="Full name"
                />
                {#if ncFormErrors.ncContactName}
                  <ul class="text-danger mt-1 text-xs">
                    <li>{ncFormErrors.ncContactName}</li>
                  </ul>
                {/if}
              </div>
              <div>
                <label class="form-label">Designation</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ncContactDesignation}
                  placeholder="e.g. Manager, Director"
                />
              </div>
              <div>
                <label class="form-label">Mobile</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ncContactMobile}
                  placeholder="Mobile"
                />
              </div>
              <div>
                <label class="form-label">Email</label>
                <input
                  type="email"
                  class="form-control"
                  bind:value={ncContactEmail}
                  placeholder="Email"
                />
              </div>
              <div>
                <label class="form-label">Whatsapp</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ncContactWhatsapp}
                  placeholder="Whatsapp"
                />
              </div>
              <div>
                <label class="form-label">Alternate Mobile</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ncContactAltMobile}
                  placeholder="Alternate mobile"
                />
              </div>
            </div>
          {/if}
          <!-- end step 2 -->
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={() => (showNewClientModal = false)}>Cancel</button
          >

          {#if newClientStep === 1}
            <button
              type="button"
              class="btn btn-primary"
              on:click={ncGoToStep2}
            >
              Next <i class="ti ti-arrow-right ms-1"></i>
            </button>
          {:else}
            <button
              type="button"
              class="btn btn-outline-secondary"
              on:click={() => (newClientStep = 1)}
            >
              <i class="ti ti-arrow-left me-1"></i>Back
            </button>
            <button
              type="button"
              class="btn btn-primary"
              on:click={ncSubmit}
              disabled={ncSubmitLoading}
            >
              {ncSubmitLoading ? "Saving..." : "Save & Link Client"}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Client Modal -->
{#if showEditClientModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" style="background:rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-building-store me-2"></i>Edit Client</h5>
          <button type="button" class="btn-close" on:click={() => showEditClientModal = false}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label">Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" class:is-invalid={editClientErrors.name} bind:value={editClientData.name} placeholder="Client name" />
              {#if editClientErrors.name}<div class="invalid-feedback">{editClientErrors.name}</div>{/if}
            </div>
            <div class="col-12">
              <label class="form-label">GST Number</label>
              <input type="text" class="form-control" bind:value={editClientData.gstNumber} placeholder="GST Number" maxlength="20" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Mobile</label>
              <input type="text" class="form-control" bind:value={editClientData.mobile} placeholder="Mobile" maxlength="20" />
            </div>
            <div class="col-md-6">
              <label class="form-label">WhatsApp</label>
              <input type="text" class="form-control" bind:value={editClientData.whatsapp} placeholder="WhatsApp" maxlength="20" />
            </div>
            <div class="col-12">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" bind:value={editClientData.email} placeholder="Email" maxlength="100" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <textarea class="form-control" rows="2" bind:value={editClientData.address} placeholder="Address" maxlength="500"></textarea>
            </div>
            <div class="col-12">
              <label class="form-label">Remark</label>
              <textarea class="form-control" rows="2" bind:value={editClientData.remark} placeholder="Remark" maxlength="500"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => showEditClientModal = false}>Cancel</button>
          <button type="button" class="btn btn-primary" on:click={saveEditClient} disabled={savingClient}>
            {#if savingClient}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showVisitListModal}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);"
    on:click|self={() => (showVisitListModal = false)}
  >
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-map-pin me-2 text-success"></i>Visits for This Order <span class="badge bg-success ms-1">{orderVisits.length}</span></h5>
          <button type="button" class="btn-close" on:click={() => (showVisitListModal = false)}></button>
        </div>
        <div class="modal-body p-0">
          <div class="table-responsive">
            <table class="table table-hover mb-0">
              <thead class="table-light">
                <tr>
                  <th class="px-3 text-center">#</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Purpose</th>
                  <th>Outcome</th>
                  <th>Attendees</th>
                  <th class="text-end px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each orderVisits as v, i}
                  <tr>
                    <td class="px-3 fw-semibold text-center">{i + 1}</td>
                    <td>
                      <span class="badge {v.visitType === 'incoming' ? 'bg-primary' : 'bg-warning text-dark'}">
                        {v.visitType}
                      </span>
                    </td>
                    <td class="small">{v.visitDate ? new Date(v.visitDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td class="small">{v.purpose || '—'}</td>
                    <td class="small">{v.outcome || '—'}</td>
                    <td class="small">{v.attendees?.length ?? 0}</td>
                    <td class="text-end px-3">
                      <div class="d-inline-flex gap-2">
                        <a href="/admin/client-visit/{v.id}" class="btn btn-sm btn-outline-primary" title="View">
                          <i class="ti ti-eye"></i>
                        </a>
                        <a href="/admin/client-visit/edit/{v.id}" class="btn btn-sm btn-outline-warning" title="Edit">
                          <i class="ti ti-edit"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showVisitListModal = false)}>Close</button>
          <button type="button" class="btn btn-success" on:click={() => { showVisitListModal = false; openVisitModal(); }}>
            <i class="ti ti-plus me-1"></i>Add Visit
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showVisitModal}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);overflow-y:auto;"
    on:click|self={() => (showVisitModal = false)}
  >
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-map-pin me-2 text-success"></i>Create Visit for This Order</h5>
          <button type="button" class="btn-close" on:click={() => (showVisitModal = false)}></button>
        </div>
        <div class="modal-body">

          {#if visitError}
            <div class="alert alert-danger py-2 mb-3">{visitError}</div>
          {/if}

          <div class="row g-3">

            <!-- Visit Type -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Visit Type <span class="text-danger">*</span></label>
              <select class="form-select" bind:value={visitType}>
                <option value="outgoing">Outgoing</option>
                <option value="incoming">Incoming</option>
              </select>
            </div>

            <!-- Visit Date -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Visit Date <span class="text-danger">*</span></label>
              <input type="date" class="form-control" bind:value={visitDate} />
            </div>

            <!-- Start Date Time -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Start Date &amp; Time</label>
              <input type="datetime-local" class="form-control" bind:value={visitStartTime} />
            </div>

            <!-- End Date Time -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">End Date &amp; Time</label>
              <input type="datetime-local" class="form-control" bind:value={visitEndTime} />
            </div>

            <!-- Transport + Company -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Transport Medium</label>
              <input type="text" class="form-control" bind:value={visitTransport} placeholder="e.g. Car, Train, Bike..." />
            </div>

            <div class="col-md-6">
              <label class="form-label fw-semibold">Company <span class="text-danger">*</span></label>
              <select class="form-select" class:is-invalid={visitFormErrors.companyId} bind:value={visitCompanyId}>
                <option value="">Select company...</option>
                {#each visitCompanies as c}
                  <option value={String(c.id)}>{c.name}</option>
                {/each}
              </select>
              {#if visitFormErrors.companyId}<div class="invalid-feedback">{visitFormErrors.companyId}</div>{/if}
            </div>

            <!-- Purpose -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Purpose <span class="text-danger">*</span></label>
              <textarea class="form-control" class:is-invalid={visitFormErrors.purpose} rows="2" bind:value={visitPurpose} placeholder="Reason for the visit..."></textarea>
              {#if visitFormErrors.purpose}<div class="invalid-feedback">{visitFormErrors.purpose}</div>{/if}
            </div>

            <!-- Outcome -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Outcome</label>
              <textarea class="form-control" rows="2" bind:value={visitOutcome} placeholder="Result of the visit..."></textarea>
            </div>

            <!-- Client Contacts -->
            {#if visitClientContacts.length > 0}
              <div class="col-12">
                <label class="form-label fw-semibold">Client Contacts Met</label>
                <div class="d-flex flex-wrap gap-2">
                  {#each visitClientContacts as cc}
                    <button
                      type="button"
                      class="btn btn-sm {visitSelectedContactIds.includes(cc.id) ? 'btn-primary' : 'btn-outline-secondary'}"
                      on:click={() => toggleVisitContact(cc.id)}
                    >
                      <i class="ti ti-user me-1"></i>{cc.name}{cc.designation ? ` (${cc.designation})` : ""}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Attendees -->
            <div class="col-12">
              <label class="form-label fw-semibold">Team Attendees</label>
              {#each visitAttendees as att, i}
                <div class="d-flex gap-2 mb-2 align-items-center">
                  <select class="form-select form-select-sm" bind:value={att.userId}>
                    <option value="">Select user...</option>
                    {#each users as u}
                      <option value={u.id}>{u.name}</option>
                    {/each}
                  </select>
                  <div class="form-check form-check-inline mb-0 text-nowrap">
                    <input class="form-check-input" type="checkbox" id="lead_{i}" bind:checked={att.isLead} />
                    <label class="form-check-label small" for="lead_{i}">Lead</label>
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => removeVisitAttendee(i)}>
                    <i class="ti ti-x"></i>
                  </button>
                </div>
              {/each}
              <button type="button" class="btn btn-sm btn-outline-secondary mt-1" on:click={addVisitAttendee}>
                <i class="ti ti-plus me-1"></i>Add Attendee
              </button>
            </div>

            <!-- Follow-up Date -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Next Follow-up Date</label>
              <input type="date" class="form-control" bind:value={visitNextFollowUp} />
            </div>

            <!-- Client Feedback -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Client Feedback</label>
              <input type="text" class="form-control" bind:value={visitFeedback} placeholder="Client's feedback..." />
            </div>

            <!-- Notes -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Internal Notes</label>
              <textarea class="form-control" rows="2" bind:value={visitNotes} placeholder="Internal notes..."></textarea>
            </div>

            <!-- Terms -->
            <div class="col-md-6">
              <label class="form-label fw-semibold">Terms Discussed</label>
              <textarea class="form-control" rows="2" bind:value={visitTerms} placeholder="Terms discussed during visit..."></textarea>
            </div>

          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showVisitModal = false)}>Cancel</button>
          <button type="button" class="btn btn-success" on:click={submitVisitModal} disabled={visitLoading}>
            {#if visitLoading}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Save Visit
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Change Client Modal (Svelte-controlled) -->
{#if showChangeClientModal}
  <div
    class="modal fade show d-block"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:9999;"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {order.client ? "Change Client" : "Link Client"}
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={() => {
              showChangeClientModal = false;
              ccSelectedExisting = null;
              ccCancelInlineCreate();
            }}
          ></button>
        </div>
        <div class="modal-body">
          {#if order.client}
            <div class="mb-3 text-muted small">
              Current: <strong>{order.client.name}</strong>
            </div>
          {/if}

          <!-- Mode toggle label row -->
          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="form-label mb-0 fw-semibold">
              {#if ccInlineCreate}
                <i class="ti ti-building-store me-1 text-primary"></i>New Client
              {:else}
                <i class="ti ti-search me-1 text-primary"></i>Search Client
              {/if}
            </label>
            {#if ccInlineCreate}
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                on:click={() => {
                  ccCancelInlineCreate();
                  ccSelectedExisting = null;
                  changeClientQuery = "";
                }}
              >
                <i class="ti ti-arrow-left me-1"></i>Back to Search
              </button>
            {:else}
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                on:click={ccOpenInlineCreate}
              >
                <i class="ti ti-plus me-1"></i>New Client
              </button>
            {/if}
          </div>

          <!-- ── Search Mode ── -->
          {#if !ccInlineCreate}
            <div class="position-relative">
              <div class="input-group mb-2">
                <input
                  type="text"
                  class="form-control"
                  placeholder="Type name, mobile, email, GST..."
                  bind:value={changeClientQuery}
                  on:input={onChangeClientInput}
                  autocomplete="off"
                />
                {#if changeClientLoading}
                  <span class="input-group-text">
                    <span class="spinner-border spinner-border-sm"></span>
                  </span>
                {/if}
              </div>

              <!-- Search results dropdown -->
              {#if changeClientDropdown && changeClientResults.length > 0}
                <div
                  class="border rounded"
                  style="max-height:200px;overflow-y:auto;"
                >
                  {#each changeClientResults as client}
                    <button
                      type="button"
                      class="d-block w-100 text-start px-3 py-2 border-bottom"
                      style="background:none;"
                      on:click={() => {
                        changeClientDropdown = false;
                        ccSelectedExisting = client;
                      }}
                    >
                      <div class="fw-semibold">
                        <i class="ti ti-building-store me-1 text-primary"
                        ></i>{client.name}
                      </div>
                      {#if client.gstNumber}
                        <div class="text-muted small">
                          GST: {client.gstNumber}
                        </div>
                      {/if}
                      {#if client.contacts?.length > 0}
                        <div class="text-muted small">
                          {client.contacts.map((c) => c.name).join(", ")}
                        </div>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}

              <!-- No results hint -->
              {#if changeClientDropdown && changeClientResults.length === 0}
                <div class="text-muted small mt-1 fst-italic">
                  No client found — use <strong>New Client</strong> button above
                  to create one.
                </div>
              {/if}
            </div>

            <!-- Selected existing client card -->
            {#if ccSelectedExisting}
              <div
                class="border rounded p-3 mt-2 bg-light d-flex justify-content-between align-items-start"
              >
                <div>
                  <div class="fw-semibold">
                    <i class="ti ti-building-store me-1 text-primary"
                    ></i>{ccSelectedExisting.name}
                  </div>
                  {#if ccSelectedExisting.gstNumber}
                    <div class="text-muted small">
                      GST: {ccSelectedExisting.gstNumber}
                    </div>
                  {/if}
                  {#if ccSelectedExisting.contacts?.length > 0}
                    <div class="text-muted small mt-1">
                      {ccSelectedExisting.contacts
                        .map((c) => c.name)
                        .join(", ")}
                    </div>
                  {/if}
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  on:click={() => {
                    ccSelectedExisting = null;
                    changeClientQuery = "";
                  }}
                >
                  <i class="ti ti-x"></i>
                </button>
              </div>
            {/if}
          {/if}

          <!-- ── Create Mode ── -->
          {#if ccInlineCreate}
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label"
                  >Company Name <span class="text-danger">*</span></label
                >
                <input
                  type="text"
                  class="form-control"
                  class:is-invalid={ccCreateErrors.name}
                  bind:value={ccNewName}
                  placeholder="Company name"
                />
                {#if ccCreateErrors.name}
                  <ul class="text-danger mt-1 text-xs">
                    <li>{ccCreateErrors.name}</li>
                  </ul>
                {/if}
              </div>
              <div>
                <label class="form-label">GST Number</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ccNewGst}
                  placeholder="GST number"
                />
              </div>
              <div>
                <label class="form-label">Mobile</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ccNewMobile}
                  placeholder="Mobile"
                />
              </div>
              <div>
                <label class="form-label">Email</label>
                <input
                  type="email"
                  class="form-control"
                  bind:value={ccNewEmail}
                  placeholder="Email"
                />
              </div>
              <div class="col-span-2">
                <label class="form-label">Address</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={ccNewAddress}
                  placeholder="Address"
                />
              </div>
            </div>
          {/if}

          <!-- Legacy contacts (first time link only) -->
          {#if legacyContacts.length > 0 && !order.clientId}
            <div class="mt-3 border rounded p-3 bg-light">
              <div class="fw-semibold small mb-2">
                <i class="ti ti-users me-1 text-primary"></i>
                Legacy contacts on this order — add to client:
              </div>
              {#each legacyContacts as oc}
                <label
                  class="d-flex align-items-center gap-2 py-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={legacyChecked.includes(oc.id)}
                    on:change={() => toggleLegacy(oc.id)}
                  />
                  <span class="small">
                    <strong>{oc.name}</strong>
                    {#if oc.designation}<span class="text-muted">
                        · {oc.designation}</span
                      >{/if}
                    {#if oc.mobile}<span class="text-muted">
                        · {oc.mobile}</span
                      >{/if}
                    {#if oc.email}<span class="text-muted">
                        · {oc.email}</span
                      >{/if}
                  </span>
                </label>
              {/each}
              {#if legacyChecked.length > 0}
                <div class="text-primary small mt-1">
                  <i class="ti ti-check me-1"></i>{legacyChecked.length} contact(s)
                  will be added
                </div>
              {/if}
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={() => {
              showChangeClientModal = false;
              ccCancelInlineCreate();
              ccSelectedExisting = null;
            }}
          >
            Cancel
          </button>

          <!-- Confirm link for selected existing client -->
          {#if ccSelectedExisting}
            <button
              type="button"
              class="btn btn-primary"
              on:click={() => confirmChangeClient(ccSelectedExisting)}
            >
              {#if legacyChecked.length > 0 && !order.clientId}
                Link ({legacyChecked.length} contact{legacyChecked.length > 1
                  ? "s"
                  : ""})
              {:else}
                Link Client
              {/if}
            </button>
          {/if}

          <!-- Confirm create + link for inline new client -->
          {#if ccInlineCreate}
            <button
              type="button"
              class="btn btn-primary"
              on:click={ccCreateAndLink}
              disabled={ccCreateLoading}
            >
              {#if ccCreateLoading}
                Creating...
              {:else if legacyChecked.length > 0 && !order.clientId}
                Create & Link ({legacyChecked.length} contact{legacyChecked.length >
                1
                  ? "s"
                  : ""})
              {:else}
                Create & Link
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Create Client -->
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
                Name <span class="text-danger">*</span>
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
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.name[0]}</li>
                </ul>
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
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.email[0]}</li>
                </ul>
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
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.mobile[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="alternateMobile">
                Alternate Mobile
              </label>
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
                Address <span class="text-danger">*</span>
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
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Client -->

<!-- Create Component -->
<div class="modal fade" id="edit_component" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Update Order</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={editComponent}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="orderTitle">
                Title <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="orderTitle"
                class="form-control"
                class:is-invalid={formErrors.orderTitle}
                bind:value={orderTitle}
                required
                id="orderTitle"
                placeholder="Title"
              />
              {#if formErrors.orderTitle}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.orderTitle[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="orderWorkOrderNumber">
                Work Order Number
              </label>
              <input
                type="text"
                name="orderWorkOrderNumber"
                class="form-control"
                class:is-invalid={formErrors.orderWorkOrderNumber}
                bind:value={orderWorkOrderNumber}
                id="orderWorkOrderNumber"
                placeholder="Work Order Number"
              />
              {#if formErrors.orderWorkOrderNumber}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.orderWorkOrderNumber[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal"
            >Cancel</button
          >
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Now"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- /Create Client -->

<PIWOTIModal
  open={piwotiOpen}
  type={piwotiType}
  order={order}
  on:close={() => piwotiOpen = false}
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
