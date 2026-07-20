<script>
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import { slide } from "svelte/transition";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { io } from "socket.io-client";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { API_BASE_URL, ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { queryUnreadCounts, clearUnread, incrementUnread, loadUnreadCounts } from "$lib/stores/queryUnreadCounts";
  import { pushQueryToast } from "$lib/stores/queryToastStore";

  /** Mark all incoming (not-own) messages in a query as read in the DB, then clear local badge. */
  async function markChatsRead(id) {
    if (!currentUser || (!isTech(currentUser) && !isTelecaller(currentUser) && !isTechHelper(currentUser))) return;
    clearUnread(Number(id));
    return authApiFetch(`${API_ROUTES.QUERY}/${id}/chat/mark-read`, { method: "PATCH" });
  }
  import { queryPrivacy } from "$lib/stores/queryPrivacy";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import { jsPDF } from "jspdf";
  import Swal from "sweetalert2";
  import LightBox from "$lib/components/LightBox.svelte";
  import DOMPurify from "dompurify";
  import { open as openExternal } from '@tauri-apps/api/shell';

  function isHtml(str) {
    return str ? /<[a-z][\s\S]*>/i.test(str) : false;
  }
  function safeHtml(str) {
    return DOMPurify.sanitize(str ?? '');
  }

  let lightboxData = [];
  let lightboxStartIndex = 0;

  function openImageLightbox(urls, index = 0) {
    lightboxStartIndex = index;
    lightboxData = urls;
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

  let queryId = $page.params.id;
  let _prevId = $page.params.id;
  let currentUser;
  let query = null;

  // ── Requirement inline edit ───────────────────────────────────────────────
  let editingRequirement = false;
  let requirementDraft = "";
  let savingRequirement = false;

  function startEditRequirement() {
    requirementDraft = query?.description ?? "";
    editingRequirement = true;
  }

  function cancelEditRequirement() {
    editingRequirement = false;
    requirementDraft = "";
  }

  async function saveRequirement() {
    if (savingRequirement) return;
    savingRequirement = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}`, {
        method: "PATCH",
        data: JSON.stringify({ description: requirementDraft }),
      });
      query = { ...query, description: requirementDraft };
      editingRequirement = false;
    } catch {
      // keep modal open on error
    } finally {
      savingRequirement = false;
    }
  }

  // Order drawer
  let orderDrawerOpen = false;
  let orderDrawerData = null;
  let orderDrawerLoading = false;
  let orderNoLinkedOrder = false; // true when drawer is open but query has no linked order

  // ── Right panel stack: 'subquery' | 'order' ──────────────────────────────
  // Last item = top (visible). Opening a panel pushes it; closing pops/removes it.
  let rightPanelStack = [];

  function pushRightPanel(panelId) {
    // Already on top — nothing to do
    if (rightPanelStack[rightPanelStack.length - 1] === panelId) return;
    // Already in stack but not on top — move it to top
    rightPanelStack = [...rightPanelStack.filter(p => p !== panelId), panelId];
  }

  function removeFromRightPanel(panelId) {
    rightPanelStack = rightPanelStack.filter(p => p !== panelId);
  }

  $: rightPanelTop = rightPanelStack[rightPanelStack.length - 1] ?? null;

  async function openOrderDrawer(orderId) {
    orderDrawerOpen = true;
    orderNoLinkedOrder = false;
    pushRightPanel('order');
    orderDrawerLoading = true;
    orderDrawerData = null;
    orderChats = [];
    orderAttachments = [];
    orderChatTotal = 0;
    orderAttachTotal = 0;
    orderActiveTab = 'info';
    try {
      const [order, chatsRes, attachRes] = await Promise.all([
        authApiFetch(`${API_ROUTES.ORDER}/${orderId}`),
        authApiFetch(`${API_ROUTES.ORDER_CHAT}?orderId=${orderId}&limit=${ORDER_PAGE_LIMIT}&offset=0`).catch(() => null),
        authApiFetch(`${API_ROUTES.ORDER_ATTACHMENT}?orderId=${orderId}&sort=asc&limit=${ORDER_PAGE_LIMIT}&offset=0`).catch(() => null),
      ]);
      orderDrawerData = order;
      orderChats = Array.isArray(chatsRes?.data) ? chatsRes.data : [];
      orderChatTotal = chatsRes?.total ?? 0;
      orderAttachments = Array.isArray(attachRes?.data) ? attachRes.data : [];
      orderAttachTotal = attachRes?.total ?? 0;
    } catch (e) {
      orderDrawerData = null;
    } finally {
      orderDrawerLoading = false;
      enhanceDescription();
    }
  }

  async function loadMoreOrderChats() {
    if (!orderDrawerData || orderChatLoadingMore) return;
    orderChatLoadingMore = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.ORDER_CHAT}?orderId=${orderDrawerData.id}&limit=${ORDER_PAGE_LIMIT}&offset=${orderChats.length}`
      );
      if (Array.isArray(res?.data) && res.data.length > 0) {
        const el = orderChatListEl;
        const prevHeight = el?.scrollHeight ?? 0;
        orderChats = [...res.data, ...orderChats];
        orderChatTotal = res.total ?? orderChatTotal;
        await tick();
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      }
    } catch (e) { /* ignore */ }
    finally { orderChatLoadingMore = false; }
  }

  async function loadMoreOrderAttachments() {
    if (!orderDrawerData || orderAttachLoadingMore) return;
    orderAttachLoadingMore = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.ORDER_ATTACHMENT}?orderId=${orderDrawerData.id}&sort=asc&limit=${ORDER_PAGE_LIMIT}&offset=${orderAttachments.length}`
      );
      if (Array.isArray(res?.data) && res.data.length > 0) {
        const el = orderAttachListEl;
        const prevHeight = el?.scrollHeight ?? 0;
        orderAttachments = [...res.data, ...orderAttachments];
        orderAttachTotal = res.total ?? orderAttachTotal;
        await tick();
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      }
    } catch (e) { /* ignore */ }
    finally { orderAttachLoadingMore = false; }
  }

  function openOrderDrawerEmpty() {
    orderDrawerOpen = true;
    orderNoLinkedOrder = true;
    orderDrawerData = null;
    orderDrawerLoading = false;
    orderChats = [];
    orderAttachments = [];
    orderActiveTab = 'info';
    pushRightPanel('order');
  }

  function closeOrderDrawer() {
    removeFromRightPanel('order');
    orderDrawerOpen = false;
    orderDrawerData = null;
    orderNoLinkedOrder = false;
    orderActiveTab = 'info';
    orderChats = [];
    orderAttachments = [];
    orderChatMsg = '';
    orderAttachFiles = [];
    orderChatSending = false;
    orderAttachSending = false;
    orderIsDragOver = false;
    orderDragDepth = 0;
    orderChatTotal = 0;
    orderAttachTotal = 0;
    orderChatLoadingMore = false;
    orderAttachLoadingMore = false;
  }

  const orderStatuses = [
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

  async function changeOrderStatusFromPanel(newStatus) {
    if (!orderDrawerData || orderDrawerData.status === newStatus) return;
    const prevStatus = orderDrawerData.status;
    const prevLabel  = $statusNamesStore[prevStatus]?.name ?? prevStatus;
    const newLabel   = $statusNamesStore[newStatus]?.name  ?? newStatus;
    const result = await Swal.fire({
      title: "Change Status?",
      text: `Change status from "${prevLabel}" to "${newLabel}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, change it!",
    });
    if (!result.isConfirmed) return;
    orderDrawerData = { ...orderDrawerData, status: newStatus };
    try {
      await authApiFetch(`${API_ROUTES.ORDER}/${orderDrawerData.id}`, {
        method: "PUT",
        data: JSON.stringify({
          status: newStatus,
          orderActivity: {
            title: "Status Changed",
            description: `Status changed from "${prevLabel}" to "${newLabel}".`,
          },
        }),
      });
      Swal.fire("Success!", `Status changed to "${newLabel}".`, "success");
    } catch (e) {
      orderDrawerData = { ...orderDrawerData, status: prevStatus };
      Swal.fire("Error!", "Failed to change status.", "error");
    }
  }

  // ── Edit Client ─────────────────────────────────────────────────────────────
  let opShowEditClientModal = false;
  let opEditClientData = { name: "", email: "", mobile: "", whatsapp: "", address: "", gstNumber: "", remark: "" };
  let opSavingClient = false;
  let opEditClientErrors = {};

  function opOpenEditClientModal() {
    const c = orderDrawerData.client;
    opEditClientData = {
      name:      c.name      ?? "",
      email:     c.email     ?? "",
      mobile:    c.mobile    ?? "",
      whatsapp:  c.whatsapp  ?? "",
      address:   c.address   ?? "",
      gstNumber: c.gstNumber ?? "",
      remark:    c.remark    ?? "",
    };
    opEditClientErrors = {};
    opShowEditClientModal = true;
  }

  async function opSaveEditClient() {
    if (!opEditClientData.name?.trim()) {
      opEditClientErrors = { name: "Client name is required." };
      return;
    }
    opSavingClient = true;
    opEditClientErrors = {};
    try {
      await authApiFetch(`${API_ROUTES.CLIENT}/${orderDrawerData.client.id}`, {
        method: "PUT",
        data: JSON.stringify(opEditClientData),
      });
      orderDrawerData = { ...orderDrawerData, client: { ...orderDrawerData.client, ...opEditClientData } };
      opShowEditClientModal = false;
    } catch (e) {
      const errs = e?.data?.message;
      if (typeof errs === "object") opEditClientErrors = errs;
      else opEditClientErrors = { name: errs ?? "Failed to update client." };
    } finally {
      opSavingClient = false;
    }
  }

  // ── Change / Link Client ────────────────────────────────────────────────────
  let opShowChangeClientModal = false;
  let opChangeClientQuery = "";
  let opChangeClientResults = [];
  let opChangeClientLoading = false;
  let opChangeClientTimer = null;
  let opChangeClientDropdown = false;
  let opCcSelectedExisting = null;
  let opCcInlineCreate = false;
  let opCcNewName = "";
  let opCcNewGst = "";
  let opCcNewMobile = "";
  let opCcNewEmail = "";
  let opCcNewAddress = "";
  let opCcCreateLoading = false;
  let opCcCreateErrors = {};

  function opCcOpenInlineCreate() {
    opCcInlineCreate = true;
    opCcNewName = opChangeClientQuery;
    opCcNewGst = opCcNewMobile = opCcNewEmail = opCcNewAddress = "";
    opCcCreateErrors = {};
  }

  function opCcCancelInlineCreate() {
    opCcInlineCreate = false;
    opCcNewName = opCcNewGst = opCcNewMobile = opCcNewEmail = opCcNewAddress = "";
    opCcCreateErrors = {};
  }

  async function opSearchChangeClient(q) {
    if (!q || q.trim().length < 1) { opChangeClientResults = []; opChangeClientDropdown = false; return; }
    opChangeClientLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`, { method: "GET" });
      opChangeClientResults = res.data || [];
      opChangeClientDropdown = true;
    } catch (e) { opChangeClientResults = []; }
    opChangeClientLoading = false;
  }

  function opOnChangeClientInput() {
    clearTimeout(opChangeClientTimer);
    opChangeClientTimer = setTimeout(() => opSearchChangeClient(opChangeClientQuery), 300);
  }

  async function opConfirmChangeClient(newClient) {
    try {
      await authApiFetch(`${API_ROUTES.ORDER}/${orderDrawerData.id}/change-client`, {
        method: "PUT",
        data: JSON.stringify({ clientId: newClient.id }),
      });
      orderDrawerData = { ...orderDrawerData, client: newClient, clientId: newClient.id, orderContacts: [] };
      opShowChangeClientModal = false;
      opChangeClientQuery = "";
      opChangeClientResults = [];
      opChangeClientDropdown = false;
      opCcSelectedExisting = null;
      opCcCancelInlineCreate();
      Swal.fire("Success!", `Client changed to "${newClient.name}".`, "success");
    } catch (e) {
      Swal.fire("Error!", "Failed to link client.", "error");
    }
  }

  async function opCcCreateAndLink() {
    opCcCreateErrors = {};
    if (!opCcNewName.trim()) { opCcCreateErrors.name = "Company name is required."; return; }
    opCcCreateLoading = true;
    try {
      const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
        method: "POST",
        data: JSON.stringify({
          name: opCcNewName.trim(),
          gstNumber: opCcNewGst || undefined,
          mobile: opCcNewMobile || undefined,
          email: opCcNewEmail || undefined,
          address: opCcNewAddress || undefined,
        }),
      });
      await opConfirmChangeClient(clientRes.data);
      opCcCancelInlineCreate();
    } catch (e) {
      const errs = errorHandle(e);
      if (errs && typeof errs === "object") opCcCreateErrors = errs;
      else Swal.fire("Error!", "Failed to create client.", "error");
    } finally {
      opCcCreateLoading = false;
    }
  }

  // ── Add Contact (inline) ────────────────────────────────────────────────────
  let opAcInline = false;
  let opAcName = "";
  let opAcDesignation = "";
  let opAcMobile = "";
  let opAcEmail = "";
  let opAcWhatsapp = "";
  let opAcAltMobile = "";
  let opAcAddress = "";
  let opAcLoading = false;
  let opAcFormErrors = {};

  function opOpenAddContactModal() {
    opAcName = opAcDesignation = opAcMobile = opAcEmail = opAcWhatsapp = opAcAltMobile = opAcAddress = "";
    opAcFormErrors = {};
    opAcLoading = false;
    opEditContactId = null;
    opAcInline = true;
  }

  function opCloseAddContact() {
    opAcInline = false;
    opAcName = opAcDesignation = opAcMobile = opAcEmail = opAcWhatsapp = opAcAltMobile = opAcAddress = "";
    opAcFormErrors = {};
  }

  async function opSubmitAddContact() {
    opAcFormErrors = {};
    if (!opAcName.trim()) { opAcFormErrors.name = "Name is required."; return; }
    opAcLoading = true;
    try {
      const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: orderDrawerData.client.id,
          name: opAcName.trim(),
          designation: opAcDesignation || undefined,
          mobile: opAcMobile || undefined,
          email: opAcEmail || undefined,
          whatsapp: opAcWhatsapp || undefined,
          alternateMobile: opAcAltMobile || undefined,
          address: opAcAddress || undefined,
        }),
      });
      const newContact = contactRes.data;
      const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({ orderId: orderDrawerData.id, clientContactId: newContact.id }),
      });
      if (!orderDrawerData.orderContacts) orderDrawerData.orderContacts = [];
      orderDrawerData = {
        ...orderDrawerData,
        orderContacts: [...orderDrawerData.orderContacts, ocRes.data],
        client: {
          ...orderDrawerData.client,
          contacts: [...(orderDrawerData.client.contacts ?? []), newContact],
        },
      };
      opCloseAddContact();
    } catch (e) {
      const errs = errorHandle(e);
      if (errs && typeof errs === "object") opAcFormErrors = errs;
      else Swal.fire("Error!", "Failed to add contact.", "error");
    } finally {
      opAcLoading = false;
    }
  }

  // ── Edit Contact (inline) ────────────────────────────────────────────────────
  let opEditContactId = null;
  let opEditContactData = { name: "", designation: "", mobile: "", email: "", whatsapp: "", alternateMobile: "", address: "" };
  let opEditContactLoading = false;
  let opEditContactErrors = {};

  function opOpenEditContact(c) {
    opAcInline = false;
    opEditContactId = c.id;
    opEditContactData = {
      name: c.name ?? "",
      designation: c.designation ?? "",
      mobile: c.mobile ?? "",
      email: c.email ?? "",
      whatsapp: c.whatsapp ?? "",
      alternateMobile: c.alternateMobile ?? "",
      address: c.address ?? "",
    };
    opEditContactErrors = {};
  }

  function opCancelEditContact() {
    opEditContactId = null;
    opEditContactErrors = {};
  }

  async function opSetPrimaryContact(ocId) {
    try {
      await authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${ocId}/set-primary`, { method: "PATCH" });
      orderDrawerData = {
        ...orderDrawerData,
        orderContacts: orderDrawerData.orderContacts.map(oc =>
          ({ ...oc, isPrimary: oc.id === ocId })
        ),
      };
    } catch (e) { errorHandle(e); }
  }

  async function opSubmitEditContact(contactId) {
    opEditContactErrors = {};
    if (!opEditContactData.name.trim()) { opEditContactErrors.name = "Name is required."; return; }
    opEditContactLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${contactId}`, {
        method: "PUT",
        data: JSON.stringify({
          name: opEditContactData.name.trim(),
          designation: opEditContactData.designation || undefined,
          mobile: opEditContactData.mobile || undefined,
          email: opEditContactData.email || undefined,
          whatsapp: opEditContactData.whatsapp || undefined,
          alternateMobile: opEditContactData.alternateMobile || undefined,
          address: opEditContactData.address || undefined,
        }),
      });
      const updated = res.data;
      orderDrawerData = {
        ...orderDrawerData,
        orderContacts: orderDrawerData.orderContacts.map(oc =>
          oc.clientContact?.id === contactId
            ? { ...oc, clientContact: { ...oc.clientContact, ...updated } }
            : oc
        ),
      };
      opCancelEditContact();
    } catch (e) {
      const errs = errorHandle(e);
      if (errs && typeof errs === "object") opEditContactErrors = errs;
      else Swal.fire("Error!", "Failed to update contact.", "error");
    } finally {
      opEditContactLoading = false;
    }
  }

  async function opUnlinkContact(orderContactId, contactName) {
    const result = await Swal.fire({
      title: "Remove Contact?",
      text: `Remove ${contactName} from this order?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, remove",
    });
    if (!result.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.ORDER_CONTACT}/${orderContactId}`, { method: "DELETE" });
      orderDrawerData = {
        ...orderDrawerData,
        orderContacts: orderDrawerData.orderContacts.filter(oc => oc.id !== orderContactId),
      };
      Swal.fire("Removed!", "Contact unlinked.", "success");
    } catch (e) {
      Swal.fire("Error!", "Failed to remove contact.", "error");
    }
  }

  // ── New Client + Contact Modal (unlinked orders) ────────────────────────────
  let opShowNewClientModal = false;
  let opNcStep = 1;
  let opNcSearchQuery = "";
  let opNcSearchResults = [];
  let opNcSearchLoading = false;
  let opNcSearchTimer = null;
  let opNcSearchDropdown = false;
  let opNcSelectedClient = null;
  let opNcCreateMode = false;
  let opNcClientName = "";
  let opNcClientGst = "";
  let opNcClientMobile = "";
  let opNcClientEmail = "";
  let opNcClientAddress = "";
  let opNcContactName = "";
  let opNcContactDesignation = "";
  let opNcContactMobile = "";
  let opNcContactEmail = "";
  let opNcContactWhatsapp = "";
  let opNcContactAltMobile = "";
  let opNcSubmitLoading = false;
  let opNcFormErrors = {};

  function opOpenNewClientModal() {
    opShowNewClientModal = true;
    opNcStep = 1;
    opNcSearchQuery = opNcClientName = opNcClientGst = opNcClientMobile = opNcClientEmail = opNcClientAddress = "";
    opNcContactName = opNcContactDesignation = opNcContactMobile = opNcContactEmail = opNcContactWhatsapp = opNcContactAltMobile = "";
    opNcSearchResults = [];
    opNcSearchDropdown = false;
    opNcSelectedClient = null;
    opNcCreateMode = false;
    opNcFormErrors = {};
  }

  async function opNcSearchClients(q) {
    if (!q || q.trim().length < 1) { opNcSearchResults = []; opNcSearchDropdown = false; return; }
    opNcSearchLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`, { method: "GET" });
      opNcSearchResults = res.data || [];
      opNcSearchDropdown = true;
    } catch (e) { opNcSearchResults = []; }
    opNcSearchLoading = false;
  }

  function opNcOnSearchInput() {
    clearTimeout(opNcSearchTimer);
    opNcSelectedClient = null;
    opNcCreateMode = false;
    opNcSearchTimer = setTimeout(() => opNcSearchClients(opNcSearchQuery), 300);
  }

  function opNcSelectClient(client) {
    opNcSelectedClient = client;
    opNcSearchQuery = client.name;
    opNcSearchDropdown = false;
    opNcCreateMode = false;
  }

  function opNcGoToStep2() {
    opNcFormErrors = {};
    if (!opNcSelectedClient && !opNcCreateMode) {
      opNcFormErrors.step1 = "Please select an existing client or create a new one.";
      return;
    }
    if (opNcCreateMode && !opNcClientName.trim()) {
      opNcFormErrors.opNcClientName = "Company name is required.";
      return;
    }
    opNcStep = 2;
  }

  async function opNcSubmit() {
    opNcFormErrors = {};
    if (!opNcContactName.trim()) { opNcFormErrors.opNcContactName = "Contact name is required."; return; }
    opNcSubmitLoading = true;
    try {
      let resolvedClient = opNcSelectedClient;
      if (!resolvedClient) {
        const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
          method: "POST",
          data: JSON.stringify({
            name: opNcClientName.trim(),
            gstNumber: opNcClientGst || undefined,
            mobile: opNcClientMobile || undefined,
            email: opNcClientEmail || undefined,
            address: opNcClientAddress || undefined,
          }),
        });
        resolvedClient = clientRes.data;
      }
      const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: resolvedClient.id,
          name: opNcContactName.trim(),
          designation: opNcContactDesignation || undefined,
          mobile: opNcContactMobile || undefined,
          email: opNcContactEmail || undefined,
          whatsapp: opNcContactWhatsapp || undefined,
          alternateMobile: opNcContactAltMobile || undefined,
        }),
      });
      const newContact = contactRes.data;
      await authApiFetch(`${API_ROUTES.ORDER}/${orderDrawerData.id}/change-client`, {
        method: "PUT",
        data: JSON.stringify({ clientId: resolvedClient.id }),
      });
      const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({ orderId: orderDrawerData.id, clientContactId: newContact.id }),
      });
      resolvedClient.contacts = [...(resolvedClient.contacts ?? []), newContact];
      orderDrawerData = {
        ...orderDrawerData,
        client: resolvedClient,
        clientId: resolvedClient.id,
        orderContacts: [ocRes.data],
      };
      opShowNewClientModal = false;
      Swal.fire("Success!", `Client "${resolvedClient.name}" linked to this order.`, "success");
    } catch (e) {
      const errs = errorHandle(e);
      if (errs && typeof errs === "object") opNcFormErrors = errs;
      else Swal.fire("Error!", "Failed to link client.", "error");
    } finally {
      opNcSubmitLoading = false;
    }
  }

  // Order drawer tabs & data
  let orderActiveTab = 'info'; // 'info' | 'chat' | 'attachments'
  let orderChats = [];
  let orderAttachments = [];
  let orderChatMsg = '';
  let orderChatSelectedTypes = [];
  let orderAttachFiles = [];
  let orderAttachTitle = '';
  let orderChatSending = false;

  const ORDER_CHAT_TYPES = ["Call", "WhatsApp", "Email"];
  function toggleOrderChatType(t) {
    if (t === "All") {
      orderChatSelectedTypes = orderChatSelectedTypes.length === ORDER_CHAT_TYPES.length ? [] : [...ORDER_CHAT_TYPES];
    } else {
      orderChatSelectedTypes = orderChatSelectedTypes.includes(t)
        ? orderChatSelectedTypes.filter((x) => x !== t)
        : [...orderChatSelectedTypes, t];
    }
  }
  $: orderChatAllSelected = orderChatSelectedTypes.length === ORDER_CHAT_TYPES.length;

  function normalizeSingleOrderChatType(raw) {
    if (!raw || raw.trim() === "") return null;
    const t = raw.trim().toLowerCase();
    if (t.includes("call")) return "Call";
    if (t.includes("whatsapp") || t.includes("whats app")) return "WhatsApp";
    if (t.includes("email") || t.includes("mail")) return "Email";
    return null;
  }
  function normalizeOrderChatTypes(typeStr) {
    if (!typeStr || typeStr.trim() === "") return [];
    return typeStr.split(",").map(normalizeSingleOrderChatType).filter(Boolean);
  }
  let orderAttachSending = false;
  let orderChatFileInput;
  let orderIsDragOver = false;
  let orderDragDepth = 0;
  let orderChatListEl;
  let orderAttachListEl;
  const ORDER_PAGE_LIMIT = 10;
  let orderChatTotal = 0;
  let orderAttachTotal = 0;
  let orderChatLoadingMore = false;
  let orderAttachLoadingMore = false;
  let orderChatAtBottom = true;
  let orderChatShowScrollBtn = false;
  let orderAttachAtBottom = true;
  let orderAttachShowScrollBtn = false;

  function handleOrderChatScroll() {
    if (!orderChatListEl) return;
    const atBottom = orderChatListEl.scrollHeight - orderChatListEl.scrollTop - orderChatListEl.clientHeight < 50;
    orderChatAtBottom = atBottom;
    orderChatShowScrollBtn = !atBottom;
  }

  function handleOrderAttachScroll() {
    if (!orderAttachListEl) return;
    const atBottom = orderAttachListEl.scrollHeight - orderAttachListEl.scrollTop - orderAttachListEl.clientHeight < 50;
    orderAttachAtBottom = atBottom;
    orderAttachShowScrollBtn = !atBottom;
  }

  async function scrollOrderChatBottom() {
    await tick();
    if (orderChatAtBottom && orderChatListEl) {
      orderChatListEl.scrollTop = orderChatListEl.scrollHeight;
    }
  }
  async function scrollOrderAttachBottom() {
    await tick();
    if (orderAttachAtBottom && orderAttachListEl) {
      orderAttachListEl.scrollTop = orderAttachListEl.scrollHeight;
    }
  }

  function jumpOrderChatBottom() {
    orderChatAtBottom = true;
    orderChatShowScrollBtn = false;
    if (orderChatListEl) orderChatListEl.scrollTop = orderChatListEl.scrollHeight;
  }

  function jumpOrderAttachBottom() {
    orderAttachAtBottom = true;
    orderAttachShowScrollBtn = false;
    if (orderAttachListEl) orderAttachListEl.scrollTop = orderAttachListEl.scrollHeight;
  }

  $: if (orderActiveTab === 'chat') {
    orderChatAtBottom = true;
    orderChatShowScrollBtn = false;
    scrollOrderChatBottom();
  }
  $: if (orderActiveTab === 'attachments') {
    orderAttachAtBottom = true;
    orderAttachShowScrollBtn = false;
    scrollOrderAttachBottom();
  }
  $: if (orderActiveTab === 'info') enhanceDescription();

  async function sendOrderChat() {
    if (!orderChatMsg.trim() || !orderDrawerData) return;
    orderChatSending = true;
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: 'POST',
        data: JSON.stringify({
          orderId: orderDrawerData.id,
          message: orderChatMsg.trim(),
          type: orderChatSelectedTypes.join(","),
        }),
      });
      if (data?.data) {
        orderChats = [...orderChats, { ...data.data, isOwn: true }];
        orderChatMsg = '';
        orderChatSelectedTypes = [];
        scrollOrderChatBottom();
      }
    } catch (e) { /* ignore */ }
    finally { orderChatSending = false; }
  }

  async function addOrderAttachment() {
    if (!orderDrawerData) return;
    if (orderAttachFiles.length === 0) return;
    orderAttachSending = true;
    try {
      const fd = new FormData();
      fd.append('orderId', String(orderDrawerData.id));
      if (orderAttachTitle.trim()) fd.append('title', orderAttachTitle.trim());
      orderAttachFiles.forEach(f => fd.append('file', f));
      const data = await authApiFetch(API_ROUTES.ORDER_ATTACHMENT, {
        method: 'POST',
        data: fd,
        timeout: 60000,
      });
      if (data?.data) {
        orderAttachments = [...orderAttachments, data.data];
        orderAttachFiles = [];
        orderAttachTitle = '';
        if (orderChatFileInput) orderChatFileInput.value = '';
        scrollOrderAttachBottom();
      }
    } catch (e) {
      const msg = typeof e?.data?.message === 'string' ? e.data.message : null;
      if (e?.isTimeout) {
        Swal.fire({ icon: 'warning', title: 'Upload timed out', text: 'The upload took too long. Please try again.' });
      } else if (e?.isNetworkError) {
        Swal.fire({ icon: 'warning', title: 'No internet connection', text: 'Could not reach the server. Please check your connection and try again.' });
      } else if (e?.status === 413 || msg?.toLowerCase().includes('too large')) {
        Swal.fire({ icon: 'error', title: 'File too large', text: 'Maximum allowed file size is 5 MB. Please reduce the file size and try again.' });
      } else {
        Swal.fire({ icon: 'error', title: 'Upload failed', text: msg ?? 'Something went wrong. Please try again.' });
      }
    } finally { orderAttachSending = false; }
  }

  function handleOrderDragEnter(e) {
    e.preventDefault();
    orderDragDepth++;
    orderIsDragOver = true;
  }
  function handleOrderDragLeave(e) {
    orderDragDepth--;
    if (orderDragDepth <= 0) { orderDragDepth = 0; orderIsDragOver = false; }
  }
  function handleOrderDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  async function handleOrderDrop(e) {
    e.preventDefault();
    orderDragDepth = 0;
    orderIsDragOver = false;

    // Chat attachment reference dragged from query chat — check FIRST
    // (browser also puts dragged images into dataTransfer.files, so files check must come after)
    const raw = e.dataTransfer?.getData('application/x-chat-attachment');
    if (raw) {
      try {
        const att = JSON.parse(raw);
        if (att?.url && att?.name && att?.mime) {
          const result = await Swal.fire({
            title: 'Add to Order?',
            text: `Add "${att.name}" to order attachments?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Add',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#3b5bdb',
            cancelButtonColor: '#adb5bd',
          });
          if (result.isConfirmed) addOrderAttachmentFromReference(att);
        }
      } catch { /* ignore */ }
      return;
    }

    // OS files dragged from desktop (fallback)
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length) {
      orderAttachFiles = dropped.slice(0, 10);
      if (orderChatFileInput) orderChatFileInput.value = '';
    }
  }
  let chats = [];
  let loading = true;
  let chatMessage = "";

  // ── Suggested messages ───────────────────────────────────────────────────────
  const SUGGESTED_TELECALLER = [
    "Please check when free",
    "This is urgent, please reply",
    "Client is waiting for answer",
    "Need quotation ASAP",
    "Please confirm stock availability",
    "Client asking for delivery date",
    "Need price confirmation",
    "Please check the order details",
    "Client has a complaint, need help",
    "Can we discuss this now?",
    "Please review and reply",
    "Waiting for your update",
    "Client is on call, need answer now",
    "Please check invoice issue",
    "Will reply in some time",
    "Currently busy, will check soon",
    "Can you share a screenshot?",
    "Ok Please share ASAP we are waiting Your update."
  ];
  const SUGGESTED_TECH = [
    "Please confirm with client",
    "Need more details from client",
    "Checking, will reply soon",
    "Done, please verify",
    "Ask client to share more info",
    "Order is being processed",
    "Quotation is ready, please check",
    "Issue is resolved",
    "Working on it, give me some time",
    "Please share client contact",
    "Ask client to wait",
    "Need approval before proceeding",
    "Please check and confirm",
    "Stock available, confirm order",
    "Please call me when free",
    "Will reply in some time",
    "Currently busy, will check soon",
    "Can you share a screenshot?",
    "Okay sir, i will check and update you soon",
    "Ok sir, i am sharing with you",
    "Please share technical details"
  ];

  $: suggestions = isTelecaller(currentUser) ? SUGGESTED_TELECALLER
    : (isTech(currentUser) || isTechHelper(currentUser)) ? SUGGESTED_TECH
    : [];

  // Recipient is busy/away when last own message is still unread
  $: recipientBusy = (() => {
    const lastOwn = [...chats].reverse().find(c => c.isOwn && !c.subQueryEvent && !c.systemEvent && !c.isDeleted);
    return lastOwn ? lastOwn.read === false : false;
  })();

  // Show suggestions when: recipient busy OR user is typing (filter mode)
  $: showSuggestions = canSendChat()
    && !attachedFiles.length
    && suggestions.length > 0
    && (recipientBusy || chatMessage.trim().length > 0);

  // Filter suggestions by typed text (case-insensitive); when empty show all
  $: filteredSuggestions = chatMessage.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(chatMessage.trim().toLowerCase()))
    : suggestions;

  function sendSuggestion(text) {
    chatMessage = text;
    sendChat();
  }
  let attachedFiles = [];
  let pendingFiles = []; // staged from drop/paste — shown in preview modal before confirm
  let pendingIndex = 0;  // active slide in the preview modal
  let fileInputEl;
  let sendingChat = false;
  let uploadingFileCount = 0; // >0 while files are being uploaded — drives the upload indicator
  let actionLoading = false;
  let qdCardCollapsed = false;
  let switching = false; // true while selectQuery is loading new data (shows shimmer bar)

  // reply state
  let replyTo = null; // { id, senderLabel, message, senderType } | null

  // edit state
  let editingChatId = null;
  let editingChatText = "";
  let savingEdit = false;

  // final flag state
  let settingFinalFlag = null; // chatId being toggled

  // read-more state
  const CHAR_LIMIT = 300;
  let expandedMessages = new Set();
  function toggleExpand(id) {
    if (expandedMessages.has(id)) expandedMessages.delete(id);
    else expandedMessages.add(id);
    expandedMessages = expandedMessages; // trigger reactivity
  }

  // socket state
  let socket = null;
  let otherTyping = false;
  let typingTimer = null;
  let isTyping = false;
  let typingQueries = new Set(); // queryIds of other queries where someone is typing

  // in-progress list
  let inProgressList = [];
  let inProgressLoading = false;
  let inProgressLoadingMore = false;
  let inProgressFiltering = false;
  let inProgressPage = 1;
  let inProgressTotal = 0;
  const IN_PROGRESS_LIMIT = 15;
  let inProgressSearch = "";
  let inProgressSearchDebounce;
  function handleInProgressSearch(val) {
    clearTimeout(inProgressSearchDebounce);
    inProgressSearch = val;
    inProgressSearchDebounce = setTimeout(() => {
      loadInProgress(true, true);
    }, 300);
  }

  let inProgressDateFilter = "all"; // all | today | yesterday | 7days | 30days | custom
  let inProgressDateField = "lastActivityAt"; // createdAt | lastActivityAt | updatedAt
  let inProgressCustomFrom = "";
  let inProgressCustomTo = "";

  function getInProgressDateRange() {
    const toISO = (d) => d.toISOString().substring(0, 10);
    const today = new Date();
    if (inProgressDateFilter === "today") {
      const s = toISO(today);
      return { dateFrom: s, dateTo: s };
    }
    if (inProgressDateFilter === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const s = toISO(y);
      return { dateFrom: s, dateTo: s };
    }
    if (inProgressDateFilter === "7days") {
      const f = new Date(today); f.setDate(f.getDate() - 6);
      return { dateFrom: toISO(f), dateTo: toISO(today) };
    }
    if (inProgressDateFilter === "30days") {
      const f = new Date(today); f.setDate(f.getDate() - 29);
      return { dateFrom: toISO(f), dateTo: toISO(today) };
    }
    if (inProgressDateFilter === "custom" && inProgressCustomFrom && inProgressCustomTo) {
      return { dateFrom: inProgressCustomFrom, dateTo: inProgressCustomTo };
    }
    return { dateFrom: null, dateTo: null };
  }

  function setDateFilter(filter) {
    inProgressDateFilter = filter;
    if (filter !== "custom") loadInProgress(true, true);
  }
  // Always show at least the number of items actually loaded — prevents stale count between reloads.
  $: effectiveInProgressTotal = Math.max(inProgressTotal, inProgressList.length);

  // Sidebar sort: queries with unread messages float to top; ties keep lastActivityAt order.
  $: sortedInProgressList = [...inProgressList].sort((a, b) => {
    const ua = $queryUnreadCounts[a.id] ?? 0;
    const ub = $queryUnreadCounts[b.id] ?? 0;
    if (ub !== ua) return ub - ua;                                              // unread first
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;                                                             // then most recent
  });

  async function loadInProgress(reset = true, filtering = false) {
    if (reset) {
      inProgressPage = 1;
      inProgressTotal = 0;
    }
    if (filtering && reset) {
      inProgressFiltering = true;
    } else if (inProgressPage === 1 && inProgressList.length === 0) {
      inProgressLoading = true;
    } else if (inProgressPage > 1) {
      inProgressLoadingMore = true;
    }
    try {
      let res;
      const p = inProgressPage;
      const searchParam = inProgressSearch.trim() ? `&search=${encodeURIComponent(inProgressSearch.trim())}` : "";
      const { dateFrom, dateTo } = getInProgressDateRange();
      const dateParam = dateFrom && dateTo ? `&dateFrom=${dateFrom}&dateTo=${dateTo}` : "";
      const dateFieldParam = inProgressDateField !== "createdAt" ? `&dateField=${inProgressDateField}` : "";
      if (isTechHelper(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}${searchParam}${dateParam}${dateFieldParam}`);
      } else if (isTech(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}${searchParam}${dateParam}${dateFieldParam}`);
      } else if (isTelecaller(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/my?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}${searchParam}${dateParam}${dateFieldParam}`);
      } else {
        res = await authApiFetch(`${API_ROUTES.QUERY}?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}${searchParam}${dateParam}${dateFieldParam}`);
      }
      const newItems = Array.isArray(res?.data) ? res.data : [];
      inProgressTotal = res?.total ?? inProgressTotal;
      if (p === 1) {
        inProgressList = newItems;
      } else {
        inProgressList = [...inProgressList, ...newItems];
      }
      // join rooms after Svelte updates the list so all new items are included
      tick().then(() => joinInProgressRooms());
    } catch (_) {
      if (inProgressPage === 1) inProgressList = [];
    } finally {
      inProgressLoading = false;
      inProgressLoadingMore = false;
      inProgressFiltering = false;
    }
  }

  async function loadMoreInProgress() {
    if (inProgressLoadingMore || inProgressLoading || inProgressList.length >= effectiveInProgressTotal) return;
    inProgressPage += 1;
    await loadInProgress(false);
  }

  function handleInProgressScroll(e) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
      loadMoreInProgress();
    }
  }

  // ── All Queries Panel ────────────────────────────────────────────────────
  const ALL_QUERIES_LIMIT = 20;
  let aqList = [];
  let aqLoading = false;
  let aqLoadingMore = false;
  let aqFiltering = false;
  let aqPage = 1;
  let aqTotal = 0;
  let aqSearch = "";
  let aqSearchDebounce;
  let aqListEl;
  let aqDateFilter = "all";
  let aqDateField = "lastActivityAt";
  let aqCustomFrom = "";
  let aqCustomTo = "";

  function getAqDateRange() {
    const toISO = (d) => d.toISOString().substring(0, 10);
    const today = new Date();
    if (aqDateFilter === "today") { const s = toISO(today); return { dateFrom: s, dateTo: s }; }
    if (aqDateFilter === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); const s = toISO(y); return { dateFrom: s, dateTo: s }; }
    if (aqDateFilter === "7days") { const f = new Date(today); f.setDate(f.getDate() - 6); return { dateFrom: toISO(f), dateTo: toISO(today) }; }
    if (aqDateFilter === "30days") { const f = new Date(today); f.setDate(f.getDate() - 29); return { dateFrom: toISO(f), dateTo: toISO(today) }; }
    if (aqDateFilter === "custom" && aqCustomFrom && aqCustomTo) return { dateFrom: aqCustomFrom, dateTo: aqCustomTo };
    return { dateFrom: null, dateTo: null };
  }

  function setAqDateFilter(filter) {
    aqDateFilter = filter;
    if (filter !== "custom") loadAqList(true, true);
  }

  function handleAqSearch(val) {
    clearTimeout(aqSearchDebounce);
    aqSearch = val;
    aqSearchDebounce = setTimeout(() => loadAqList(true, true), 300);
  }

  async function loadAqList(reset = false, filtering = false) {
    if (reset) { aqPage = 1; aqList = []; aqTotal = 0; }
    if (filtering) aqFiltering = true;
    else if (aqPage === 1 && aqList.length === 0) aqLoading = true;
    else aqLoadingMore = true;
    try {
      const searchParam = aqSearch.trim() ? `&search=${encodeURIComponent(aqSearch.trim())}` : "";
      const { dateFrom, dateTo } = getAqDateRange();
      const dateParam = dateFrom && dateTo ? `&dateFrom=${dateFrom}&dateTo=${dateTo}` : "";
      const dateFieldParam = aqDateField !== "createdAt" ? `&dateField=${aqDateField}` : "";
      let res;
      if (isTech(currentUser) || isTechHelper(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?status=in_progress&limit=${ALL_QUERIES_LIMIT}&page=${aqPage}${searchParam}${dateParam}${dateFieldParam}`);
      } else if (isTelecaller(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/my?status=in_progress&limit=${ALL_QUERIES_LIMIT}&page=${aqPage}${searchParam}${dateParam}${dateFieldParam}`);
      } else {
        res = await authApiFetch(`${API_ROUTES.QUERY}?status=in_progress&limit=${ALL_QUERIES_LIMIT}&page=${aqPage}${searchParam}${dateParam}${dateFieldParam}`);
      }
      const items = Array.isArray(res?.data) ? res.data : [];
      aqTotal = res?.total ?? aqTotal;
      aqList = aqPage === 1 ? items : [...aqList, ...items];
    } catch (e) { /* ignore */ } finally {
      aqLoading = false; aqLoadingMore = false; aqFiltering = false;
    }
  }

  async function loadMoreAq() {
    if (aqLoadingMore || aqLoading || aqList.length >= aqTotal) return;
    aqPage += 1;
    await loadAqList(false);
  }

  function handleAqScroll(e) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMoreAq();
  }

  function openAllQueriesPanel() {
    pushRightPanel('allQueries');
    aqSearch = "";
    aqDateFilter = "all";
    aqDateField = "lastActivityAt";
    aqCustomFrom = "";
    aqCustomTo = "";
    loadAqList(true);
  }

  function closeAllQueriesPanel() {
    removeFromRightPanel('allQueries');
  }

  // Watch other in-progress query rooms for typing events only
  // Uses 'watch-query' (not 'join-query') so presenceMap stays accurate
  function joinInProgressRooms() {
    if (!socket || !socket.connected) return;
    for (const q of inProgressList) {
      if (q.id !== Number(queryId)) {
        socket.emit("watch-query", q.id);
      }
    }
  }

  // debounce timers for markChatsRead (avoid rapid parallel PATCH calls)
  let markReadTimer = null;
  let sqMarkReadTimer = null;

  function debouncedMarkChatsRead(id) {
    if (markReadTimer) clearTimeout(markReadTimer);
    markReadTimer = setTimeout(() => {
      markChatsRead(id).then(() => loadUnreadCounts()).catch(() => {});
      authApiFetch(`${API_ROUTES.QUERY}/${id}/read-notifications`, { method: "PATCH" }).catch(() => {});
      markReadTimer = null;
    }, 800);
  }

  function debouncedSqMarkChatsRead(id) {
    if (sqMarkReadTimer) clearTimeout(sqMarkReadTimer);
    sqMarkReadTimer = setTimeout(() => {
      markChatsRead(id).then(() => loadUnreadCounts()).catch(() => {});
      authApiFetch(`${API_ROUTES.QUERY}/${id}/read-notifications`, { method: "PATCH" }).catch(() => {});
      sqMarkReadTimer = null;
    }, 800);
  }

  // live status banner
  let statusBanner = null; // { status, assignedToName } | null
  let bannerTimer = null;

  function showStatusBanner(status, assignedToName) {
    if (bannerTimer) clearTimeout(bannerTimer);
    statusBanner = { status, assignedToName };
    bannerTimer = setTimeout(() => { statusBanner = null; }, 5000);
  }

  $: {
    const _id = $page.params.id;
    const _onQueryRoute = $page.url.pathname.startsWith('/admin/query/');
    if (_id && _prevId && _id !== _prevId && _onQueryRoute) {
      _prevId = _id;
      queryId = _id;
      _reloadForId(_id);
    }
  }

  function _reloadForId(id) {
    disconnectSocket();
    const _wasOrderDrawerOpen = orderDrawerOpen;
    typingQueries = new Set();
    query = null;
    chats = [];
    subQueries = [];
    if (sqIsTyping && viewingSubQueryId) {
      socket?.emit("typing-stop", Number(viewingSubQueryId));
    }
    viewingSubQueryId = null;
    sqViewQuery = null;
    sqViewChats = [];
    sqViewHasMore = false; sqHasMoreOlder = false;
    sqChatMessage = ""; sqAttachedFiles = []; sqReplyTo = null;
    sqOtherTyping = false; sqIsAtBottom = true; sqIsTyping = false;
    sqExpandedMessages = new Set();
    sqPendingFiles = []; sqPendingIndex = 0;
    sqNewMsgCount = 0; sqShowNewMsgBanner = false;
    sqEditingChatId = null; sqEditingChatText = "";
    sqSettingFinalFlag = null;
    hasMoreOlderChats = false;
    loadingOlder = false;
    otherTyping = false;
    expandedMessages = new Set();
    chatMessage = "";
    attachedFiles = [];
    cancelPending();
    replyTo = null;
    editingChatId = null;
    editingChatText = "";
    newMsgCount = 0;
    showNewMsgBanner = false;
    isAtBottom = true;
    statusBanner = null;
    if (bannerTimer) clearTimeout(bannerTimer);
    clearUnread(Number(id));
    // queryId is already updated by the reactive block before this is called
    loadQuery(id).then(() => {
      // tech users should never see a sub-query as a standalone page — redirect to parent + inline panel
      if (query?.parentQueryId && isTech(currentUser)) {
        goto(`/admin/query/${query.parentQueryId}?sq=${id}`, { replaceState: true });
        return;
      }
      loadSubQueries(id);
      // reload order drawer with new query's order, or show "no order" message
      if (_wasOrderDrawerOpen) {
        if (query?.order?.id) {
          openOrderDrawer(query.order.id);
        } else {
          openOrderDrawerEmpty();
        }
      }
    });
    loadChats(id);
    connectSocket();
    loadInProgress();
    markChatsRead(id).then(() => loadUnreadCounts()).catch(() => {});
    authApiFetch(`${API_ROUTES.QUERY}/${id}/read-notifications`, { method: "PATCH" }).catch(() => {});
  }

  const isTelecaller = (u) => u?.subRole === "telecaller";
  const isTech = (u) => u?.subRole === "tech";
  const isTechHelper = (u) => u?.subRole === "tech_helper";
  const isMasterView = (u) => u?.role !== "user";

  // For tech users, "sub-query" is presented simply as "query"
  $: sqWord        = isTech(currentUser) ? "Query"   : "Sub-Query";
  $: sqWordLower   = isTech(currentUser) ? "query"   : "sub-query";
  $: sqWordPlural  = isTech(currentUser) ? "Queries" : "Sub-Queries";

  /**
   * Derive a stable sender type used for avatar colour + bubble tint.
   * senderSubRole comes from the API/socket:
   *   null      → admin / master / manager
   *   'tech'    → tech
   *   'telecaller' → telecaller
   *   undefined → not present (old socket message) → fall back to senderLabel
   */
  function deriveSenderType(isOwn, senderLabel, senderSubRole) {
    if (isOwn) return "own";
    if (senderSubRole !== undefined) {
      if (senderSubRole === null)           return "admin";
      if (senderSubRole === "tech")         return "tech";
      if (senderSubRole === "telecaller")   return "telecaller";
      if (senderSubRole === "tech_helper")  return "tech_helper";
    }
    // label-based fallback (non-master users, or old socket messages)
    if (senderLabel === "Admin")            return "admin";
    if (senderLabel === "Support Team")     return "tech";
    if (senderLabel === "Requester")        return "telecaller";
    return "other";
  }

  function setReply(chat) {
    replyTo = { id: chat.id, senderLabel: chat.senderLabel, message: chat.message, senderType: chat.senderType };
    chatInputEl?.focus();
  }

  function canSetFinalFlag() {
    return currentUser?.subRole === 'telecaller' || currentUser?.subRole === 'tech' || currentUser?.subRole === 'tech_helper';
  }

  function canEditChat(chat) {
    if (!chat.isOwn) return false;
    const ageMs = Date.now() - new Date(chat.createdAt).getTime();
    return ageMs <= 30 * 60 * 1000;
  }

  function startEditChat(chat) {
    editingChatId = chat.id;
    editingChatText = chat.message ?? "";
  }

  function cancelEditChat() {
    editingChatId = null;
    editingChatText = "";
  }

  async function saveEditChat(chatId) {
    if (!editingChatText.trim()) return;
    savingEdit = true;
    try {
      const result = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat/${chatId}`, {
        method: "PATCH",
        data: JSON.stringify({ message: editingChatText.trim() }),
      });
      chats = chats.map((c) =>
        c.id === chatId
          ? { ...c, message: result.data.message, editedAt: result.data.editedAt }
          : c
      );
      editingChatId = null;
      editingChatText = "";
    } catch (e) {
      const msg = e?.data?.message;
      Swal.fire({
        icon: "error",
        title: "Cannot edit",
        text: typeof msg === "string" ? msg : "Failed to edit message.",
      });
    } finally {
      savingEdit = false;
    }
  }

  async function toggleFinalFlag(chat) {
    if (settingFinalFlag === chat.id) return;
    settingFinalFlag = chat.id;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat/${chat.id}/flag`, { method: 'PATCH' });
      const isFinal = res?.data?.isFinal ?? false;
      // Clear previous final flag in local state, then set new one
      chats = chats.map(c => ({
        ...c,
        isFinal: c.id === chat.id ? isFinal : (isFinal ? false : c.isFinal),
        finalSetById: c.id === chat.id ? (isFinal ? currentUser?.id : null) : (isFinal ? null : c.finalSetById),
      }));
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update final flag.' });
    } finally {
      settingFinalFlag = null;
    }
  }

  function canDeleteChat(chat) {
    if (chat.isDeleted || chat.subQueryEvent || chat.systemEvent) return false;
    if (currentUser?.role === 'master' || currentUser?.role === 'admin' || currentUser?.role === 'manager') return true;
    if (isTelecaller(currentUser) && chat.isOwn) return true;
    return false;
  }

  let deletingChatId = null;
  let copiedChatId = null;
  async function copyMessage(chat) {
    if (!chat.message) return;
    await navigator.clipboard.writeText(chat.message);
    copiedChatId = chat.id;
    setTimeout(() => (copiedChatId = null), 1500);
  }

  let copiedFieldKey = null;
  async function copyField(key, text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copiedFieldKey = key;
    setTimeout(() => (copiedFieldKey = null), 1500);
  }

  // ── Description field copy enhancer ─────────────────────────────────────
  let descEl;

  afterUpdate(() => {
    if (!descEl) return;
    descEl.querySelectorAll('a[href]').forEach(a => {
      if (a.__externalHandled) return;
      a.__externalHandled = true;
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (href && (href.startsWith('http') || href.startsWith('www'))) {
          e.preventDefault();
          openExternal(href.startsWith('www') ? 'https://' + href : href);
        }
      });
    });
  });

  // Exposed globally so injected buttons can call it
  if (typeof window !== 'undefined') {
    window.__descCopy = async (text, btnEl) => {
      if (!text) return;
      await navigator.clipboard.writeText(text);
      if (btnEl) {
        const icon = btnEl.querySelector('i');
        if (icon) { icon.className = 'ti ti-check'; }
        btnEl.classList.add('desc-copy-btn--copied');
        setTimeout(() => {
          if (icon) icon.className = 'ti ti-copy';
          btnEl.classList.remove('desc-copy-btn--copied');
        }, 1500);
      }
    };
  }

  async function enhanceDescription() {
    await tick();
    if (!descEl) return;

    // Remove previously injected buttons to avoid duplicates
    descEl.querySelectorAll('.desc-copy-btn').forEach(b => b.remove());

    function makeCopyBtn(text) {
      const btn = document.createElement('button');
      btn.className = 'desc-copy-btn';
      btn.title = 'Copy';
      btn.innerHTML = '<i class="ti ti-copy"></i>';
      btn.setAttribute('onclick', `window.__descCopy(${JSON.stringify(text)}, this)`);
      return btn;
    }

    // 1. Table rows — from / cc / to / bcc / address / mobile / tel / phone
    descEl.querySelectorAll('table tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      if (cells.length < 2) return;
      const label = cells[0].textContent.trim().toLowerCase().replace(/[:.\s]/g, '');

      const multiTargets = ['cc', 'to', 'bcc'];
      const singleTargets = ['from', 'fro', 'mobile', 'tel', 'phone', 'fax', 'address', 'email'];

      if (multiTargets.some(t => label.startsWith(t))) {
        // Inject copy button in EACH value cell separately
        cells.slice(1).forEach(cell => {
          const text = cell.textContent.trim();
          if (!text) return;
          if (!cell.querySelector('.desc-copy-btn')) {
            cell.appendChild(makeCopyBtn(text));
          }
        });

      } else if (singleTargets.some(t => label.startsWith(t))) {
        const valueCell = cells[1];
        const valueText = valueCell.textContent.trim();
        if (!valueText) return;

        if (!valueCell.querySelector('.desc-copy-btn')) {
          if (label.startsWith('from') || label.startsWith('fro')) {
            // Extract email from angle brackets e.g. "Anand Chavan <email@x.com>"
            const emailMatch = valueText.match(/<([^>]+@[^>]+)>/);
            const email = emailMatch ? emailMatch[1].trim() : null;
            // Copy full text button
            valueCell.appendChild(makeCopyBtn(valueText));
            // Extra email-only button if email found separately
            if (email && email !== valueText) {
              const emailBtn = makeCopyBtn(email);
              emailBtn.title = 'Copy email only';
              emailBtn.innerHTML = '<i class="ti ti-mail"></i>';
              emailBtn.setAttribute('onclick', `window.__descCopy(${JSON.stringify(email)}, this)`);
              valueCell.appendChild(emailBtn);
            }
          } else {
            valueCell.appendChild(makeCopyBtn(valueText));
          }
        }
      }
    });

    // 2. mailto links — inject copy button after each
    descEl.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const email = a.href.replace('mailto:', '').trim();
      if (!email || a.nextSibling?.classList?.contains?.('desc-copy-btn')) return;
      a.insertAdjacentElement('afterend', makeCopyBtn(email));
    });

    // 3. Phone / mobile patterns in text nodes — wrap and add button
    const phoneRe = /(\+?\d[\d\s\-().]{7,}\d)/g;
    descEl.querySelectorAll('p, li, span, td').forEach(el => {
      // Skip if already has copy btn or is inside a table cell already handled
      if (el.querySelector('.desc-copy-btn')) return;
      if (el.closest('td') && el.closest('td').querySelector('.desc-copy-btn')) return;
      el.childNodes.forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const text = node.textContent;
        if (!phoneRe.test(text)) return;
        phoneRe.lastIndex = 0;
        const matches = [...text.matchAll(phoneRe)];
        matches.forEach(m => {
          const phone = m[1].trim();
          // Only inject once per element to avoid explosion
          if (!el.querySelector(`.desc-copy-btn[title="${phone}"]`)) {
            const btn = makeCopyBtn(phone);
            btn.title = phone;
            el.appendChild(btn);
          }
        });
      });
    });
  }

  async function deleteChat(chat) {
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'Delete message?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#d33',
    });
    if (!confirmed.isConfirmed) return;
    deletingChatId = chat.id;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat/${chat.id}`, { method: 'DELETE' });
      const isMaster = currentUser?.role === 'master';
      chats = chats.map(c => c.id === chat.id
        ? { ...c, isDeleted: true, ...(isMaster ? {} : { message: null, attachments: [] }) }
        : c);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Could not delete message.' });
    } finally {
      deletingChatId = null;
    }
  }

  function scrollToMessage(msgId) {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-row--highlight");
    setTimeout(() => el.classList.remove("chat-row--highlight"), 1500);
  }

  const STATUS_COLORS = {
    open: "bg-primary text-white",
    in_progress: "bg-warning text-dark",
    resolved: "bg-success text-white",
    reopened: "bg-danger text-white",
    closed: "bg-secondary text-white",
  };

  const PRIORITY_COLORS = {
    high: "bg-danger text-white",
    medium: "bg-warning text-dark",
    low: "bg-success text-white",
  };

  const QUERY_TYPES = [
    { value: "order_issue", label: "Order Issue" },
    { value: "payment_issue", label: "Payment Issue" },
    { value: "invoice_issue", label: "Invoice Issue" },
    { value: "stock_issue", label: "Stock Issue" },
    { value: "technical", label: "Technical" },
    { value: "customer_complaint", label: "Customer Complaint" },
    { value: "access_issue", label: "Access Issue" },
    { value: "other", label: "Other" },
    { value: "price_check", label: "Price Check" },
    { value: "transport_check", label: "Transport Check" },
    { value: "delivery_check", label: "Delivery Check" },
    { value: "availability_check", label: "Availability Check" },
    { value: "design_check", label: "Design Check" },
    { value: "other_help", label: "Other Help" },
  ];

  const SUB_QUERY_TYPES = [
    { value: "price_check", label: "Price Check" },
    { value: "transport_check", label: "Transport Check" },
    { value: "delivery_check", label: "Delivery Check" },
    { value: "availability_check", label: "Availability Check" },
    { value: "design_check", label: "Design Check" },
    { value: "other_help", label: "Other Help" },
  ];

  function subTypeLabel(type) {
    const found = SUB_QUERY_TYPES.find(t => t.value === type);
    return found ? found.label : (QUERY_TYPES.find(t => t.value === type)?.label ?? type ?? "Other");
  }

  // sub-query state
  let subQueries = [];
  let subQueriesLoading = false;
  let showSubQueriesModal = false;
  let showSubQueryModal = false;
  let sqType = "price_check";
  let sqSubject = "";

  let sqPriority = "medium";
  let sqSending = false;

  // ── Inline sub-query chat panel ──────────────────────────────────────────
  let viewingSubQueryId = null;
  let sqViewQuery = null;
  let sqViewChats = [];
  let sqViewLoading = false;
  let sqViewHasMore = false;
  // interactive state
  let sqChatMessage = "";
  let sqAttachedFiles = [];
  let sqSendingChat = false;
  let sqReplyTo = null;
  let sqIsTyping = false;
  let sqTypingTimer = null;
  let sqOtherTyping = false;
  let sqIsAtBottom = true;
  let sqHasMoreOlder = false;
  let sqLoadingOlder = false;
  let sqFileInputEl;
  let sqExpandedMessages = new Set();
  let sqIsDragOver = false;
  let sqDragDepth = 0;
  let sqPendingFiles = []; // staged from drop/paste — shown in preview modal before confirm
  let sqPendingIndex = 0;  // active slide in the sq preview modal
  let sqNewMsgCount = 0;
  let sqShowNewMsgBanner = false;
  let sqEditingChatId = null;
  let sqEditingChatText = "";
  let sqSavingEdit = false;
  let sqSettingFinalFlag = null;
  let sqActionLoading = false;

  $: isSubQuery = query?.parentQueryId != null;
  $: hasOpenSubQueries = subQueries.some(s => ["open", "in_progress", "reopened"].includes(s.status));

  async function loadSubQueries(id = queryId) {
    if (!query || isSubQuery) return;
    subQueriesLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${id}/sub-queries`);
      subQueries = Array.isArray(res) ? res : (res?.data ?? []);
    } catch (_) {
      subQueries = [];
    } finally {
      subQueriesLoading = false;
    }
  }

  async function openSubQueryInline(sq) {
    showSubQueriesModal = false;
    clearUnread(sq.id);
    // mark chats read in DB then refresh store so parent row badge drops accurately
    markChatsRead(sq.id).then(() => loadUnreadCounts()).catch(() => {});
    // clear sub-query status notifications (pickup/resolve) from the bell
    authApiFetch(`${API_ROUTES.QUERY}/${sq.id}/read-notifications`, { method: "PATCH" }).catch(() => {});
    // reset interactive state for new panel
    sqChatMessage = ""; sqAttachedFiles = []; sqReplyTo = null;
    sqOtherTyping = false; sqIsAtBottom = true;
    sqExpandedMessages = new Set();
    sqNewMsgCount = 0; sqShowNewMsgBanner = false;
    sqEditingChatId = null; sqEditingChatText = "";
    sqSettingFinalFlag = null;
    sqCancelPending();
    if (sqIsTyping) { sqIsTyping = false; clearTimeout(sqTypingTimer); }

    viewingSubQueryId = sq.id;
    pushRightPanel('subquery');
    history.pushState({}, "", `/admin/query/${queryId}?sq=${sq.id}`);
    sqViewQuery = sq;
    sqViewChats = [];
    sqViewHasMore = false;
    sqHasMoreOlder = false;
    sqViewLoading = true;

    // join sub-query socket room for real-time messages
    socket?.emit("join-query", sq.id);

    try {
      const [sqDetail, chatsRes] = await Promise.all([
        authApiFetch(`${API_ROUTES.QUERY}/${sq.id}`).catch(() => null),
        authApiFetch(`${API_ROUTES.QUERY}/${sq.id}/chat?limit=${CHAT_LIMIT}`).catch(() => ({ data: [], hasMore: false })),
      ]);
      sqViewQuery = sqDetail ?? sq;
      sqViewChats = Array.isArray(chatsRes.data)
        ? chatsRes.data.map(c => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole), isFinal: c.isFinal ?? false, finalSetById: c.finalSetById ?? null }))
        : [];
      sqViewHasMore = chatsRes.hasMore ?? false;
      sqHasMoreOlder = chatsRes.hasMore ?? false;
    } catch (_) {
      sqViewChats = [];
    } finally {
      sqViewLoading = false;
      await tick(); // wait for messages to render
      await tick(); // wait for {#if canSendSqChat()} input block to render
      if (sqChatContainer) sqChatContainer.scrollTop = sqChatContainer.scrollHeight;
    }
  }

  function closeSubQueryInline() {
    if (sqIsTyping && viewingSubQueryId) {
      sqIsTyping = false;
      clearTimeout(sqTypingTimer);
      socket?.emit("typing-stop", Number(viewingSubQueryId));
    }
    viewingSubQueryId = null;
    removeFromRightPanel('subquery');
    history.replaceState({}, "", `/admin/query/${queryId}`);
    sqViewQuery = null;
    sqViewChats = [];
    sqViewHasMore = false;
    sqHasMoreOlder = false;
    sqViewLoading = false;
    sqChatMessage = ""; sqAttachedFiles = []; sqReplyTo = null;
    sqOtherTyping = false; sqIsAtBottom = true;
    sqExpandedMessages = new Set();
    sqNewMsgCount = 0; sqShowNewMsgBanner = false;
    sqEditingChatId = null; sqEditingChatText = "";
    sqSettingFinalFlag = null;
    sqCancelPending();
  }

  async function submitSubQuery() {
    if (!sqSubject.trim()) return;
    sqSending = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/sub-queries`, {
        method: "POST",
        data: JSON.stringify({ type: sqType, subject: sqSubject.trim(), priority: sqPriority }),
      });
      showSubQueryModal = false;
      sqSubject = ""; sqType = "price_check"; sqPriority = "medium";
      Swal.fire({ icon: "success", title: "Query raised!", text: "A tech helper will pick it up shortly.", timer: 1800, showConfirmButton: false });
      await loadSubQueries();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e?.data?.message ?? "Could not raise query." });
    } finally {
      sqSending = false;
    }
  }

  function canRaiseSubQuery() {
    if (!query || isSubQuery) return false;
    return isTech(currentUser) && query.status === "in_progress" && query.assignedToId === currentUser?.id;
  }

  let chatContainer;
  let sqChatContainer; // scroll container for the inline sub-query chat panel
  let shouldScroll = false;
  let isAtBottom = true;
  let newMsgCount = 0;
  let showNewMsgBanner = false;

  // WhatsApp-style chat pagination
  const CHAT_LIMIT = 30;
  let hasMoreOlderChats = false;
  let loadingOlder = false;

  // drag-and-drop state
  let isDragOver = false;
  let dragDepth = 0;
  const previewCache = new WeakMap(); // File → blob URL; avoids duplicate createObjectURL calls

  function checkAtBottom() {
    if (!chatContainer) return true;
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 60;
  }

  function handleChatScroll() {
    isAtBottom = checkAtBottom();
    if (isAtBottom) {
      newMsgCount = 0;
      showNewMsgBanner = false;
    }
    // Load older messages when user scrolls near the top (WhatsApp style)
    if (chatContainer && chatContainer.scrollTop < 60 && hasMoreOlderChats && !loadingOlder) {
      loadOlderChats();
    }
  }

  function scrollToBottom() {
    if (!chatContainer) return;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    newMsgCount = 0;
    showNewMsgBanner = false;
    isAtBottom = true;
  }

  $: if (chats || otherTyping) shouldScroll = true;

  afterUpdate(() => {
    if (shouldScroll && chatContainer) {
      if (isAtBottom) {
        // Extra tick ensures {#if canSendChat()} input block is in DOM before scrolling
        tick().then(() => {
          if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      }
      shouldScroll = false;
    }
  });

  onMount(async () => {
    document.body.classList.add('query-no-scroll');
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user" && !currentUser.subRole) { goto("/admin/dashboard"); return; }
    clearUnread(Number(queryId));
    await loadQuery();
    // tech users should never see a sub-query as a standalone page — redirect to parent + inline panel
    if (query?.parentQueryId && isTech(currentUser)) {
      goto(`/admin/query/${query.parentQueryId}?sq=${queryId}`, { replaceState: true });
      return;
    }
    await Promise.all([loadChats(), loadSubQueries()]);
    markChatsRead(queryId).then(() => loadUnreadCounts()).catch(() => {});
    connectSocket();
    loadInProgress();
    // mark any existing notifications for this query as read
    authApiFetch(`${API_ROUTES.QUERY}/${queryId}/read-notifications`, { method: "PATCH" }).catch(() => {});
    // auto-open sub-query panel if ?sq= is present in URL
    const sqParam = $page.url.searchParams.get("sq");
    if (sqParam) {
      const sqId = Number(sqParam);
      const sq = subQueries.find(s => s.id === sqId) ?? { id: sqId };
      openSubQueryInline(sq);
    }
    window.addEventListener("popstate", handlePopState);
  });

  onDestroy(() => {
    document.body.classList.remove('query-no-scroll');
    disconnectSocket();
    window.removeEventListener("popstate", handlePopState);
    if (bannerTimer) clearTimeout(bannerTimer);
    if (markReadTimer) clearTimeout(markReadTimer);
    if (sqMarkReadTimer) clearTimeout(sqMarkReadTimer);
  });

  // Sync panel state with browser back/forward — if ?sq= disappears, close; if it appears, open.
  function handlePopState() {
    const sqParam = new URLSearchParams(window.location.search).get("sq");
    if (sqParam) {
      const sqId = Number(sqParam);
      if (viewingSubQueryId !== sqId) {
        const sq = subQueries.find(s => s.id === sqId) ?? { id: sqId };
        openSubQueryInline(sq);
      }
    } else if (viewingSubQueryId) {
      closeSubQueryInline();
    }
  }

  // Switch to a different query without a page navigation.
  // Fetches new data first, then swaps atomically — old content stays visible (no blink).
  async function selectQuery(newId) {
    newId = Number(newId);
    if (newId === Number(queryId)) return;

    // close sub-query panel if open
    if (viewingSubQueryId) closeSubQueryInline();
    // track if order drawer was open — will reload or close after new query loads
    const _wasOrderDrawerOpen = orderDrawerOpen;

    // stop typing on the old query
    if (isTyping) {
      isTyping = false;
      clearTimeout(typingTimer);
      socket?.emit("typing-stop", Number(queryId));
    }

    // reset non-panel state (typing, attachments, status banner, reply)
    otherTyping = false;
    typingQueries = new Set();
    expandedMessages = new Set();
    chatMessage = "";
    attachedFiles = [];
    cancelPending();
    replyTo = null;
    editingChatId = null;
    editingChatText = "";
    newMsgCount = 0;
    showNewMsgBanner = false;
    isAtBottom = true;
    statusBanner = null;
    if (bannerTimer) clearTimeout(bannerTimer);
    if (markReadTimer) clearTimeout(markReadTimer);
    if (sqMarkReadTimer) clearTimeout(sqMarkReadTimer);
    if (chatInputEl) chatInputEl.style.height = "auto";

    // show shimmer bar — old query detail + chat stay visible underneath
    switching = true;

    // commit queryId now so socket handlers immediately use the new id
    queryId = String(newId);
    clearUnread(newId);
    history.replaceState({}, "", `/admin/query/${newId}`);
    socket?.emit("join-query", newId);
    loadInProgress();

    // fetch both panels in parallel
    const [newQuery, newChatsRes] = await Promise.all([
      authApiFetch(`${API_ROUTES.QUERY}/${newId}`).catch(() => null),
      authApiFetch(`${API_ROUTES.QUERY}/${newId}/chat?limit=${CHAT_LIMIT}`).catch(() => ({ data: [], hasMore: false })),
    ]);

    // atomic swap — single render tick, no blank flash
    query = newQuery;
    chats = Array.isArray(newChatsRes.data)
      ? newChatsRes.data.map((c) => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole), isFinal: c.isFinal ?? false, finalSetById: c.finalSetById ?? null }))
      : [];
    hasMoreOlderChats = newChatsRes.hasMore ?? false;
    loadingOlder = false;
    switching = false;

    // reload order drawer with new query's order, or show "no order" message
    if (_wasOrderDrawerOpen) {
      if (newQuery?.order?.id) {
        openOrderDrawer(newQuery.order.id);
      } else {
        openOrderDrawerEmpty();
      }
    }

    await tick();
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

    authApiFetch(`${API_ROUTES.QUERY}/${newId}/read-notifications`, { method: "PATCH" }).catch(() => {});
    markChatsRead(newId).then(() => loadUnreadCounts()).catch(() => {});
  }

  // Socket handlers deliberately reference `queryId` (the live let-binding),
  // NOT a captured snapshot, so switching queries via selectQuery() works correctly.
  function connectSocket() {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    socket = io(`${API_BASE_URL}/query-chat`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("join-query", Number(queryId));
      // join all sub-query rooms so new-message events arrive for unread badge tracking
      subQueries.forEach(sq => socket.emit("join-query", sq.id));
      // also watch other in-progress rooms for typing (list may already be loaded)
      joinInProgressRooms();
    });

    socket.on("new-message", (msg) => {
      // ── sub-query inline panel: intercept messages for the open sub-query ──
      if (viewingSubQueryId && msg.queryId === Number(viewingSubQueryId)) {
        if (sqViewChats.find(c => c.id === msg.id)) return;
        const isOwn = msg.senderId === currentUser?.id;
        let senderLabel;
        const _isMaster = currentUser?.role === 'master';
        if (isOwn) senderLabel = "You";
        else if (msg.senderSubRole === 'tech_helper') senderLabel = _isMaster ? (msg.senderName ?? 'Senior Tech') : 'Senior Tech';
        else if (msg.senderSubRole === 'tech')        senderLabel = _isMaster ? (msg.senderName ?? "Tech")        : "Tech";
        else if (msg.senderSubRole === 'telecaller')  senderLabel = _isMaster ? (msg.senderName ?? "Telecaller")  : "Requester";
        else if (msg.isAdminSender)                   senderLabel = _isMaster ? (msg.senderName ?? "Admin")       : "Admin";
        else                                          senderLabel = _isMaster ? (msg.senderName ?? "Unknown")     : "Unknown";
        const senderType = deriveSenderType(isOwn, senderLabel, msg.senderSubRole);
        let msgReplyTo = null;
        if (msg.replyToId) {
          const ref = sqViewChats.find(c => c.id === msg.replyToId);
          if (ref) msgReplyTo = { id: ref.id, senderLabel: ref.senderLabel, message: ref.message, senderType: ref.senderType };
        }
        sqViewChats = [...sqViewChats, {
          id: msg.id, message: msg.message, attachments: msg.attachments ?? [],
          createdAt: msg.createdAt, isOwn, senderLabel, senderType,
          replyTo: msgReplyTo, isNew: true, isFinal: false, finalSetById: null,
        }];
        if (sqIsAtBottom) {
          tick().then(() => { if (sqChatContainer) sqChatContainer.scrollTop = sqChatContainer.scrollHeight; });
        } else if (!isOwn) {
          sqNewMsgCount += 1;
          sqShowNewMsgBanner = true;
        }
        if (!isOwn) debouncedSqMarkChatsRead(viewingSubQueryId);
        // bump parent query's lastActivityAt + lastMessage so in-progress list re-sorts and preview updates
        const _sqIpIdx = inProgressList.findIndex(q => q.id === Number(queryId));
        if (_sqIpIdx !== -1) {
          inProgressList[_sqIpIdx] = {
            ...inProgressList[_sqIpIdx],
            lastActivityAt: new Date().toISOString(),
            lastMessage: msg.message || inProgressList[_sqIpIdx].lastMessage,
          };
          inProgressList = [...inProgressList];
        }
        return;
      }

      // message for a sub-query of this parent but inline panel is not showing it
      if (subQueries.some(s => s.id === msg.queryId)) {
        const isOwn = msg.senderId === currentUser?.id;
        if (!isOwn) {
          incrementUnread(msg.queryId);       // sub-query event card badge
          incrementUnread(Number(queryId));   // parent query in-progress list badge
        }
        return;
      }

      // handle messages for other in-progress queries — bubble to top of list + track unread
      if (msg.queryId !== Number(queryId)) {
        const isOwn = msg.senderId === currentUser?.id;
        if (!isOwn) {
          incrementUnread(msg.queryId);
          // toast notification for new message on other query
          const listItem = inProgressList.find(q => q.id === msg.queryId);
          // apply same name masking as chat messages
          const _isAdminSender = msg.isAdminSender ?? false;
          let _toastSender;
          if (isMasterView(currentUser)) {
            _toastSender = msg.senderName ?? 'Unknown';
          } else if (_isAdminSender) {
            _toastSender = 'Admin';
          } else if (isTelecaller(currentUser)) {
            _toastSender = 'Support Team';
          } else {
            _toastSender = 'Requester';
          }
          pushQueryToast({
            type: 'message',
            queryId: msg.queryId,
            subject: listItem?.subject ?? `Query #${msg.queryId}`,
            senderLabel: _toastSender,
            preview: msg.message ? (msg.message.length > 60 ? msg.message.slice(0, 60) + '…' : msg.message) : '📎 Attachment',
            createdAt: msg.createdAt,
          });
        }
        const idx = inProgressList.findIndex(q => q.id === msg.queryId);
        const now = new Date().toISOString();
        if (idx === 0) {
          // already at top — refresh lastMessage + lastActivityAt
          inProgressList[0] = { ...inProgressList[0], lastMessage: msg.message ?? inProgressList[0].lastMessage, lastActivityAt: now };
          inProgressList = [...inProgressList];
        } else if (idx > 0) {
          const item = { ...inProgressList[idx], lastMessage: msg.message ?? inProgressList[idx].lastMessage, lastActivityAt: now };
          inProgressList = [item, ...inProgressList.filter((_, i) => i !== idx)];
        } else {
          // not in loaded pages yet — refresh from page 1
          loadInProgress(true);
        }
        return;
      }
      // skip if already added locally (own message added immediately after send)
      if (chats.find((c) => c.id === msg.id)) return;

      // system event message (reopen, reassignment) — render as centered divider
      if (msg.systemEvent) {
        // escalated events are admin-only — hide from tech/tech_helper in real-time too
        if (msg.systemEvent.type === 'escalated' && (isTech(currentUser) || isTechHelper(currentUser))) return;
        chats = [...chats, {
          id: msg.id,
          message: null,
          attachments: [],
          createdAt: msg.createdAt,
          isOwn: false,
          senderLabel: 'System',
          senderType: 'system',
          replyTo: null,
          isFinal: false,
          finalSetById: null,
          subQueryEvent: null,
          systemEvent: msg.systemEvent,
        }];
        return;
      }

      const isOwn = msg.senderId === currentUser?.id;
      // msg.isAdminSender is true when sender has no subRole (master/admin/manager)
      const isAdminSender = msg.isAdminSender ?? false;
      let senderLabel;

      if (isMasterView(currentUser)) {
        senderLabel = isOwn ? "You" : (msg.senderName || "Unknown");
      } else if (isOwn) {
        senderLabel = "You";
      } else if (isAdminSender) {
        senderLabel = "Admin";
      } else if (isTelecaller(currentUser)) {
        senderLabel = "Support Team";
      } else {
        senderLabel = "Requester";
      }

      const senderType = deriveSenderType(isOwn, senderLabel, msg.senderSubRole);

      // resolve replyTo from local chats array (message already loaded on client)
      let msgReplyTo = null;
      if (msg.replyToId) {
        const ref = chats.find((c) => c.id === msg.replyToId);
        if (ref) msgReplyTo = { id: ref.id, senderLabel: ref.senderLabel, message: ref.message, senderType: ref.senderType };
      }

      const atBottom = checkAtBottom();
      chats = [
        ...chats,
        {
          id: msg.id,
          message: msg.message,
          attachments: msg.attachments ?? [],
          createdAt: msg.createdAt,
          isOwn,
          senderLabel,
          senderType,
          replyTo: msgReplyTo,
          isNew: true,
        },
      ];
      if (!atBottom && !isOwn) {
        newMsgCount += 1;
        showNewMsgBanner = true;
      }

      // keep DB in sync — mark incoming messages read while actively viewing (debounced)
      if (!isOwn) debouncedMarkChatsRead(queryId);
      // bump lastActivityAt + lastMessage on current query so in-progress list re-sorts and preview updates
      const _ipIdx = inProgressList.findIndex(q => q.id === Number(queryId));
      if (_ipIdx !== -1) {
        inProgressList[_ipIdx] = {
          ...inProgressList[_ipIdx],
          lastActivityAt: new Date().toISOString(),
          lastMessage: msg.message || inProgressList[_ipIdx].lastMessage,
        };
        inProgressList = [...inProgressList];
      }
    });

    socket.on("user-typing", (data) => {
      const qid = data?.queryId;
      if (viewingSubQueryId && qid === Number(viewingSubQueryId)) {
        sqOtherTyping = true;
        return;
      }
      if (qid && qid !== Number(queryId)) {
        typingQueries.add(qid);
        typingQueries = typingQueries;
      } else {
        otherTyping = true;
      }
    });

    socket.on("typing-stopped", (data) => {
      const qid = data?.queryId;
      if (viewingSubQueryId && qid === Number(viewingSubQueryId)) {
        sqOtherTyping = false;
        return;
      }
      if (qid && qid !== Number(queryId)) {
        typingQueries.delete(qid);
        typingQueries = typingQueries;
      } else {
        otherTyping = false;
      }
    });

    // personal room event — another query's status changed, refresh our list
    socket.on("query-list-changed", () => {
      loadInProgress();
    });

    socket.on("message-edited", (data) => {
      if (viewingSubQueryId && data.queryId === Number(viewingSubQueryId)) {
        sqViewChats = sqViewChats.map(c =>
          c.id === data.chatId ? { ...c, message: data.message, editedAt: data.editedAt } : c
        );
        return;
      }
      if (data.queryId !== Number(queryId)) return;
      chats = chats.map((c) =>
        c.id === data.chatId
          ? { ...c, message: data.message, editedAt: data.editedAt }
          : c
      );
    });

    socket.on("message-deleted", (data) => {
      const isMaster = currentUser?.role === 'master';
      const patch = { isDeleted: true, ...(isMaster ? {} : { message: null, attachments: [] }) };
      if (viewingSubQueryId && data.queryId === Number(viewingSubQueryId)) {
        sqViewChats = sqViewChats.map(c => c.id === data.chatId ? { ...c, ...patch } : c);
        return;
      }
      if (data.queryId !== Number(queryId)) return;
      chats = chats.map(c => c.id === data.chatId ? { ...c, ...patch } : c);
    });

    socket.on("messages-read", (data) => {
      // Recipient opened the chat — flip all our own messages to read (double-tick)
      if (data.queryId === Number(queryId)) {
        chats = chats.map(c => c.isOwn ? { ...c, read: true } : c);
      }
      if (data.queryId === Number(viewingSubQueryId)) {
        sqViewChats = sqViewChats.map(c => c.isOwn ? { ...c, read: true } : c);
      }
    });

    socket.on("status-update", (data) => {
      // refresh in-progress list on any status change (query may enter or leave in_progress)
      loadInProgress();

      if (data.queryId === Number(queryId)) {
        // current query — patch reactively + show existing status banner
        query = {
          ...query,
          status: data.status,
          assignedToId: data.assignedToId ?? query.assignedToId,
          assignedTo: data.assignedToName
            ? { ...(query.assignedTo ?? {}), name: data.assignedToName }
            : query.assignedTo,
        };
        const _bannerAssignee = isMasterView(currentUser)  ? data.assignedToName
                              : isTelecaller(currentUser)   ? 'Support Team'
                              : (isTech(currentUser) || isTechHelper(currentUser)) ? 'Tech'
                              : data.assignedToName;
        showStatusBanner(data.status, _bannerAssignee);
      } else {
        // other query — increment unread badge + show toast
        if (data.status === 'in_progress' || data.status === 'reopened') {
          incrementUnread(data.queryId);
        }
        const listItem = inProgressList.find(q => q.id === data.queryId);
        // mask tech real name — show role name instead for non-master viewers
        const _assigneeName = isMasterView(currentUser)  ? data.assignedToName
                            : isTelecaller(currentUser)   ? 'Support Team'
                            : (isTech(currentUser) || isTechHelper(currentUser)) ? 'Tech'
                            : data.assignedToName;
        const statusLabel = data.status === 'in_progress'
          ? `Picked up${_assigneeName ? ' by ' + _assigneeName : ''}`
          : data.status === 'reopened' ? 'Query reopened'
          : data.status === 'resolved' ? 'Query resolved'
          : data.status === 'closed'   ? 'Query closed'
          : `Status → ${data.status}`;
        pushQueryToast({
          type: 'status',
          queryId: data.queryId,
          subject: listItem?.subject ?? `Query #${data.queryId}`,
          status: data.status,
          statusLabel,
          createdAt: new Date().toISOString(),
        });
      }
      // also patch the inline sub-query panel if the event is for that sub-query
      // (tech joins the sub-query room on openSubQueryInline, so this event arrives here too)
      if (viewingSubQueryId && data.queryId === Number(viewingSubQueryId) && sqViewQuery) {
        sqViewQuery = {
          ...sqViewQuery,
          status: data.status,
          assignedToId: data.assignedToId ?? sqViewQuery.assignedToId,
        };
      }
    });

    socket.on("sub-query-update", (data) => {
      if (data.parentQueryId !== Number(queryId)) return;
      // if this sub-query is currently open in the inline panel, patch its header live
      if (viewingSubQueryId && data.subQueryId === Number(viewingSubQueryId) && sqViewQuery) {
        sqViewQuery = { ...sqViewQuery, status: data.status, assignedToId: data.assignedToId ?? sqViewQuery.assignedToId };
      }
      // update local subQueries array (upsert by id)
      const idx = subQueries.findIndex(s => s.id === data.subQueryId);
      if (idx >= 0) {
        subQueries[idx] = { ...subQueries[idx], status: data.status };
        subQueries = [...subQueries];
      } else if (data.eventType === 'created') {
        subQueries = [...subQueries, { id: data.subQueryId, subject: data.subject, type: data.type, status: data.status }];
      }
      // append inline event card to chat (if payload carries it)
      // Telecaller: only append 'created' events — status changes shown reactively on existing card
      if (data.chatEventMsg) {
        const skipForTelecaller = isTelecaller(currentUser) && data.eventType !== 'created';
        if (!skipForTelecaller && !chats.find(c => c.id === data.chatEventMsg.id)) {
          chats = [...chats, {
            id: data.chatEventMsg.id,
            message: null,
            attachments: [],
            createdAt: data.chatEventMsg.createdAt,
            isOwn: false,
            senderLabel: "System",
            senderType: "system",
            replyTo: null,
            isFinal: false,
            finalSetById: null,
            subQueryEvent: data.chatEventMsg.subQueryEvent,
          }];
        }
      }
    });

    socket.on("connect_error", (err) => {
    });
  }

  function disconnectSocket() {
    if (typingTimer) clearTimeout(typingTimer);
    if (socket) { socket.disconnect(); socket = null; }
  }

  let chatInputEl;

  function autoResize(node) {
    node.style.height = "auto";
    node.style.height = node.scrollHeight + "px";
  }

  function handleTyping(e) {
    autoResize(e.target);
    if (!socket || !canSendChat()) return;
    if (!isTyping) {
      isTyping = true;
      socket.emit("typing-start", Number(queryId));
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      socket.emit("typing-stop", Number(queryId));
    }, 2500);
  }

  async function loadQuery(id = queryId) {
    loading = true;
    try {
      query = await authApiFetch(`${API_ROUTES.QUERY}/${id}`);
    } catch (e) {
      // network errors: ServerOffline modal already covers the UI
      if (!e?.isNetworkError && e?.status !== 0) errorHandle(e);
    } finally {
      loading = false;
    }
  }

  async function loadChats(id = queryId) {
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${id}/chat?limit=${CHAT_LIMIT}`);
      chats = Array.isArray(res.data)
        ? res.data.map((c) => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole), isFinal: c.isFinal ?? false, finalSetById: c.finalSetById ?? null }))
        : [];
      hasMoreOlderChats = res.hasMore ?? false;
      await tick(); // wait for messages to render
      await tick(); // wait for {#if canSendChat()} input block to render
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (_) {}
  }

  async function loadOlderChats() {
    if (loadingOlder || !hasMoreOlderChats || chats.length === 0) return;
    loadingOlder = true;
    const oldestId = chats[0].id;
    const prevScrollHeight = chatContainer?.scrollHeight ?? 0;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat?limit=${CHAT_LIMIT}&before=${oldestId}`);
      const older = Array.isArray(res.data)
        ? res.data.map((c) => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole), isFinal: c.isFinal ?? false, finalSetById: c.finalSetById ?? null }))
        : [];
      hasMoreOlderChats = res.hasMore ?? false;
      chats = [...older, ...chats]; // prepend older messages
      await tick();
      // Restore scroll position — new content above expanded scrollHeight
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight - prevScrollHeight;
      }
    } catch (_) {} finally {
      loadingOlder = false;
    }
  }

  function onFileSelect(e) {
    const input = e.target;
    const picked = Array.from(input.files ?? []);
    if (picked.length) {
      attachedFiles = [...attachedFiles, ...picked].slice(0, 5);
    }
    input.value = "";
  }

  function triggerFilePicker() {
    fileInputEl?.click();
  }

  function clearAttachment(index) {
    const f = attachedFiles[index];
    const url = previewCache.get(f);
    if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    attachedFiles = attachedFiles.filter((_, i) => i !== index);
  }

  function isImage(mime) { return mime?.startsWith("image/") ?? false; }

  function timeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  // ── Drag-and-drop: order attachment reference → query chat ──────────────
  async function sendChatWithReference(att) {
    if (!canSendChat()) return;
    sendingChat = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat`, {
        method: 'POST',
        data: {
          referenceUrl:  att.url,
          referenceName: att.name,
          referenceMime: att.mime,
        },
      });
      if (data?.data) {
        const chat = data.data;
        if (!chats.find((c) => c.id === chat.id)) {
          chats = [...chats, {
            id:          chat.id,
            message:     chat.message,
            attachments: chat.attachments ?? [],
            createdAt:   chat.createdAt,
            isOwn:       true,
            senderLabel: "You",
            senderType:  "own",
            replyTo:     null,
            isNew:       true,
            read:        false,
          }];
        }
        await tick();
        scrollChatBottom();
      }
    } catch (e) { /* ignore */ }
    finally { sendingChat = false; }
  }

  // ── Drag-and-drop: query chat reference → order attachment ───────────────
  async function addOrderAttachmentFromReference(att) {
    if (!orderDrawerData) return;
    orderAttachSending = true;
    try {
      const data = await authApiFetch(API_ROUTES.ORDER_ATTACHMENT, {
        method: 'POST',
        data: {
          orderId:      String(orderDrawerData.id),
          referenceUrl: att.url,
          originalName: att.name,
          mimeType:     att.mime,
          title:        orderAttachTitle.trim() || undefined,
        },
      });
      if (data?.data) {
        orderAttachments = [...orderAttachments, data.data];
        orderAttachTitle = '';
        orderAttachAtBottom = true;
        orderAttachShowScrollBtn = false;
        await tick();
        if (orderAttachListEl) orderAttachListEl.scrollTop = orderAttachListEl.scrollHeight;
      }
    } catch (e) {
      const msg = typeof e?.data?.message === 'string' ? e.data.message : null;
      if (e?.isTimeout) {
        Swal.fire({ icon: 'warning', title: 'Upload timed out', text: 'The upload took too long. Please try again.' });
      } else if (e?.isNetworkError) {
        Swal.fire({ icon: 'warning', title: 'No internet connection', text: 'Could not reach the server. Please check your connection and try again.' });
      } else {
        Swal.fire({ icon: 'error', title: 'Upload failed', text: msg ?? 'Something went wrong. Please try again.' });
      }
    } finally { orderAttachSending = false; }
  }

  async function sendChat() {
    if (!chatMessage.trim() && !attachedFiles.length) return;
    sendingChat = true;

    if (isTyping) {
      isTyping = false;
      clearTimeout(typingTimer);
      socket?.emit("typing-stop", Number(queryId));
    }

    const msgText = chatMessage.trim();
    const msgFiles = [...attachedFiles];
    const msgReplyTo = replyTo; // capture before clearing
    chatMessage = "";
    attachedFiles = [];
    replyTo = null;
    // reset textarea height back to 1 row after clearing
    if (chatInputEl) { chatInputEl.style.height = "auto"; }

    uploadingFileCount = msgFiles.length;
    try {
      const fd = new FormData();
      if (msgText) fd.append("message", msgText);
      for (const f of msgFiles) fd.append("files", f);
      if (msgReplyTo) fd.append("replyToId", String(msgReplyTo.id));

      const result = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat`, {
        method: "POST",
        data: fd,
        // give file uploads enough time on slow connections (default 12s is too short)
        timeout: msgFiles.length > 0 ? 60000 : 12000,
      });

      const chat = result.data;
      if (!chats.find((c) => c.id === chat.id)) {
        chats = [
          ...chats,
          {
            id: chat.id,
            message: chat.message,
            attachments: chat.attachments ?? [],
            createdAt: chat.createdAt,
            isOwn: true,
            senderLabel: "You",
            senderType: "own",
            replyTo: msgReplyTo ? { id: msgReplyTo.id, senderLabel: msgReplyTo.senderLabel, message: msgReplyTo.message, senderType: msgReplyTo.senderType } : null,
            isNew: true,
            read: false,
          },
        ];
      }
      await tick();
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
      // bump lastActivityAt + lastMessage on current query so in-progress list re-sorts and preview updates
      const _ipIdx = inProgressList.findIndex(q => q.id === Number(queryId));
      if (_ipIdx !== -1) {
        inProgressList[_ipIdx] = {
          ...inProgressList[_ipIdx],
          lastActivityAt: new Date().toISOString(),
          lastMessage: msgText || inProgressList[_ipIdx].lastMessage,
        };
        inProgressList = [...inProgressList];
      }
      // revoke blob preview URLs created for chip thumbnails (files now uploaded)
      for (const f of msgFiles) {
        const url = previewCache.get(f);
        if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
      }
    } catch (e) {
      chatMessage = msgText;
      attachedFiles = msgFiles;
      replyTo = msgReplyTo; // restore reply context on failure
      const status = e?.status;
      const rawMsg = e?.data?.message;
      const msg = typeof rawMsg === "string" ? rawMsg : null;
      const restoredNote = msgFiles.length > 0 ? "\n\nYour files have been restored — tap Send to retry." : "";

      if (e?.isTimeout) {
        Swal.fire({
          icon: "warning",
          title: "Upload timed out",
          text: `The upload took too long and was cancelled.${restoredNote}`,
        });
      } else if (e?.isNetworkError) {
        Swal.fire({
          icon: "warning",
          title: "No internet connection",
          text: `Could not reach the server. Please check your connection.${restoredNote}`,
        });
      } else if (status === 413 || msg?.toLowerCase().includes("too large") || msg?.includes("LIMIT_FILE_SIZE")) {
        Swal.fire({
          icon: "error",
          title: "File too large",
          text: "Maximum allowed file size is 5 MB per file. Please reduce the file size and try again.",
        });
      } else if (status === 400 && msg?.toLowerCase().includes("too many")) {
        Swal.fire({
          icon: "error",
          title: "Too many files",
          text: "You can attach a maximum of 5 files per message.",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Failed to send",
          text: (msg ?? "Something went wrong. Please try again.") + restoredNote,
        });
      }
    } finally {
      sendingChat = false;
      uploadingFileCount = 0;
    }
  }

  async function pickUp() {
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/assign`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query assigned to you", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      if (status === 409) {
        Swal.fire({
          icon: "warning",
          title: "Already picked up",
          text: "This query was just picked up by another team member.",
          timer: 2500,
          showConfirmButton: false,
        });
        await loadQuery(); // refresh so the button disappears
      } else if (status === 403) {
        Swal.fire({
          icon: "error",
          title: "Not Allowed",
          text: e?.data?.message ?? "This query was reassigned to a different support member.",
          confirmButtonColor: "#dc3545",
        });
        await loadQuery();
      } else {
        errorHandle(e);
      }
    } finally { actionLoading = false; }
  }

  async function markResolved() {
    const confirm = await Swal.fire({
      icon: "question", title: "Mark as Resolved?",
      text: "The requester will be notified and can reopen if needed.",
      showCancelButton: true, confirmButtonText: "Yes, resolve it", confirmButtonColor: "#198754",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/resolve`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query resolved!", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  async function acceptSolution() {
    const confirm = await Swal.fire({
      icon: "question", title: "Accept Solution?",
      text: "This will close the query. You won't be able to reopen it after accepting.",
      showCancelButton: true, confirmButtonText: "Yes, accept it", confirmButtonColor: "#198754",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/accept`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Solution accepted!", text: "Query has been closed.", timer: 1800, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  // ── Reopen modal state ───────────────────────────────────────────────────
  let showReopenModal = false;
  let reopenType = "same"; // 'same' | 'other'
  let reopenNote = "";
  let reopenError = "";

  function openReopenModal() {
    reopenType = "same";
    reopenNote = "";
    reopenError = "";
    showReopenModal = true;
  }

  async function submitReopen() {
    reopenError = "";
    if (reopenType === "other" && !reopenNote.trim()) {
      reopenError = "Please provide a reason for reassigning to another support member.";
      return;
    }
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/reopen`, {
        method: "PATCH",
        data: JSON.stringify({ reopenType, note: reopenNote.trim() || undefined }),
      });
      showReopenModal = false;
      Swal.fire({ icon: "success", title: "Query reopened", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      reopenError = e?.data?.message ?? "Failed to reopen query.";
    } finally { actionLoading = false; }
  }

  // ── Escalate (telecaller on stuck in_progress) ──────────────────────────
  let showEscalateModal = false;
  let escalateNote = "";
  let escalateLoading = false;

  async function submitEscalate() {
    escalateLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/escalate`, {
        method: "PATCH",
        data: JSON.stringify({ note: escalateNote.trim() || undefined }),
      });
      showEscalateModal = false;
      escalateNote = "";
      Swal.fire({ icon: "success", title: "Escalated!", text: "Admin has been notified.", timer: 2000, showConfirmButton: false });
      await loadQuery();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e?.data?.message ?? "Failed to escalate." });
    } finally { escalateLoading = false; }
  }

  // ── Force Release (admin/master on stuck in_progress) ───────────────────
  async function forceRelease() {
    const confirm = await Swal.fire({
      icon: "warning",
      title: "Force Release Query?",
      text: "This will remove the current tech and return the query to the open queue.",
      showCancelButton: true,
      confirmButtonText: "Yes, release it",
      confirmButtonColor: "#dc3545",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/force-release`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query Released", text: "Query is back in the open queue.", timer: 2000, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e?.data?.message ?? "Failed to release query." });
    } finally { actionLoading = false; }
  }

  async function closeQuery() {
    const confirm = await Swal.fire({
      icon: "warning", title: "Close this query?", text: "This action is permanent.",
      showCancelButton: true, confirmButtonText: "Yes, close it",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}`, {
        method: "PATCH",
        data: JSON.stringify({ status: "closed" }),
      });
      Swal.fire({ icon: "success", title: "Query closed", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  function canSendChat() {
    if (!query) return false;
    if (isTelecaller(currentUser)) return query.status !== "closed" && query.status !== "resolved" && query.status !== "reopened";
    if (isTech(currentUser)) {
      if (isSubQuery) return query.status !== "closed" && query.status !== "resolved" && query.status !== "reopened";
      return query.status === "in_progress" && query.assignedToId === currentUser?.id;
    }
    if (isTechHelper(currentUser)) return query.status === "in_progress" && query.assignedToId === currentUser?.id;
    if (isMasterView(currentUser)) return query.status !== "closed";
    return false;
  }

  function typingLabel() {
    if (isTelecaller(currentUser)) return "Support Team is typing…";
    if (isTech(currentUser)) return isSubQuery ? "Senior Tech is typing…" : "Requester is typing…";
    if (isTechHelper(currentUser)) return "Tech is typing…";
    return "Someone is typing…";
  }

  const ALLOWED_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar";

  // ── Privacy masking ───────────────────────────────────────────────────────
  $: isTechSubRole    = currentUser?.subRole === "tech" || currentUser?.subRole === "tech_helper";
  $: isTCSubRole      = currentUser?.subRole === "telecaller";
  $: maskTC     = (name) => ((isTechSubRole || (currentUser?.role === "master" && $queryPrivacy.telecaller)) && name) ? "Telecaller" : (name ?? "-");
  $: maskTech   = (name) => ((isTCSubRole  || (currentUser?.role === "master" && $queryPrivacy.tech))       && name) ? "Tech"        : (name ?? "-");
  $: maskHelper = (name) => ((isTCSubRole  || (currentUser?.role === "master" && $queryPrivacy.techHelper)) && name) ? "Senior Tech" : (name ?? "-");
  $: maskChatSender = (chat) => {
    if (currentUser?.role !== "master") return chat.senderLabel;
    if ($queryPrivacy.telecaller && chat.senderType === "telecaller") return "Telecaller";
    if ($queryPrivacy.tech       && chat.senderType === "tech")       return "Tech";
    if ($queryPrivacy.techHelper && chat.senderType === "tech_helper") return "Senior Tech";
    return chat.senderLabel;
  };

  // Mask a senderLabel for reply quotes / previews where only senderType is available.
  // Applies the same role-based privacy as the main chat bubble logic.
  function maskSenderLabel(label, senderType) {
    if (!senderType || label === 'You') return label;
    // telecaller viewing tech/helper message → "Support Team"
    if (isTelecaller(currentUser) && senderType === 'tech')        return 'Support Team';
    if (isTelecaller(currentUser) && senderType === 'tech_helper') return 'Senior Tech';
    // tech/tech_helper viewing telecaller message → "Requester"
    if ((isTech(currentUser) || isTechHelper(currentUser)) && senderType === 'telecaller') return 'Requester';
    // master: apply privacy toggle
    if (isMasterView(currentUser)) {
      if ($queryPrivacy.telecaller && senderType === 'telecaller') return 'Telecaller';
      if ($queryPrivacy.tech       && senderType === 'tech')       return 'Tech';
      if ($queryPrivacy.techHelper && senderType === 'tech_helper') return 'Senior Tech';
    }
    return label;
  }

  // ── PDF Export ───────────────────────────────────────────────────────────
  let showExportModal = false;
  let exportRangePreset = "all";
  let exportFromDate = "";
  let exportToDate = "";
  let exportLoading = false;

  function getExportDateRange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (exportRangePreset === "all") return { from: null, to: null };
    if (exportRangePreset === "today") return { from: today, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    if (exportRangePreset === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: y, to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999) };
    }
    if (exportRangePreset === "last7") {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { from: s, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    }
    if (exportRangePreset === "last30") {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { from: s, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    }
    if (exportRangePreset === "thismonth") {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: s, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    }
    if (exportRangePreset === "custom") {
      const from = exportFromDate ? (() => { const d = new Date(exportFromDate); d.setHours(0,0,0,0); return d; })() : null;
      const to = exportToDate ? (() => { const d = new Date(exportToDate); d.setHours(23,59,59,999); return d; })() : null;
      return { from, to };
    }
    return { from: null, to: null };
  }

  $: exportPreviewCount = (() => {
    const { from, to } = getExportDateRange();
    return chats.filter(c => {
      if (c.subQueryEvent || c.systemEvent || c.isDeleted) return false;
      const t = new Date(c.createdAt);
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    }).length;
  })();

  function getExportSenderName(chat) {
    if (chat.systemEvent || chat.subQueryEvent) return "System";
    if (chat.isOwn) return currentUser?.name ?? "You";
    const type = chat.senderType;
    const isMaster = currentUser?.role === "master";
    const privacy = $queryPrivacy;
    if (type === "telecaller") {
      if (isMaster && privacy.telecaller) return "Telecaller";
      return isMaster ? (chat.senderLabel ?? "Telecaller") : "Telecaller";
    }
    if (type === "tech") {
      if (isMaster && privacy.tech) return "Tech";
      return isMaster ? (chat.senderLabel ?? "Tech") : "Tech";
    }
    if (type === "tech_helper") {
      if (isMaster && privacy.techHelper) return "Senior Tech";
      return isMaster ? (chat.senderLabel ?? "Senior Tech") : "Senior Tech";
    }
    return chat.senderLabel ?? "Admin";
  }

  function getAttachmentLabel(url) {
    if (!url) return "";
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/.test(lower)) return "📷 Image";
    if (/\.(mp4|avi|mov|mkv|webm)(\?|$)/.test(lower)) return "🎬 Video";
    if (/\.(mp3|wav|ogg|aac)(\?|$)/.test(lower)) return "🎵 Audio";
    if (/\.(pdf)(\?|$)/.test(lower)) return "📄 File: " + url.split("/").pop().split("?")[0];
    if (/\.(doc|docx|xls|xlsx|txt|zip|rar)(\?|$)/.test(lower)) return "📄 File: " + url.split("/").pop().split("?")[0];
    if (/^https?:\/\//.test(url)) return "🔗 Link: " + url;
    return "📎 Attachment";
  }

  function formatPdfDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    const day = String(dt.getDate()).padStart(2, "0");
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const year = dt.getFullYear();
    const h = String(dt.getHours()).padStart(2, "0");
    const m = String(dt.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${h}:${m}`;
  }

  function exportChatPdf() {
    exportLoading = true;
    try {
      const { from, to } = getExportDateRange();
      let filtered = chats.filter(c => {
        if (c.subQueryEvent || c.systemEvent || c.isDeleted) return false;
        const t = new Date(c.createdAt);
        if (from && t < from) return false;
        if (to && t > to) return false;
        return true;
      });

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210, margin = 14, contentW = pageW - margin * 2;
      let y = margin;

      // ── Header ──
      doc.setFontSize(13).setFont(undefined, "bold");
      doc.text("Query Chat Export", margin, y); y += 7;
      doc.setFontSize(9).setFont(undefined, "normal").setTextColor(80);
      doc.text(`Query: ${query.ticketCode ?? "#" + query.id}  |  ${query.subject ?? ""}`, margin, y); y += 5;
      if (exportFromDate || exportToDate) {
        doc.text(`Date range: ${exportFromDate || "Start"} → ${exportToDate || "End"}`, margin, y); y += 5;
      }
      doc.text(`Total messages: ${filtered.length}  |  Exported: ${formatPdfDate(new Date())}`, margin, y); y += 5;
      doc.setDrawColor(180).setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y); y += 5;
      doc.setTextColor(0);

      // ── Messages ──
      for (const chat of filtered) {
        const sender = getExportSenderName(chat);
        const time = formatPdfDate(chat.createdAt);
        let body = "";
        if (chat.attachments?.length) {
          body = chat.attachments.map(a => getAttachmentLabel(a.url ?? a)).join("\n");
          if (chat.message?.trim()) body = chat.message.trim() + "\n" + body;
        } else {
          body = chat.message?.trim() || "";
        }
        if (!body) continue;

        // sender + time line
        const senderLines = doc.splitTextToSize(sender, contentW * 0.6);
        const neededH = 5 + senderLines.length * 4.5 + doc.splitTextToSize(body, contentW).length * 4.5 + 6;
        if (y + neededH > 280) { doc.addPage(); y = margin; }

        doc.setFontSize(8).setFont(undefined, "bold").setTextColor(40);
        doc.text(senderLines, margin, y);
        doc.setFont(undefined, "normal").setTextColor(120);
        doc.text(time, pageW - margin, y, { align: "right" });
        y += senderLines.length * 4.5;

        doc.setFontSize(9).setFont(undefined, "normal").setTextColor(0);
        const bodyLines = doc.splitTextToSize(body, contentW);
        for (const line of bodyLines) {
          if (y + 5 > 280) { doc.addPage(); y = margin; }
          doc.text(line, margin, y); y += 4.5;
        }

        doc.setDrawColor(210).setLineWidth(0.2);
        doc.line(margin, y + 1, pageW - margin, y + 1); y += 5;
      }

      const filename = `query-${query.ticketCode ?? query.id}-chat.pdf`;
      doc.save(filename);
      showExportModal = false;
    } finally {
      exportLoading = false;
    }
  }

  // ── Preview attached file before sending ─────────────────────────────────
  function previewAttachedFile(file) {
    if (file.type.startsWith("image/")) {
      const imgFiles = attachedFiles.filter(f => f.type.startsWith("image/"));
      const urls = imgFiles.map(f => URL.createObjectURL(f));
      const idx = imgFiles.indexOf(file);
      openImageLightbox(urls, idx < 0 ? 0 : idx);
      setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60_000);
    } else {
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  // ── Pending files helpers ─────────────────────────────────────────────────
  function getPreviewUrl(file) {
    if (previewCache.has(file)) return previewCache.get(file);
    const url = URL.createObjectURL(file);
    previewCache.set(file, url);
    return url;
  }

  function confirmPendingFiles() {
    const remaining = 5 - attachedFiles.length;
    if (remaining <= 0) { cancelPending(); return; }
    attachedFiles = [...attachedFiles, ...pendingFiles.slice(0, remaining)];
    pendingFiles = []; // URLs kept alive in previewCache — reused by chip thumbnails
  }

  function cancelPending() {
    for (const f of pendingFiles) {
      const url = previewCache.get(f);
      if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    }
    pendingFiles = [];
    pendingIndex = 0;
  }

  function removePendingFile(i) {
    const f = pendingFiles[i];
    const url = previewCache.get(f);
    if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    pendingFiles = pendingFiles.filter((_, idx) => idx !== i);
    // keep index in-bounds after removal
    if (pendingIndex >= pendingFiles.length) {
      pendingIndex = Math.max(0, pendingFiles.length - 1);
    }
  }

  function prevPending()  { if (pendingIndex > 0) pendingIndex--; }
  function nextPending()  { if (pendingIndex < pendingFiles.length - 1) pendingIndex++; }
  function jumpPending(i) { pendingIndex = i; }

  // ── Drag & drop handlers ──────────────────────────────────────────────────
  function handleDragEnter(e) {
    if (!canSendChat()) return;
    e.preventDefault();
    dragDepth++;
    isDragOver = true;
  }

  function handleDragLeave(e) {
    if (!canSendChat()) return;
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; isDragOver = false; }
  }

  function handleDragOver(e) {
    if (!canSendChat()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  async function handleDrop(e) {
    if (!canSendChat()) return;
    e.preventDefault();
    dragDepth = 0;
    isDragOver = false;

    // OS files dragged from desktop (existing behaviour)
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) {
      const capacity = 5 - attachedFiles.length - pendingFiles.length;
      if (capacity <= 0) return;
      pendingFiles = [...pendingFiles, ...files.slice(0, capacity)];
      return;
    }

    // Order attachment reference dragged from order drawer
    const raw = e.dataTransfer?.getData('application/x-order-attachment');
    if (!raw) return;
    try {
      const att = JSON.parse(raw);
      if (att?.url && att?.name && att?.mime) {
        const result = await Swal.fire({
          title: 'Send to Chat?',
          text: `Share "${att.name}" in the discussion thread?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Yes, Send',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#3b5bdb',
          cancelButtonColor: '#adb5bd',
        });
        if (result.isConfirmed) sendChatWithReference(att);
      }
    } catch { /* ignore */ }
  }

  // ── Paste image handler ───────────────────────────────────────────────────
  function handlePaste(e) {
    if (!canSendChat()) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const capacity = 5 - attachedFiles.length - pendingFiles.length;
    if (capacity <= 0) return;
    imageItems.slice(0, capacity).forEach(item => {
      const file = item.getAsFile();
      if (file) pendingFiles = [...pendingFiles, file];
    });
  }

  // ── Inline sub-query panel helpers ───────────────────────────────────────
  function canSendSqChat() {
    if (!sqViewQuery) return false;
    if (isTelecaller(currentUser)) return false;
    if (query?.status === 'closed') return false;
    if (sqViewQuery.status === 'closed') return false;
    if (sqViewQuery.status === 'resolved') return false;
    if (isTech(currentUser)) return true;
    if (isTechHelper(currentUser)) return sqViewQuery.status === 'in_progress' && sqViewQuery.assignedToId === currentUser?.id;
    if (isMasterView(currentUser)) return true;
    return false;
  }

  function sqTypingLabel() {
    if (isTech(currentUser)) return "Senior Tech is typing…";
    if (isTechHelper(currentUser)) return "Tech is typing…";
    return "Someone is typing…";
  }

  function handleSqTyping() {
    if (!socket || !canSendSqChat()) return;
    if (!sqIsTyping) {
      sqIsTyping = true;
      socket.emit("typing-start", Number(viewingSubQueryId));
    }
    clearTimeout(sqTypingTimer);
    sqTypingTimer = setTimeout(() => {
      sqIsTyping = false;
      socket.emit("typing-stop", Number(viewingSubQueryId));
    }, 2500);
  }

  function handleSqChatScroll() {
    if (!sqChatContainer) return;
    sqIsAtBottom = sqChatContainer.scrollHeight - sqChatContainer.scrollTop - sqChatContainer.clientHeight < 60;
    if (sqIsAtBottom) {
      sqNewMsgCount = 0;
      sqShowNewMsgBanner = false;
    }
    if (sqChatContainer.scrollTop < 60 && sqHasMoreOlder && !sqLoadingOlder) {
      loadOlderSqChats();
    }
  }

  async function loadOlderSqChats() {
    if (sqLoadingOlder || !sqHasMoreOlder || sqViewChats.length === 0) return;
    sqLoadingOlder = true;
    const oldestId = sqViewChats[0].id;
    const prevScrollHeight = sqChatContainer?.scrollHeight ?? 0;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/chat?limit=${CHAT_LIMIT}&before=${oldestId}`);
      const older = Array.isArray(res.data)
        ? res.data.map(c => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole), isFinal: c.isFinal ?? false, finalSetById: c.finalSetById ?? null }))
        : [];
      sqHasMoreOlder = res.hasMore ?? false;
      sqViewChats = [...older, ...sqViewChats];
      await tick();
      if (sqChatContainer) sqChatContainer.scrollTop = sqChatContainer.scrollHeight - prevScrollHeight;
    } catch (_) {} finally { sqLoadingOlder = false; }
  }

  async function sendSqChat() {
    if (!sqChatMessage.trim() && !sqAttachedFiles.length) return;
    sqSendingChat = true;
    if (sqIsTyping) {
      sqIsTyping = false;
      clearTimeout(sqTypingTimer);
      socket?.emit("typing-stop", Number(viewingSubQueryId));
    }
    const msgText = sqChatMessage.trim();
    const msgFiles = [...sqAttachedFiles];
    const msgReplyTo = sqReplyTo;
    sqChatMessage = ""; sqAttachedFiles = []; sqReplyTo = null;
    try {
      const fd = new FormData();
      if (msgText) fd.append("message", msgText);
      for (const f of msgFiles) fd.append("files", f);
      if (msgReplyTo) fd.append("replyToId", String(msgReplyTo.id));
      const result = await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/chat`, { method: "POST", data: fd });
      const chat = result.data;
      if (!sqViewChats.find(c => c.id === chat.id)) {
        sqViewChats = [...sqViewChats, {
          id: chat.id, message: chat.message, attachments: chat.attachments ?? [],
          createdAt: chat.createdAt, isOwn: true, senderLabel: "You", senderType: "own",
          replyTo: msgReplyTo ? { id: msgReplyTo.id, senderLabel: msgReplyTo.senderLabel, message: msgReplyTo.message, senderType: msgReplyTo.senderType } : null,
          isNew: true, isFinal: false, finalSetById: null, read: false,
        }];
      }
      await tick();
      if (sqChatContainer) sqChatContainer.scrollTop = sqChatContainer.scrollHeight;
      sqIsAtBottom = true;
      // bump parent query's lastActivityAt + lastMessage so in-progress list re-sorts and preview updates
      const _sqIpIdx = inProgressList.findIndex(q => q.id === Number(queryId));
      if (_sqIpIdx !== -1) {
        inProgressList[_sqIpIdx] = {
          ...inProgressList[_sqIpIdx],
          lastActivityAt: new Date().toISOString(),
          lastMessage: msgText || inProgressList[_sqIpIdx].lastMessage,
        };
        inProgressList = [...inProgressList];
      }
    } catch (e) {
      sqChatMessage = msgText; sqAttachedFiles = msgFiles; sqReplyTo = msgReplyTo;
      Swal.fire({ icon: "error", title: "Failed to send", text: e?.data?.message ?? "Something went wrong." });
    } finally { sqSendingChat = false; }
  }

  function handleSqDragEnter(e) {
    if (!canSendSqChat()) return;
    e.preventDefault(); sqDragDepth++; sqIsDragOver = true;
  }
  function handleSqDragLeave(e) {
    if (!canSendSqChat()) return;
    sqDragDepth--;
    if (sqDragDepth <= 0) { sqDragDepth = 0; sqIsDragOver = false; }
  }
  function handleSqDragOver(e) {
    if (!canSendSqChat()) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  }
  function handleSqDrop(e) {
    if (!canSendSqChat()) return;
    e.preventDefault(); sqDragDepth = 0; sqIsDragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    const capacity = 5 - sqAttachedFiles.length - sqPendingFiles.length;
    if (capacity <= 0) return;
    sqPendingFiles = [...sqPendingFiles, ...files.slice(0, capacity)];
  }
  function handleSqPaste(e) {
    if (!canSendSqChat()) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const capacity = 5 - sqAttachedFiles.length - sqPendingFiles.length;
    if (capacity <= 0) return;
    imageItems.slice(0, capacity).forEach(item => {
      const file = item.getAsFile();
      if (file) sqPendingFiles = [...sqPendingFiles, file];
    });
  }

  function scrollSqToMsg(msgId) {
    const el = document.getElementById(`sq-msg-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-row--highlight");
    setTimeout(() => el.classList.remove("chat-row--highlight"), 1500);
  }

  function sqScrollToBottom() {
    if (!sqChatContainer) return;
    sqChatContainer.scrollTop = sqChatContainer.scrollHeight;
    sqNewMsgCount = 0;
    sqShowNewMsgBanner = false;
    sqIsAtBottom = true;
  }

  function previewSqAttachedFile(file) {
    if (file.type.startsWith("image/")) {
      const imgFiles = sqAttachedFiles.filter(f => f.type.startsWith("image/"));
      const urls = imgFiles.map(f => URL.createObjectURL(f));
      const idx = imgFiles.indexOf(file);
      openImageLightbox(urls, idx < 0 ? 0 : idx);
      setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60_000);
    } else {
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  function sqClearAttachment(i) {
    const f = sqAttachedFiles[i];
    const url = previewCache.get(f);
    if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    sqAttachedFiles = sqAttachedFiles.filter((_, idx) => idx !== i);
  }

  function sqCanEditChat(chat) {
    if (!chat.isOwn) return false;
    const ageMs = Date.now() - new Date(chat.createdAt).getTime();
    return ageMs <= 30 * 60 * 1000;
  }

  function sqStartEditChat(chat) {
    sqEditingChatId = chat.id;
    sqEditingChatText = chat.message ?? "";
  }

  function sqCancelEditChat() {
    sqEditingChatId = null;
    sqEditingChatText = "";
  }

  async function sqSaveEditChat(chatId) {
    if (!sqEditingChatText.trim()) return;
    sqSavingEdit = true;
    try {
      const result = await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/chat/${chatId}`, {
        method: "PATCH",
        data: JSON.stringify({ message: sqEditingChatText.trim() }),
      });
      sqViewChats = sqViewChats.map(c =>
        c.id === chatId
          ? { ...c, message: result.data.message, editedAt: result.data.editedAt }
          : c
      );
      sqEditingChatId = null;
      sqEditingChatText = "";
    } catch (e) {
      Swal.fire({ icon: "error", title: "Cannot edit", text: e?.data?.message ?? "Failed to edit message." });
    } finally {
      sqSavingEdit = false;
    }
  }

  async function sqAcceptSolution() {
    if (!viewingSubQueryId || sqActionLoading) return;
    sqActionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/accept`, { method: 'PATCH' });
      sqViewQuery = { ...sqViewQuery, status: 'closed' };
      subQueries = subQueries.map(s => s.id === Number(viewingSubQueryId) ? { ...s, status: 'closed' } : s);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.data?.message ?? 'Could not close sub-query.' });
    } finally {
      sqActionLoading = false;
    }
  }

  async function sqReopenQuery() {
    if (!viewingSubQueryId || sqActionLoading) return;
    sqActionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/reopen`, { method: 'PATCH' });
      sqViewQuery = { ...sqViewQuery, status: 'reopened' };
      subQueries = subQueries.map(s => s.id === Number(viewingSubQueryId) ? { ...s, status: 'reopened' } : s);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.data?.message ?? 'Could not reopen sub-query.' });
    } finally {
      sqActionLoading = false;
    }
  }

  async function sqToggleFinalFlag(chat) {
    if (sqSettingFinalFlag === chat.id) return;
    sqSettingFinalFlag = chat.id;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/chat/${chat.id}/flag`, { method: 'PATCH' });
      const isFinal = res?.data?.isFinal ?? false;
      sqViewChats = sqViewChats.map(c => ({
        ...c,
        isFinal: c.id === chat.id ? isFinal : (isFinal ? false : c.isFinal),
        finalSetById: c.id === chat.id ? (isFinal ? currentUser?.id : null) : (isFinal ? null : c.finalSetById),
      }));
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update final flag.' });
    } finally {
      sqSettingFinalFlag = null;
    }
  }

  function sqCanDeleteChat(chat) {
    if (chat.isDeleted || chat.subQueryEvent || chat.systemEvent) return false;
    if (currentUser?.role === 'master' || currentUser?.role === 'admin' || currentUser?.role === 'manager') return true;
    if (isTelecaller(currentUser) && chat.isOwn) return true;
    return false;
  }

  let sqDeletingChatId = null;
  async function sqDeleteChat(chat) {
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'Delete message?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#d33',
    });
    if (!confirmed.isConfirmed) return;
    sqDeletingChatId = chat.id;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${viewingSubQueryId}/chat/${chat.id}`, { method: 'DELETE' });
      const isMaster = currentUser?.role === 'master';
      sqViewChats = sqViewChats.map(c => c.id === chat.id
        ? { ...c, isDeleted: true, ...(isMaster ? {} : { message: null, attachments: [] }) }
        : c);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Could not delete message.' });
    } finally {
      sqDeletingChatId = null;
    }
  }

  // ── Sq pending files helpers ──────────────────────────────────────────────
  function sqConfirmPendingFiles() {
    const remaining = 5 - sqAttachedFiles.length;
    if (remaining <= 0) { sqCancelPending(); return; }
    sqAttachedFiles = [...sqAttachedFiles, ...sqPendingFiles.slice(0, remaining)];
    sqPendingFiles = []; // URLs kept alive in previewCache — reused by chip thumbnails
  }

  function sqCancelPending() {
    for (const f of sqPendingFiles) {
      const url = previewCache.get(f);
      if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    }
    sqPendingFiles = [];
    sqPendingIndex = 0;
  }

  function sqRemovePendingFile(i) {
    const f = sqPendingFiles[i];
    const url = previewCache.get(f);
    if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    sqPendingFiles = sqPendingFiles.filter((_, idx) => idx !== i);
    if (sqPendingIndex >= sqPendingFiles.length) {
      sqPendingIndex = Math.max(0, sqPendingFiles.length - 1);
    }
  }

  function sqPrevPending()  { if (sqPendingIndex > 0) sqPendingIndex--; }
  function sqNextPending()  { if (sqPendingIndex < sqPendingFiles.length - 1) sqPendingIndex++; }
  function sqJumpPending(i) { sqPendingIndex = i; }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }
</script>

<div class="page-wrapper">
  <div class="content">

    {#if loading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if !query}
      <div class="text-center py-5 text-muted">Query not found.</div>
    {:else}
      <LightBox data={lightboxData} startIndex={lightboxStartIndex} />

      <!-- ── Reopen modal ───────────────────────────────────────────────────── -->
      {#if showEscalateModal}
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
          on:click|self={() => (showEscalateModal = false)}>
          <div class="card shadow-lg p-4" style="max-width:460px;width:100%;position:relative;">
            <button style="position:absolute;top:0.6rem;right:0.75rem;background:none;border:none;font-size:1.2rem;color:#6c757d;cursor:pointer;"
              on:click={() => (showEscalateModal = false)}>
              <i class="ti ti-x"></i>
            </button>
            <h5 class="fw-bold mb-1"><i class="ti ti-alert-triangle text-warning me-2"></i>Escalate Query</h5>
            <p class="text-muted small mb-3">Admin will be notified that the support member is unavailable or not responding.</p>
            <div class="mb-3">
              <label class="form-label small fw-semibold">Reason <span class="text-muted fw-normal">(optional)</span></label>
              <textarea class="form-control form-control-sm" rows="3"
                bind:value={escalateNote}
                placeholder="e.g. No response for 2 days, tech seems unavailable"
                style="resize:vertical;"></textarea>
            </div>
            <div class="d-flex gap-2 justify-content-end">
              <button class="btn btn-secondary btn-sm" on:click={() => (showEscalateModal = false)}>Cancel</button>
              <button class="btn btn-warning btn-sm" on:click={submitEscalate} disabled={escalateLoading}>
                {escalateLoading ? "Escalating..." : "Escalate to Admin"}
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if showReopenModal}
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
          on:click|self={() => (showReopenModal = false)}>
          <div class="card shadow-lg p-4" style="max-width:480px;width:100%;position:relative;">
            <button style="position:absolute;top:0.6rem;right:0.75rem;background:none;border:none;font-size:1.2rem;color:#6c757d;cursor:pointer;"
              on:click={() => (showReopenModal = false)}>
              <i class="ti ti-x"></i>
            </button>
            <h5 class="fw-bold mb-1">Reopen Query</h5>
            <p class="text-muted small mb-3">Choose how you want to reopen this query.</p>

            {#if reopenError}
              <div class="alert alert-danger py-2 small">{reopenError}</div>
            {/if}

            <!-- Reopen type selection -->
            <div class="d-flex gap-2 mb-3">
              <button type="button"
                class="btn btn-sm flex-fill {reopenType === 'same' ? 'btn-warning' : 'btn-outline-secondary'}"
                on:click={() => { reopenType = 'same'; reopenNote = ''; reopenError = ''; }}>
                <i class="ti ti-user-check me-1"></i> Same Support Member
              </button>
              <button type="button"
                class="btn btn-sm flex-fill {reopenType === 'other' ? 'btn-danger' : 'btn-outline-secondary'}"
                on:click={() => { reopenType = 'other'; reopenError = ''; }}>
                <i class="ti ti-user-plus me-1"></i> Other Support Member
              </button>
            </div>

            <!-- Description of choice -->
            {#if reopenType === 'same'}
              <div class="alert alert-warning py-2 small mb-3">
                <i class="ti ti-info-circle me-1"></i>
                The same support member will be notified to continue working on this query.
              </div>
            {:else}
              <div class="alert alert-danger py-2 small mb-2">
                <i class="ti ti-info-circle me-1"></i>
                The query will go back to the open queue for a new support member to pick up.
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold">Reason <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" rows="3"
                  bind:value={reopenNote}
                  placeholder="Why is a different support member needed? (e.g. original member on leave)"
                  style="resize:vertical;"></textarea>
              </div>
            {/if}

            <div class="d-flex gap-2 justify-content-end">
              <button class="btn btn-secondary btn-sm" on:click={() => (showReopenModal = false)}>Cancel</button>
              <button class="btn {reopenType === 'same' ? 'btn-warning' : 'btn-danger'} btn-sm"
                on:click={submitReopen} disabled={actionLoading}>
                {actionLoading ? "Reopening..." : "Reopen Query"}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- ── Pending-files preview modal (slider) ─────────────────────────── -->
      {#if pendingFiles.length > 0}
        {@const totalAllowed = Math.max(0, 5 - attachedFiles.length)}
        {@const cur = pendingFiles[pendingIndex]}
        {@const curAllowed = pendingIndex < totalAllowed}
        <div class="pf-backdrop" on:click={cancelPending} role="dialog" aria-modal="true" aria-label="Preview files">
          <div class="pf-card" on:click|stopPropagation role="document">

            <!-- header -->
            <div class="pf-header">
              <i class="ti ti-photo-check" style="color:#3b5bdb;font-size:15px;"></i>
              <span>Preview Files</span>
              <span class="pf-index">{pendingIndex + 1} / {pendingFiles.length}</span>
              <button class="pf-close" on:click={cancelPending} title="Discard"><i class="ti ti-x"></i></button>
            </div>

            <!-- over-limit warning -->
            {#if pendingFiles.length > totalAllowed}
              <div class="pf-warn">
                <i class="ti ti-alert-triangle"></i>
                Only {totalAllowed} of {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} can be added (5-file limit). Dimmed items will be skipped.
              </div>
            {/if}

            <!-- main stage -->
            <div class="pf-stage">
              {#if pendingIndex > 0}
                <button class="pf-arrow pf-arrow--left" on:click={prevPending} title="Previous">
                  <i class="ti ti-chevron-left"></i>
                </button>
              {/if}

              <div class="pf-preview" class:pf-preview--overlimit={!curAllowed}>
                {#if cur?.type.startsWith('image/')}
                  <img src={getPreviewUrl(cur)} alt={cur.name} class="pf-stage-img" />
                {:else}
                  <div
                    class="pf-stage-file"
                    role="button"
                    tabindex="0"
                    title="Click to open file"
                    on:click={() => window.open(getPreviewUrl(cur), '_blank', 'noopener,noreferrer')}
                    on:keydown={(e) => e.key === 'Enter' && window.open(getPreviewUrl(cur), '_blank', 'noopener,noreferrer')}
                  >
                    <i class="ti ti-file-description pf-stage-file-icon"></i>
                    <span class="pf-stage-ext">.{cur?.name.split('.').pop()?.toLowerCase() ?? 'file'}</span>
                    <span class="pf-stage-open-hint"><i class="ti ti-external-link"></i> Click to open</span>
                  </div>
                {/if}

                {#if curAllowed}
                  <button class="pf-stage-remove" on:click={() => removePendingFile(pendingIndex)}>
                    <i class="ti ti-trash"></i> Remove
                  </button>
                {:else}
                  <div class="pf-overlimit-badge"><i class="ti ti-ban"></i> Over limit</div>
                {/if}
              </div>

              {#if pendingIndex < pendingFiles.length - 1}
                <button class="pf-arrow pf-arrow--right" on:click={nextPending} title="Next">
                  <i class="ti ti-chevron-right"></i>
                </button>
              {/if}
            </div>

            <!-- filename -->
            <div class="pf-stage-name" title={cur?.name}>{cur?.name}</div>

            <!-- thumbnail strip -->
            <div class="pf-strip">
              {#each pendingFiles as file, i}
                <button
                  class="pf-thumb"
                  class:pf-thumb--active={i === pendingIndex}
                  class:pf-thumb--overlimit={i >= totalAllowed}
                  on:click={() => jumpPending(i)}
                  title={file.name}
                >
                  {#if file.type.startsWith('image/')}
                    <img src={getPreviewUrl(file)} alt={file.name} class="pf-thumb-img" />
                  {:else}
                    <i class="ti ti-file-description pf-thumb-icon"></i>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- footer -->
            <div class="pf-footer">
              <button class="pf-btn-cancel" on:click={cancelPending}>Discard</button>
              <button class="pf-btn-confirm" on:click={confirmPendingFiles} disabled={attachedFiles.length >= 5}>
                <i class="ti ti-check"></i>
                Add {Math.min(pendingFiles.length, totalAllowed)} file{Math.min(pendingFiles.length, totalAllowed) !== 1 ? 's' : ''}
              </button>
            </div>

          </div>
        </div>
      {/if}

      <div class="row g-4">
        <!-- Left: query info + actions -->
        <div class="col-lg-3 query-left-col">
          {#if query.order}
            {@const canSeeFullOrder = (currentUser?.role === 'admin' || currentUser?.role === 'master') || (currentUser?.orderAccess && !isTech(currentUser) && !isTechHelper(currentUser))}
            {#if canSeeFullOrder}
              <div class="card border-0 shadow-sm mb-3">
                <div class="card-header py-2 d-flex align-items-center gap-2">
                  <i class="ti ti-receipt text-primary"></i>
                  <span class="fw-semibold small">Current Linked Order</span>
                  <button class="btn btn-sm btn-outline-primary ms-auto py-0 px-2" style="font-size:11px;" on:click={() => openOrderDrawer(query.order.id)}>
                    <i class="ti ti-external-link me-1"></i>View
                  </button>
                </div>
                <div class="card-body py-2 px-3 small">
                  <div class="fw-semibold text-dark d-flex align-items-center justify-content-between gap-2">
                    <span>{query.order.title ?? "-"} <b>#{query.order.pId}</b></span>
                    <span class="badge bg-secondary" style="font-size:10px;white-space:nowrap;">{$statusNamesStore[query.order.status]?.name ?? query.order.status}</span>
                  </div>
                </div>
              </div>
            {:else if ['Deal Won', 'Dispatched', 'Completed'].includes(query.order.status)}
              <div class="card border-0 shadow-sm mb-3">
                <div class="card-body py-2 px-3 small d-flex align-items-center justify-content-between">
                  <span class="text-muted">Order Status</span>
                  <span class="badge bg-success">🏆 Deal Won</span>
                </div>
              </div>
            {/if}
          {/if}
          <div class="qd-card mb-3">
            <!-- ── Switching shimmer bar (always rendered, animated when switching) ── -->
            <div class="switch-bar" class:switch-bar--active={switching}></div>

            <!-- ── Card label ── -->
            <div class="qd-card-label d-flex align-items-center gap-2">
              <button class="btn btn-sm btn-warning py-0 px-1" on:click={() => history.back()} title="Back">
                <i class="ti ti-arrow-left"></i>
              </button>
              <span><i class="ti ti-message-circle"></i>Query Detail</span>
            </div>

            <!-- ── Header: subject + status ── -->
            <div class="qd-header" class:qd-header--collapsed={qdCardCollapsed} style="cursor:pointer;" on:click={() => qdCardCollapsed = !qdCardCollapsed} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && (qdCardCollapsed = !qdCardCollapsed)}>
              <div class="qd-subject-wrap">
                {#if query.ticketCode}
                  <span class="qd-ticket-badge">{query.ticketCode}</span>
                {/if}
                <h6 class="qd-subject" title={query.subject}>{query.subject}</h6>
                <span class="badge {STATUS_COLORS[query.status] ?? 'bg-secondary'} qd-status-badge flex-shrink-0">
                  {query.status?.replace("_", " ")}
                </span>
              </div>
              <button class="qd-collapse-btn" tabindex="-1">
                <i class="ti {qdCardCollapsed ? 'ti-chevron-down' : 'ti-chevron-up'}"></i>
              </button>
            </div>

            {#if !qdCardCollapsed}
            <div transition:slide={{ duration: 250 }}>

            <!-- ── Requirement ── -->
            <div class="qd-description">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <div class="qd-meta-label"><i class="ti ti-notes"></i> Requirement</div>
                {#if !editingRequirement}
                  <button class="btn btn-xs btn-outline-dark py-0 px-1" style="font-size:11px;" on:click={startEditRequirement}>
                    <i class="ti ti-edit"></i> Edit
                  </button>
                {/if}
              </div>
              {#if editingRequirement}
                <textarea
                  class="form-control form-control-sm mb-2"
                  rows="4"
                  bind:value={requirementDraft}
                  disabled={savingRequirement}
                  placeholder="Describe your requirement in detail..."
                ></textarea>
                <div class="d-flex gap-2">
                  <button class="btn btn-primary btn-sm" style="line-height:1.5;" on:click={saveRequirement} disabled={savingRequirement}>{savingRequirement ? "Saving..." : "Save"}</button>
                  <button class="btn btn-outline-dark btn-sm" on:click={cancelEditRequirement} disabled={savingRequirement}>Cancel</button>
                </div>
              {:else}
                <div style="white-space:pre-wrap;">{query.description || "—"}</div>
              {/if}
            </div>

            <!-- ── Tags: type + priority ── -->
            <div class="qd-tags">
              <span class="qd-tag qd-tag--type">
                <i class="ti ti-tag"></i>
                {QUERY_TYPES.find(t => t.value === query.type)?.label ?? query.type ?? "Other"}
              </span>
              <span class="qd-tag qd-tag--priority qd-tag--{query.priority ?? 'medium'}">
                <i class="ti ti-flag"></i>
                {query.priority ?? "medium"}
              </span>
            </div>

            <!-- ── Reopened alert ── -->
            {#if isTelecaller(currentUser) && query.status === "reopened"}
              <div class="qd-alert">
                <i class="ti ti-clock-pause"></i>
                <span>Your query has been reopened. Waiting for the support team to pick it up.</span>
              </div>
            {/if}

            <!-- ── Meta info ── -->
            <div class="qd-meta">
              <div class="qd-meta-row">
                <span class="qd-meta-label"><i class="ti ti-calendar"></i> Raised</span>
                <span class="qd-meta-value">{formatDate(query.createdAt)}</span>
              </div>
              {#if query.resolvedAt}
                <div class="qd-meta-row">
                  <span class="qd-meta-label"><i class="ti ti-circle-check"></i> Resolved</span>
                  <span class="qd-meta-value">{formatDate(query.resolvedAt)}</span>
                </div>
              {/if}
              {#if isMasterView(currentUser)}
                <div class="qd-meta-row">
                  <span class="qd-meta-label"><i class="ti ti-user"></i> Raised by</span>
                  <span class="qd-meta-value">{maskTC(query.raisedBy?.name)}</span>
                </div>
                <div class="qd-meta-row">
                  <span class="qd-meta-label"><i class="ti ti-user-check"></i> Assigned</span>
                  <span class="qd-meta-value">{query.assignedTo ? maskTech(query.assignedTo.name) : "Unassigned"}</span>
                </div>
              {/if}
            </div>

            <!-- ── Actions ── -->
            {#if
              (isTech(currentUser) && (query.status === "open" || query.status === "reopened" || (query.status === "in_progress" && query.assignedToId === currentUser?.id))) ||
              (isTechHelper(currentUser) && (query.status === "open" || (query.status === "in_progress" && query.assignedToId === currentUser?.id))) ||
              (isTelecaller(currentUser) && (["open", "in_progress", "reopened", "resolved"].includes(query.status) && Number(query.raisedById) === Number(currentUser?.id))) ||
              (isMasterView(currentUser) && query.status !== "closed")
            }
              <div class="qd-actions">
                {#if isTech(currentUser)}
                  {#if query.status === "open" || query.status === "reopened"}
                    <button class="qd-btn qd-btn--warning" on:click={pickUp} disabled={actionLoading}>
                      <i class="ti ti-hand-stop"></i> Pick Up Query
                    </button>
                  {/if}
                  {#if query.status === "in_progress" && query.assignedToId === currentUser?.id}
                    {#if hasOpenSubQueries && !isSubQuery}
                      <div class="qd-sub-block-notice">
                        <i class="ti ti-alert-triangle"></i>
                        {subQueries.filter(s => ["open","in_progress","reopened"].includes(s.status)).length} quer{subQueries.filter(s => ["open","in_progress","reopened"].includes(s.status)).length === 1 ? 'y' : 'ies'} still open — resolve them first.
                      </div>
                    {/if}
                    <button class="qd-btn qd-btn--success" on:click={markResolved} disabled={actionLoading || (hasOpenSubQueries && !isSubQuery)}>
                      <i class="ti ti-circle-check"></i> Mark as Resolved
                    </button>
                  {/if}
                {/if}
                {#if isTechHelper(currentUser)}
                  {#if query.status === "open"}
                    <button class="qd-btn qd-btn--warning" on:click={pickUp} disabled={actionLoading}>
                      <i class="ti ti-hand-stop"></i> Pick Up Query
                    </button>
                  {/if}
                  {#if query.status === "in_progress" && query.assignedToId === currentUser?.id}
                    <button class="qd-btn qd-btn--success" on:click={markResolved} disabled={actionLoading}>
                      <i class="ti ti-circle-check"></i> Mark as Resolved
                    </button>
                  {/if}
                {/if}
                {#if isTelecaller(currentUser)}
                  {#if ["open", "in_progress", "reopened"].includes(query.status) && Number(query.raisedById) === Number(currentUser?.id)}
                    <button class="qd-btn qd-btn--danger-outline" on:click={closeQuery} disabled={actionLoading}>
                      <i class="ti ti-lock"></i> Close Query
                    </button>
                  {/if}
                  {#if query.status === "in_progress" && Number(query.raisedById) === Number(currentUser?.id)}
                    <button class="qd-btn qd-btn--warning" on:click={() => { escalateNote = ""; showEscalateModal = true; }} disabled={actionLoading}>
                      <i class="ti ti-alert-triangle"></i> Escalate
                    </button>
                  {/if}
                  {#if query.status === "resolved"}
                    {#if query.assignedToId}
                      <button class="qd-btn qd-btn--success" on:click={acceptSolution} disabled={actionLoading}>
                        <i class="ti ti-thumb-up"></i> Accept Solution
                      </button>
                    {/if}
                    <button class="qd-btn qd-btn--danger-outline" on:click={openReopenModal} disabled={actionLoading}>
                      <i class="ti ti-refresh"></i> Reopen Query
                    </button>
                  {/if}
                {/if}
                {#if isMasterView(currentUser) && query.status !== "closed"}
                  {#if query.status === "in_progress"}
                    <button class="qd-btn qd-btn--danger-outline" on:click={forceRelease} disabled={actionLoading}>
                      <i class="ti ti-player-eject"></i> Force Release
                    </button>
                  {/if}
                  <button class="qd-btn qd-btn--danger-outline" on:click={closeQuery} disabled={actionLoading}>
                    <i class="ti ti-lock"></i> Close Query
                  </button>
                {/if}
              </div>
            {/if}
            </div><!-- end slide wrapper -->
            {/if}<!-- end qdCardCollapsed -->

          </div>

          <!-- Sub-queries list modal -->
          {#if showSubQueriesModal}
            <div class="modal-backdrop-custom" on:click={() => showSubQueriesModal = false} role="dialog" aria-modal="true">
              <div class="card shadow-lg p-4 position-relative" style="max-width:480px;width:100%;" on:click|stopPropagation>
                <button class="modal-close-btn" on:click={() => showSubQueriesModal = false} aria-label="Close"><i class="ti ti-x"></i></button>
                <h5 class="fw-bold mb-3">
                  <i class="ti ti-subtask me-2 text-primary"></i>{sqWordPlural}
                  {#if subQueries.length > 0}
                    <span class="badge {hasOpenSubQueries ? 'bg-warning text-dark' : 'bg-success'} ms-1" style="font-size:12px;">{subQueries.length}</span>
                  {/if}
                </h5>
                {#if subQueriesLoading}
                  <div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span></div>
                {:else if subQueries.length === 0}
                  <div class="text-center py-3 text-muted">
                    <i class="ti ti-inbox fs-4 d-block mb-1"></i>No sub-queries yet.
                  </div>
                {:else}
                  <table class="table table-hover align-middle mb-0 sq-modal-table">
                    <thead class="table-light">
                      <tr>
                        <th class="sq-modal-th-sr">#</th>
                        <th>Title</th>
                        <th class="sq-modal-th-status">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each subQueries as sq, i}
                        <tr>
                          <td class="sq-modal-td-sr">{i + 1}</td>
                          <td>
                            {#if isTech(currentUser) || isMasterView(currentUser)}
                              <button type="button" class="sq-modal-subject-btn" on:click={() => openSubQueryInline(sq)}>{sq.subject}</button>
                            {:else}
                              <span class="sq-modal-subject-plain">{sq.subject}</span>
                            {/if}
                            {#if ($queryUnreadCounts[sq.id] ?? 0) > 0}
                              <span class="badge bg-danger ms-1" style="font-size:10px;vertical-align:middle;">{$queryUnreadCounts[sq.id]}</span>
                            {/if}
                            <div class="mt-1">
                              <span class="badge bg-light text-dark border sq-modal-type">{subTypeLabel(sq.type)}</span>
                            </div>
                          </td>
                          <td class="sq-modal-td-status">
                            <span class="badge {sq.status === 'resolved' || sq.status === 'closed' ? 'bg-success' : sq.status === 'in_progress' ? 'bg-warning text-dark' : 'bg-primary'} sq-modal-status">
                              {sq.status?.replace("_"," ")}
                            </span>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Sub-query creation modal -->
          {#if showSubQueryModal}
            <div class="modal-backdrop-custom" on:click={() => showSubQueryModal = false} role="dialog" aria-modal="true">
              <div class="card shadow-lg p-4 position-relative" style="max-width:500px;width:100%;" on:click|stopPropagation role="document">
                <button class="modal-close-btn" on:click={() => showSubQueryModal = false} aria-label="Close">
                  <i class="ti ti-x"></i>
                </button>
                <h5 class="fw-bold mb-3"><i class="ti ti-subtask me-2 text-primary"></i>Raise Query</h5>
                <div class="mb-3">
                  <label class="form-label">Subject <span class="text-danger">*</span></label>
                  <input class="form-control" type="text" placeholder="Brief subject…" bind:value={sqSubject} maxlength="120" />
                </div>
                <div class="mb-3">
                  <label class="form-label">Type</label>
                  <div class="d-flex flex-wrap gap-2">
                    {#each SUB_QUERY_TYPES as t}
                      <button type="button"
                        class="badge-tab {sqType === t.value ? 'badge-tab--type-active' : ''}"
                        on:click={() => sqType = t.value}
                      >{t.label}</button>
                    {/each}
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Priority</label>
                  <div class="d-flex flex-wrap gap-2">
                    {#each ['low','medium','high'] as p}
                      <button type="button"
                        class="badge-tab badge-tab--priority-{p} {sqPriority === p ? 'badge-tab--active' : ''}"
                        on:click={() => sqPriority = p}
                      >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                    {/each}
                  </div>
                </div>
                <div class="d-flex gap-2 justify-content-end">
                  <button class="btn btn-secondary btn-sm" on:click={() => showSubQueryModal = false}>Cancel</button>
                  <button class="btn btn-warning btn-sm" on:click={submitSubQuery} disabled={sqSending || !sqSubject.trim()}>
                    {#if sqSending}<span class="spinner-border spinner-border-sm me-1" style="width:12px;height:12px;border-width:1.5px;"></span>{:else}<i class="ti ti-send me-1"></i>{/if}
                    Raise Query
                  </button>
                </div>
              </div>
            </div>
          {/if}

          {#if showExportModal}
            <div class="modal-backdrop-custom" on:click={() => showExportModal = false} role="dialog" aria-modal="true">
              <div class="card shadow-lg p-4 position-relative" style="max-width:420px;width:100%;" on:click|stopPropagation role="document">
                <button class="modal-close-btn" on:click={() => showExportModal = false} aria-label="Close"><i class="ti ti-x"></i></button>
                <h5 class="fw-bold mb-3"><i class="ti ti-file-type-pdf me-2 text-danger"></i>Export Chat as PDF</h5>
                <div class="mb-3">
                  <label class="form-label">Date Range</label>
                  <select class="form-select" bind:value={exportRangePreset}>
                    <option value="all">All Messages</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7">Last 7 Days</option>
                    <option value="last30">Last 30 Days</option>
                    <option value="thismonth">This Month</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                {#if exportRangePreset === "custom"}
                  <div class="mb-3">
                    <label class="form-label">From Date</label>
                    <input type="date" class="form-control" bind:value={exportFromDate} />
                  </div>
                  <div class="mb-3">
                    <label class="form-label">To Date</label>
                    <input type="date" class="form-control" bind:value={exportToDate} />
                  </div>
                {/if}
                <p class="text-muted small mb-3"><i class="ti ti-info-circle me-1"></i>{exportPreviewCount} message{exportPreviewCount !== 1 ? "s" : ""} will be exported</p>
                <div class="d-flex gap-2 justify-content-end">
                  <button class="btn btn-secondary btn-sm" on:click={() => showExportModal = false}>Cancel</button>
                  <button class="btn btn-danger btn-sm" on:click={exportChatPdf} disabled={exportLoading}>
                    {#if exportLoading}<span class="spinner-border spinner-border-sm me-1" style="width:12px;height:12px;border-width:1.5px;"></span>{:else}<i class="ti ti-download me-1"></i>{/if}
                    Export PDF
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- In-progress list — inside left column, below detail card -->
          {#if inProgressLoading}
            <div class="card border-0 shadow-sm p-3 text-center">
              <span class="spinner-border spinner-border-sm text-primary"></span>
            </div>
          {:else}
            <div class="card border-0 shadow-sm ip-card">
              <div class="card-header py-2 px-3 d-flex align-items-center gap-2">
                <i class="ti ti-loader text-warning"></i>
                <span class="fw-semibold small">In Progress</span>
                <span class="badge bg-warning text-dark ms-1">{effectiveInProgressTotal || 0}</span>
                <button class="ip-view-all-btn ms-auto" on:click={openAllQueriesPanel}>View all →</button>
              </div>
              <div class="px-3 pt-2 pb-1">
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-white border-end-0"><i class="ti ti-search text-muted" style="font-size:13px;"></i></span>
                  <input
                    type="text"
                    class="form-control border-start-0 ps-0"
                    placeholder="Search queries..."
                    style="font-size:12px;"
                    value={inProgressSearch}
                    on:input={(e) => handleInProgressSearch(e.target.value)}
                  />
                  {#if inProgressSearch}
                    <button class="input-group-text bg-white border-start-0" style="cursor:pointer;" on:click={() => handleInProgressSearch("")}>
                      <i class="ti ti-x text-muted" style="font-size:12px;"></i>
                    </button>
                  {/if}
                </div>
                <!-- Date filter pills + field selector in one row -->
                <div class="d-flex align-items-center gap-1 mt-2 flex-wrap">
                  <div class="ip-date-filters flex-grow-1">
                    {#each [["all","All"],["today","Today"],["yesterday","Yest."],["7days","7D"],["30days","30D"],["custom","Custom"]] as [val, label]}
                      <button
                        class="ip-date-pill {inProgressDateFilter === val ? 'active' : ''}"
                        on:click={() => setDateFilter(val)}
                      >{label}</button>
                    {/each}
                  </div>
                  <select
                    class="ip-field-select"
                    bind:value={inProgressDateField}
                    on:change={() => { if (inProgressDateFilter !== "all") loadInProgress(true, true); }}
                  >
                    <option value="createdAt">Created</option>
                    <option value="lastActivityAt">Last Activity</option>
                    <option value="updatedAt">Updated</option>
                  </select>
                </div>
                {#if inProgressDateFilter === "custom"}
                  <div class="d-flex gap-1 mt-1">
                    <input type="date" class="form-control form-control-sm" style="font-size:11px;" bind:value={inProgressCustomFrom}
                      on:change={() => { if (inProgressCustomFrom && inProgressCustomTo) loadInProgress(true, true); }} />
                    <input type="date" class="form-control form-control-sm" style="font-size:11px;" bind:value={inProgressCustomTo}
                      on:change={() => { if (inProgressCustomFrom && inProgressCustomTo) loadInProgress(true, true); }} />
                  </div>
                {/if}
              </div>
              <div class="card-body p-0 ip-list-body" on:scroll={handleInProgressScroll}>
                {#if inProgressFiltering}
                  <div class="d-flex align-items-center justify-content-center" style="height:120px;">
                    <span class="spinner-border spinner-border-sm text-primary"></span>
                  </div>
                {:else}
                {#each sortedInProgressList as q}
                  {@const unread = $queryUnreadCounts[q.id] ?? 0}
                  {@const isTypingHere = typingQueries.has(q.id)}
                  {@const isCurrent = Number(queryId) === q.id}
                  {@const typeLabel = QUERY_TYPES.find(t => t.value === q.type)?.label ?? q.type ?? "Other"}
                  <div
                    class="in-progress-row {isCurrent ? 'in-progress-row--active' : ''}"
                    role="button"
                    tabindex="0"
                    on:click={() => selectQuery(q.id)}
                    on:keydown={(e) => e.key === 'Enter' && selectQuery(q.id)}
                  >
                    <!-- circle icon with priority dot -->
                    <div class="ip-avatar-wrap">
                      <div class="ip-avatar {isCurrent ? 'ip-avatar--active' : ''}">
                        <i class="ti ti-message-circle"></i>
                      </div>
                      <span class="ip-priority-dot ip-priority-dot--{q.priority ?? 'medium'}"></span>
                    </div>

                    <!-- subject + sub-line -->
                    <div class="ip-body">
                      <div class="ip-subject-row">
                        <span class="ip-subject">{q.subject}</span>
                        {#if q.lastActivityAt}
                          <span class="ip-time" title="Last activity">{timeAgo(q.lastActivityAt)}</span>
                        {/if}
                      </div>
                      <span class="ip-sub {isTypingHere ? 'ip-sub--typing' : ''}">
                        {#if isTypingHere}
                          <i class="ti ti-pencil" style="font-size:10px;"></i> typing…
                        {:else if q.lastMessage}
                          {q.lastMessage.length > 42 ? q.lastMessage.slice(0, 42).trimEnd() + '…' : q.lastMessage}
                        {:else}
                          {typeLabel}
                        {/if}
                      </span>
                      {#if q.createdAt}
                        <span class="ip-raised">
                          <i class="ti ti-calendar" style="font-size:9px;"></i> {formatDateTime(q.createdAt)}
                        </span>
                      {/if}
                      {#if isMasterView(currentUser)}
                        <span class="ip-meta">
                          {#if q.raisedBy?.name}<i class="ti ti-user" style="font-size:9px;"></i> {maskTC(q.raisedBy.name)}{/if}{#if q.assignedTo?.name}&nbsp;·&nbsp;<i class="ti ti-user-check" style="font-size:9px;"></i> {maskTech(q.assignedTo.name)}{/if}
                        </span>
                      {/if}
                    </div>

                    <!-- unread count — all users -->
                    {#if unread > 0}
                      <span class="in-progress-unread">{unread > 99 ? "99+" : unread}</span>
                    {/if}
                  </div>
                {/each}
                {#if sortedInProgressList.length === 0 && !inProgressLoadingMore && !inProgressFiltering}
                  <div class="text-center text-muted py-4 small">
                    <i class="ti ti-inbox d-block mb-1" style="font-size:22px;"></i>
                    No queries found
                  </div>
                {/if}
                {#if inProgressLoadingMore}
                  <div class="ip-loading-more">
                    <span class="spinner-border spinner-border-sm text-warning" style="width:14px;height:14px;border-width:2px;"></span>
                  </div>
                {:else if inProgressList.length > 0 && inProgressList.length >= effectiveInProgressTotal && effectiveInProgressTotal > IN_PROGRESS_LIMIT}
                  <div class="ip-all-loaded">All caught up</div>
                {/if}
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Right: chat (shrinks when right panel stack is open) -->
        <div class="{rightPanelStack.length > 0 ? 'col-lg-5' : 'col-lg-9'}"
          style="transition: all 0.2s ease;">
          <div class="chat-card d-flex flex-column">
            <!-- Switching shimmer bar (always rendered, animated when switching) -->
            <div class="switch-bar switch-bar--chat" class:switch-bar--active={switching}></div>

            <!-- Chat header -->
            <div class="chat-header d-flex align-items-center gap-3 px-4 py-3">
              <div class="chat-avatar chat-avatar--support">
                <i class="ti ti-headset"></i>
              </div>
              <div class="flex-grow-1">
                <div class="fw-semibold">Discussion Thread</div>
                {#if otherTyping}
                  <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="ms-1">{typingLabel()}</span>
                  </div>
                {:else}
                  <div class="small text-muted">{chats.length} message{chats.length !== 1 ? "s" : ""}</div>
                {/if}
              </div>
              {#if !isSubQuery && (isTech(currentUser) || isMasterView(currentUser))}
                <button
                  class="btn btn-sm btn-outline-secondary sq-list-btn"
                  on:click={() => showSubQueriesModal = true}
                >
                  <i class="ti ti-layout-list me-1"></i>{sqWordPlural}
                  {#if subQueriesLoading}
                    <span class="spinner-border spinner-border-sm ms-1" style="width:10px;height:10px;border-width:1.5px;"></span>
                  {:else if subQueries.length > 0}
                    <span class="badge {hasOpenSubQueries ? 'bg-warning text-dark' : 'bg-success'} ms-1" style="font-size:10px;">{subQueries.length}</span>
                  {/if}
                </button>
              {/if}
              {#if canRaiseSubQuery()}
                <button class="btn btn-sm btn-outline-warning" on:click={() => showSubQueryModal = true}>
                  <i class="ti ti-plus me-1"></i>Query
                </button>
              {/if}
              {#if currentUser?.role === 'admin' || currentUser?.role === 'master'}
                <button class="btn btn-sm btn-outline-secondary" on:click={() => { exportRangePreset = 'all'; exportFromDate = ''; exportToDate = ''; showExportModal = true; }} title="Export Chat as PDF">
                  <i class="ti ti-file-type-pdf"></i>
                </button>
              {/if}
              <span class="badge {query.status === 'resolved' ? 'bg-success' : query.status === 'closed' ? 'bg-secondary' : query.status === 'in_progress' ? 'bg-warning text-dark' : 'bg-primary'} chat-status-badge">
                {query.status?.replace("_", " ")}
              </span>
            </div>

            <!-- Policy notice -->
            <div class="chat-policy-notice">
              <i class="ti ti-shield-lock chat-policy-icon"></i>
              <div class="chat-policy-marquee-wrap">
                <span class="chat-policy-marquee-text">
                  Sharing personal contact information (name, mobile, email, address, etc.) is not allowed in Query Chat. Violations may lead to account suspension or termination.
                </span>
              </div>
            </div>

            <!-- Messages -->
            <div class="chat-messages-wrap"
              on:dragenter={handleDragEnter}
              on:dragleave={handleDragLeave}
              on:dragover={handleDragOver}
              on:drop={handleDrop}
            >
            {#if isDragOver}
              <div class="drag-overlay" aria-hidden="true">
                <div class="drag-overlay-content">
                  <i class="ti ti-upload"></i>
                  <span>Drop files here</span>
                </div>
              </div>
            {/if}
            <div bind:this={chatContainer} class="chat-messages flex-grow-1 overflow-auto px-4 py-3" style="flex:1 1 0;min-height:0;" on:scroll={handleChatScroll}>
              <!-- Load older messages (WhatsApp style) -->
              {#if hasMoreOlderChats || loadingOlder}
                <div class="text-center py-2">
                  {#if loadingOlder}
                    <span class="text-xs text-muted">
                      <i class="ti ti-loader animate-spin me-1"></i>Loading older messages...
                    </span>
                  {:else}
                    <button
                      class="btn btn-sm btn-outline-secondary px-3 py-1 text-xs"
                      on:click={loadOlderChats}
                    >
                      <i class="ti ti-chevron-up me-1"></i>Load older messages
                    </button>
                  {/if}
                </div>
              {/if}
              {#if chats.length === 0}
                <div class="chat-empty">
                  <i class="ti ti-messages-off"></i>
                  <p>No messages yet. Start the discussion.</p>
                </div>
              {/if}
              {#each chats as chat}
              {#if chat.subQueryEvent}
                <!-- Query system event card -->
                <!-- Telecaller + Tech: only 'created' event shown (single card, live status). Master: all events. -->
                {#if (!isTelecaller(currentUser) && !isTech(currentUser)) || chat.subQueryEvent.eventType === 'created'}
                {@const _sqClickable = !isTelecaller(currentUser) && chat.subQueryEvent.subQueryId > 0}

                {#if (isTelecaller(currentUser) || isTech(currentUser)) && chat.subQueryEvent.subQueryId > 0}
                  <!-- Single live card: icon/title/status all reflect current live status -->
                  {@const liveSubQuery = subQueries.find(s => s.id === chat.subQueryEvent.subQueryId)}
                  {@const liveStatus = liveSubQuery?.status ?? chat.subQueryEvent.status}
                  <div
                    class="sq-event-card {_sqClickable ? 'sq-event-card--clickable' : ''}"
                    role={_sqClickable ? 'button' : undefined}
                    tabindex={_sqClickable ? 0 : undefined}
                    on:click={_sqClickable ? () => openSubQueryInline({ id: chat.subQueryEvent.subQueryId, type: chat.subQueryEvent.type, status: liveStatus }) : undefined}
                    on:keydown={_sqClickable ? (e) => e.key === 'Enter' && openSubQueryInline({ id: chat.subQueryEvent.subQueryId, type: chat.subQueryEvent.type, status: liveStatus }) : undefined}
                  >
                    {#if ($queryUnreadCounts[chat.subQueryEvent.subQueryId] ?? 0) > 0}
                      <span class="sq-event-unread">{$queryUnreadCounts[chat.subQueryEvent.subQueryId]}</span>
                    {/if}
                    <div class="sq-event-icon sq-event-icon--{liveStatus === 'in_progress' ? 'assigned' : liveStatus === 'resolved' ? 'resolved' : liveStatus === 'closed' ? 'closed' : 'created'}">
                      {#if liveStatus === 'in_progress'}<i class="ti ti-user-check"></i>
                      {:else if liveStatus === 'resolved'}<i class="ti ti-circle-check"></i>
                      {:else if liveStatus === 'closed'}<i class="ti ti-lock"></i>
                      {:else}<i class="ti ti-subtask"></i>{/if}
                    </div>
                    <div class="sq-event-body">
                      <span class="sq-event-title">
                        {#if isTelecaller(currentUser)}Query raised
                        {:else if liveStatus === 'in_progress'}{sqWord} picked up
                        {:else if liveStatus === 'resolved'}{sqWord} resolved
                        {:else if liveStatus === 'closed'}{sqWord} closed
                        {:else if liveStatus === 'reopened'}{sqWord} reopened
                        {:else}{sqWord} raised{/if}
                      </span>
                      <span class="sq-event-link">
                        {subTypeLabel(chat.subQueryEvent.type)} — <span class="sq-event-status sq-event-status--{liveStatus}">{liveStatus?.replace("_"," ")}</span>
                      </span>
                      <span class="sq-event-time">{formatDate(chat.createdAt)}</span>
                    </div>
                  </div>
                {:else}
                  <!-- Master (or no subQueryId): static card per event -->
                  <div
                    class="sq-event-card {_sqClickable ? 'sq-event-card--clickable' : ''}"
                    role={_sqClickable ? 'button' : undefined}
                    tabindex={_sqClickable ? 0 : undefined}
                    on:click={_sqClickable ? () => openSubQueryInline({ id: chat.subQueryEvent.subQueryId, type: chat.subQueryEvent.type, status: chat.subQueryEvent.status }) : undefined}
                    on:keydown={_sqClickable ? (e) => e.key === 'Enter' && openSubQueryInline({ id: chat.subQueryEvent.subQueryId, type: chat.subQueryEvent.type, status: chat.subQueryEvent.status }) : undefined}
                  >
                    <div class="sq-event-icon sq-event-icon--{chat.subQueryEvent.eventType}">
                      {#if chat.subQueryEvent.eventType === 'created'}<i class="ti ti-subtask"></i>
                      {:else if chat.subQueryEvent.eventType === 'assigned'}<i class="ti ti-user-check"></i>
                      {:else if chat.subQueryEvent.eventType === 'resolved'}<i class="ti ti-circle-check"></i>
                      {:else}<i class="ti ti-lock"></i>{/if}
                    </div>
                    <div class="sq-event-body">
                      <span class="sq-event-title">
                        {#if chat.subQueryEvent.eventType === 'created'}{sqWord} raised
                        {:else if chat.subQueryEvent.eventType === 'assigned'}{sqWord} picked up
                        {:else if chat.subQueryEvent.eventType === 'resolved'}{sqWord} resolved
                        {:else}{sqWord} closed{/if}
                      </span>
                      {#if chat.subQueryEvent.subQueryId > 0}
                        <span class="sq-event-link">
                          {subTypeLabel(chat.subQueryEvent.type)} — <span class="sq-event-status sq-event-status--{chat.subQueryEvent.status}">{chat.subQueryEvent.status?.replace("_"," ")}</span>
                        </span>
                      {/if}
                      <span class="sq-event-time">{formatDate(chat.createdAt)}</span>
                    </div>
                  </div>
                {/if}
                {/if}
              {:else if chat.systemEvent}
                <!-- System event: centered divider message -->
                <div class="chat-system-event chat-system-event--{chat.systemEvent.type}" id="chat-msg-{chat.id}">
                  <span class="chat-system-event__line"></span>
                  <span class="chat-system-event__text">
                    {#if chat.systemEvent.type === 'reopened_same'}
                      Query reopened — same support member will continue
                    {:else if chat.systemEvent.type === 'reopened_other'}
                      Query reopened and reassigned to a new support member
                    {:else if chat.systemEvent.type === 'escalated'}
                      <i class="ti ti-alert-triangle me-1"></i>Query escalated to admin
                    {:else if chat.systemEvent.type === 'force_released'}
                      <i class="ti ti-player-eject me-1"></i>Query force released by admin — returned to open queue
                    {/if}
                    {#if chat.systemEvent.note}
                      <span class="chat-system-event__note"> · {chat.systemEvent.note}</span>
                    {/if}
                    <span class="chat-system-event__time">{formatDate(chat.createdAt)}</span>
                  </span>
                  <span class="chat-system-event__line"></span>
                </div>
              {:else}
                <div class="chat-row" class:chat-row--own={chat.isOwn} class:chat-row--new={chat.isNew} id="chat-msg-{chat.id}">
                  {#if !chat.isOwn}
                    <div class="chat-avatar chat-avatar--sm chat-avatar--{chat.senderType ?? 'other'}">
                      {maskChatSender(chat).charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <div class="chat-bubble-wrap">
                  <div class="chat-bubble chat-bubble--{chat.senderType ?? (chat.isOwn ? 'own' : 'other')} {chat.isFinal ? 'chat-bubble--final' : ''} {chat.isNew ? 'chat-bubble--new' : ''}">
                    <!-- reply quote block -->
                    {#if chat.replyTo}
                      <div
                        class="chat-reply-quote chat-reply-quote--{chat.senderType ?? 'other'}"
                        role="button"
                        tabindex="0"
                        on:click={() => scrollToMessage(chat.replyTo.id)}
                        on:keydown={(e) => e.key === 'Enter' && scrollToMessage(chat.replyTo.id)}
                        title="Jump to original message"
                      >
                        <span class="chat-reply-quote-sender">{maskSenderLabel(chat.replyTo.senderLabel, chat.replyTo.senderType)}</span>
                        <span class="chat-reply-quote-text">
                          {#if chat.replyTo.message}
                            {chat.replyTo.message.length > 70 ? chat.replyTo.message.slice(0, 70).trimEnd() + '…' : chat.replyTo.message}
                          {:else}
                            📎 Attachment
                          {/if}
                        </span>
                      </div>
                    {/if}
                    <div class="chat-sender">{maskChatSender(chat)}</div>
                    {#if chat.message && !chat.isDeleted && editingChatId !== chat.id}
                      <button class="chat-copy-btn" title="Copy message" on:click|stopPropagation={() => copyMessage(chat)}>
                        <i class="ti {copiedChatId === chat.id ? 'ti-check' : 'ti-copy'}"></i>
                      </button>
                    {/if}
                    {#if chat.isDeleted}
                      <div class="chat-deleted-text">
                        <i class="ti ti-trash me-1"></i>This message was deleted
                      </div>
                      {#if currentUser?.role === 'master' && chat.message}
                        <div class="chat-deleted-original">{chat.message}</div>
                      {/if}
                    {:else if editingChatId === chat.id}
                      <!-- inline edit mode -->
                      <textarea
                        class="chat-edit-input"
                        bind:value={editingChatText}
                        rows="2"
                        on:keydown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditChat(chat.id); }
                          if (e.key === "Escape") cancelEditChat();
                        }}
                      ></textarea>
                      <div class="chat-edit-actions">
                        <button
                          class="chat-edit-save"
                          on:click={() => saveEditChat(chat.id)}
                          disabled={savingEdit || !editingChatText.trim()}
                        >
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button class="chat-edit-cancel" on:click={cancelEditChat}>Cancel</button>
                      </div>
                    {:else if chat.message}
                      {@const isLong = chat.message.length > CHAR_LIMIT}
                      {@const expanded = expandedMessages.has(chat.id)}
                      <div class="chat-text">
                        {#if isLong && !expanded}
                          {chat.message.slice(0, CHAR_LIMIT).trimEnd()}…
                        {:else}
                          {chat.message}
                        {/if}
                      </div>
                      {#if isLong}
                        <button
                          class="read-more-btn read-more-btn--{chat.senderType ?? (chat.isOwn ? 'own' : 'other')}"
                          on:click|stopPropagation={() => toggleExpand(chat.id)}
                        >
                          {#if expanded}
                            <i class="ti ti-chevron-up"></i> Show less
                          {:else}
                            <i class="ti ti-chevron-down"></i> Read more
                          {/if}
                        </button>
                      {/if}
                    {/if}
                    {#if chat.attachments?.length}
                      {@const imgs = chat.attachments.filter(a => isImage(a.mime))}
                      {@const files = chat.attachments.filter(a => !isImage(a.mime))}
                      {#if imgs.length}
                        {@const imgUrls = imgs.map(a => ATTACHMENT_BASE_URL + a.url)}
                        <div class="chat-attachments-grid" class:chat-attachments-grid--single={imgs.length === 1}>
                          {#each imgs as att, i}
                            <button
                              class="chat-attachment-img-btn"
                              draggable="true"
                              on:dragstart={(e) => {
                                e.dataTransfer.effectAllowed = 'copy';
                                e.dataTransfer.setData('application/x-chat-attachment', JSON.stringify({ url: att.url, name: att.name, mime: att.mime, source: 'query_chat' }));
                              }}
                              on:click={() => openImageLightbox(imgUrls, i)}
                              title="View {att.name}"
                            >
                              <img src="{ATTACHMENT_BASE_URL}{att.url}" alt={att.name} class="chat-attachment-img" />
                            </button>
                          {/each}
                        </div>
                      {/if}
                      {#if files.length}
                        <div class="chat-attachments-files">
                          {#each files as att}
                            <button
                              class="chat-attachment-file {chat.senderType === 'own' ? 'chat-attachment-file--own' : ''}"
                              draggable="true"
                              on:dragstart={(e) => {
                                e.dataTransfer.effectAllowed = 'copy';
                                e.dataTransfer.setData('application/x-chat-attachment', JSON.stringify({ url: att.url, name: att.name, mime: att.mime, source: 'query_chat' }));
                              }}
                              on:click={() => openAttachment(ATTACHMENT_BASE_URL + att.url, att.mime, att.name)}
                            >
                              <i class="ti ti-file-download me-1"></i>{att.name}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                    <div class="chat-time-row">
                      <span class="chat-time">{formatDate(chat.createdAt)}</span>
                      {#if chat.editedAt}
                        <span class="chat-edited-badge">edited</span>
                      {/if}
                      {#if chat.isFinal}
                        <span class="final-badge"><i class="ti ti-flag-check"></i> Final Quotation</span>
                      {/if}
                      {#if chat.isOwn}
                        <span class="chat-tick {chat.read ? 'chat-tick--read' : ''}" title="{chat.read ? 'Read' : 'Sent'}">
                          {#if chat.read}✓✓{:else}✓{/if}
                        </span>
                      {/if}
                    </div>
                  </div>
                  </div>
                  <!-- action buttons: flag → edit → delete → reply -->
                  <div class="chat-action-btns">
                    {#if canSetFinalFlag() && !chat.isDeleted}
                      <button
                        class="final-flag-btn {chat.isFinal ? 'final-flag-btn--active' : ''}"
                        title="{chat.isFinal ? 'Remove final flag' : 'Mark as Final Quotation'}"
                        disabled={settingFinalFlag === chat.id}
                        on:click={() => toggleFinalFlag(chat)}
                      >
                        {#if settingFinalFlag === chat.id}
                          <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;border-width:1.5px;"></span>
                        {:else}
                          <i class="ti ti-flag"></i>
                        {/if}
                      </button>
                    {/if}
                    {#if canEditChat(chat) && editingChatId !== chat.id && !chat.isDeleted}
                      <button
                        class="chat-edit-btn"
                        title="Edit message (within 30 min)"
                        on:click={() => startEditChat(chat)}
                      >
                        <i class="ti ti-pencil"></i>
                      </button>
                    {/if}
                    {#if canDeleteChat(chat)}
                      <button
                        class="chat-delete-btn"
                        title="Delete message"
                        disabled={deletingChatId === chat.id}
                        on:click={() => deleteChat(chat)}
                      >
                        {#if deletingChatId === chat.id}
                          <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;border-width:1.5px;"></span>
                        {:else}
                          <i class="ti ti-trash"></i>
                        {/if}
                      </button>
                    {/if}
                    {#if canSendChat() && !chat.isDeleted}
                      <button
                        class="chat-reply-btn"
                        title="Reply"
                        on:click={() => setReply(chat)}
                      >
                        <i class="ti ti-corner-up-left"></i>
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
              {/each}
            </div>
            {#if showNewMsgBanner}
              <button class="new-msg-banner" on:click={scrollToBottom}>
                <i class="ti ti-arrow-down"></i>
                {newMsgCount > 1 ? `${newMsgCount} new messages` : "New message"}
              </button>
            {:else if !isAtBottom}
              <button class="scroll-bottom-btn" title="Scroll to bottom" on:click={scrollToBottom}>
                <i class="ti ti-arrow-down"></i>
              </button>
            {/if}
            </div>

            <!-- Input -->
            {#if canSendChat()}
              <!-- hidden file input lives outside the bar so Svelte never re-creates it -->
              <input
                type="file"
                class="d-none"
                accept={ALLOWED_TYPES}
                multiple={true}
                bind:this={fileInputEl}
                on:change={onFileSelect}
              />
              {#if showSuggestions && filteredSuggestions.length > 0}
                <div class="chat-suggestions">
                  <div class="chat-suggestions__chips">
                    {#each filteredSuggestions as s}
                      <button class="chat-suggestion-chip" on:click={() => sendSuggestion(s)} disabled={sendingChat}>
                        {s}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="chat-input-wrap">
                {#if replyTo}
                  <div class="chat-reply-preview">
                    <i class="ti ti-corner-up-left chat-reply-preview-icon"></i>
                    <div class="chat-reply-preview-body">
                      <span class="chat-reply-preview-sender">{maskSenderLabel(replyTo.senderLabel, replyTo.senderType)}</span>
                      <span class="chat-reply-preview-text">
                        {#if replyTo.message}
                          {replyTo.message.length > 90 ? replyTo.message.slice(0, 90).trimEnd() + '…' : replyTo.message}
                        {:else}
                          📎 Attachment
                        {/if}
                      </span>
                    </div>
                    <button class="chat-reply-preview-close" on:click={() => replyTo = null} title="Cancel reply">
                      <i class="ti ti-x"></i>
                    </button>
                  </div>
                {/if}
                {#if attachedFiles.length > 0}
                  <div class="chat-file-preview-row">
                    {#each attachedFiles as file, i}
                      <div
                        class="chat-file-chip"
                        role="button"
                        tabindex="0"
                        title="Click to preview"
                        on:click={() => previewAttachedFile(file)}
                        on:keydown={(e) => e.key === "Enter" && previewAttachedFile(file)}
                      >
                        {#if file.type.startsWith('image/')}
                          <img src={getPreviewUrl(file)} alt={file.name} class="chip-thumb" />
                        {:else}
                          <i class="ti ti-file-text"></i>
                        {/if}
                        <span class="chip-name">{file.name}</span>
                        <button type="button" class="chip-remove" on:click|stopPropagation={() => clearAttachment(i)} title="Remove">
                          <i class="ti ti-x"></i>
                        </button>
                      </div>
                    {/each}
                    {#if attachedFiles.length >= 5}
                      <span class="chip-limit-note">Max 5 files</span>
                    {/if}
                  </div>
                {/if}
                {#if sendingChat && uploadingFileCount > 0}
                  <div class="chat-upload-indicator">
                    <span class="chat-upload-indicator__bar"></span>
                    <span class="chat-upload-indicator__label">
                      <span class="spinner-border spinner-border-sm me-1" style="width:12px;height:12px;border-width:2px;"></span>
                      Uploading {uploadingFileCount} file{uploadingFileCount > 1 ? 's' : ''}…
                    </span>
                  </div>
                {/if}
                <div class="chat-input-bar">
                  <button
                    type="button"
                    class="chat-attach-btn"
                    title="Attach up to 5 files (image, PDF, doc…)"
                    on:click={triggerFilePicker}
                    disabled={attachedFiles.length >= 5 || sendingChat}
                  >
                    <i class="ti ti-paperclip"></i>
                  </button>
                  <div class="chat-input-grow-wrap">
                    <textarea
                      class="chat-input"
                      rows="1"
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      bind:value={chatMessage}
                      bind:this={chatInputEl}
                      on:input={handleTyping}
                      on:paste={handlePaste}
                      on:keydown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                      }}
                    ></textarea>
                    {#if chatMessage.length > 100}
                      <div class="chat-char-count">{chatMessage.length}</div>
                    {/if}
                  </div>
                  <button class="chat-send-btn" on:click={sendChat} disabled={sendingChat || (!chatMessage.trim() && !attachedFiles.length)}>
                    {#if sendingChat}
                      <span class="spinner-border spinner-border-sm"></span>
                    {:else}
                      <i class="ti ti-send"></i>
                    {/if}
                  </button>
                </div>
              </div>
            {:else}
              <div class="chat-blocked">
                {#if query.status === "closed"}
                  <i class="ti ti-lock me-1"></i> This query is closed. No further messages can be sent.
                {:else if query.status === "resolved" && isTelecaller(currentUser)}
                  <i class="ti ti-check-circle me-1 text-success"></i> Query resolved — reopen to continue the discussion.
                {:else if isTech(currentUser) && (query.status === "open" || query.status === "reopened")}
                  <i class="ti ti-hand-stop me-1"></i> Pick up this query to send messages.
                {:else if isTech(currentUser) && query.assignedToId !== currentUser?.id}
                  <i class="ti ti-hand-stop me-1"></i> Pick up this query to send messages.
                {:else if isTechHelper(currentUser) && query.status === "open"}
                  <i class="ti ti-hand-stop me-1"></i> Pick up this query to start helping.
                {:else if isTechHelper(currentUser) && query.assignedToId !== currentUser?.id}
                  <i class="ti ti-hand-stop me-1"></i> This query is handled by another helper.
                {:else if isTechHelper(currentUser) && query.status === "resolved"}
                  <i class="ti ti-circle-check me-1 text-success"></i> Query resolved.
                {/if}
              </div>
            {/if}
          </div>
        </div>

        <!-- ── Sq pending-files preview modal (slider) ───────────────────── -->
        {#if viewingSubQueryId}
        {#if sqPendingFiles.length > 0}
          {@const sqTotalAllowed = Math.max(0, 5 - sqAttachedFiles.length)}
          {@const sqCur = sqPendingFiles[sqPendingIndex]}
          {@const sqCurAllowed = sqPendingIndex < sqTotalAllowed}
          <div class="pf-backdrop" on:click={sqCancelPending} role="dialog" aria-modal="true" aria-label="Preview files">
            <div class="pf-card" on:click|stopPropagation role="document">

              <!-- header -->
              <div class="pf-header">
                <i class="ti ti-photo-check" style="color:#3b5bdb;font-size:15px;"></i>
                <span>Preview Files</span>
                <span class="pf-index">{sqPendingIndex + 1} / {sqPendingFiles.length}</span>
                <button class="pf-close" on:click={sqCancelPending} title="Discard"><i class="ti ti-x"></i></button>
              </div>

              <!-- over-limit warning -->
              {#if sqPendingFiles.length > sqTotalAllowed}
                <div class="pf-warn">
                  <i class="ti ti-alert-triangle"></i>
                  Only {sqTotalAllowed} of {sqPendingFiles.length} file{sqPendingFiles.length !== 1 ? 's' : ''} can be added (5-file limit). Dimmed items will be skipped.
                </div>
              {/if}

              <!-- main stage -->
              <div class="pf-stage">
                {#if sqPendingIndex > 0}
                  <button class="pf-arrow pf-arrow--left" on:click={sqPrevPending} title="Previous">
                    <i class="ti ti-chevron-left"></i>
                  </button>
                {/if}

                <div class="pf-preview" class:pf-preview--overlimit={!sqCurAllowed}>
                  {#if sqCur?.type.startsWith('image/')}
                    <img src={getPreviewUrl(sqCur)} alt={sqCur.name} class="pf-stage-img" />
                  {:else}
                    <div
                      class="pf-stage-file"
                      role="button"
                      tabindex="0"
                      title="Click to open file"
                      on:click={() => window.open(getPreviewUrl(sqCur), '_blank', 'noopener,noreferrer')}
                      on:keydown={(e) => e.key === 'Enter' && window.open(getPreviewUrl(sqCur), '_blank', 'noopener,noreferrer')}
                    >
                      <i class="ti ti-file-description pf-stage-file-icon"></i>
                      <span class="pf-stage-ext">.{sqCur?.name.split('.').pop()?.toLowerCase() ?? 'file'}</span>
                      <span class="pf-stage-open-hint"><i class="ti ti-external-link"></i> Click to open</span>
                    </div>
                  {/if}

                  {#if sqCurAllowed}
                    <button class="pf-stage-remove" on:click={() => sqRemovePendingFile(sqPendingIndex)}>
                      <i class="ti ti-trash"></i> Remove
                    </button>
                  {:else}
                    <div class="pf-overlimit-badge"><i class="ti ti-ban"></i> Over limit</div>
                  {/if}
                </div>

                {#if sqPendingIndex < sqPendingFiles.length - 1}
                  <button class="pf-arrow pf-arrow--right" on:click={sqNextPending} title="Next">
                    <i class="ti ti-chevron-right"></i>
                  </button>
                {/if}
              </div>

              <!-- filename -->
              <div class="pf-stage-name" title={sqCur?.name}>{sqCur?.name}</div>

              <!-- thumbnail strip -->
              <div class="pf-strip">
                {#each sqPendingFiles as file, i}
                  <button
                    class="pf-thumb"
                    class:pf-thumb--active={i === sqPendingIndex}
                    class:pf-thumb--overlimit={i >= sqTotalAllowed}
                    on:click={() => sqJumpPending(i)}
                    title={file.name}
                  >
                    {#if file.type.startsWith('image/')}
                      <img src={getPreviewUrl(file)} alt={file.name} class="pf-thumb-img" />
                    {:else}
                      <i class="ti ti-file-description pf-thumb-icon"></i>
                    {/if}
                  </button>
                {/each}
              </div>

              <!-- footer -->
              <div class="pf-footer">
                <button class="pf-btn-cancel" on:click={sqCancelPending}>Discard</button>
                <button class="pf-btn-confirm" on:click={sqConfirmPendingFiles} disabled={sqAttachedFiles.length >= 5}>
                  <i class="ti ti-check"></i>
                  Add {Math.min(sqPendingFiles.length, sqTotalAllowed)} file{Math.min(sqPendingFiles.length, sqTotalAllowed) !== 1 ? 's' : ''}
                </button>
              </div>

            </div>
          </div>
        {/if}
        {/if}

        <!-- ── Right panel stack: sub-query OR order detail (same column, stacked) ── -->
        {#if rightPanelStack.length > 0}
        <div class="col-lg-4" style="transition: all 0.2s ease; overflow: hidden;">

          <!-- Sub-query panel: visible when on top of stack -->
          {#if rightPanelTop === 'subquery' && viewingSubQueryId}
          <div class="chat-card d-flex flex-column sq-inline-card">

            <!-- Header -->
            <div class="chat-header d-flex align-items-center gap-2 px-3 py-3">
              <div class="chat-avatar chat-avatar--support" style="width:32px;height:32px;font-size:14px;">
                <i class="ti ti-subtask"></i>
              </div>
              <div class="flex-grow-1 min-w-0">
                <div class="fw-semibold text-truncate" style="font-size:13px;" title={sqViewQuery?.subject}>
                  {sqViewQuery?.subject ?? sqWord}
                </div>
                {#if sqOtherTyping}
                  <div class="typing-indicator" style="font-size:11px;">
                    <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                    <span class="ms-1">{sqTypingLabel()}</span>
                  </div>
                {:else}
                  <div class="text-muted" style="font-size:11px;">{subTypeLabel(sqViewQuery?.type)}</div>
                {/if}
              </div>
              <span class="badge {STATUS_COLORS[sqViewQuery?.status] ?? 'bg-secondary'}" style="font-size:10px;">
                {sqViewQuery?.status?.replace('_', ' ')}
              </span>
              {#if rightPanelStack.includes('order')}
                <button class="btn btn-sm btn-outline-secondary sq-inline-icon-btn" title="Order Detail is below — close to reveal"
                  on:click={closeSubQueryInline} style="font-size:10px;padding:2px 6px;">
                  <i class="ti ti-layers-subtract"></i>
                </button>
              {/if}
              <button class="btn btn-sm btn-outline-secondary sq-inline-icon-btn" on:click={closeSubQueryInline} title="Close">
                <i class="ti ti-x"></i>
              </button>
            </div>

            <!-- Policy notice -->
            <div class="chat-policy-notice">
              <i class="ti ti-shield-lock chat-policy-icon"></i>
              <div class="chat-policy-marquee-wrap">
                <span class="chat-policy-marquee-text">
                  Sharing personal contact information (name, mobile, email, address, etc.) is not allowed in Query Chat. Violations may lead to account suspension or termination.
                </span>
              </div>
            </div>

            <!-- Messages -->
            <div class="chat-messages-wrap"
              on:dragenter={handleSqDragEnter}
              on:dragleave={handleSqDragLeave}
              on:dragover={handleSqDragOver}
              on:drop={handleSqDrop}
            >
              {#if sqIsDragOver}
                <div class="drag-overlay" aria-hidden="true">
                  <div class="drag-overlay-content">
                    <i class="ti ti-upload"></i>
                    <span>Drop files here</span>
                  </div>
                </div>
              {/if}
              <div bind:this={sqChatContainer} class="chat-messages flex-grow-1 overflow-auto px-3 py-3"
                style="flex:1 1 0;min-height:0;" on:scroll={handleSqChatScroll}>

                <!-- Load older -->
                {#if sqHasMoreOlder || sqLoadingOlder}
                  <div class="text-center py-2">
                    {#if sqLoadingOlder}
                      <span class="text-xs text-muted"><i class="ti ti-loader animate-spin me-1"></i>Loading older…</span>
                    {:else}
                      <button class="btn btn-sm btn-outline-secondary px-3 py-1" style="font-size:11px;" on:click={loadOlderSqChats}>
                        <i class="ti ti-chevron-up me-1"></i>Load older
                      </button>
                    {/if}
                  </div>
                {/if}

                {#if sqViewLoading}
                  <div class="text-center py-5">
                    <span class="spinner-border spinner-border-sm text-primary"></span>
                    <p class="mt-2 text-muted small">Loading…</p>
                  </div>
                {:else if sqViewChats.length === 0}
                  <div class="chat-empty">
                    <i class="ti ti-messages-off"></i>
                    <p>No messages yet.</p>
                  </div>
                {:else}
                  {#each sqViewChats as chat}
                    {#if chat.subQueryEvent}
                      <div class="sq-event-card">
                        <div class="sq-event-icon sq-event-icon--{chat.subQueryEvent.eventType}">
                          {#if chat.subQueryEvent.eventType === 'created'}<i class="ti ti-subtask"></i>
                          {:else if chat.subQueryEvent.eventType === 'assigned'}<i class="ti ti-user-check"></i>
                          {:else if chat.subQueryEvent.eventType === 'resolved'}<i class="ti ti-circle-check"></i>
                          {:else}<i class="ti ti-lock"></i>{/if}
                        </div>
                        <div class="sq-event-body">
                          <span class="sq-event-title">
                            {#if chat.subQueryEvent.eventType === 'created'}{sqWord} raised
                            {:else if chat.subQueryEvent.eventType === 'assigned'}Picked up
                            {:else if chat.subQueryEvent.eventType === 'resolved'}Resolved
                            {:else}Closed{/if}
                          </span>
                          <span class="sq-event-time">{formatDate(chat.createdAt)}</span>
                        </div>
                      </div>
                    {:else}
                      {@const sqIsLong = (chat.message?.length ?? 0) > CHAR_LIMIT}
                      {@const sqExpanded = sqExpandedMessages.has(chat.id)}
                      <div class="chat-row" class:chat-row--own={chat.isOwn} class:chat-row--new={chat.isNew} id="sq-msg-{chat.id}">
                        {#if !chat.isOwn}
                          <div class="chat-avatar chat-avatar--sm chat-avatar--{chat.senderType ?? 'other'}">
                            {maskChatSender(chat).charAt(0).toUpperCase()}
                          </div>
                        {/if}
                        <div class="chat-bubble-wrap">
                          <div class="chat-bubble chat-bubble--{chat.senderType ?? (chat.isOwn ? 'own' : 'other')} {chat.isFinal ? 'chat-bubble--final' : ''} {chat.isNew ? 'chat-bubble--new' : ''}">
                            <!-- reply quote -->
                            {#if chat.replyTo}
                              <div class="chat-reply-quote chat-reply-quote--{chat.senderType ?? 'other'}"
                                role="button" tabindex="0"
                                on:click={() => scrollSqToMsg(chat.replyTo.id)}
                                on:keydown={(e) => e.key === 'Enter' && scrollSqToMsg(chat.replyTo.id)}
                                title="Jump to original">
                                <span class="chat-reply-quote-sender">{maskSenderLabel(chat.replyTo.senderLabel, chat.replyTo.senderType)}</span>
                                <span class="chat-reply-quote-text">
                                  {#if chat.replyTo.message}
                                    {chat.replyTo.message.length > 70 ? chat.replyTo.message.slice(0, 70).trimEnd() + '…' : chat.replyTo.message}
                                  {:else}📎 Attachment{/if}
                                </span>
                              </div>
                            {/if}
                            <div class="chat-sender">{maskChatSender(chat)}</div>
                            {#if chat.message && !chat.isDeleted && sqEditingChatId !== chat.id}
                              <button class="chat-copy-btn" title="Copy message" on:click|stopPropagation={() => copyMessage(chat)}>
                                <i class="ti {copiedChatId === chat.id ? 'ti-check' : 'ti-copy'}"></i>
                              </button>
                            {/if}
                            {#if chat.isDeleted}
                              <div class="chat-deleted-text">
                                <i class="ti ti-trash me-1"></i>This message was deleted
                              </div>
                              {#if currentUser?.role === 'master' && chat.message}
                                <div class="chat-deleted-original">{chat.message}</div>
                              {/if}
                            {:else if sqEditingChatId === chat.id}
                              <textarea
                                class="chat-edit-input"
                                bind:value={sqEditingChatText}
                                rows="2"
                                on:keydown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sqSaveEditChat(chat.id); }
                                  if (e.key === "Escape") sqCancelEditChat();
                                }}
                              ></textarea>
                              <div class="chat-edit-actions">
                                <button class="chat-edit-save" on:click={() => sqSaveEditChat(chat.id)} disabled={sqSavingEdit || !sqEditingChatText.trim()}>
                                  {sqSavingEdit ? "Saving…" : "Save"}
                                </button>
                                <button class="chat-edit-cancel" on:click={sqCancelEditChat}>Cancel</button>
                              </div>
                            {:else if chat.message}
                              <div class="chat-text">
                                {sqIsLong && !sqExpanded ? chat.message.slice(0, CHAR_LIMIT).trimEnd() + '…' : chat.message}
                              </div>
                              {#if sqIsLong}
                                <button class="read-more-btn read-more-btn--{chat.senderType ?? (chat.isOwn ? 'own' : 'other')}"
                                  on:click|stopPropagation={() => { if (sqExpandedMessages.has(chat.id)) sqExpandedMessages.delete(chat.id); else sqExpandedMessages.add(chat.id); sqExpandedMessages = sqExpandedMessages; }}>
                                  {#if sqExpanded}<i class="ti ti-chevron-up"></i> Show less{:else}<i class="ti ti-chevron-down"></i> Read more{/if}
                                </button>
                              {/if}
                            {/if}
                            <!-- attachments -->
                            {#if chat.attachments?.length}
                              {@const imgs = chat.attachments.filter(a => isImage(a.mime))}
                              {@const files = chat.attachments.filter(a => !isImage(a.mime))}
                              {#if imgs.length}
                                {@const imgUrls = imgs.map(a => ATTACHMENT_BASE_URL + a.url)}
                                <div class="chat-attachments-grid" class:chat-attachments-grid--single={imgs.length === 1}>
                                  {#each imgs as att, i}
                                    <button class="chat-attachment-img-btn" on:click={() => openImageLightbox(imgUrls, i)} title="View {att.name}">
                                      <img src="{ATTACHMENT_BASE_URL}{att.url}" alt={att.name} class="chat-attachment-img" />
                                    </button>
                                  {/each}
                                </div>
                              {/if}
                              {#if files.length}
                                <div class="chat-attachments-files">
                                  {#each files as att}
                                    <button class="chat-attachment-file {chat.senderType === 'own' ? 'chat-attachment-file--own' : ''}"
                                      on:click={() => openAttachment(ATTACHMENT_BASE_URL + att.url, att.mime, att.name)}>
                                      <i class="ti ti-file-download me-1"></i>{att.name}
                                    </button>
                                  {/each}
                                </div>
                              {/if}
                            {/if}
                            <div class="chat-time-row">
                              <span class="chat-time">{formatDate(chat.createdAt)}</span>
                              {#if chat.editedAt}
                                <span class="chat-edited-badge">edited</span>
                              {/if}
                              {#if chat.isFinal}
                                <span class="final-badge"><i class="ti ti-flag-check"></i> Final Quotation</span>
                              {/if}
                              {#if chat.isOwn}
                                <span class="chat-tick {chat.read ? 'chat-tick--read' : ''}" title="{chat.read ? 'Read' : 'Sent'}">
                                  {#if chat.read}✓✓{:else}✓{/if}
                                </span>
                              {/if}
                            </div>
                          </div>
                        </div>
                        <!-- action buttons: flag → edit → delete → reply -->
                        <div class="chat-action-btns">
                          {#if canSetFinalFlag() && !chat.isDeleted}
                            <button
                              class="final-flag-btn {chat.isFinal ? 'final-flag-btn--active' : ''}"
                              title="{chat.isFinal ? 'Remove final flag' : 'Mark as Final Quotation'}"
                              disabled={sqSettingFinalFlag === chat.id}
                              on:click={() => sqToggleFinalFlag(chat)}
                            >
                              {#if sqSettingFinalFlag === chat.id}
                                <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;border-width:1.5px;"></span>
                              {:else}
                                <i class="ti ti-flag"></i>
                              {/if}
                            </button>
                          {/if}
                          {#if sqCanEditChat(chat) && sqEditingChatId !== chat.id && !chat.isDeleted}
                            <button class="chat-edit-btn" title="Edit message (within 30 min)" on:click={() => sqStartEditChat(chat)}>
                              <i class="ti ti-pencil"></i>
                            </button>
                          {/if}
                          {#if sqCanDeleteChat(chat)}
                            <button
                              class="chat-delete-btn"
                              title="Delete message"
                              disabled={sqDeletingChatId === chat.id}
                              on:click={() => sqDeleteChat(chat)}
                            >
                              {#if sqDeletingChatId === chat.id}
                                <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;border-width:1.5px;"></span>
                              {:else}
                                <i class="ti ti-trash"></i>
                              {/if}
                            </button>
                          {/if}
                          {#if canSendSqChat() && !chat.isDeleted}
                            <button class="chat-reply-btn" title="Reply"
                              on:click={() => sqReplyTo = { id: chat.id, senderLabel: chat.senderLabel, message: chat.message, senderType: chat.senderType }}>
                              <i class="ti ti-corner-up-left"></i>
                            </button>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  {/each}
                {/if}
              </div>
              {#if sqShowNewMsgBanner}
                <button class="new-msg-banner" on:click={sqScrollToBottom}>
                  <i class="ti ti-arrow-down"></i>
                  {sqNewMsgCount > 1 ? `${sqNewMsgCount} new messages` : "New message"}
                </button>
              {:else if !sqIsAtBottom}
                <button class="scroll-bottom-btn" title="Scroll to bottom" on:click={sqScrollToBottom}>
                  <i class="ti ti-arrow-down"></i>
                </button>
              {/if}
            </div>

            <!-- Input bar or blocked notice -->
            {#if canSendSqChat()}
              <input type="file" class="d-none" accept={ALLOWED_TYPES} multiple={true}
                bind:this={sqFileInputEl}
                on:change={(e) => { const picked = Array.from(e.target.files ?? []); if (picked.length) sqAttachedFiles = [...sqAttachedFiles, ...picked].slice(0, 5); e.target.value = ""; }} />
              <div class="chat-input-wrap">
                {#if sqReplyTo}
                  <div class="chat-reply-preview">
                    <i class="ti ti-corner-up-left chat-reply-preview-icon"></i>
                    <div class="chat-reply-preview-body">
                      <span class="chat-reply-preview-sender">{maskSenderLabel(sqReplyTo.senderLabel, sqReplyTo.senderType)}</span>
                      <span class="chat-reply-preview-text">
                        {#if sqReplyTo.message}{sqReplyTo.message.length > 90 ? sqReplyTo.message.slice(0, 90).trimEnd() + '…' : sqReplyTo.message}{:else}📎 Attachment{/if}
                      </span>
                    </div>
                    <button class="chat-reply-preview-close" on:click={() => sqReplyTo = null} title="Cancel"><i class="ti ti-x"></i></button>
                  </div>
                {/if}
                {#if sqAttachedFiles.length > 0}
                  <div class="chat-file-preview-row">
                    {#each sqAttachedFiles as file, i}
                      <div
                        class="chat-file-chip"
                        role="button"
                        tabindex="0"
                        title="Click to preview"
                        on:click={() => previewSqAttachedFile(file)}
                        on:keydown={(e) => e.key === "Enter" && previewSqAttachedFile(file)}
                      >
                        {#if file.type.startsWith('image/')}
                          <img src={getPreviewUrl(file)} alt={file.name} class="chip-thumb" />
                        {:else}
                          <i class="ti ti-file-text"></i>
                        {/if}
                        <span class="chip-name">{file.name}</span>
                        <button type="button" class="chip-remove" on:click|stopPropagation={() => sqClearAttachment(i)} title="Remove">
                          <i class="ti ti-x"></i>
                        </button>
                      </div>
                    {/each}
                    {#if sqAttachedFiles.length >= 5}
                      <span class="chip-limit-note">Max 5 files</span>
                    {/if}
                  </div>
                {/if}
                <div class="chat-input-bar">
                  <button type="button" class="chat-attach-btn" title="Attach files" on:click={() => sqFileInputEl?.click()} disabled={sqAttachedFiles.length >= 5}>
                    <i class="ti ti-paperclip"></i>
                  </button>
                  <div class="chat-input-grow-wrap">
                    <textarea class="chat-input" rows="1"
                      placeholder="Type a message… (Enter to send)"
                      bind:value={sqChatMessage}
                      on:input={(e) => { autoResize(e.target); handleSqTyping(); }}
                      on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSqChat(); } }}
                      on:paste={handleSqPaste}
                    ></textarea>
                    {#if sqChatMessage.length > 100}
                      <div class="chat-char-count">{sqChatMessage.length}</div>
                    {/if}
                  </div>
                  <button class="chat-send-btn" on:click={sendSqChat}
                    disabled={sqSendingChat || (!sqChatMessage.trim() && !sqAttachedFiles.length)}>
                    {#if sqSendingChat}<span class="spinner-border spinner-border-sm"></span>{:else}<i class="ti ti-send"></i>{/if}
                  </button>
                </div>
              </div>
            {:else}
              <div class="chat-blocked">
                {#if query?.status === 'closed' || sqViewQuery?.status === 'closed'}
                  <i class="ti ti-lock me-1"></i> This {sqWordLower} is closed.
                {:else if isTelecaller(currentUser)}
                  <i class="ti ti-eye me-1 text-muted"></i> Read-only view
                {:else if isTechHelper(currentUser) && sqViewQuery?.status === 'open'}
                  <i class="ti ti-hand-stop me-1"></i> Pick up to start helping.
                {:else if sqViewQuery?.status === 'resolved' && isTech(currentUser)}
                  <div class="d-flex flex-column align-items-center gap-2 w-100">
                    <span class="small text-success"><i class="ti ti-circle-check me-1"></i>{sqWord} resolved — review and take action.</span>
                    <div class="d-flex gap-2">
                      <button class="qd-btn qd-btn--success" style="font-size:12px;padding:5px 14px;width:auto;" on:click={sqAcceptSolution} disabled={sqActionLoading}>
                        {#if sqActionLoading}<span class="spinner-border spinner-border-sm me-1" style="width:11px;height:11px;border-width:1.5px;"></span>{:else}<i class="ti ti-thumb-up me-1"></i>{/if}
                        Accept & Close
                      </button>
                      <button class="qd-btn qd-btn--danger-outline" style="font-size:12px;padding:5px 14px;width:auto;" on:click={sqReopenQuery} disabled={sqActionLoading}>
                        {#if sqActionLoading}<span class="spinner-border spinner-border-sm me-1" style="width:11px;height:11px;border-width:1.5px;"></span>{:else}<i class="ti ti-refresh me-1"></i>{/if}
                        Reopen
                      </button>
                    </div>
                  </div>
                {:else if sqViewQuery?.status === 'resolved'}
                  <i class="ti ti-circle-check me-1 text-success"></i> {sqWord} resolved.
                {:else if isTechHelper(currentUser) && sqViewQuery?.assignedToId !== currentUser?.id}
                  <i class="ti ti-hand-stop me-1"></i> Handled by another helper.
                {:else}
                  <i class="ti ti-eye me-1 text-muted"></i> Read-only
                {/if}
              </div>
            {/if}

          </div>
          {/if}

          <!-- Order panel: visible when on top of stack -->
          {#if rightPanelTop === 'allQueries'}
            <div class="card border-0 shadow-sm aq-panel">
              <!-- Header -->
              <div class="card-header py-2 px-3 d-flex align-items-center gap-2">
                <i class="ti ti-loader text-warning"></i>
                <span class="fw-semibold small">In Progress</span>
                <span class="badge bg-warning text-dark ms-1">{aqTotal || 0}</span>
                <button class="btn-close btn-close-sm ms-auto" style="font-size:10px;" on:click={closeAllQueriesPanel}></button>
              </div>

              <!-- Search -->
              <div class="px-3 pt-2 pb-2 border-bottom">
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-white border-end-0"><i class="ti ti-search text-muted" style="font-size:13px;"></i></span>
                  <input
                    type="text"
                    class="form-control border-start-0 ps-0"
                    placeholder="Search queries..."
                    style="font-size:12px;"
                    value={aqSearch}
                    on:input={(e) => handleAqSearch(e.target.value)}
                  />
                  {#if aqSearch}
                    <button class="input-group-text bg-white border-start-0" style="cursor:pointer;" on:click={() => handleAqSearch("")}>
                      <i class="ti ti-x text-muted" style="font-size:12px;"></i>
                    </button>
                  {/if}
                </div>
                <div class="d-flex align-items-center gap-1 mt-2 flex-wrap">
                  <div class="ip-date-filters flex-grow-1">
                    {#each [["all","All"],["today","Today"],["yesterday","Yest."],["7days","7D"],["30days","30D"],["custom","Custom"]] as [val, label]}
                      <button
                        class="ip-date-pill {aqDateFilter === val ? 'active' : ''}"
                        on:click={() => setAqDateFilter(val)}
                      >{label}</button>
                    {/each}
                  </div>
                  <select
                    class="ip-field-select"
                    bind:value={aqDateField}
                    on:change={() => { if (aqDateFilter !== "all") loadAqList(true, true); }}
                  >
                    <option value="createdAt">Created</option>
                    <option value="lastActivityAt">Last Activity</option>
                    <option value="updatedAt">Updated</option>
                  </select>
                </div>
                {#if aqDateFilter === "custom"}
                  <div class="d-flex gap-1 mt-1">
                    <input type="date" class="form-control form-control-sm" style="font-size:11px;" bind:value={aqCustomFrom}
                      on:change={() => { if (aqCustomFrom && aqCustomTo) loadAqList(true, true); }} />
                    <input type="date" class="form-control form-control-sm" style="font-size:11px;" bind:value={aqCustomTo}
                      on:change={() => { if (aqCustomFrom && aqCustomTo) loadAqList(true, true); }} />
                  </div>
                {/if}
              </div>

              <!-- List -->
              <div class="aq-list-body" on:scroll={handleAqScroll} bind:this={aqListEl}>
                {#if aqLoading}
                  <div class="d-flex align-items-center justify-content-center" style="height:120px;">
                    <span class="spinner-border spinner-border-sm text-warning"></span>
                  </div>
                {:else if aqFiltering}
                  <div class="d-flex align-items-center justify-content-center" style="height:80px;">
                    <span class="spinner-border spinner-border-sm text-primary"></span>
                  </div>
                {:else}
                  {#each aqList as q}
                    {@const isCurrent = Number(queryId) === q.id}
                    {@const typeLabel = QUERY_TYPES.find(t => t.value === q.type)?.label ?? q.type ?? "Other"}
                    <div
                      class="in-progress-row {isCurrent ? 'in-progress-row--active' : ''}"
                      role="button"
                      tabindex="0"
                      on:click={() => { selectQuery(q.id); closeAllQueriesPanel(); }}
                      on:keydown={(e) => e.key === 'Enter' && (selectQuery(q.id), closeAllQueriesPanel())}
                    >
                      <div class="ip-avatar-wrap">
                        <div class="ip-avatar {isCurrent ? 'ip-avatar--active' : ''}">
                          <i class="ti ti-message-circle"></i>
                        </div>
                        <span class="ip-priority-dot ip-priority-dot--{q.priority ?? 'medium'}"></span>
                      </div>
                      <div class="ip-body">
                        <div class="ip-subject-row">
                          <span class="ip-subject">{q.subject}</span>
                          {#if q.lastActivityAt}
                            <span class="ip-time">{timeAgo(q.lastActivityAt)}</span>
                          {/if}
                        </div>
                        <span class="ip-sub">
                          {#if q.lastMessage}
                            {q.lastMessage.length > 42 ? q.lastMessage.slice(0, 42).trimEnd() + '…' : q.lastMessage}
                          {:else}
                            {typeLabel}
                          {/if}
                        </span>
                        {#if q.createdAt}
                          <span class="ip-raised">
                            <i class="ti ti-calendar" style="font-size:9px;"></i> {formatDateTime(q.createdAt)}
                          </span>
                        {/if}
                        {#if isMasterView(currentUser)}
                          <span class="ip-meta">
                            {#if q.raisedBy?.name}<i class="ti ti-user" style="font-size:9px;"></i> {maskTC(q.raisedBy.name)}{/if}{#if q.assignedTo?.name}&nbsp;·&nbsp;<i class="ti ti-user-check" style="font-size:9px;"></i> {maskTech(q.assignedTo.name)}{/if}
                          </span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                  {#if aqList.length === 0 && !aqLoadingMore}
                    <div class="text-center text-muted py-4 small">
                      <i class="ti ti-inbox d-block mb-1" style="font-size:22px;"></i>
                      No queries found
                    </div>
                  {/if}
                  {#if aqLoadingMore}
                    <div class="ip-loading-more">
                      <span class="spinner-border spinner-border-sm text-warning" style="width:14px;height:14px;border-width:2px;"></span>
                    </div>
                  {:else if aqList.length >= aqTotal && aqTotal > ALL_QUERIES_LIMIT}
                    <div class="ip-all-loaded">All caught up</div>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}

          {#if rightPanelTop === 'order' && orderDrawerOpen}
            <div class="card border-0 shadow-sm order-inline-panel"
              on:dragenter={(e) => {
                if (e.dataTransfer?.types?.includes('application/x-chat-attachment')) {
                  orderIsDragOver = true;
                  orderDragDepth = 1;
                  orderActiveTab = 'attachments';
                }
              }}
            >
              <div class="card-header py-2 px-3 d-flex align-items-center gap-2">
                <i class="ti ti-receipt text-primary"></i>
                <span class="fw-semibold small">Order Detail</span>
                {#if rightPanelStack.includes('subquery')}
                  <span class="badge bg-light text-muted border ms-1" style="font-size:10px;font-weight:500;">
                    <i class="ti ti-layers-subtract me-1"></i>{sqWord} below
                  </span>
                {/if}
                <button class="btn-close btn-close-sm ms-auto" style="font-size:10px;" on:click={closeOrderDrawer}></button>
              </div>

              <!-- Tab bar -->
              {#if !orderDrawerLoading && orderDrawerData}
              <div class="d-flex gap-1 px-3 pt-2 pb-1 border-bottom" style="background:#fafafa;">
                <button class="op-tab-btn {orderActiveTab === 'info' ? 'op-tab-btn--active' : ''}" on:click={() => orderActiveTab = 'info'}>
                  <i class="ti ti-info-circle me-1"></i>Info
                </button>
                <button class="op-tab-btn {orderActiveTab === 'chat' ? 'op-tab-btn--active' : ''}" on:click={() => orderActiveTab = 'chat'}>
                  <i class="ti ti-message me-1"></i>Chat
                  {#if orderChats.length > 0}<span class="badge bg-primary ms-1" style="font-size:9px;padding:1px 5px;">{orderChats.length}</span>{/if}
                </button>
                <button class="op-tab-btn {orderActiveTab === 'attachments' ? 'op-tab-btn--active' : ''}" on:click={() => orderActiveTab = 'attachments'}>
                  <i class="ti ti-paperclip me-1"></i>Files
                  {#if orderAttachments.length > 0}<span class="badge bg-secondary ms-1" style="font-size:9px;padding:1px 5px;">{orderAttachments.length}</span>{/if}
                </button>
              </div>
              {/if}

              <div class="order-inline-body">
                {#if orderDrawerLoading}
                  <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
                {:else if orderNoLinkedOrder}
                  <div class="text-center py-5 px-3">
                    <i class="ti ti-receipt-off d-block mb-2" style="font-size:36px;color:#adb5bd;"></i>
                    <div class="fw-semibold text-muted mb-1" style="font-size:13px;">No Order Linked</div>
                    <div class="text-muted" style="font-size:12px;">This query is not linked to any order.</div>
                  </div>
                {:else if orderDrawerData}
                  {@const o = orderDrawerData}

                  <!-- ── Info tab ── -->
                  {#if orderActiveTab === 'info'}
                  <!-- Title + status -->
                  <div class="op-section">
                    <div class="op-section-title"><i class="ti ti-receipt"></i>Title</div>
                    <div class="d-flex align-items-start gap-2 flex-wrap">
                      <span class="fw-semibold flex-grow-1" style="font-size:13px;line-height:1.4;">{o.title ?? "-"}</span>
                      <div class="dropdown flex-shrink-0">
                        <a
                          class="badge bg-secondary text-white dropdown-toggle"
                          style="font-size:10px;cursor:pointer;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;"
                          data-bs-toggle="dropdown"
                          aria-expanded="false"
                        >
                          {$statusNamesStore[o.status]?.name ?? o.status ?? "-"}
                        </a>
                        <div class="dropdown-menu dropdown-menu-end" style="font-size:12px;min-width:170px;">
                          {#each orderStatuses as status}
                            <a
                              class="dropdown-item"
                              class:active={o.status === status}
                              href={`#${status}`}
                              on:click|preventDefault={() => changeOrderStatusFromPanel(status)}
                            >
                              {$statusNamesStore[status]?.name ?? status}
                            </a>
                          {/each}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Order fields -->
                  <div class="op-section">
                    <div class="op-section-title"><i class="ti ti-info-circle"></i>Order Info</div>
                    <div class="op-row"><span class="op-label"><i class="ti ti-hash"></i>Order #</span><span class="op-value op-copyable" on:click={() => copyField('orderId', String(o.pId ?? ''))}>{o.pId ?? "-"}<i class="ti {copiedFieldKey === 'orderId' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'orderId'}></i></span></div>
                    {#if o.category}<div class="op-row"><span class="op-label"><i class="ti ti-tag"></i>Category</span><span class="op-value">{o.category}</span></div>{/if}
                    {#if o.workOrderNumber}<div class="op-row"><span class="op-label"><i class="ti ti-file-invoice"></i>Work Order</span><span class="op-value op-copyable" on:click={() => copyField('workOrder', o.workOrderNumber)}>{o.workOrderNumber}<i class="ti {copiedFieldKey === 'workOrder' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'workOrder'}></i></span></div>{/if}
                    {#if o.assignedUsers?.length}<div class="op-row"><span class="op-label"><i class="ti ti-user"></i>Assigned To</span><span class="op-value">{o.assignedUsers.map(u => {
                        if (!currentUser) return u.name;
                        if (['master','admin','manager'].includes(currentUser.role)) return u.name;
                        if (currentUser.subRole === 'tech' || currentUser.subRole === 'tech_helper') return u.subRole === 'telecaller' ? 'User' : u.name;
                        if (currentUser.subRole === 'telecaller') return (u.subRole === 'tech' || u.subRole === 'tech_helper') ? 'User' : u.name;
                        return u.name;
                      }).join(", ")}</span></div>{/if}
                  </div>

                  <!-- Company / GST -->
                  <div class="op-section">
                    <div class="op-section-title"><i class="ti ti-building"></i>Company</div>
                    {#if o.company}<div class="op-row"><span class="op-label"><i class="ti ti-building"></i>Name</span><span class="op-value op-copyable" on:click={() => copyField('company', o.company)}>{o.company}<i class="ti {copiedFieldKey === 'company' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'company'}></i></span></div>{/if}
                    {#if o.gstNumber}<div class="op-row"><span class="op-label"><i class="ti ti-license"></i>GST No.</span><span class="op-value op-copyable font-mono" style="font-size:11px;" on:click={() => copyField('gst', o.gstNumber)}>{o.gstNumber}<i class="ti {copiedFieldKey === 'gst' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'gst'}></i></span></div>{/if}
                    {#if !o.company && !o.gstNumber && !o.client}
                      <div class="op-row"><span class="op-value text-muted" style="font-size:11px;">No company info.</span></div>
                    {/if}
                  </div>

                  <!-- Client section with edit/change/link actions -->
                  <div class="op-section">
                    <div class="op-section-title d-flex align-items-center justify-content-between">
                      <span><i class="ti ti-building-store"></i>Client</span>
                      <div class="d-flex gap-1">
                        {#if o.client}
                          <button type="button" class="btn btn-xs btn-outline-warning py-0 px-1" style="font-size:10px;" on:click={opOpenEditClientModal}>
                            <i class="ti ti-pencil"></i>
                          </button>
                          <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1" style="font-size:10px;" on:click={() => { opShowChangeClientModal = true; opChangeClientQuery = ""; opCcSelectedExisting = null; opCcCancelInlineCreate(); }}>
                            <i class="ti ti-replace me-1"></i>Change
                          </button>
                        {:else}
                          <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1" style="font-size:10px;" on:click={() => { opShowChangeClientModal = true; opChangeClientQuery = ""; opCcSelectedExisting = null; opCcCancelInlineCreate(); }}>
                            <i class="ti ti-link me-1"></i>Link
                          </button>
                          <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1" style="font-size:10px;" on:click={opOpenNewClientModal}>
                            <i class="ti ti-plus me-1"></i>Contact
                          </button>
                        {/if}
                      </div>
                    </div>
                    {#if o.client}
                      {#if o.client.name}<div class="op-row"><span class="op-label"><i class="ti ti-id-badge"></i>Client</span><span class="op-value op-copyable" on:click={() => copyField('clientName', o.client.name)}>{o.client.name}<i class="ti {copiedFieldKey === 'clientName' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientName'}></i></span></div>{/if}
                      {#if o.client.gstNumber}<div class="op-row"><span class="op-label"><i class="ti ti-license"></i>Client GST</span><span class="op-value op-copyable font-mono" style="font-size:11px;" on:click={() => copyField('clientGst', o.client.gstNumber)}>{o.client.gstNumber}<i class="ti {copiedFieldKey === 'clientGst' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientGst'}></i></span></div>{/if}
                      {#if o.client.mobile}<div class="op-row"><span class="op-label"><i class="ti ti-phone"></i>Client Mobile</span><span class="op-value op-copyable" on:click={() => copyField('clientMobile', o.client.mobile)}>{o.client.mobile}<i class="ti {copiedFieldKey === 'clientMobile' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientMobile'}></i></span></div>{/if}
                      {#if o.client.whatsapp}<div class="op-row"><span class="op-label"><i class="ti ti-brand-whatsapp"></i>Client WA</span><span class="op-value op-copyable" on:click={() => copyField('clientWa', o.client.whatsapp)}>{o.client.whatsapp}<i class="ti {copiedFieldKey === 'clientWa' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientWa'}></i></span></div>{/if}
                      {#if o.client.email}<div class="op-row"><span class="op-label"><i class="ti ti-mail"></i>Client Email</span><span class="op-value op-copyable" on:click={() => copyField('clientEmail', o.client.email)}>{o.client.email}<i class="ti {copiedFieldKey === 'clientEmail' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientEmail'}></i></span></div>{/if}
                      {#if o.client.address}<div class="op-row"><span class="op-label"><i class="ti ti-map-pin"></i>Address</span><span class="op-value op-copyable" on:click={() => copyField('clientAddr', o.client.address)}>{o.client.address}<i class="ti {copiedFieldKey === 'clientAddr' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientAddr'}></i></span></div>{/if}
                      {#if o.client.remark}<div class="op-row"><span class="op-label"><i class="ti ti-note"></i>Remark</span><span class="op-value op-copyable" on:click={() => copyField('clientRemark', o.client.remark)}>{o.client.remark}<i class="ti {copiedFieldKey === 'clientRemark' ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === 'clientRemark'}></i></span></div>{/if}
                    {:else}
                      <div class="op-row"><span class="op-value text-muted" style="font-size:11px;">No client linked.</span></div>
                    {/if}
                  </div>

                  <!-- orderContacts (master contacts) with inline edit/unlink -->
                  {@const masterContacts = (o.orderContacts ?? []).map(oc => ({ ...oc.clientContact, _ocId: oc.id, _isPrimary: oc.isPrimary ?? false })).filter(Boolean)}
                  <div class="op-section">
                    <div class="op-section-title d-flex align-items-center justify-content-between">
                      <span><i class="ti ti-address-book"></i>Contacts</span>
                      {#if o.client}
                        <button type="button" class="btn btn-xs py-0 px-1 {opAcInline ? 'btn-primary' : 'btn-outline-primary'}" style="font-size:10px;" on:click={() => opAcInline ? opCloseAddContact() : opOpenAddContactModal()}>
                          <i class="ti {opAcInline ? 'ti-x' : 'ti-plus'} me-1"></i>{opAcInline ? 'Cancel' : 'Add'}
                        </button>
                      {/if}
                    </div>

                    {#each masterContacts as c, ci}
                      <div class="op-contact">
                        {#if opEditContactId === c.id}
                          <!-- inline edit form -->
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;">
                            <div style="grid-column:1/-1;">
                              <input type="text" class="form-control form-control-sm {opEditContactErrors.name ? 'is-invalid' : ''}" bind:value={opEditContactData.name} placeholder="Name *" />
                              {#if opEditContactErrors.name}<div class="invalid-feedback" style="font-size:10px;">{opEditContactErrors.name}</div>{/if}
                            </div>
                            <input type="text" class="form-control form-control-sm" bind:value={opEditContactData.designation} placeholder="Designation" />
                            <input type="text" class="form-control form-control-sm" bind:value={opEditContactData.mobile} placeholder="Mobile" />
                            <input type="text" class="form-control form-control-sm" bind:value={opEditContactData.whatsapp} placeholder="WhatsApp" />
                            <input type="text" class="form-control form-control-sm" bind:value={opEditContactData.alternateMobile} placeholder="Alt Mobile" />
                            <input type="email" class="form-control form-control-sm" bind:value={opEditContactData.email} placeholder="Email" />
                            <div style="grid-column:1/-1;">
                              <input type="text" class="form-control form-control-sm" bind:value={opEditContactData.address} placeholder="Address" />
                            </div>
                          </div>
                          <div class="d-flex gap-1 justify-content-end">
                            <button type="button" class="btn btn-xs btn-light py-0 px-2" style="font-size:10px;" on:click={opCancelEditContact}>Cancel</button>
                            <button type="button" class="btn btn-xs btn-success py-0 px-2" style="font-size:10px;" disabled={opEditContactLoading} on:click={() => opSubmitEditContact(c.id)}>
                              {opEditContactLoading ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        {:else}
                          <!-- read view -->
                          <div class="d-flex align-items-center justify-content-between flex-wrap gap-1">
                            <div class="d-flex align-items-center gap-1">
                              {#if c._isPrimary}
                                <i class="ti ti-star-filled text-warning" style="font-size:11px;"></i>
                              {/if}
                              <span class="fw-medium" style="font-size:12px;">{c.name ?? "-"}</span>
                            </div>
                            <div class="d-flex gap-1">
                              {#if c._isPrimary}
                                <span class="op-contact-btn op-contact-btn--primary-active">
                                  <i class="ti ti-star-filled"></i> Primary
                                </span>
                              {:else}
                                <button type="button" class="op-contact-btn op-contact-btn--star" on:click={() => opSetPrimaryContact(c._ocId)}>
                                  <i class="ti ti-star"></i> Primary
                                </button>
                              {/if}
                              <button type="button" class="op-contact-btn op-contact-btn--edit" on:click={() => opOpenEditContact(c)}>
                                <i class="ti ti-pencil"></i> Edit
                              </button>
                              <button type="button" class="op-contact-btn op-contact-btn--remove" on:click={() => opUnlinkContact(c._ocId, c.name)}>
                                <i class="ti ti-x"></i>
                              </button>
                            </div>
                          </div>
                          {#if c.designation}<div class="op-contact-designation">{c.designation}</div>{/if}
                          {#if c.mobile}<div class="op-contact-detail"><i class="ti ti-phone"></i><span class="op-copyable" on:click={() => copyField(`mc-mob-${ci}`, c.mobile)}>{c.mobile}<i class="ti {copiedFieldKey === `mc-mob-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `mc-mob-${ci}`}></i></span></div>{/if}
                          {#if c.alternateMobile}<div class="op-contact-detail"><i class="ti ti-phone-plus"></i><span class="op-copyable" on:click={() => copyField(`mc-alt-${ci}`, c.alternateMobile)}>{c.alternateMobile}<i class="ti {copiedFieldKey === `mc-alt-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `mc-alt-${ci}`}></i></span></div>{/if}
                          {#if c.whatsapp}<div class="op-contact-detail"><i class="ti ti-brand-whatsapp"></i><span class="op-copyable" on:click={() => copyField(`mc-wa-${ci}`, c.whatsapp)}>{c.whatsapp}<i class="ti {copiedFieldKey === `mc-wa-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `mc-wa-${ci}`}></i></span></div>{/if}
                          {#if c.email}<div class="op-contact-detail"><i class="ti ti-mail"></i><span class="op-copyable" on:click={() => copyField(`mc-email-${ci}`, c.email)}>{c.email}<i class="ti {copiedFieldKey === `mc-email-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `mc-email-${ci}`}></i></span></div>{/if}
                          {#if c.address}<div class="op-contact-detail"><i class="ti ti-map-pin"></i><span class="op-copyable" on:click={() => copyField(`mc-addr-${ci}`, c.address)}>{c.address}<i class="ti {copiedFieldKey === `mc-addr-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `mc-addr-${ci}`}></i></span></div>{/if}
                          {#if c.remark}<div class="op-contact-detail"><i class="ti ti-note"></i><span class="op-copyable" on:click={() => copyField(`mc-remark-${ci}`, c.remark)}>{c.remark}<i class="ti {copiedFieldKey === `mc-remark-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `mc-remark-${ci}`}></i></span></div>{/if}
                        {/if}
                      </div>
                    {/each}

                    {#if !masterContacts.length && !opAcInline}
                      <div class="op-row"><span class="op-value text-muted" style="font-size:11px;">No contacts linked.</span></div>
                    {/if}

                    <!-- inline add contact form -->
                    {#if opAcInline}
                      <div class="op-inline-form">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;">
                          <div style="grid-column:1/-1;">
                            <input type="text" class="form-control form-control-sm {opAcFormErrors.name ? 'is-invalid' : ''}" bind:value={opAcName} placeholder="Name *" />
                            {#if opAcFormErrors.name}<div class="invalid-feedback" style="font-size:10px;">{opAcFormErrors.name}</div>{/if}
                          </div>
                          <input type="text" class="form-control form-control-sm" bind:value={opAcDesignation} placeholder="Designation" />
                          <input type="text" class="form-control form-control-sm" bind:value={opAcMobile} placeholder="Mobile" />
                          <input type="text" class="form-control form-control-sm" bind:value={opAcWhatsapp} placeholder="WhatsApp" />
                          <input type="text" class="form-control form-control-sm" bind:value={opAcAltMobile} placeholder="Alt Mobile" />
                          <input type="email" class="form-control form-control-sm" bind:value={opAcEmail} placeholder="Email" />
                          <div style="grid-column:1/-1;">
                            <input type="text" class="form-control form-control-sm" bind:value={opAcAddress} placeholder="Address" />
                          </div>
                        </div>
                        <div class="d-flex gap-1 justify-content-end">
                          <button type="button" class="btn btn-xs btn-light py-0 px-2" style="font-size:10px;" on:click={opCloseAddContact}>Cancel</button>
                          <button type="button" class="btn btn-xs btn-primary py-0 px-2" style="font-size:10px;" disabled={opAcLoading} on:click={opSubmitAddContact}>
                            {opAcLoading ? 'Saving…' : 'Save Contact'}
                          </button>
                        </div>
                      </div>
                    {/if}
                  </div>

                  <!-- orderClients (inline clients) -->
                  {#if (o.orderClients ?? []).length}
                    <div class="op-section">
                      <div class="op-section-title"><i class="ti ti-users"></i>Order Clients</div>
                      {#each o.orderClients as c, ci}
                        <div class="op-contact">
                          <div class="fw-medium" style="font-size:12px;">{c.name ?? "-"}</div>
                          {#if c.designation}<div class="op-contact-designation">{c.designation}</div>{/if}
                          {#if c.mobile}<div class="op-contact-detail"><i class="ti ti-phone"></i><span class="op-copyable" on:click={() => copyField(`oc-mob-${ci}`, c.mobile)}>{c.mobile}<i class="ti {copiedFieldKey === `oc-mob-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `oc-mob-${ci}`}></i></span></div>{/if}
                          {#if c.alternateMobile}<div class="op-contact-detail"><i class="ti ti-phone-plus"></i><span class="op-copyable" on:click={() => copyField(`oc-alt-${ci}`, c.alternateMobile)}>{c.alternateMobile}<i class="ti {copiedFieldKey === `oc-alt-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `oc-alt-${ci}`}></i></span></div>{/if}
                          {#if c.whatsapp}<div class="op-contact-detail"><i class="ti ti-brand-whatsapp"></i><span class="op-copyable" on:click={() => copyField(`oc-wa-${ci}`, c.whatsapp)}>{c.whatsapp}<i class="ti {copiedFieldKey === `oc-wa-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `oc-wa-${ci}`}></i></span></div>{/if}
                          {#if c.email}<div class="op-contact-detail"><i class="ti ti-mail"></i><span class="op-copyable" on:click={() => copyField(`oc-email-${ci}`, c.email)}>{c.email}<i class="ti {copiedFieldKey === `oc-email-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `oc-email-${ci}`}></i></span></div>{/if}
                          {#if c.address}<div class="op-contact-detail"><i class="ti ti-map-pin"></i><span class="op-copyable" on:click={() => copyField(`oc-addr-${ci}`, c.address)}>{c.address}<i class="ti {copiedFieldKey === `oc-addr-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `oc-addr-${ci}`}></i></span></div>{/if}
                          {#if c.remark}<div class="op-contact-detail"><i class="ti ti-note"></i><span class="op-copyable" on:click={() => copyField(`oc-remark-${ci}`, c.remark)}>{c.remark}<i class="ti {copiedFieldKey === `oc-remark-${ci}` ? 'ti-check text-success' : 'ti-copy'} op-copy-icon" class:op-copy-icon--copied={copiedFieldKey === `oc-remark-${ci}`}></i></span></div>{/if}
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <!-- Description -->
                  {#if o.description}
                    <div class="op-section">
                      <div class="op-section-title d-flex align-items-center justify-content-between">
                        <span><i class="ti ti-align-left"></i>Description</span>
                        <button class="op-desc-copy-btn" title="Copy description" on:click={() => copyField('desc', o.description)}>
                          <i class="ti {copiedFieldKey === 'desc' ? 'ti-check text-success' : 'ti-copy'}"></i>
                        </button>
                      </div>
                      <div class="op-description" bind:this={descEl}>
                        {#if isHtml(o.description)}
                          {@html safeHtml(o.description)}
                        {:else}
                          {o.description}
                        {/if}
                      </div>
                    </div>
                  {/if}

                  <!-- Full Detail -->
                  <div class="op-section" style="border-bottom:none;">
                    <a href="/admin/order/{o.id}" data-order-href="/admin/order/{o.id}" class="btn btn-primary btn-sm w-100">
                      <i class="ti ti-external-link me-1"></i>Full Detail
                    </a>
                  </div>
                  {/if}

                  <!-- ── Chat tab ── -->
                  {#if orderActiveTab === 'chat'}
                  <div class="op-chat-wrap">
                    <div class="op-list-wrap">
                      {#if orderChatShowScrollBtn}
                        <button class="op-scroll-bottom-btn" on:click={jumpOrderChatBottom} title="Scroll to bottom">
                          <i class="ti ti-arrow-down"></i>
                        </button>
                      {/if}
                      <div class="op-chat-list" bind:this={orderChatListEl} on:scroll={handleOrderChatScroll}>
                      {#if orderChats.length < orderChatTotal}
                        <div class="text-center py-2">
                          {#if orderChatLoadingMore}
                            <span class="text-muted" style="font-size:11px;"><i class="ti ti-loader me-1"></i>Loading…</span>
                          {:else}
                            <button class="btn btn-sm btn-outline-secondary px-3 py-1" style="font-size:11px;" on:click={loadMoreOrderChats}>
                              <i class="ti ti-chevron-up me-1"></i>Load older
                            </button>
                          {/if}
                        </div>
                      {/if}
                      {#if orderChats.length === 0}
                        <div class="text-center text-muted py-4" style="font-size:12px;"><i class="ti ti-messages-off d-block mb-1" style="font-size:20px;"></i>No messages yet.</div>
                      {:else}
                        {#each orderChats as oc}
                          <div class="op-chat-msg">
                            <div class="op-chat-meta">
                              <span class="op-chat-sender">{oc.user?.name ?? "User"}</span>
                              {#each normalizeOrderChatTypes(oc.type) as nt}
                                <span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:600;padding:1px 5px;border-radius:4px;
                                  {nt === 'Call' ? 'background:#dbeafe;color:#1d4ed8;' : nt === 'WhatsApp' ? 'background:#dcfce7;color:#15803d;' : 'background:#fef9c3;color:#a16207;'}">
                                  {#if nt === 'Call'}<i class="ti ti-phone" style="font-size:9px;"></i>{/if}
                                  {#if nt === 'WhatsApp'}<i class="ti ti-brand-whatsapp" style="font-size:9px;"></i>{/if}
                                  {#if nt === 'Email'}<i class="ti ti-mail" style="font-size:9px;"></i>{/if}
                                  {nt}
                                </span>
                              {/each}
                              <span class="op-chat-time">{formatDate(oc.createdAt)}</span>
                            </div>
                            <div class="op-chat-bubble">{oc.message}</div>
                          </div>
                        {/each}
                      {/if}
                    </div>
                    </div><!-- /op-list-wrap -->
                    <div style="display:flex;align-items:center;gap:5px;padding:7px 12px 4px;border-top:1px solid #f0f0f0;background:#fafafa;">
                      <span style="font-size:10px;color:#adb5bd;font-weight:500;white-space:nowrap;">Type:</span>
                      {#each ORDER_CHAT_TYPES as t}
                        <button
                          type="button"
                          style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid {orderChatSelectedTypes.includes(t) ? 'transparent' : '#dee2e6'};
                            background:{orderChatSelectedTypes.includes(t) ? (t === 'Call' ? '#3b82f6' : t === 'WhatsApp' ? '#22c55e' : '#eab308') : '#fff'};
                            color:{orderChatSelectedTypes.includes(t) ? '#fff' : '#6c757d'};cursor:pointer;display:inline-flex;align-items:center;gap:3px;transition:all 0.15s;"
                          on:click|stopPropagation={() => toggleOrderChatType(t)}
                        >
                          {#if t === 'Call'}<i class="ti ti-phone" style="font-size:10px;"></i>{/if}
                          {#if t === 'WhatsApp'}<i class="ti ti-brand-whatsapp" style="font-size:10px;"></i>{/if}
                          {#if t === 'Email'}<i class="ti ti-mail" style="font-size:10px;"></i>{/if}
                          {t}
                        </button>
                      {/each}
                      <button
                        type="button"
                        style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid {orderChatAllSelected ? 'transparent' : '#dee2e6'};
                          background:{orderChatAllSelected ? '#212529' : '#fff'};color:{orderChatAllSelected ? '#fff' : '#6c757d'};cursor:pointer;transition:all 0.15s;"
                        on:click|stopPropagation={() => toggleOrderChatType('All')}
                      >All</button>
                    </div>
                    <div class="op-chat-input-row">
                      <input
                        class="form-control form-control-sm"
                        placeholder="Type a message…"
                        bind:value={orderChatMsg}
                        on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && sendOrderChat()}
                        disabled={orderChatSending}
                        style="font-size:12px;"
                      />
                      <button class="btn btn-primary btn-sm" on:click={sendOrderChat} disabled={orderChatSending || !orderChatMsg.trim()} style="font-size:12px;white-space:nowrap;">
                        {#if orderChatSending}<span class="spinner-border spinner-border-sm" style="width:12px;height:12px;border-width:1.5px;"></span>{:else}<i class="ti ti-send"></i>{/if}
                      </button>
                    </div>
                  </div>
                  {/if}

                  <!-- ── Attachments tab ── -->
                  {#if orderActiveTab === 'attachments'}
                  <div class="op-attach-wrap"
                    on:dragenter={handleOrderDragEnter}
                    on:dragleave={handleOrderDragLeave}
                    on:dragover={handleOrderDragOver}
                    on:drop={handleOrderDrop}
                  >
                    {#if orderIsDragOver}
                      <div class="drag-overlay" aria-hidden="true">
                        <div class="drag-overlay-content">
                          <i class="ti ti-upload"></i>
                          <span>Drop files here</span>
                        </div>
                      </div>
                    {/if}
                    <div class="op-list-wrap">
                      {#if orderAttachShowScrollBtn}
                        <button class="op-scroll-bottom-btn" on:click={jumpOrderAttachBottom} title="Scroll to bottom">
                          <i class="ti ti-arrow-down"></i>
                        </button>
                      {/if}
                      <div class="op-attach-list" bind:this={orderAttachListEl} on:scroll={handleOrderAttachScroll}>
                      {#if orderAttachments.length < orderAttachTotal}
                        <div class="text-center py-2">
                          {#if orderAttachLoadingMore}
                            <span class="text-muted" style="font-size:11px;"><i class="ti ti-loader me-1"></i>Loading…</span>
                          {:else}
                            <button class="btn btn-sm btn-outline-secondary px-3 py-1" style="font-size:11px;" on:click={loadMoreOrderAttachments}>
                              <i class="ti ti-chevron-up me-1"></i>Load older
                            </button>
                          {/if}
                        </div>
                      {/if}
                      {#if orderAttachments.length === 0}
                        <div class="text-center text-muted py-4" style="font-size:12px;"><i class="ti ti-paperclip d-block mb-1" style="font-size:20px;"></i>No attachments yet.</div>
                      {:else}
                        {#each orderAttachments as att}
                          <div class="op-attach-item">
                            <div class="op-attach-title">{att.title || "Attachment"}</div>
                            {#if att.link}
                              <a href={att.link} target="_blank" rel="noopener noreferrer" class="op-attach-link"><i class="ti ti-link me-1"></i>{att.link}</a>
                            {/if}
                            {#if att.files?.length}
                              <div class="d-flex flex-wrap gap-1 mt-1">
                                {#each att.files as f}
                                  {@const isImg = f.mimeType?.startsWith('image/')}
                                  {#if isImg}
                                    <div
                                      draggable="true"
                                      on:dragstart={(e) => {
                                        e.dataTransfer.effectAllowed = 'copy';
                                        e.dataTransfer.setData('application/x-order-attachment', JSON.stringify({ url: f.url, name: f.originalName, mime: f.mimeType, source: 'order_attachment' }));
                                      }}
                                      style="display:inline-block;cursor:grab;"
                                    >
                                      <img
                                        src="{ATTACHMENT_BASE_URL}{f.url}"
                                        alt={f.originalName}
                                        class="op-attach-thumb"
                                        draggable="false"
                                        on:click={() => openImageLightbox([ATTACHMENT_BASE_URL + f.url], 0)}
                                        style="cursor:pointer;"
                                      />
                                    </div>
                                  {:else}
                                    <a
                                      href="{ATTACHMENT_BASE_URL}{f.url}"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      class="op-attach-file-chip"
                                      title={f.originalName}
                                      draggable="true"
                                      on:dragstart={(e) => {
                                        e.dataTransfer.effectAllowed = 'copy';
                                        e.dataTransfer.setData('application/x-order-attachment', JSON.stringify({ url: f.url, name: f.originalName, mime: f.mimeType, source: 'order_attachment' }));
                                      }}
                                    >
                                      <i class="ti ti-file me-1"></i>{f.originalName}
                                    </a>
                                  {/if}
                                {/each}
                              </div>
                            {/if}
                            <div class="op-attach-time">{formatDate(att.createdAt)}</div>
                          </div>
                        {/each}
                      {/if}
                    </div>
                    </div><!-- /op-list-wrap -->

                    <!-- Upload form -->
                    <div class="op-attach-upload">
                      <input type="text" class="op-attach-title-input" placeholder="Title (optional)" bind:value={orderAttachTitle} disabled={orderAttachSending} />
                      <label
                        class="op-attach-dropzone"
                        class:has-files={orderAttachFiles.length > 0}
                        class:is-uploading={orderAttachSending}
                        title="Click to pick files or drag & drop"
                        on:dragover={(e) => {
                          if (e.dataTransfer?.types?.includes('application/x-chat-attachment')) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                          }
                        }}
                        on:drop={async (e) => {
                          const raw = e.dataTransfer?.getData('application/x-chat-attachment');
                          if (raw) {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              const att = JSON.parse(raw);
                              if (att?.url && att?.name && att?.mime) {
                                const result = await Swal.fire({
                                  title: 'Add to Order?',
                                  text: `Add "${att.name}" to order attachments?`,
                                  icon: 'question',
                                  showCancelButton: true,
                                  confirmButtonText: 'Yes, Add',
                                  cancelButtonText: 'Cancel',
                                  confirmButtonColor: '#3b5bdb',
                                  cancelButtonColor: '#adb5bd',
                                });
                                if (result.isConfirmed) addOrderAttachmentFromReference(att);
                              }
                            } catch { /* ignore */ }
                          }
                        }}
                      >
                        <i class="ti ti-paperclip op-attach-clip-icon"></i>
                        <span class="op-attach-dropzone-text">
                          {#if orderAttachFiles.length > 0}
                            <strong>{orderAttachFiles.length} file{orderAttachFiles.length > 1 ? 's' : ''}</strong> selected
                          {:else}
                            Click to pick files &nbsp;<span class="op-attach-or">or drag & drop</span>
                          {/if}
                        </span>
                        <input type="file" multiple accept="*/*" style="display:none;"
                          on:change={(e) => { if (!orderAttachSending) orderAttachFiles = Array.from(e.target.files ?? []); }}
                          bind:this={orderChatFileInput}
                          disabled={orderAttachSending}
                        />
                      </label>
                      {#if orderAttachFiles.length > 0}
                        <div class="op-attach-chips">
                          {#each orderAttachFiles as f, fi}
                            <span class="op-attach-file-chip op-attach-file-chip--new">
                              <i class="ti ti-file-description"></i>
                              <span class="op-attach-chip-name">{f.name}</span>
                              <button class="op-attach-chip-remove" on:click={() => { orderAttachFiles = orderAttachFiles.filter((_, i) => i !== fi); }} title="Remove">
                                <i class="ti ti-x"></i>
                              </button>
                            </span>
                          {/each}
                        </div>
                      {/if}
                      <button class="op-attach-upload-btn" on:click={addOrderAttachment} disabled={orderAttachSending || orderAttachFiles.length === 0}>
                        {#if orderAttachSending}
                          <span class="spinner-border spinner-border-sm" style="width:13px;height:13px;border-width:2px;"></span> Uploading…
                        {:else}
                          <i class="ti ti-upload"></i> Upload
                        {/if}
                      </button>
                    </div>
                  </div>
                  {/if}

                {:else}
                  <div class="text-center text-muted py-5">Failed to load order.</div>
                {/if}
              </div>
            </div>
          {/if}

        </div>
        {/if}
        <!-- ── End right panel stack ── -->

      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Badge tab selector ─────────────────────────────── */
  /* ── Order drawer tabs ─────────────────────────────── */
  .op-tab-btn {
    padding: 3px 10px;
    border-radius: 16px;
    border: 1.5px solid #dee2e6;
    background: transparent;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    color: #6c757d;
    transition: all 0.15s ease;
    line-height: 1.6;
    white-space: nowrap;
    display: flex;
    align-items: center;
  }
  .op-tab-btn:hover { border-color: #adb5bd; background: #f0f4ff; color: #495057; }
  .op-tab-btn--active { background: #2563eb; color: #fff; border-color: #2563eb; }

  /* ── Order chat tab ─────────────────────────────── */
  .op-chat-wrap { display: flex; flex-direction: column; height: 100%; }
  .op-list-wrap { position: relative; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .op-scroll-bottom-btn { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 10; width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid #dee2e6; background: #fff; color: #3b5bdb; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); cursor: pointer; transition: background 0.15s, color 0.15s; }
  .op-scroll-bottom-btn:hover { background: #3b5bdb; color: #fff; }
  .op-chat-list { flex: 1 1 0; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .op-chat-msg { display: flex; flex-direction: column; gap: 2px; }
  .op-chat-meta { display: flex; align-items: baseline; gap: 6px; }
  .op-chat-sender { font-size: 11px; font-weight: 600; color: #3b5bdb; }
  .op-chat-time { font-size: 10px; color: #adb5bd; }
  .op-chat-bubble { background: #f1f3f5; border-radius: 0 8px 8px 8px; padding: 6px 10px; font-size: 12px; color: #212529; line-height: 1.5; word-break: break-word; }
  .op-chat-input-row { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid #f0f0f0; background: #fafafa; flex-shrink: 0; }

  /* ── Order attachments tab ─────────────────────────────── */
  .op-attach-wrap { display: flex; flex-direction: column; height: 100%; position: relative; }
  .op-attach-list { flex: 1 1 0; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .op-attach-item { background: #f8f9fa; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
  .op-attach-title { font-weight: 600; color: #343a40; margin-bottom: 2px; }
  .op-attach-link { font-size: 11px; color: #3b5bdb; word-break: break-all; display: block; }
  .op-attach-time { font-size: 10px; color: #adb5bd; margin-top: 4px; }
  .op-attach-thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; border: 1px solid #dee2e6; }
  .op-attach-file-chip { display: inline-flex; align-items: center; font-size: 10px; background: #e9ecef; color: #495057; border-radius: 4px; padding: 2px 6px; text-decoration: none; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; gap: 3px; }
  .op-attach-chip-remove { background: none; border: none; padding: 0; cursor: pointer; color: #868e96; display: flex; align-items: center; flex-shrink: 0; font-size: 10px; line-height: 1; }
  .op-attach-chip-remove:hover { color: #dc3545; }
  .op-attach-upload { padding: 10px 12px; border-top: 1px solid #e9ecef; background: #f8f9fa; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
  .op-attach-title-input { width: 100%; font-size: 12px; padding: 5px 9px; border: 1px solid #dee2e6; border-radius: 6px; outline: none; color: #495057; background: #fff; transition: border-color 0.15s, box-shadow 0.15s; }
  .op-attach-title-input:focus { border-color: #748ffc; box-shadow: 0 0 0 3px rgba(116,143,252,0.15); }
  .op-attach-title-input::placeholder { color: #adb5bd; }
  .op-attach-dropzone { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #fff; border: 1.5px dashed #ced4da; border-radius: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
  .op-attach-dropzone:hover, .op-attach-dropzone.has-files { border-color: #748ffc; background: #f0f4ff; }
  .op-attach-dropzone.is-uploading { pointer-events: none; opacity: 0.6; cursor: not-allowed; }
  .op-attach-clip-icon { font-size: 16px; color: #868e96; flex-shrink: 0; }
  .op-attach-dropzone:hover .op-attach-clip-icon, .op-attach-dropzone.has-files .op-attach-clip-icon { color: #4c6ef5; }
  .op-attach-dropzone-text { font-size: 11.5px; color: #6c757d; }
  .op-attach-dropzone.has-files .op-attach-dropzone-text { color: #3b5bdb; }
  .op-attach-or { color: #adb5bd; }
  .op-attach-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .op-attach-file-chip--new { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: #e7f0ff; color: #3b5bdb; border: 1px solid #bac8ff; border-radius: 20px; padding: 3px 8px; max-width: 180px; }
  .op-attach-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
  .op-attach-upload-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 7px 0; border: none; border-radius: 8px; background: linear-gradient(135deg, #4c6ef5, #748ffc); color: #fff; cursor: pointer; transition: opacity 0.15s, box-shadow 0.15s; box-shadow: 0 2px 6px rgba(76,110,245,0.25); }
  .op-attach-upload-btn:hover:not(:disabled) { opacity: 0.9; box-shadow: 0 4px 10px rgba(76,110,245,0.35); }
  .op-attach-upload-btn:disabled { background: #adb5bd; box-shadow: none; cursor: not-allowed; opacity: 0.7; }

  .badge-tab {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    border: 1.5px solid #dee2e6;
    background: transparent;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    color: #6c757d;
    transition: all 0.15s ease;
    line-height: 1.5;
    white-space: nowrap;
  }
  .badge-tab:hover {
    border-color: #adb5bd;
    background: #f8f9fa;
    color: #495057;
  }
  .badge-tab--type-active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }
  .badge-tab--priority-low.badge-tab--active    { background: #198754; color: #fff; border-color: #198754; }
  .badge-tab--priority-medium.badge-tab--active { background: #ffc107; color: #000; border-color: #ffc107; }
  .badge-tab--priority-high.badge-tab--active   { background: #dc3545; color: #fff; border-color: #dc3545; }

  .chat-card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    height: calc(100vh - 100px);
    min-height: 480px;
    overflow: hidden;
  }
  .chat-header {
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
    border-radius: 16px 16px 0 0;
  }
  .chat-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 15px; flex-shrink: 0;
  }
  .chat-avatar--sm { width: 32px; height: 32px; font-size: 12px; }
  .chat-avatar--support    { background: #e8f0fe; color: #3b5bdb; font-size: 18px; }
  /* own — blue */
  .chat-avatar--own        { background: #3b5bdb; color: #fff; }
  /* admin / master — purple */
  .chat-avatar--admin      { background: #7048e8; color: #fff; }
  /* tech / support team — teal */
  .chat-avatar--tech       { background: #0ca678; color: #fff; }
  /* telecaller / requester — amber */
  .chat-avatar--telecaller { background: #f59f00; color: #fff; }
  /* fallback */
  .chat-avatar--other      { background: #f1f3f5; color: #495057; }
  .chat-policy-notice {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; background: #fff5f5;
    border-bottom: 1px solid #fecaca;
    font-size: 12px; color: #991b1b;
    overflow: hidden;
  }
  .chat-policy-icon {
    font-size: 14px; color: #dc3545; flex-shrink: 0;
  }
  .chat-policy-marquee-wrap {
    flex: 1; overflow: hidden; white-space: nowrap;
  }
  .chat-policy-marquee-text {
    display: inline-block;
    animation: policy-marquee 22s linear infinite;
  }
  .chat-policy-marquee-text:hover {
    animation-play-state: paused;
  }
  @keyframes policy-marquee {
    0%   { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  .chat-messages-wrap {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* drag-and-drop overlay */
  .drag-overlay {
    position: absolute;
    inset: 0;
    background: rgba(59, 91, 219, 0.10);
    border: 2.5px dashed #3b5bdb;
    border-radius: 8px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: drag-overlay-in 0.15s ease;
  }
  @keyframes drag-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .drag-overlay-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: #3b5bdb;
    font-weight: 700;
    font-size: 18px;
    background: rgba(255, 255, 255, 0.88);
    padding: 28px 40px;
    border-radius: 14px;
    box-shadow: 0 4px 20px rgba(59, 91, 219, 0.18);
  }
  .drag-overlay-content i { font-size: 42px; opacity: 0.85; }
  .chat-messages {
    display: flex; flex-direction: column; gap: 16px;
    padding: 20px; background: #f8f9fa;
  }
  .new-msg-banner {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    background: #3b5bdb;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    box-shadow: 0 3px 10px rgba(59,91,219,0.35);
    animation: new-msg-slide-up 0.2s ease;
    z-index: 10;
    white-space: nowrap;
  }
  .new-msg-banner:hover { background: #2f4ac2; }
  .new-msg-banner i { font-size: 13px; }
  @keyframes new-msg-slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .scroll-bottom-btn {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 34px; height: 34px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid #c5cff9;
    color: #3b5bdb;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(59,91,219,0.15);
    transition: background 0.15s, border-color 0.15s;
    z-index: 10;
    animation: scroll-btn-slide-up 0.2s ease;
  }
  .scroll-bottom-btn:hover { background: #eef2ff; border-color: #748ffc; }
  @keyframes scroll-btn-slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .chat-empty { text-align: center; color: #adb5bd; margin-top: 40px; font-size: 14px; }
  .chat-empty i { font-size: 2.5rem; display: block; margin-bottom: 8px; }
  .chat-row { display: flex; align-items: flex-end; gap: 8px; }
  .chat-row--own { flex-direction: row-reverse; }
  /* highlight flash when scrolled-to */
  .chat-row--highlight .chat-bubble { animation: msg-highlight 1.5s ease; }
  @keyframes msg-highlight {
    0%, 100% { box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    25%       { box-shadow: 0 0 0 3px #748ffc66; }
    75%       { box-shadow: 0 0 0 3px #748ffc33; }
  }
  /* new message: slide-in on row */
  .chat-row--new { animation: new-row-slide-in 0.25s ease; }
  @keyframes new-row-slide-in {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  /* new message: glow pulse on bubble */
  .chat-bubble--new { animation: new-bubble-glow 1.4s ease forwards; }
  @keyframes new-bubble-glow {
    0%   { box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    25%  { box-shadow: 0 0 0 4px rgba(59,91,219,0.22); }
    65%  { box-shadow: 0 0 0 4px rgba(59,91,219,0.08); }
    100% { box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
  }
  .chat-bubble {
    width: 100%; padding: 10px 14px; border-radius: 16px;
    line-height: 1.5; position: relative; word-break: break-word;
    box-sizing: border-box;
  }
  .chat-copy-btn {
    position: absolute; top: 6px; right: 8px;
    background: none; border: none; padding: 2px 3px;
    border-radius: 4px; cursor: pointer; line-height: 1;
    font-size: 12px; color: inherit;
    opacity: 0; transition: opacity 0.15s;
  }
  .chat-bubble:hover .chat-copy-btn { opacity: 0.5; }
  .chat-copy-btn:hover { opacity: 1 !important; }
  /* own — light blue tint */
  .chat-bubble--own {
    background: #dbe4ff; color: #1c3faa;
    border-bottom-right-radius: 4px;
    border-right: 3px solid #3b5bdb;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* admin / master — light purple tint */
  .chat-bubble--admin {
    background: #f3f0ff; color: #3b2a8c;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #7048e8;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* tech / support team — light teal tint */
  .chat-bubble--tech {
    background: #e6fcf5; color: #0b5e45;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #0ca678;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* telecaller / requester — light amber tint */
  .chat-bubble--telecaller {
    background: #fff9db; color: #7a4800;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #f59f00;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* fallback — plain white */
  .chat-bubble--other {
    background: #fff; color: #212529;
    border-bottom-left-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  }
  /* bubble wrapper — needed for reply button hover */
  .chat-bubble-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 68%;
  }
  .chat-row--own .chat-bubble-wrap { align-items: flex-end; }
  /* extra horizontal space so the absolutely-positioned flag button isn't clipped */
  .chat-bubble-wrap { overflow: visible; }

  /* reply button — flex sibling in chat-row, shown on row hover */
  .chat-reply-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #6c757d; font-size: 13px; cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .chat-reply-btn:hover { background: #dbe4ff; color: #3b5bdb; border-color: #c5cff9; }

  /*
   * Own messages use flex-direction: row-reverse.
   * HTML order: [bubble-wrap] [chat-action-btns] [own-avatar]
   * row-reverse order: avatar(right, order 0) → bubble(middle, order 2) → action-btns(left, order 3)
   */
  .chat-row--own .chat-bubble-wrap { order: 2; }

  /* reply quote block inside bubble */
  .chat-reply-quote {
    display: flex; flex-direction: column; gap: 1px;
    padding: 5px 10px; border-radius: 6px; margin-bottom: 6px;
    cursor: pointer; transition: opacity 0.15s;
    border-left: 3px solid rgba(0,0,0,0.15);
    background: rgba(0,0,0,0.05);
    max-width: 100%;
  }
  .chat-reply-quote:hover { opacity: 0.8; }
  .chat-reply-quote--own { background: rgba(59,91,219,0.1); border-left-color: rgba(59,91,219,0.4); }
  .chat-reply-quote-sender { font-size: 10.5px; font-weight: 700; opacity: 0.85; }
  .chat-reply-quote-text {
    font-size: 11.5px; opacity: 0.75;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 260px;
  }

  /* reply preview bar above input */
  .chat-reply-preview {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 16px; border-top: 1px solid #e9ecef;
    background: #f8f9fa;
  }
  .chat-reply-preview-icon { color: #3b5bdb; font-size: 16px; flex-shrink: 0; }
  .chat-reply-preview-body { flex: 1; display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
  .chat-reply-preview-sender { font-size: 11px; font-weight: 700; color: #3b5bdb; }
  .chat-reply-preview-text {
    font-size: 12px; color: #6c757d;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chat-reply-preview-close {
    background: none; border: none; padding: 2px 4px; cursor: pointer;
    color: #adb5bd; font-size: 14px; flex-shrink: 0;
    display: flex; align-items: center; border-radius: 4px;
  }
  .chat-reply-preview-close:hover { color: #dc3545; background: #fff0f0; }

  .chat-sender { font-size: 11px; font-weight: 600; margin-bottom: 3px; opacity: 0.75; letter-spacing: 0.3px; }
  .chat-text { white-space: pre-line; font-size: 14px; }
  .read-more-btn {
    display: inline-flex; align-items: center; gap: 3px;
    background: none; border: none; padding: 2px 0 0;
    font-size: 11.5px; font-weight: 600; cursor: pointer;
    letter-spacing: 0.2px; transition: opacity 0.15s;
    opacity: 0.7;
  }
  .read-more-btn:hover { opacity: 1; }
  .read-more-btn--own        { color: #3b5bdb; }
  .read-more-btn--admin      { color: #7048e8; }
  .read-more-btn--tech       { color: #0ca678; }
  .read-more-btn--telecaller { color: #f59f00; }
  .read-more-btn--other      { color: #3b5bdb; }
  .chat-time-row {
    display: flex; align-items: center; gap: 8px;
    margin-top: 5px; justify-content: flex-end; flex-wrap: wrap;
  }
  .chat-row--own .chat-time-row { flex-direction: row; }
  .chat-time { font-size: 10px; opacity: 0.6; }
  .final-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.3px;
    color: #0ca678; background: #e6fcf5; border: 1px solid #0ca678;
    padding: 1px 7px; border-radius: 20px;
  }
  .final-badge i { font-size: 10px; }

  /* final flag button — inline inside chat-action-btns */
  .final-flag-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #adb5bd; font-size: 13px; cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .final-flag-btn:hover { background: #e6fcf5; color: #0ca678; border-color: #0ca678; }
  .final-flag-btn--active { background: #e6fcf5; color: #0ca678; border-color: #0ca678; }
  .final-flag-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* highlighted bubble when marked as final quotation */
  .chat-bubble--final {
    outline: 2px solid #0ca678;
    outline-offset: 1px;
  }
  .chat-input-bar {
    display: flex; align-items: flex-end; gap: 10px;
    padding: 10px 16px 12px; background: transparent;
  }
  .chat-input-grow-wrap {
    flex: 1; position: relative; display: flex; flex-direction: column;
  }
  .chat-input {
    width: 100%; border: 1px solid #dee2e6; border-radius: 20px;
    padding: 10px 16px; font-size: 14px; resize: none; outline: none;
    line-height: 1.5; max-height: 200px; overflow-y: auto;
    transition: border-color 0.2s; box-sizing: border-box;
  }
  .chat-input:focus { border-color: #3b5bdb; }
  .chat-input { scrollbar-width: thin; scrollbar-color: #c5cff9 transparent; }
  .chat-input::-webkit-scrollbar       { width: 4px; }
  .chat-input::-webkit-scrollbar-track { background: transparent; }
  .chat-input::-webkit-scrollbar-thumb { background: #c5cff9; border-radius: 10px; }
  .chat-input::-webkit-scrollbar-thumb:hover { background: #3b5bdb; }
  .chat-char-count {
    align-self: flex-end; font-size: 11px; color: #adb5bd;
    margin-top: 3px; padding-right: 6px; user-select: none;
  }
  .chat-send-btn {
    width: 42px; height: 42px; border-radius: 50%; background: #3b5bdb;
    color: #fff; border: none; display: flex; align-items: center;
    justify-content: center; font-size: 18px; cursor: pointer; flex-shrink: 0;
    transition: background 0.2s, transform 0.1s;
  }
  .chat-send-btn:hover:not(:disabled) { background: #2f4ac2; transform: scale(1.05); }
  .chat-send-btn:disabled { background: #adb5bd; cursor: not-allowed; }
  .chat-blocked {
    padding: 14px 20px; text-align: center; font-size: 13px; color: #6c757d;
    background: #fff; border-top: 1px solid #f0f0f0; border-radius: 0 0 16px 16px;
  }
  /* ── Suggested messages ─────────────────────────────────────────────────────── */
  .chat-suggestions {
    padding: 5px 12px;
    background: #f8f9ff;
    border-top: 1px solid #e9ecef;
  }
  .chat-suggestions__chips {
    display: flex; flex-wrap: nowrap; gap: 6px;
    overflow-x: auto; padding-bottom: 6px;
    scrollbar-width: thin;
    scrollbar-color: #c5cff9 transparent;
  }
  .chat-suggestions__chips::-webkit-scrollbar { height: 1px; }
  .chat-suggestions__chips::-webkit-scrollbar-thumb { background: #c5cff9; border-radius: 10px; min-width: 20px; max-width: 60px; }
  .chat-suggestions__chips::-webkit-scrollbar-track { background: transparent; }
  .chat-suggestion-chip {
    flex-shrink: 0;
    font-size: 11.5px; font-weight: 500;
    padding: 4px 10px; border-radius: 20px;
    background: #fff; border: 1px solid #c5cff9; color: #3b5bdb;
    cursor: pointer; transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .chat-suggestion-chip:hover { background: #eef2ff; border-color: #748ffc; }
  .chat-suggestion-chip:disabled { opacity: 0.5; cursor: not-allowed; }

  .chat-input-wrap { background: #fff; border-top: 1px solid #f0f0f0; border-radius: 0 0 16px 16px; }
  .chat-file-preview-row {
    padding: 8px 16px 0;
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  }
  .chip-limit-note { font-size: 11px; color: #868e96; font-style: italic; }

  /* ── Upload progress indicator ──────────────────────────────────────────────── */
  .chat-upload-indicator {
    position: relative; overflow: hidden;
    padding: 5px 14px; background: #eef2ff;
    border-top: 1px solid #c5cff9;
    display: flex; align-items: center;
  }
  .chat-upload-indicator__bar {
    position: absolute; left: 0; top: 0; bottom: 0; width: 40%;
    background: linear-gradient(90deg, transparent, rgba(99,102,241,0.18), transparent);
    animation: upload-sweep 1.4s ease-in-out infinite;
  }
  @keyframes upload-sweep {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
  .chat-upload-indicator__label {
    position: relative; z-index: 1;
    font-size: 12px; color: #3b5bdb; font-weight: 500;
    display: flex; align-items: center; gap: 4px;
  }
  .chat-file-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px 5px 8px; border-radius: 20px;
    background: #eef2ff; border: 1px solid #c5cff9;
    color: #3b5bdb; font-size: 12px; font-weight: 500; max-width: 100%;
    cursor: pointer; transition: background 0.15s, border-color 0.15s;
  }
  .chat-file-chip:hover { background: #dbe4ff; border-color: #748ffc; }
  .chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .chip-remove {
    background: none; border: none; padding: 0; line-height: 1;
    color: #3b5bdb; cursor: pointer; opacity: 0.7; font-size: 13px;
    display: flex; align-items: center; flex-shrink: 0;
  }
  .chip-remove:hover { opacity: 1; }
  /* ── Chip image thumbnail ───────────────────────────────────────────────── */
  .chip-thumb {
    width: 20px; height: 20px; object-fit: cover;
    border-radius: 4px; flex-shrink: 0; display: block;
  }

  /* ── Pending-files preview modal — slider ────────────────────────────────── */
  .pf-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.50);
    z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    animation: pf-fade-in 0.15s ease;
  }
  @keyframes pf-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .pf-card {
    background: #fff;
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    width: min(420px, 94vw);
    display: flex; flex-direction: column;
    overflow: hidden;
    animation: pf-slide-in 0.18s ease;
  }
  @keyframes pf-slide-in {
    from { opacity: 0; transform: scale(0.96) translateY(-10px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }

  /* header */
  .pf-header {
    display: flex; align-items: center; gap: 8px;
    padding: 13px 16px;
    border-bottom: 1px solid #f1f3f5;
    font-size: 13px; font-weight: 700; color: #212529;
    flex-shrink: 0;
  }
  .pf-index {
    margin-left: auto;
    font-size: 11px; font-weight: 600; color: #868e96;
    background: #f1f3f5; padding: 2px 9px; border-radius: 20px;
  }
  .pf-close {
    background: none; border: none; padding: 2px 4px; cursor: pointer;
    color: #adb5bd; font-size: 14px;
    display: flex; align-items: center; border-radius: 4px;
    transition: color 0.15s;
  }
  .pf-close:hover { color: #dc3545; }

  /* over-limit warning */
  .pf-warn {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 14px;
    background: #fff8e6; border-bottom: 1px solid #ffc94d;
    font-size: 11.5px; font-weight: 600; color: #7a4800;
    flex-shrink: 0;
  }

  /* main stage */
  .pf-stage {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    height: 240px;
    background: #f8f9fa;
    flex-shrink: 0;
    overflow: hidden;
  }
  .pf-preview {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    position: relative;
    padding: 10px 12px;
    box-sizing: border-box;
  }
  .pf-preview--overlimit::after {
    content: '';
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.28);
    pointer-events: none;
  }
  .pf-stage-img {
    max-width: 100%; max-height: 100%;
    object-fit: contain; display: block;
    user-select: none;
    border: 1.5px solid #dee2e6;
    border-radius: 6px;
    margin: 3px 0;
  }
  .pf-stage-file {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    cursor: pointer; padding: 16px; border-radius: 12px;
    transition: background 0.15s;
    outline: none;
  }
  .pf-stage-file:hover { background: rgba(59,91,219,0.06); }
  .pf-stage-file:hover .pf-stage-file-icon { color: #3b5bdb; }
  .pf-stage-file:hover .pf-stage-open-hint { opacity: 1; }
  .pf-stage-file-icon { font-size: 72px; color: #adb5bd; line-height: 1; transition: color 0.15s; }
  .pf-stage-ext {
    font-size: 12px; font-weight: 700; color: #6c757d;
    background: #e9ecef; padding: 3px 12px; border-radius: 20px;
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  .pf-stage-open-hint {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600; color: #3b5bdb;
    opacity: 0; transition: opacity 0.15s;
  }
  /* remove button — bottom-centre of stage */
  .pf-stage-remove {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 16px; border-radius: 20px;
    background: rgba(220,53,69,0.85); border: none; color: #fff;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
    z-index: 2; white-space: nowrap;
  }
  .pf-stage-remove:hover { background: #dc3545; }
  /* over-limit badge */
  .pf-overlimit-badge {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 13px; border-radius: 20px;
    background: rgba(0,0,0,0.55); color: #fff;
    font-size: 11.5px; font-weight: 600;
    z-index: 3; white-space: nowrap;
  }
  /* arrow buttons */
  .pf-arrow {
    position: absolute; top: 50%; transform: translateY(-50%);
    z-index: 5;
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.92); border: 1px solid #dee2e6;
    color: #495057; font-size: 17px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.14);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .pf-arrow:hover { background: #fff; color: #3b5bdb; border-color: #748ffc; }
  .pf-arrow--left  { left: 10px; }
  .pf-arrow--right { right: 10px; }

  /* filename label */
  .pf-stage-name {
    padding: 8px 16px 4px;
    font-size: 11.5px; font-weight: 500; color: #495057;
    text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex-shrink: 0;
  }

  /* thumbnail strip */
  .pf-strip {
    display: flex; gap: 6px; align-items: center;
    padding: 8px 14px 12px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .pf-strip::-webkit-scrollbar { display: none; }
  .pf-thumb {
    flex-shrink: 0;
    width: 46px; height: 46px;
    border-radius: 8px; overflow: hidden;
    border: 2.5px solid transparent;
    background: #f1f3f5;
    cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.15s, opacity 0.15s;
  }
  .pf-thumb--active  { border-color: #3b5bdb; }
  .pf-thumb--overlimit { opacity: 0.35; }
  .pf-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pf-thumb-icon { font-size: 22px; color: #adb5bd; }

  /* footer */
  .pf-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid #f1f3f5;
    flex-shrink: 0;
  }
  .pf-btn-cancel {
    padding: 7px 16px; border-radius: 8px;
    border: 1px solid #dee2e6; background: #fff;
    color: #6c757d; font-size: 13px; font-weight: 500; cursor: pointer;
    transition: background 0.15s;
  }
  .pf-btn-cancel:hover { background: #f8f9fa; }
  .pf-btn-confirm {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 18px; border-radius: 8px;
    background: #3b5bdb; border: none; color: #fff;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
  }
  .pf-btn-confirm:hover:not(:disabled) { background: #2f4ac2; }
  .pf-btn-confirm:disabled { background: #adb5bd; cursor: not-allowed; }

  .chat-attach-btn {
    width: 36px; height: 36px; border-radius: 50%; background: #f1f3f5;
    color: #6c757d; display: flex; align-items: center; justify-content: center;
    font-size: 18px; cursor: pointer; flex-shrink: 0; border: none;
    transition: background 0.2s, color 0.2s;
  }
  .chat-attach-btn:hover:not(:disabled) { background: #e8ecf8; color: #3b5bdb; }
  .chat-attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-attachments-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 3px;
    margin-top: 6px;
    border-radius: 8px;
    overflow: hidden;
    max-width: 200px;
  }
  .chat-attachments-grid--single { grid-template-columns: 1fr; }
  .chat-attachments-files { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .chat-attachment-img-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    display: block; width: 100%; aspect-ratio: 1; overflow: hidden;
  }
  .chat-attachments-grid--single .chat-attachment-img-btn { aspect-ratio: auto; }
  .chat-attachment-img-btn:hover .chat-attachment-img { opacity: 0.85; }
  .chat-attachment-img {
    width: 100%; height: 100%; display: block;
    cursor: pointer; object-fit: cover; border: none;
    transition: opacity 0.15s;
  }
  .chat-attachments-grid--single .chat-attachment-img {
    max-width: 200px; max-height: 200px; width: auto; height: auto;
    border-radius: 8px; border: 1px solid rgba(0,0,0,0.06); object-fit: contain;
  }
  .chat-attachment-file {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 500;
    background: rgba(0,0,0,0.07); color: inherit; text-decoration: none;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chat-attachment-file:hover { background: rgba(0,0,0,0.13); text-decoration: none; }
  .chat-attachment-file--own { background: rgba(59,91,219,0.12); color: #1c3faa; }
  .chat-attachment-file--own:hover { background: rgba(59,91,219,0.2); }

  /* ── Chat action buttons (reply + edit) ─────────────────────────────────── */
  .chat-action-btns {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: flex-end;
    margin-bottom: 6px;
    flex-shrink: 0;
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .chat-row:hover .chat-action-btns { visibility: visible; opacity: 1; }
  .chat-row--own .chat-action-btns { order: 3; }

  .chat-edit-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #6c757d; font-size: 13px; cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .chat-edit-btn:hover { background: #fff3cd; color: #b45309; border-color: #fde68a; }

  .chat-delete-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #6c757d; font-size: 13px; cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .chat-delete-btn:hover { background: #ffe3e3; color: #c92a2a; border-color: #ffc9c9; }
  .chat-delete-btn:disabled { opacity: 0.5; cursor: default; }

  .chat-deleted-text {
    font-size: 12.5px;
    color: #868e96;
    font-style: italic;
    padding: 2px 0 4px;
  }
  .chat-deleted-original {
    margin-top: 4px;
    padding: 6px 10px;
    background: rgba(0,0,0,0.05);
    border-left: 3px solid #fa5252;
    border-radius: 4px;
    font-size: 12.5px;
    color: #495057;
  }

  .chat-edit-input {
    width: 100%;
    border: 1px solid #748ffc;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    resize: none;
    outline: none;
    line-height: 1.5;
    background: rgba(255,255,255,0.85);
    color: inherit;
    margin-top: 4px;
    box-sizing: border-box;
  }
  .chat-edit-input:focus { border-color: #3b5bdb; }

  .chat-edit-actions {
    display: flex; gap: 6px; margin-top: 5px; justify-content: flex-end;
  }
  .chat-edit-save {
    padding: 3px 12px; border-radius: 6px; border: none;
    background: #3b5bdb; color: #fff; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background 0.15s;
  }
  .chat-edit-save:hover:not(:disabled) { background: #2f4ac2; }
  .chat-edit-save:disabled { opacity: 0.55; cursor: not-allowed; }
  .chat-edit-cancel {
    padding: 3px 10px; border-radius: 6px;
    border: 1px solid #dee2e6; background: #fff;
    color: #6c757d; font-size: 12px; cursor: pointer;
    transition: background 0.15s;
  }
  .chat-edit-cancel:hover { background: #f8f9fa; }

  .chat-edited-badge {
    font-size: 9.5px; color: #adb5bd;
    font-style: italic; letter-spacing: 0.2px;
  }

  /* ── Read receipt ticks ──────────────────────────────────────────────────── */
  .chat-tick {
    font-size: 11px; color: #adb5bd; letter-spacing: -2px; line-height: 1;
    flex-shrink: 0;
  }
  .chat-tick--read { color: #339af0; }

  /* ── Switch shimmer bar ─────────────────────────────────────────────────── */
  /* Always 3px tall so layout never shifts — only the animation turns on/off */
  .switch-bar {
    height: 3px;
    background: transparent;
    border-radius: 3px 3px 0 0;
    flex-shrink: 0;
  }
  .switch-bar--chat {
    border-radius: 16px 16px 0 0;
  }
  .switch-bar--active {
    background: linear-gradient(90deg, #eef2ff 0%, #3b5bdb 40%, #748ffc 60%, #eef2ff 100%);
    background-size: 250% 100%;
    animation: switch-shimmer 1.2s linear infinite;
  }
  @keyframes switch-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  /* ─────────────────────────────────────────────────────────────────────────── */

  /* ── Query detail card ───────────────────────────────────────────────────── */
  .qd-card {
    background: #fff; border-radius: 6px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    overflow: hidden;
  }
  .qd-card-label {
    display: flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 700; color: #868e96;
    text-transform: uppercase; letter-spacing: 0.6px;
    padding: 8px 14px 0;
  }
  .qd-card-label i { font-size: 11px; }

  /* header */
  .qd-header {
    padding: 14px 18px;
    border-bottom: 1px solid #f1f3f5;
    display: flex; align-items: flex-start; gap: 8px;
  }
  .qd-header--collapsed { border-bottom: none; }
  .qd-header:hover { background: #f8f9fa; }
  .qd-collapse-btn {
    background: none; border: none; cursor: pointer;
    color: #adb5bd; font-size: 14px; padding: 2px;
    flex-shrink: 0; margin-top: 2px;
    display: flex; align-items: center;
  }
  .qd-collapse-btn:hover { color: #495057; }
  .qd-subject-wrap {
    display: flex; flex-direction: row; align-items: center;
    gap: 8px; flex: 1; min-width: 0; flex-wrap: nowrap;
  }
  .qd-subject {
    font-size: 15px; font-weight: 700;
    color: #1a1a2e; margin: 0; line-height: 1.4;
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .qd-ticket-badge {
    flex-shrink: 0;
    font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
    background: #f1f3f5; border: 1px solid #dee2e6;
    border-radius: 4px; padding: 2px 7px; color: #495057;
  }
  .qd-status-badge { flex-shrink: 0; font-size: 11px; padding: 4px 9px; border-radius: 20px; }

  /* tags */
  .qd-tags {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 10px 18px;
    border-bottom: 1px solid #f1f3f5;
  }
  .qd-tag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11.5px; font-weight: 500;
    padding: 3px 10px; border-radius: 20px;
  }
  .qd-tag i { font-size: 12px; }
  .qd-tag--type { background: #f1f3f5; color: #495057; }
  .qd-tag--priority { color: #fff; }
  .qd-tag--high   { background: #dc3545; }
  .qd-tag--medium { background: #ffc107; color: #212529 !important; }
  .qd-tag--low    { background: #198754; }

  /* description */
  .qd-description {
    padding: 12px 18px;
    font-size: 13px; color: #6c757d;
    white-space: pre-line; line-height: 1.6;
    border-bottom: 1px solid #f1f3f5;
  }
  .qd-description .qd-meta-label {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;
    color: #3b5bdb;
    background: #eef2ff; border-radius: 5px;
    padding: 2px 8px; margin-bottom: 6px;
  }
  .qd-description .qd-meta-label i { font-size: 12px; }

  /* reopened alert */
  .qd-alert {
    display: flex; align-items: flex-start; gap: 8px;
    margin: 0; padding: 10px 18px;
    background: #fff9e6; border-bottom: 1px solid #fde68a;
    font-size: 12px; color: #7a5800;
  }
  .qd-alert i { font-size: 15px; color: #d97706; flex-shrink: 0; margin-top: 1px; }

  /* meta */
  .qd-meta {
    padding: 10px 18px;
    display: flex; flex-direction: column; gap: 6px;
    border-bottom: 1px solid #f1f3f5;
  }
  .qd-meta-row {
    display: flex; align-items: center;
    justify-content: space-between; gap: 8px;
  }
  .qd-meta-label {
    font-size: 11.5px; color: #adb5bd;
    display: flex; align-items: center; gap: 4px;
    white-space: nowrap; flex-shrink: 0;
  }
  .qd-meta-label i { font-size: 12px; }
  .qd-meta-value {
    font-size: 12px; color: #495057; font-weight: 500;
    text-align: right; word-break: break-word;
  }

  /* actions */
  .qd-actions {
    padding: 12px 18px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .qd-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    border: none; transition: opacity 0.15s, transform 0.1s;
    width: 100%;
  }
  .qd-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .qd-btn:not(:disabled):hover { opacity: 0.88; }
  .qd-btn:not(:disabled):active { transform: scale(0.98); }
  .qd-btn i { font-size: 15px; }
  .qd-btn--success       { background: #198754; color: #fff; }
  .qd-btn--warning       { background: #ffc107; color: #212529; }
  .qd-btn--danger-outline {
    background: transparent; color: #dc3545;
    border: 1.5px solid #dc3545;
  }
  .qd-btn--danger-outline:not(:disabled):hover { background: #fff5f5; }
  /* ───────────────────────────────────────────────────────────────────────── */

  /* in-progress list */
  .in-progress-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; border-bottom: 1px solid #f3f4f6;
    border-left: 3px solid transparent;
    cursor: pointer; user-select: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .in-progress-row:last-child { border-bottom: none; }
  .in-progress-row:hover { background: #f8f9fa; }
  .in-progress-row--active { background: #eef2ff; border-left-color: #3b5bdb; }
  .in-progress-row--active:hover { background: #e5ebff; }

  /* circle avatar wrapper — needed for dot positioning */
  .ip-avatar-wrap { position: relative; flex-shrink: 0; width: 36px; height: 36px; }

  /* priority dot */
  .ip-priority-dot {
    position: absolute; top: 1px; right: 1px;
    width: 9px; height: 9px; border-radius: 50%;
    border: 1.5px solid #fff;
  }
  .ip-priority-dot--high   { background: #dc3545; }
  .ip-priority-dot--medium { background: #ffc107; }
  .ip-priority-dot--low    { background: #198754; }

  /* circle avatar */
  .ip-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid #e9ecef; background: #f8f9fa;
    color: #adb5bd; font-size: 16px; transition: border-color 0.15s, color 0.15s;
  }
  .ip-avatar--active { border-color: #c5cff9; color: #3b5bdb; background: #eef2ff; }
  .in-progress-row:hover .ip-avatar { border-color: #ced4da; }

  /* body — subject + sub-line */
  .ip-body {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; gap: 1px;
  }
  .ip-subject-row {
    display: flex; align-items: baseline; gap: 4px;
    overflow: hidden;
  }
  .ip-subject {
    font-size: 13px; font-weight: 500; color: #e07b00;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex: 1;
  }
  .ip-time {
    font-size: 10px; color: #adb5bd; white-space: nowrap; flex-shrink: 0;
  }
  .ip-sub {
    font-size: 11px; color: #3b5bdb;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ip-sub--typing {
    animation: typing-fade 1.2s infinite ease-in-out;
    font-style: italic;
  }
  @keyframes typing-fade {
    0%, 100% { opacity: 0.45; }
    50%       { opacity: 1; }
  }
  .ip-raised {
    font-size: 10px; color: #adb5bd;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* left column — same height as chat card */
  .query-left-col {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 100px);
    min-height: 480px;
    overflow: hidden;
  }
  /* qd-card: fixed height, scrollable if content overflows */
  .query-left-col .qd-card {
    flex-shrink: 0;
    overflow-y: auto;
    min-height: 0;
  }
  /* optional linked order card: also fixed */
  .query-left-col > .card.border-0.shadow-sm.mb-3 {
    flex-shrink: 0;
  }
  /* in-progress card: fill remaining space */
  .ip-card {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .ip-card .card-header { flex-shrink: 0; }

  /* scrollable list body — fills ip-card, no fixed max-height */
  .ip-list-body {
    flex: 1 1 0;
    max-height: none;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #e9ecef transparent;
  }
  .ip-list-body::-webkit-scrollbar { width: 4px; }
  .ip-list-body::-webkit-scrollbar-track { background: transparent; }
  .ip-list-body::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 10px; }
  .ip-list-body::-webkit-scrollbar-thumb:hover { background: #adb5bd; }

  /* raised by / assigned to meta line */
  .ip-meta {
    font-size: 10px; color: #adb5bd;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: flex; align-items: center; gap: 2px; margin-top: 1px;
  }

  /* load-more bottom states */
  .ip-loading-more {
    display: flex; align-items: center; justify-content: center;
    padding: 8px 0;
  }
  .ip-all-loaded {
    text-align: center; font-size: 10px; color: #ced4da;
    padding: 6px 0; letter-spacing: 0.3px;
  }

  /* unread count */
  .in-progress-unread {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px; padding: 0 5px;
    background: #dc3545; color: #fff; border-radius: 10px;
    font-size: 10px; font-weight: 700; line-height: 1; flex-shrink: 0;
  }

  /* live status banner */
  .status-live-banner {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-radius: 8px; margin-bottom: 14px;
    font-size: 13.5px; font-weight: 500; border: 1px solid transparent;
    animation: banner-slide-in 0.25s ease;
    position: relative;
  }
  @keyframes banner-slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .status-live-banner--in-progress  { background: #fff9e6; border-color: #ffc107; color: #7a5800; }
  .status-live-banner--resolved      { background: #edfaf3; border-color: #198754; color: #145c38; }
  .status-live-banner--closed        { background: #f4f5f6; border-color: #6c757d; color: #4a4f54; }
  .status-live-banner--reopened      { background: #fff0f0; border-color: #dc3545; color: #8b1a24; }
  .status-live-banner--open          { background: #eaf1ff; border-color: #0d6efd; color: #083a85; }
  .status-banner-close {
    margin-left: auto; background: none; border: none; padding: 0;
    font-size: 14px; cursor: pointer; opacity: 0.6; color: inherit;
    display: flex; align-items: center;
  }
  .status-banner-close:hover { opacity: 1; }

  /* typing indicator */
  .typing-indicator {
    display: flex; align-items: center; gap: 2px;
    color: #3b5bdb; font-size: 12px; font-style: italic;
  }
  .typing-dot {
    display: inline-block; width: 5px; height: 5px; border-radius: 50%;
    background: #3b5bdb; animation: typing-bounce 1.2s infinite ease-in-out;
  }
  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* ─── tech_helper chat avatar & bubble ──────────────────────────────────── */
  .chat-avatar--tech_helper { background: #e7f5ff; color: #1971c2; }
  .chat-bubble--tech_helper {
    background: #e7f5ff; color: #0d3a6e;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #339af0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }

  /* ─── sub-query raise button ─────────────────────────────────────────────── */
  .qd-btn--sub {
    background: #fff3bf; color: #5c3700;
    border: 1.5px solid #fcc419;
  }
  .qd-btn--sub:not(:disabled):hover { background: #ffec99; }

  /* blocking notice when open sub-queries exist */
  .qd-sub-block-notice {
    display: flex; align-items: flex-start; gap: 8px;
    background: #fff9db; border: 1px solid #fcc419; border-radius: 8px;
    padding: 8px 12px; font-size: 12px; color: #7a4800;
  }
  .qd-sub-block-notice i { font-size: 14px; margin-top: 1px; flex-shrink: 0; color: #f08c00; }

  /* ─── sub-query pinned panel ─────────────────────────────────────────────── */
  /* ─── chat header — size-normalize buttons + status badge ── */
  .sq-list-btn .badge { vertical-align: middle; font-size: 10px; }
  .chat-status-badge {
    font-size: 0.875rem;
    padding: 0.25rem 0.6rem;
    border-radius: 0.2rem;
  }

  /* ─── sub-queries list modal ─────────────────────────── */
  .sq-modal-table { font-size: 13px; }
  /* ── Inline sub-query chat panel ───────────────────────── */
  .sq-inline-card { border: 1.5px solid #e0e7ff; }
  .sq-inline-icon-btn { padding: 2px 6px; font-size: 12px; line-height: 1.4; }

  /* sq-modal-subject-btn: button styled as a clickable link (replaces <a> for inline sub-query open) */
  .sq-modal-subject-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    font-weight: 500; color: #212529; text-decoration: none;
    display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
    text-align: left; font-size: inherit; line-height: inherit;
  }
  .sq-modal-subject-btn:hover { color: #2563eb; text-decoration: underline; }
  .sq-modal-th-sr, .sq-modal-td-sr { width: 36px; text-align: center; color: #adb5bd; font-size: 12px; }
  .sq-modal-th-status, .sq-modal-td-status { width: 100px; text-align: right; white-space: nowrap; }
  .sq-modal-subject {
    font-weight: 500; color: #212529;
    text-decoration: none; display: block;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
  }
  .sq-modal-subject:hover { color: #2563eb; text-decoration: underline; }
  .sq-modal-subject-plain {
    font-weight: 500; color: #495057; display: block;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
  }
  .sq-modal-type   { font-size: 11px; }
  .sq-modal-status { font-size: 11px; }

  /* ─── sub-query creation modal (matches raise/edit query modal style) ───── */
  .modal-backdrop-custom {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    z-index: 1050; display: flex; align-items: flex-start;
    justify-content: center; padding: 1rem;
  }
  .modal-close-btn {
    position: absolute; top: 0.6rem; right: 0.75rem;
    background: none; border: none; font-size: 1.25rem; line-height: 1;
    color: #6c757d; cursor: pointer; padding: 0.25rem 0.4rem;
    border-radius: 4px; transition: color 0.15s, background 0.15s; z-index: 10;
  }
  .modal-close-btn:hover { color: #dc3545; background: rgba(220,53,69,0.08); }

  /* ─── inline sub-query event cards in chat ───────────────────────────────── */
  /* ── Centered system event divider ──────────────────────────────────────── */
  .chat-system-event {
    display: flex; align-items: center; gap: 8px;
    margin: 14px 16px; text-align: center;
  }
  .chat-system-event__line {
    flex: 1; height: 1px; background: #dee2e6;
  }
  /* color-coded lines by event type */
  .chat-system-event--reopened_same    .chat-system-event__line { background: #74c0fc; }
  .chat-system-event--reopened_other   .chat-system-event__line { background: #ffa94d; }
  .chat-system-event--escalated        .chat-system-event__line { background: #ffe066; }
  .chat-system-event--force_released   .chat-system-event__line { background: #ff8787; }

  /* text color matches line color */
  .chat-system-event--reopened_same  .chat-system-event__text { color: #1971c2; }
  .chat-system-event--reopened_other .chat-system-event__text { color: #e8590c; }
  .chat-system-event--escalated      .chat-system-event__text { color: #e67700; }
  .chat-system-event--force_released .chat-system-event__text { color: #c92a2a; }

  .chat-system-event__text {
    font-size: 11.5px; color: #868e96; flex-shrink: 0;
    max-width: 70%;
    white-space: normal; text-align: center;
    line-height: 1.4;
  }
  .chat-system-event__note {
    font-style: italic; opacity: 0.75;
  }
  .chat-system-event__time {
    display: block; font-size: 10px; opacity: 0.6; margin-top: 2px;
  }

  .sq-event-card {
    display: flex; align-items: center; gap: 10px;
    margin: 10px auto; padding: 8px 16px;
    background: #f8f9ff; border: 1px solid #dde3f8; border-radius: 20px;
    max-width: 420px; width: fit-content;
    font-size: 12.5px;
    position: relative;
  }
  .sq-event-card--clickable {
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .sq-event-card--clickable:hover {
    background: #eef2ff;
    border-color: #c5cff9;
    box-shadow: 0 2px 8px rgba(59, 91, 219, 0.12);
  }
  .sq-event-icon {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; flex-shrink: 0;
  }
  .sq-event-icon--created  { background: #e7f5ff; color: #1971c2; }
  .sq-event-icon--assigned { background: #e6fcf5; color: #0b7a5e; }
  .sq-event-icon--resolved { background: #ebfbee; color: #2b8a3e; }
  .sq-event-icon--closed   { background: #f8f9fa; color: #868e96; }
  .sq-event-body { display: flex; flex-direction: column; gap: 2px; }
  .sq-event-title { font-weight: 600; color: #495057; }
  .sq-event-unread {
    position: absolute; top: -7px; right: -7px;
    min-width: 18px; height: 18px; padding: 0 4px;
    background: #dc3545; color: #fff;
    border-radius: 9px; border: 2px solid #fff;
    font-size: 10px; font-weight: 700; line-height: 14px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .sq-event-link { font-size: 12px; }
  .sq-event-status { text-transform: capitalize; font-weight: 500; }
  .sq-event-status--open        { color: #1971c2; }
  .sq-event-status--in_progress { color: #e67700; }
  .sq-event-status--resolved    { color: #2b8a3e; }
  .sq-event-status--closed      { color: #868e96; }
  .sq-event-time { font-size: 11px; color: #adb5bd; }

  /* ── Order Side Drawer ───────────────────────────────────────────── */
  .order-inline-panel {
    height: calc(100vh - 100px);
    min-height: 480px;
    display: flex;
    flex-direction: column;
  }
  .order-inline-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .order-inline-body .op-chat-wrap,
  .order-inline-body .op-attach-wrap {
    margin: -14px -16px;
    height: calc(100% + 28px);
  }
  .order-inline-body::-webkit-scrollbar { width: 4px; }
  .order-inline-body::-webkit-scrollbar-track { background: transparent; }
  .order-inline-body::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 10px; }
  /* ── Inline order panel sections ── */
  .op-section {
    padding: 10px 0;
    border-bottom: 1px solid #f1f3f5;
  }
  .op-section-title {
    display: flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 700; color: #868e96;
    text-transform: uppercase; letter-spacing: 0.6px;
    margin-bottom: 6px;
  }
  .op-section-title i { font-size: 11px; }
  .op-row {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 8px; padding: 3px 0; font-size: 12px;
  }
  .op-label {
    display: inline-flex; align-items: center; gap: 4px;
    color: #868e96; white-space: nowrap; flex-shrink: 0;
  }
  .op-label i { font-size: 11px; }
  .op-value { color: #212529; text-align: right; word-break: break-word; }
  .op-contact { padding: 6px 0; border-bottom: 1px solid #f1f3f5; }
  .op-inline-form { background: #f8f9ff; border: 1px solid #dee2f7; border-radius: 6px; padding: 8px; margin-top: 6px; }

  .op-contact-btn {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 500; line-height: 1;
    padding: 3px 7px; border-radius: 4px; border: 1px solid;
    background: transparent; cursor: pointer; white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .op-contact-btn--star { color: #b45309; border-color: #fbbf24; }
  .op-contact-btn--star:hover { background: #fef3c7; }
  .op-contact-btn--primary-active {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600; line-height: 1;
    padding: 3px 7px; border-radius: 4px;
    background: #fef3c7; color: #b45309; border: 1px solid #fbbf24;
    white-space: nowrap;
  }
  .op-contact-btn--edit { color: #374151; border-color: #d1d5db; }
  .op-contact-btn--edit:hover { background: #f3f4f6; }
  .op-contact-btn--remove { color: #dc2626; border-color: #fca5a5; }
  .op-contact-btn--remove:hover { background: #fee2e2; }
  .op-contact:last-child { border-bottom: none; }
  .op-contact-designation { font-size: 11px; color: #868e96; margin-top: 1px; }
  .op-contact-detail {
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; color: #6c757d; margin-top: 3px;
  }
  .op-contact-detail i { font-size: 11px; }
  .op-description { font-size: 12px; color: #495057; line-height: 1.6; word-break: break-word; }

  /* Text */
  .op-description :global(p)          { margin: 0 0 6px; }
  .op-description :global(strong),
  .op-description :global(b)          { font-weight: 700; }
  .op-description :global(em),
  .op-description :global(i)          { font-style: italic; }
  .op-description :global(u)          { text-decoration: underline; }
  .op-description :global(s)          { text-decoration: line-through; }
  .op-description :global(a)          { color: #3b5bdb; text-decoration: underline; }
  .op-description :global(a:hover)    { color: #1d4ed8; }

  /* Headings */
  .op-description :global(h1) { font-size: 18px; font-weight: 700; margin: 8px 0 4px; }
  .op-description :global(h2) { font-size: 15px; font-weight: 700; margin: 8px 0 4px; }
  .op-description :global(h3) { font-size: 13px; font-weight: 700; margin: 6px 0 4px; }

  /* Lists */
  .op-description :global(ul)         { list-style: disc;    padding-left: 20px; margin: 0 0 6px; }
  .op-description :global(ol)         { list-style: decimal; padding-left: 20px; margin: 0 0 6px; }
  .op-description :global(li)         { display: list-item; margin-bottom: 2px; }
  .op-description :global(ul ul)      { list-style: circle; margin: 2px 0; }
  .op-description :global(ul ul ul)   { list-style: square; }

  /* Blockquote */
  .op-description :global(blockquote) {
    border-left: 3px solid #dee2e6;
    margin: 4px 0 6px;
    padding: 4px 10px;
    color: #6c757d;
    font-style: italic;
  }

  /* Code */
  .op-description :global(code) {
    font-family: monospace;
    font-size: 11px;
    background: #f1f3f5;
    border-radius: 3px;
    padding: 1px 4px;
    color: #c92a2a;
  }
  .op-description :global(pre) {
    font-family: monospace;
    font-size: 11px;
    background: #f1f3f5;
    border-radius: 6px;
    padding: 8px 10px;
    overflow-x: auto;
    margin: 0 0 6px;
    color: #212529;
    white-space: pre-wrap;
  }

  /* Table */
  .op-description :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin: 0 0 6px;
    table-layout: auto;
  }
  .op-description :global(th),
  .op-description :global(td) {
    border: 1px solid #dee2e6;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
  }
  .op-description :global(th) {
    background: #f1f3f5;
    font-weight: 600;
    white-space: nowrap;
  }
  /* First column (label) — compact, no wrap */
  .op-description :global(td:first-child),
  .op-description :global(th:first-child) {
    width: 1%;
    white-space: nowrap;
    font-weight: 600;
    color: #495057;
    background: #f8f9fa;
  }
  /* Value columns share remaining width equally */
  .op-description :global(td:not(:first-child)) {
    width: auto;
  }
  .op-description :global(tr:nth-child(even) td) {
    background: #f1f3f5;
  }
  .op-description :global(tr:nth-child(even) td:first-child) {
    background: #e9ecef;
  }

  /* ── Injected copy buttons inside description ── */
  .op-description :global(.desc-copy-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 1px 5px;
    margin-left: 5px;
    cursor: pointer;
    font-size: 10px;
    color: #6c757d;
    vertical-align: middle;
    transition: all 0.15s;
    line-height: 1;
  }
  .op-description :global(.desc-copy-btn:hover) {
    background: #e9ecef;
    color: #212529;
    border-color: #adb5bd;
  }
  .op-description :global(.desc-copy-btn--copied) {
    background: #d1fae5;
    color: #065f46;
    border-color: #6ee7b7;
  }
  .op-desc-copy-btn {
    background: none; border: none; cursor: pointer;
    color: #868e96; font-size: 11px; padding: 0 2px; line-height: 1;
  }
  .op-desc-copy-btn:hover { color: #3b5bdb; }
  .op-copyable { cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .op-copy-icon { font-size: 11px; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
  .op-copyable:hover .op-copy-icon { opacity: 0.6; }
  .op-copy-icon--copied { opacity: 1 !important; }
  .op-copyable:hover { color: #3b5bdb; }

  /* ── In-progress date filter pills ──────────────────────────────── */
  .ip-date-filters { display: flex; flex-wrap: wrap; gap: 4px; }
  .ip-field-select {
    font-size: 10px; color: #6c757d;
    border: 1px solid #dee2e6; border-radius: 6px;
    padding: 2px 18px 2px 5px; background-color: #fff;
    cursor: pointer; outline: none;
    appearance: auto; flex-shrink: 0;
  }
  .ip-field-select:focus { border-color: #86b7fe; }
  .ip-date-pill {
    font-size: 11px; padding: 2px 8px; border-radius: 20px;
    border: 1px solid #dee2e6; background: #f8f9fa; color: #495057;
    cursor: pointer; line-height: 1.6;
  }
  .ip-date-pill:hover { background: #e9ecef; }
  .ip-date-pill.active { background: #0d6efd; color: #fff; border-color: #0d6efd; }

  /* ── View all button ── */
  .ip-view-all-btn { background: none; border: none; padding: 0; font-size: 12px; color: #6c757d; cursor: pointer; white-space: nowrap; }
  .ip-view-all-btn:hover { color: #3b5bdb; text-decoration: underline; }

  /* ── All Queries Panel ── */
  .aq-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .aq-list-body { flex: 1 1 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #dee2e6 transparent; }
  .aq-list-body::-webkit-scrollbar { width: 4px; }
  .aq-list-body::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 10px; }
</style>

<!-- ── Edit Client Modal ─────────────────────────────────────────────────── -->
{#if opShowEditClientModal}
  <div class="modal fade show d-block" role="dialog" style="background:rgba(0,0,0,0.5);z-index:9999;">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-building-store me-2"></i>Edit Client</h5>
          <button type="button" class="btn-close" on:click={() => opShowEditClientModal = false}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label">Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" class:is-invalid={opEditClientErrors.name} bind:value={opEditClientData.name} placeholder="Client name" />
              {#if opEditClientErrors.name}<div class="invalid-feedback">{opEditClientErrors.name}</div>{/if}
            </div>
            <div class="col-12">
              <label class="form-label">GST Number</label>
              <input type="text" class="form-control" bind:value={opEditClientData.gstNumber} placeholder="GST Number" maxlength="20" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Mobile</label>
              <input type="text" class="form-control" bind:value={opEditClientData.mobile} placeholder="Mobile" maxlength="20" />
            </div>
            <div class="col-md-6">
              <label class="form-label">WhatsApp</label>
              <input type="text" class="form-control" bind:value={opEditClientData.whatsapp} placeholder="WhatsApp" maxlength="20" />
            </div>
            <div class="col-12">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" bind:value={opEditClientData.email} placeholder="Email" maxlength="100" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <textarea class="form-control" rows="2" bind:value={opEditClientData.address} placeholder="Address" maxlength="500"></textarea>
            </div>
            <div class="col-12">
              <label class="form-label">Remark</label>
              <textarea class="form-control" rows="2" bind:value={opEditClientData.remark} placeholder="Remark" maxlength="500"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => opShowEditClientModal = false}>Cancel</button>
          <button type="button" class="btn btn-primary" on:click={opSaveEditClient} disabled={opSavingClient}>
            {#if opSavingClient}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ── Change / Link Client Modal ───────────────────────────────────────── -->
{#if opShowChangeClientModal}
  <div class="modal fade show d-block" role="dialog" style="background:rgba(0,0,0,0.5);z-index:9999;">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{orderDrawerData?.client ? "Change Client" : "Link Client"}</h5>
          <button type="button" class="btn-close" on:click={() => { opShowChangeClientModal = false; opCcSelectedExisting = null; opCcCancelInlineCreate(); }}></button>
        </div>
        <div class="modal-body">
          {#if orderDrawerData?.client}
            <div class="mb-3 text-muted small">Current: <strong>{orderDrawerData.client.name}</strong></div>
          {/if}
          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="form-label mb-0 fw-semibold">
              {#if opCcInlineCreate}<i class="ti ti-building-store me-1 text-primary"></i>New Client
              {:else}<i class="ti ti-search me-1 text-primary"></i>Search Client{/if}
            </label>
            {#if opCcInlineCreate}
              <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { opCcCancelInlineCreate(); opCcSelectedExisting = null; opChangeClientQuery = ""; }}>
                <i class="ti ti-arrow-left me-1"></i>Back to Search
              </button>
            {:else}
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={opCcOpenInlineCreate}>
                <i class="ti ti-plus me-1"></i>New Client
              </button>
            {/if}
          </div>
          {#if !opCcInlineCreate}
            <div class="position-relative">
              <div class="input-group mb-2">
                <input type="text" class="form-control" placeholder="Type name, mobile, email, GST..." bind:value={opChangeClientQuery} on:input={opOnChangeClientInput} autocomplete="off" />
                {#if opChangeClientLoading}<span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>{/if}
              </div>
              {#if opChangeClientDropdown && opChangeClientResults.length > 0}
                <div class="border rounded" style="max-height:200px;overflow-y:auto;">
                  {#each opChangeClientResults as client}
                    <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom" style="background:none;" on:click={() => { opChangeClientDropdown = false; opCcSelectedExisting = client; }}>
                      <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{client.name}</div>
                      {#if client.gstNumber}<div class="text-muted small">GST: {client.gstNumber}</div>{/if}
                      {#if client.contacts?.length > 0}<div class="text-muted small">{client.contacts.map(c => c.name).join(", ")}</div>{/if}
                    </button>
                  {/each}
                </div>
              {/if}
              {#if opChangeClientDropdown && opChangeClientResults.length === 0}
                <div class="text-muted small mt-1 fst-italic">No client found — use <strong>New Client</strong> button above.</div>
              {/if}
            </div>
            {#if opCcSelectedExisting}
              <div class="border rounded p-3 mt-2 bg-light d-flex justify-content-between align-items-start">
                <div>
                  <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{opCcSelectedExisting.name}</div>
                  {#if opCcSelectedExisting.gstNumber}<div class="text-muted small">GST: {opCcSelectedExisting.gstNumber}</div>{/if}
                  {#if opCcSelectedExisting.contacts?.length > 0}<div class="text-muted small mt-1">{opCcSelectedExisting.contacts.map(c => c.name).join(", ")}</div>{/if}
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { opCcSelectedExisting = null; opChangeClientQuery = ""; }}><i class="ti ti-x"></i></button>
              </div>
            {/if}
          {/if}
          {#if opCcInlineCreate}
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">Company Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" class:is-invalid={opCcCreateErrors.name} bind:value={opCcNewName} placeholder="Company name" />
                {#if opCcCreateErrors.name}<ul class="text-danger mt-1 text-xs"><li>{opCcCreateErrors.name}</li></ul>{/if}
              </div>
              <div><label class="form-label">GST Number</label><input type="text" class="form-control" bind:value={opCcNewGst} placeholder="GST number" /></div>
              <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={opCcNewMobile} placeholder="Mobile" /></div>
              <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={opCcNewEmail} placeholder="Email" /></div>
              <div class="col-span-2"><label class="form-label">Address</label><input type="text" class="form-control" bind:value={opCcNewAddress} placeholder="Address" /></div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={() => { opShowChangeClientModal = false; opCcCancelInlineCreate(); opCcSelectedExisting = null; }}>Cancel</button>
          {#if opCcSelectedExisting}
            <button type="button" class="btn btn-primary" on:click={() => opConfirmChangeClient(opCcSelectedExisting)}>Link Client</button>
          {/if}
          {#if opCcInlineCreate}
            <button type="button" class="btn btn-primary" on:click={opCcCreateAndLink} disabled={opCcCreateLoading}>
              {opCcCreateLoading ? "Creating..." : "Create & Link"}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ── New Client + Contact Modal (unlinked orders) ──────────────────────── -->
{#if opShowNewClientModal}
  <div class="modal fade show d-block" role="dialog" style="background:rgba(0,0,0,0.5);z-index:9999;">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-building-store me-2 text-primary"></i>
            {opNcStep === 1 ? "Step 1 — Select or Create Client" : "Step 2 — Add Contact Person"}
          </h5>
          <button type="button" class="btn-close" on:click={() => opShowNewClientModal = false}></button>
        </div>
        <div class="modal-body">
          <div class="d-flex align-items-center gap-2 mb-4">
            <div class="d-flex align-items-center gap-1">
              <span class="badge rounded-pill {opNcStep >= 1 ? 'bg-primary' : 'bg-secondary'} px-3 py-2">1</span>
              <span class="small fw-semibold {opNcStep >= 1 ? 'text-primary' : 'text-muted'}">Client</span>
            </div>
            <div class="flex-grow-1 border-top mx-2"></div>
            <div class="d-flex align-items-center gap-1">
              <span class="badge rounded-pill {opNcStep >= 2 ? 'bg-primary' : 'bg-secondary'} px-3 py-2">2</span>
              <span class="small fw-semibold {opNcStep >= 2 ? 'text-primary' : 'text-muted'}">Contact</span>
            </div>
          </div>
          {#if opNcStep === 1}
            {#if !opNcSelectedClient && !opNcCreateMode}
              <div class="mb-3 position-relative">
                <label class="form-label fw-semibold">Search Existing Client</label>
                <div class="input-group">
                  <input type="text" class="form-control" placeholder="Type company name, mobile, email..." bind:value={opNcSearchQuery} on:input={opNcOnSearchInput} autocomplete="off" />
                  {#if opNcSearchLoading}<span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>{/if}
                </div>
                {#if opNcSearchDropdown && opNcSearchResults.length > 0}
                  <div class="border rounded bg-white position-absolute w-100 shadow" style="z-index:9999;max-height:220px;overflow-y:auto;top:100%;">
                    {#each opNcSearchResults as client}
                      <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom" style="background:none;" on:click={() => opNcSelectClient(client)}>
                        <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{client.name}</div>
                        {#if client.gstNumber}<div class="text-muted small">GST: {client.gstNumber}</div>{/if}
                        {#if client.contacts?.length > 0}<div class="text-muted small">Contacts: {client.contacts.map(c => c.name).join(", ")}</div>{/if}
                      </button>
                    {/each}
                  </div>
                {/if}
                {#if opNcSearchDropdown && opNcSearchResults.length === 0 && opNcSearchQuery.length > 1}
                  <div class="border rounded bg-white position-absolute w-100 shadow px-3 py-2" style="z-index:9999;top:100%;">
                    <div class="text-muted small mb-2">No client found for "{opNcSearchQuery}"</div>
                    <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => { opNcCreateMode = true; opNcClientName = opNcSearchQuery; opNcSearchDropdown = false; }}>
                      <i class="ti ti-plus me-1"></i>Create New Client
                    </button>
                  </div>
                {/if}
              </div>
              <div class="text-center text-muted small my-3">— or —</div>
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => { opNcCreateMode = true; opNcSearchDropdown = false; }}>
                <i class="ti ti-plus me-1"></i>Create New Client
              </button>
            {/if}
            {#if opNcSelectedClient}
              <div class="border rounded p-3 bg-light mb-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <div class="fw-bold"><i class="ti ti-building-store me-1 text-primary"></i>{opNcSelectedClient.name}</div>
                    {#if opNcSelectedClient.gstNumber}<div class="text-muted small">GST: {opNcSelectedClient.gstNumber}</div>{/if}
                    {#if opNcSelectedClient.contacts?.length > 0}<div class="text-muted small mt-1">Existing: {opNcSelectedClient.contacts.map(c => c.name).join(", ")}</div>{/if}
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => { opNcSelectedClient = null; opNcSearchQuery = ""; }}><i class="ti ti-x"></i></button>
                </div>
              </div>
            {/if}
            {#if opNcCreateMode}
              <div class="border rounded p-3 bg-light mb-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h6 class="mb-0 fw-semibold">New Client</h6>
                  <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { opNcCreateMode = false; opNcClientName = ""; }}><i class="ti ti-x"></i></button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Company Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" class:is-invalid={opNcFormErrors.opNcClientName} bind:value={opNcClientName} placeholder="Company name" />
                    {#if opNcFormErrors.opNcClientName}<ul class="text-danger mt-1 text-xs"><li>{opNcFormErrors.opNcClientName}</li></ul>{/if}
                  </div>
                  <div><label class="form-label">GST Number</label><input type="text" class="form-control" bind:value={opNcClientGst} placeholder="GST number" /></div>
                  <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={opNcClientMobile} placeholder="Mobile" /></div>
                  <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={opNcClientEmail} placeholder="Email" /></div>
                  <div class="col-span-2"><label class="form-label">Address</label><input type="text" class="form-control" bind:value={opNcClientAddress} placeholder="Address" /></div>
                </div>
              </div>
            {/if}
            {#if opNcFormErrors.step1}<div class="alert alert-warning py-2 small">{opNcFormErrors.step1}</div>{/if}
          {/if}
          {#if opNcStep === 2}
            <div class="mb-2 p-2 bg-light rounded border d-flex align-items-center gap-2">
              <i class="ti ti-building-store text-primary"></i>
              <span class="fw-semibold">{opNcSelectedClient?.name || opNcClientName}</span>
              <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" on:click={() => opNcStep = 1}><i class="ti ti-edit me-1"></i>Change</button>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label class="form-label">Contact Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" class:is-invalid={opNcFormErrors.opNcContactName} bind:value={opNcContactName} placeholder="Full name" />
                {#if opNcFormErrors.opNcContactName}<ul class="text-danger mt-1 text-xs"><li>{opNcFormErrors.opNcContactName}</li></ul>{/if}
              </div>
              <div><label class="form-label">Designation</label><input type="text" class="form-control" bind:value={opNcContactDesignation} placeholder="e.g. Manager" /></div>
              <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={opNcContactMobile} placeholder="Mobile" /></div>
              <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={opNcContactEmail} placeholder="Email" /></div>
              <div><label class="form-label">Whatsapp</label><input type="text" class="form-control" bind:value={opNcContactWhatsapp} placeholder="Whatsapp" /></div>
              <div><label class="form-label">Alternate Mobile</label><input type="text" class="form-control" bind:value={opNcContactAltMobile} placeholder="Alternate mobile" /></div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={() => opShowNewClientModal = false}>Cancel</button>
          {#if opNcStep === 1}
            <button type="button" class="btn btn-primary" on:click={opNcGoToStep2}>Next <i class="ti ti-arrow-right ms-1"></i></button>
          {:else}
            <button type="button" class="btn btn-outline-secondary" on:click={() => opNcStep = 1}><i class="ti ti-arrow-left me-1"></i>Back</button>
            <button type="button" class="btn btn-primary" on:click={opNcSubmit} disabled={opNcSubmitLoading}>
              {opNcSubmitLoading ? "Saving..." : "Save & Link Client"}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
