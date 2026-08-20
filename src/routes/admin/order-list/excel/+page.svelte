<script>
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import Loader from "$lib/components/Loader.svelte";
  import LightBox from "$lib/components/LightBox.svelte";
  import { categoriesAllStore, companiesAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { orderExcelFilterStore } from "$lib/stores/filterStore";
  import { checkAuth } from "$lib/utils/auth";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import { maskAssignedName } from "$lib/utils/maskUser";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";
  import OrderQueriesModal from "$lib/components/OrderQueriesModal.svelte";
  import OrderChatQuickModal from "$lib/components/OrderChatQuickModal.svelte";
  import { OrderFeedbackModal } from "$lib/features/orders/detail";
  import { errorHandle } from "$lib/utils/errorHandle";

  // ── auth ─────────────────────────────────────────────────
  const currentUser = checkAuth();
  const isMaster = currentUser?.role === "master";

  // ── feedback modal ───────────────────────────────────────
  const FEEDBACK_TRIGGER_STATUSES = [
    "Deal Lost",
    "Deal Won",
    "Dispatched",
    "Completed",
    "Cancelled",
  ];
  let feedbackModalShow = false;
  let feedbackModalOrder = null;
  let feedbackTriggerStatus = null;
  let feedbackLoading = false;

  function openFeedbackModal(order, triggerStatus = null) {
    feedbackModalOrder = order;
    feedbackTriggerStatus = triggerStatus;
    feedbackModalShow = true;
  }

  let queriesModalOpen = false;
  let queriesModalOrder = null;
  let queriesModalStartRaise = false;

  async function openQueriesModal(order, startRaise = false) {
    if (!order) return;
    queriesModalOpen = false;
    queriesModalOrder = order;
    queriesModalStartRaise = startRaise;
    await tick();
    queriesModalOpen = true;
  }

  async function submitFeedback(e) {
    if (!feedbackModalOrder) return;
    feedbackLoading = true;
    try {
      await authApiFetch(API_ROUTES.ORDER_FEEDBACK, {
        method: "POST",
        data: JSON.stringify({
          orderId: feedbackModalOrder.id,
          satisfactionLevel: e.detail.satisfactionLevel,
          reason: e.detail.reason,
          remarks: e.detail.remarks,
          feedbackType: e.detail.triggerStatus ? "TRIGGERED" : "FREE",
          triggerStatus: e.detail.triggerStatus || null,
        }),
      });
      feedbackModalShow = false;
    } catch (err) {
      errorHandle(err);
    } finally {
      feedbackLoading = false;
    }
  }

  // ── data ────────────────────────────────────────────────
  let orders = [];
  let totalPages = 1;
  let total = 0;
  let loadingData = true;
  let searchTerm = "";
  let orderBy = "createdAt";
  let filterStatus = "";
  let filterDateRange = "7d";
  let customStartDate = "";
  let customEndDate = "";
  let pageSize = 10;
  let filterUserId = "";
  let filterCompanyId = "";
  let filterCategory = "";
  let filterSource = "";
  let allUsers = [];
  let allCompanies = [];

  const ORDER_BY_OPTIONS = [
    { value: "createdAt", label: "Date Created" },
    { value: "updatedAt", label: "Date Updated" },
    { value: "orderDate", label: "Order Date" },
    { value: "title", label: "Title" },
    { value: "status", label: "Status" },
    { value: "pId", label: "pId" },
  ];

  const DATE_RANGE_OPTIONS = [
    { value: "all", label: "All Time" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
    { value: "3m", label: "Last 3 Months" },
    { value: "fy", label: "This Financial Year" },
    { value: "custom", label: "Custom Range" },
  ];

  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  const STATUS_COLORS = {
    "New Lead": { bg: "#cff4fc", color: "#055160" },
    Contacted: { bg: "#dbeafe", color: "#1d4ed8" },
    "Quotation Sent": { bg: "#faf5ff", color: "#7e22ce" },
    "Follow Up": { bg: "#ede9fe", color: "#6d28d9" },
    "Needs Assessment": { bg: "#ffedd5", color: "#c2410c" },
    Qualified: { bg: "#dcfce7", color: "#15803d" },
    "Negotiation In Progress": { bg: "#fefce8", color: "#a16207" },
    "Deal Won": { bg: "#d1fae5", color: "#047857" },
    Unqualified: { bg: "#f3f4f6", color: "#6b7280" },
    "Deal Lost": { bg: "#fee2e2", color: "#b91c1c" },
  };

  function statusStyle(s) {
    const c = STATUS_COLORS[s] || { bg: "#f3f4f6", color: "#374151" };
    return `background:${c.bg};color:${c.color};`;
  }

  function getDateRangeParams(range) {
    // Keep date filter behavior consistent with `desktop-app/src/routes/admin/order/+page.svelte`.
    // Backend expects `startDate/endDate` as YYYY-MM-DD-like strings (it parses them via `new Date(...)`)
    // and then adjusts to IST day boundaries.
    const fmt = (d) => d.toLocaleDateString("en-CA"); // Local YYYY-MM-DD

    if (range === "all") return {};

    if (range === "custom") {
      if (!customStartDate || !customEndDate) return {};
      // For custom, pass the `type="date"` string directly (same as Orders list page).
      return { startDate: customStartDate, endDate: customEndDate };
    }

    const now = new Date();
    const endDate = fmt(now);

    if (range === "today") {
      return { startDate: endDate, endDate };
    }

    if (range === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = fmt(y);
      return { startDate: d, endDate: d };
    }

    if (range === "7d") {
      const s = new Date(now);
      s.setDate(s.getDate() - 7);
      return { startDate: fmt(s), endDate };
    }

    if (range === "30d") {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { startDate: fmt(s), endDate };
    }

    if (range === "3m") {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 3);
      return { startDate: fmt(s), endDate };
    }

    if (range === "fy") {
      const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const s = new Date(now);
      // Financial year starts on April 1 (month index 3).
      s.setFullYear(yr, 3, 1);
      return { startDate: fmt(s), endDate };
    }

    return {};
  }

  let currentPage = 1;

  // ── inline expand ────────────────────────────────────────
  let expandedRow = null;
  let chatMsg = {},
    chatTypeInput = {},
    reminderInput = {},
    reminderTimeInput = {};

  // ── chat quick modal (right sidebar UX) ───────────────────
  let chatQuickOpen = false;
  let chatQuickOrder = null;
  let activeChatOrderId = null; // for row highlight

  async function openChatQuickModal(order) {
    if (!order) return;
    expandedRow = null;
    activeChatOrderId = order.id;
    chatQuickOrder = order;
    await tick();
    chatQuickOpen = true;
  }

  function closeChatQuickModal() {
    chatQuickOpen = false;
    chatQuickOrder = null;
    activeChatOrderId = null;
  }

  const CHAT_TYPES = ["Call", "WA", "Email"];
  const CHAT_TYPE_COLORS = { Call: "btn-primary", WA: "btn-success", Email: "btn-warning" };

  function normalizeSingleType(raw) {
    if (!raw || raw.trim() === "") return null;
    const t = raw.trim().toLowerCase();
    if (t.includes("call")) return "Call";
    if (t.includes("whatsapp") || t.includes("whats app") || t === "wa") return "WA";
    if (t.includes("email") || t.includes("mail")) return "Email";
    return null;
  }
  function normalizeTypes(typeStr) {
    if (!typeStr || typeStr.trim() === "") return [];
    return typeStr.split(",").map(normalizeSingleType).filter(Boolean);
  }

  function chatTypeBadgeStyle(type) {
    if (type === "Call") return "background:#dbeafe;color:#1d4ed8;";
    if (type === "WA" || type === "WhatsApp") return "background:#dcfce7;color:#15803d;";
    if (type === "Email") return "background:#fef9c3;color:#a16207;";
    return "background:#f3f4f6;color:#6b7280;";
  }

  // ── inline edit ──────────────────────────────────────────
  let editingCell = null; // { orderId, field }
  let editingValue = "";
  let editingSaving = false;
  let savingCell = null; // { orderId, field } — which cell is currently calling the API

  // Fields that belong to orderClients[0]; all others are on the order itself
  const CLIENT_FIELDS = { mobile: true, name: true, address: true };

  async function startEdit(e, orderId, field, currentValue) {
    e.stopPropagation();
    editingCell = { orderId, field };
    editingValue = currentValue || "";
    await tick();
    const el = document.getElementById(`cell-input-${orderId}-${field}`);
    if (el) {
      el.focus();
      el.select();
    }
  }

  function cancelEdit() {
    editingCell = null;
    editingValue = "";
  }

  async function saveEdit() {
    if (!editingCell || editingSaving) return;
    const { orderId, field } = editingCell;
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      cancelEdit();
      return;
    }

    // Skip if unchanged
    const isClientField = CLIENT_FIELDS[field];
    const oldVal = isClientField ? order.orderClients?.[0]?.[field] || "" : order[field] || "";
    if (editingValue.trim() === oldVal.trim()) {
      cancelEdit();
      return;
    }

    // Capture value before cancelEdit() wipes it
    const savedValue = editingValue.trim();

    // Optimistic update — show new value immediately
    if (isClientField) {
      orders = orders.map((o) => {
        if (o.id !== orderId) return o;
        const clients = (o.orderClients || []).map((c, idx) =>
          idx === 0 ? { ...c, [field]: savedValue } : c,
        );
        return { ...o, orderClients: clients };
      });
    } else {
      orders = orders.map((o) => (o.id === orderId ? { ...o, [field]: savedValue } : o));
    }

    cancelEdit();
    editingSaving = true;
    savingCell = { orderId, field };
    try {
      if (isClientField) {
        const orderClientId = order.orderClients?.[0]?.id;
        // Always update orderClients row if exists
        if (orderClientId) {
          await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${orderClientId}`, {
            method: "PUT",
            data: JSON.stringify({ [field]: savedValue }),
          });
        }

        if (order.client) {
          // Find existing orderContact → clientContact for this order
          const existingOrderContact = order.orderContacts?.[0];
          const existingClientContactId = existingOrderContact?.clientContact?.id;

          if (existingClientContactId) {
            // UPDATE existing clientContact
            await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${existingClientContactId}`, {
              method: "PUT",
              data: JSON.stringify({ [field]: savedValue }),
            });
          } else {
            // No clientContact yet — CREATE one + link as orderContact
            const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
              method: "POST",
              data: JSON.stringify({
                clientId: order.client.id,
                name:
                  field === "name"
                    ? savedValue
                    : order.orderClients?.[0]?.name || order.client.name,
                mobile: field === "mobile" ? savedValue : order.orderClients?.[0]?.mobile || "",
              }),
            });
            const newContact = contactRes.data ?? contactRes;
            if (newContact?.id) {
              await authApiFetch(API_ROUTES.ORDER_CONTACT, {
                method: "POST",
                data: JSON.stringify({ orderId, clientContactId: newContact.id }),
              });
              // Also create orderClient row if missing
              if (!orderClientId) {
                await authApiFetch(API_ROUTES.ORDER_CLIENT, {
                  method: "POST",
                  data: JSON.stringify({
                    orderId,
                    name: newContact.name,
                    mobile: newContact.mobile || "",
                    address: order.client.address || "",
                  }),
                });
              }
            }
          }
        } else if (!orderClientId) {
          // No client linked, no orderClient row — create orderClient only
          await authApiFetch(API_ROUTES.ORDER_CLIENT, {
            method: "POST",
            data: JSON.stringify({
              orderId,
              name: field === "name" ? savedValue : "",
              mobile: field === "mobile" ? savedValue : "",
            }),
          });
        }
      } else {
        await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`, {
          method: "PUT",
          data: JSON.stringify({
            [field]: savedValue,
            orderActivity: {
              title: "Order Updated",
              description: `${field} updated via excel view.`,
            },
          }),
        });
      }
      await refreshOrder(orderId);
    } catch (e) {
      await refreshOrder(orderId);
    } finally {
      editingSaving = false;
      savingCell = null;
    }
  }

  function onCellKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  // ── city extraction ──────────────────────────────────────
  function extractCity(address) {
    if (!address) return "-";
    // Strip common prefixes
    let s = address.replace(/^address\s*[:\-]+\s*/i, "").trim();
    // Split by comma
    const parts = s
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    // Remove 6-digit pincodes and "India"
    const filtered = parts.filter((p) => !/^\d{6}$/.test(p) && !/^india$/i.test(p));
    if (filtered.length === 0) return s || "-";
    // Last segment is usually city or state; prefer second-to-last if last looks like a state
    return filtered[filtered.length - 1] || filtered[0] || "-";
  }

  // ── masking helpers ──────────────────────────────────────
  function maskMobile(m) {
    if (!m) return "-";
    const s = String(m).replace(/\s/g, "");
    if (s.length <= 4) return s;
    return "•".repeat(s.length - 4) + s.slice(-4);
  }

  function maskEmail(e) {
    if (!e) return "-";
    const [user, domain] = e.split("@");
    if (!domain) return e;
    const visible =
      user.length > 2 ? user[0] + "•".repeat(user.length - 2) + user.slice(-1) : user[0] + "•";
    return `${visible}@${domain}`;
  }

  let copiedFieldKey = "";
  let copyTimeout = null;
  async function copyField(key, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      copiedFieldKey = key;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedFieldKey = "";
      }, 1500);
    } catch (_) {}
  }

  // ── add order drawer ─────────────────────────────────────
  let drawerOpen = false;
  let drawerLoading = false;
  let drawerErrors = {};

  let f_title = "";
  let f_category = "";
  let f_orderDate = null;
  let f_startDate = null;
  let f_deadlineDate = null;
  let f_price = null;
  let f_currency = "INR";
  let f_priceTerms = "";
  let f_source = "";
  let f_company = "";
  let f_gstNumber = "";
  let f_description = "";
  let f_name = "";
  let f_designation = "";
  let f_email = "";
  let f_mobile = "";
  let f_alternateMobile = "";
  let f_whatsapp = "";
  let f_address = "";

  const CURRENCIES = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];
  const SOURCES = ["Whatsapp", "Website", "Mail"];

  // ── lightbox ─────────────────────────────────────────────
  let lightboxImages = [];
  let lightboxStart = 0;

  function openLightbox(urls, index = 0) {
    lightboxStart = index;
    lightboxImages = Array.isArray(urls) ? urls : [urls];
  }

  // file shape: { url, mimeType, originalName, size }
  function fileUrl(f) {
    const raw = f?.url || "";
    if (!raw) return "";
    return raw.startsWith("http") ? raw : ATTACHMENT_BASE_URL + raw;
  }

  function fileName(f) {
    return f?.originalName || "File";
  }

  function fileIsImage(f) {
    const mime = f?.mimeType || "";
    if (mime) return mime.startsWith("image/");
    const ext = (f?.originalName || "").split(".").pop()?.toLowerCase() ?? "";
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);
  }

  function fileTypeIcon(f) {
    const mime = f?.mimeType || "";
    if (mime === "application/pdf") return "📕";
    if (mime.includes("spreadsheet") || mime.includes("excel")) return "📊";
    if (mime.includes("word") || mime.includes("document")) return "📝";
    if (mime.includes("zip") || mime.includes("rar")) return "🗜️";
    const ext = (f?.originalName || "").split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "📕";
    if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (["doc", "docx"].includes(ext)) return "📝";
    if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
    return "📄";
  }

  // returns the first file of an attachment for preview use
  function previewFile(a) {
    return a?.files?.[0] ?? null;
  }

  let categories = [];

  onMount(async () => {
    const categoriesCached = get(categoriesAllStore);
    categories = categoriesCached && categoriesCached.length > 0 ? categoriesCached : [];

    loadColPrefs();
    const saved = $orderExcelFilterStore;
    if (saved && Object.keys(saved).length > 0) {
      if (saved.searchTerm !== undefined) searchTerm = saved.searchTerm;
      if (saved.filterStatus !== undefined) filterStatus = saved.filterStatus;
      if (saved.filterDateRange !== undefined) filterDateRange = saved.filterDateRange;
      if (saved.customStartDate !== undefined) customStartDate = saved.customStartDate || "";
      if (saved.customEndDate !== undefined) customEndDate = saved.customEndDate || "";
      if (saved.filterUserId !== undefined) filterUserId = saved.filterUserId;
      if (saved.filterCompanyId !== undefined) filterCompanyId = saved.filterCompanyId;
      if (saved.filterCategory !== undefined) filterCategory = saved.filterCategory;
      if (saved.orderBy !== undefined) orderBy = saved.orderBy;
      if (saved.pageSize !== undefined) pageSize = saved.pageSize;
    }
    // Incomplete custom range (no dates) used to skip fetch while leaving the loader on.
    if (filterDateRange === "custom" && (!customStartDate || !customEndDate)) {
      filterDateRange = "7d";
      customStartDate = "";
      customEndDate = "";
      saveFilterStore();
    }
    if (isMaster || currentUser?.role === "admin") {
      try {
        const res = await authApiFetch(`${API_ROUTES.USER}/all`, { method: "GET" });
        allUsers = Array.isArray(res) ? res : res.data || [];
      } catch (e) {}
    }
    try {
      const cached = get(companiesAllStore);
      if (cached && cached.length > 0) {
        allCompanies = cached;
      } else {
        const res = await authApiFetch(`${API_ROUTES.COMPANY}/all`, { method: "GET" });
        allCompanies = Array.isArray(res) ? res : res.data || [];
        companiesAllStore.set(allCompanies);
      }
    } catch (e) {}
    fetchOrders();
  });

  function openDrawer() {
    f_title = "";
    f_category = "";
    f_orderDate = null;
    f_startDate = null;
    f_deadlineDate = null;
    f_price = null;
    f_currency = "INR";
    f_priceTerms = "";
    f_source = "";
    f_company = "";
    f_gstNumber = "";
    f_description = "";
    f_name = "";
    f_designation = "";
    f_email = "";
    f_mobile = "";
    f_alternateMobile = "";
    f_whatsapp = "";
    f_address = "";
    drawerErrors = {};
    drawerOpen = true;
  }
  function closeDrawer() {
    drawerOpen = false;
  }

  async function submitOrder() {
    drawerErrors = {};
    if (!f_title.trim()) {
      drawerErrors.title = "Title is required.";
      return;
    }
    if (!f_name.trim()) {
      drawerErrors.name = "Name is required.";
      return;
    }
    drawerLoading = true;
    try {
      const payload = {
        title: f_title.trim(),
        category: f_category || "",
        source: f_source || null,
        company: f_company,
        gstNumber: f_gstNumber,
        description: f_description,
        currency: f_currency,
        priceTerms: f_priceTerms || null,
        ...(f_orderDate && { orderDate: f_orderDate }),
        ...(f_startDate && { startDate: f_startDate }),
        ...(f_deadlineDate && { deadlineDate: f_deadlineDate }),
        ...(f_price && { price: Number(f_price) }),
        orderClients: [
          {
            name: f_name.trim(),
            designation: f_designation,
            email: f_email,
            mobile: f_mobile,
            alternateMobile: f_alternateMobile,
            whatsapp: f_whatsapp,
            address: f_address,
          },
        ],
        orderActivity: { title: "Order Created", description: "A new order has been created." },
      };
      await authApiFetch(API_ROUTES.ORDER, { method: "POST", data: JSON.stringify(payload) });
      closeDrawer();
      await fetchOrders(1);
    } catch (e) {
    } finally {
      drawerLoading = false;
    }
  }

  // ── column resize + visibility + reorder ────────────────
  const ALL_COLS = [
    { key: "sno", label: "#", width: 50, minWidth: 40, visible: true },
    { key: "pId", label: "Order No.", width: 80, minWidth: 60, visible: true },
    { key: "inqCode", label: "Inq. Code", width: 100, minWidth: 70, visible: true },
    { key: "title", label: "Title", width: 160, minWidth: 80, visible: true },
    { key: "company", label: "Company", width: 100, minWidth: 80, visible: true },
    { key: "mobile", label: "Mobile", width: 130, minWidth: 100, visible: true },
    { key: "email", label: "Email", width: 160, minWidth: 120, visible: true },
    { key: "name", label: "Client Name", width: 120, minWidth: 80, visible: true },
    { key: "address", label: "City", width: 100, minWidth: 80, visible: true },
    { key: "chats", label: "Chats", width: 220, minWidth: 160, visible: true },
    { key: "attach", label: "Attachments", width: 200, minWidth: 140, visible: true },
    { key: "remind", label: "Reminders", width: 200, minWidth: 140, visible: true },
    { key: "status", label: "Status", width: 140, minWidth: 100, visible: true },
    { key: "user", label: "Sales User", width: 110, minWidth: 80, visible: true, masterOnly: true },
    { key: "date", label: "Date", width: 110, minWidth: 80, visible: true },
    { key: "actions", label: "PI / WO / TI", width: 170, minWidth: 140, visible: true },
  ];
  const DEFAULT_COLS = ALL_COLS.filter((c) => !c.masterOnly || isMaster);
  let cols = DEFAULT_COLS.map((c) => ({ ...c }));
  let resizing = null;

  // ── column panel (show/hide + reorder) ──────────────────
  let colPanelOpen = false;
  let dragColIdx = null;
  let dragOverColIdx = null;

  const COL_PREFS_KEY = "orderExcelCols";

  function saveColPrefs() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      COL_PREFS_KEY,
      JSON.stringify(cols.map((c) => ({ key: c.key, visible: c.visible, width: c.width }))),
    );
  }

  function loadColPrefs() {
    if (typeof localStorage === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem(COL_PREFS_KEY) || "null");
      if (!saved) return;
      const base = DEFAULT_COLS.map((b) => {
        const s = saved.find((x) => x.key === b.key);
        return s ? { ...b, visible: s.visible, width: s.width } : b;
      });
      // restore order from saved
      base.sort((a, b) => {
        const ai = saved.findIndex((s) => s.key === a.key);
        const bi = saved.findIndex((s) => s.key === b.key);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      cols = base;
    } catch {}
  }

  function onPanelDragStart(i) {
    dragColIdx = i;
  }
  function onPanelDragOver(i) {
    dragOverColIdx = i;
  }
  function onPanelDrop(i) {
    if (dragColIdx === null || dragColIdx === i) {
      dragColIdx = null;
      dragOverColIdx = null;
      return;
    }
    const reordered = [...cols];
    const [moved] = reordered.splice(dragColIdx, 1);
    reordered.splice(i, 0, moved);
    cols = reordered;
    dragColIdx = null;
    dragOverColIdx = null;
    saveColPrefs();
  }

  function startResize(e, idx) {
    // idx is index in visibleCols; find in cols
    const key = visibleCols[idx]?.key;
    const realIdx = cols.findIndex((c) => c.key === key);
    if (realIdx === -1) return;
    e.preventDefault();
    resizing = { colIdx: realIdx, startX: e.clientX, startWidth: cols[realIdx].width };
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", stopResize);
  }
  function onResize(e) {
    if (!resizing) return;
    const delta = e.clientX - resizing.startX;
    const newW = Math.max(cols[resizing.colIdx].minWidth, resizing.startWidth + delta);
    cols[resizing.colIdx].width = newW;
    cols = [...cols];
  }
  function stopResize() {
    resizing = null;
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", stopResize);
    saveColPrefs();
  }
  function resetColWidths() {
    cols = DEFAULT_COLS.map((c) => ({ ...c }));
    localStorage.removeItem(COL_PREFS_KEY);
    colPanelOpen = false;
  }

  function saveFilterStore() {
    orderExcelFilterStore.set({
      searchTerm,
      filterStatus,
      filterDateRange,
      customStartDate,
      customEndDate,
      filterUserId,
      filterCompanyId,
      filterCategory,
      orderBy,
      pageSize,
    });
  }

  // ── API ──────────────────────────────────────────────────
  async function fetchOrders(page = 1) {
    if (filterDateRange === "custom" && (!customStartDate || !customEndDate)) {
      loadingData = false;
      return;
    }
    loadingData = true;
    currentPage = page;
    expandedRow = null;
    try {
      const dateParams = getDateRangeParams(filterDateRange);
      const q = new URLSearchParams({
        search: searchTerm || "",
        orderBy,
        limit: String(pageSize),
        page: String(page),
        full: "true",
        ...(filterStatus && { status: filterStatus }),
        ...(filterUserId && { byUserId: filterUserId }),
        ...(filterCompanyId && { byCompanyId: filterCompanyId }),
        ...(filterCategory && { category: filterCategory }),
        ...(filterSource && { source: filterSource }),
        ...dateParams,
      });
      const res = await authApiFetch(`${API_ROUTES.ORDER}?${q}`, { method: "GET" });
      orders = res.data || res;
      total = res.total || orders.length;
      totalPages = res.totalPages || 1;
    } catch (e) {
    } finally {
      loadingData = false;
    }
  }

  async function refreshOrder(orderId) {
    try {
      const res = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`, { method: "GET" });
      orders = orders.map((o) => (o.id === orderId ? res : o));
    } catch (e) {}
  }

  async function toggleRow(orderId) {
    expandedRow = expandedRow === orderId ? null : orderId;
    if (expandedRow) {
      await tick();
      for (const id of [
        `chat-scroll-${orderId}`,
        `attach-scroll-${orderId}`,
        `remind-scroll-${orderId}`,
      ]) {
        const el = document.getElementById(id);
        if (el) el.scrollTop = el.scrollHeight;
      }
    }
  }

  function toggleInlineChatType(orderId, type) {
    const cur = chatTypeInput[orderId] || [];
    const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
    chatTypeInput = { ...chatTypeInput, [orderId]: next };
  }

  function toggleInlineChatAll(orderId) {
    const cur = chatTypeInput[orderId] || [];
    const isAllSelected = CHAT_TYPES.every((t) => cur.includes(t));
    chatTypeInput = { ...chatTypeInput, [orderId]: isAllSelected ? [] : [...CHAT_TYPES] };
  }

  async function sendChat(orderId) {
    const msg = (chatMsg[orderId] || "").trim();
    if (!msg) return;
    try {
      await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify({
          orderId,
          message: msg,
          type: (chatTypeInput[orderId] || []).map((t) => (t === "WA" ? "WhatsApp" : t)).join(","),
        }),
      });
      chatMsg[orderId] = "";
      chatTypeInput[orderId] = [];
      chatMsg = { ...chatMsg };
      chatTypeInput = { ...chatTypeInput };
      await refreshOrder(orderId);
      await tick();
      const el = document.getElementById(`chat-scroll-${orderId}`);
      if (el) el.scrollTop = el.scrollHeight;
    } catch (e) {}
  }

  async function addReminder(orderId) {
    const msg = (reminderInput[orderId] || "").trim();
    const localTime = reminderTimeInput[orderId] || null;
    // datetime-local gives a timezone-less string; new Date() parses it as local time
    // .toISOString() converts to UTC so the API stores it correctly
    const time = localTime ? new Date(localTime).toISOString() : null;
    if (!msg) return;
    try {
      await authApiFetch(API_ROUTES.ORDER_REMINDER, {
        method: "POST",
        data: JSON.stringify({ orderId, message: msg, reminderTime: time }),
      });
      reminderInput[orderId] = "";
      reminderTimeInput[orderId] = null;
      await refreshOrder(orderId);
      await tick();
      const el = document.getElementById(`remind-scroll-${orderId}`);
      if (el) el.scrollTop = el.scrollHeight;
    } catch (e) {}
  }

  async function handleFileUpload(orderId, e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("orderId", orderId);
    try {
      await authApiFetch(API_ROUTES.ORDER_ATTACHMENT, { method: "POST", data: form });
      await refreshOrder(orderId);
      await tick();
      const el = document.getElementById(`attach-scroll-${orderId}`);
      if (el) el.scrollTop = el.scrollHeight;
    } catch (err) {
    } finally {
      e.target.value = "";
    }
  }

  async function updateStatus(orderId, status) {
    try {
      await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`, {
        method: "PUT",
        data: JSON.stringify({
          status,
          orderActivity: { title: "Status Updated", description: `Status changed to ${status}.` },
        }),
      });
      orders = orders.map((o) => (o.id === orderId ? { ...o, status } : o));
      if (FEEDBACK_TRIGGER_STATUSES.includes(status)) {
        const order = orders.find((o) => o.id === orderId);
        if (order) openFeedbackModal(order, status);
      }
    } catch (e) {}
  }

  function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateTime(d) {
    if (!d) return "";
    let s = String(d);
    // If no timezone info, treat as UTC (API stores UTC but may omit Z)
    if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
    return new Date(s).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  const STATUS_OPTIONS = [
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
    "Reference",
  ];

  // PI/WO/TI modal
  let piwotiModalOpen = false;
  let piwotiModalType = "PI";
  let piwotiModalOrder = null;

  function openPIWOTIModal(type, order) {
    piwotiModalType = type;
    piwotiModalOrder = order;
    piwotiModalOpen = true;
  }

  async function onPIWOTIRefresh() {
    if (piwotiModalOrder) await refreshOrder(piwotiModalOrder.id);
    // Sync modal order with updated data
    piwotiModalOrder = orders.find((o) => o.id === piwotiModalOrder?.id) ?? piwotiModalOrder;
  }

  let refresh = false;
  async function refreshPage() {
    refresh = true;
    try {
      await fetchOrders(currentPage);
    } finally {
      refresh = false;
    }
  }

  // ── Client Edit Modal ────────────────────────────────────
  let clientEditModal = null;
  // = { orderId, order, focusField, clientId, clientContactId, isCompany, noContact }
  let clientEditForm = {
    name: "",
    mobile: "",
    alternateMobile: "",
    whatsapp: "",
    email: "",
    designation: "",
    address: "",
  };
  let clientEditCompanyName = "";
  let clientEditSaving = false;
  let clientEditError = "";

  function openClientEditModal(order, field) {
    const primaryOC = order.orderContacts?.find((oc) => oc.isPrimary) ?? order.orderContacts?.[0];
    const cc = primaryOC?.clientContact;

    if (field === "company") {
      clientEditModal = {
        orderId: order.id,
        order,
        focusField: "company",
        clientId: order.client?.id,
        clientContactId: null,
        isCompany: true,
        noContact: false,
      };
      clientEditCompanyName = order.client?.name || "";
    } else {
      clientEditModal = {
        orderId: order.id,
        order,
        focusField: field,
        clientId: order.client?.id,
        clientContactId: cc?.id ?? null,
        isCompany: false,
        noContact: !cc,
      };
      clientEditForm = {
        name: cc?.name || "",
        mobile: cc?.mobile || "",
        alternateMobile: cc?.alternateMobile || "",
        whatsapp: cc?.whatsapp || "",
        email: cc?.email || "",
        designation: cc?.designation || "",
        address: cc?.address || "",
      };
    }
    clientEditError = "";
    clientEditSaving = false;
  }

  function closeClientEditModal() {
    clientEditModal = null;
    clientEditForm = {
      name: "",
      mobile: "",
      alternateMobile: "",
      whatsapp: "",
      email: "",
      designation: "",
      address: "",
    };
    clientEditCompanyName = "";
    clientEditError = "";
    clientEditSaving = false;
  }

  async function saveClientEdit() {
    if (!clientEditModal || clientEditSaving) return;
    const { orderId, order, clientId, clientContactId, isCompany, noContact } = clientEditModal;
    clientEditSaving = true;
    clientEditError = "";
    try {
      if (isCompany) {
        const newName = clientEditCompanyName.trim();
        if (!newName) {
          clientEditError = "Company name cannot be empty.";
          clientEditSaving = false;
          return;
        }
        await authApiFetch(`${API_ROUTES.CLIENT}/${clientId}`, {
          method: "PUT",
          data: JSON.stringify({ name: newName }),
        });
        orders = orders.map((o) =>
          o.id === orderId ? { ...o, client: { ...o.client, name: newName } } : o,
        );
      } else if (noContact) {
        // Create new ClientContact + OrderContact
        if (!clientEditForm.name.trim()) {
          clientEditError = "Name is required.";
          clientEditSaving = false;
          return;
        }
        const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
          method: "POST",
          data: JSON.stringify({
            clientId,
            name: clientEditForm.name.trim(),
            mobile: clientEditForm.mobile || undefined,
            alternateMobile: clientEditForm.alternateMobile || undefined,
            whatsapp: clientEditForm.whatsapp || undefined,
            email: clientEditForm.email || undefined,
            designation: clientEditForm.designation || undefined,
            address: clientEditForm.address || undefined,
          }),
        });
        const newContact = contactRes.data ?? contactRes;
        await authApiFetch(API_ROUTES.ORDER_CONTACT, {
          method: "POST",
          data: JSON.stringify({ orderId, clientContactId: newContact.id }),
        });
        // Also create/update orderClients[0]
        const orderClientId = order?.orderClients?.[0]?.id;
        const legacyPayload = {
          orderId,
          name: clientEditForm.name.trim(),
          mobile: clientEditForm.mobile || "",
          address: clientEditForm.address || "",
        };
        if (orderClientId) {
          await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${orderClientId}`, {
            method: "PUT",
            data: JSON.stringify(legacyPayload),
          });
        } else {
          await authApiFetch(API_ROUTES.ORDER_CLIENT, {
            method: "POST",
            data: JSON.stringify(legacyPayload),
          });
        }
        await refreshOrder(orderId);
      } else {
        // Update existing ClientContact — all fields
        await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${clientContactId}`, {
          method: "PUT",
          data: JSON.stringify({
            name: clientEditForm.name.trim(),
            mobile: clientEditForm.mobile || undefined,
            alternateMobile: clientEditForm.alternateMobile || undefined,
            whatsapp: clientEditForm.whatsapp || undefined,
            email: clientEditForm.email || undefined,
            designation: clientEditForm.designation || undefined,
            address: clientEditForm.address || undefined,
          }),
        });
        // Sync orderClients[0] for legacy display consistency
        const orderClientId = order?.orderClients?.[0]?.id;
        if (orderClientId) {
          await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${orderClientId}`, {
            method: "PUT",
            data: JSON.stringify({
              name: clientEditForm.name.trim(),
              mobile: clientEditForm.mobile || "",
              address: clientEditForm.address || "",
            }),
          });
        }
        // Update local state
        orders = orders.map((o) => {
          if (o.id !== orderId) return o;
          const updatedContacts = (o.orderContacts || []).map((oc) =>
            oc.clientContact?.id === clientContactId
              ? {
                  ...oc,
                  clientContact: {
                    ...oc.clientContact,
                    ...clientEditForm,
                    name: clientEditForm.name.trim(),
                  },
                }
              : oc,
          );
          const updatedLegacy = (o.orderClients || []).map((oc, i) =>
            i === 0
              ? {
                  ...oc,
                  name: clientEditForm.name.trim(),
                  mobile: clientEditForm.mobile || "",
                  address: clientEditForm.address || "",
                }
              : oc,
          );
          return { ...o, orderContacts: updatedContacts, orderClients: updatedLegacy };
        });
      }
      closeClientEditModal();
    } catch (e) {
      clientEditError = "Failed to save. Please try again.";
    } finally {
      clientEditSaving = false;
    }
  }

  // ── Link Client Modal ────────────────────────────────────
  let showLinkClientModal = false;
  let linkClientOrderId = null;
  let linkClientOrder = null; // full order object
  let linkClientSearch = "";
  let linkClientResults = [];
  let linkClientSelected = null;
  let linkClientSearching = false;
  let linkingClient = false;
  let linkClientDebounce;
  let showCreateClientForm = false;
  let newClientForm = { name: "", mobile: "", email: "", address: "" };
  // for "client linked, pick/add contact" mode
  let selectedContactId = null;
  let showAddContactForm = false;
  let newContactForm = { name: "", mobile: "", email: "" };
  // legacy orderClients migration (pre-checked)
  let legacyChecked = [];

  function openLinkClientModal(e, order) {
    e.stopPropagation();
    linkClientOrderId = order.id;
    linkClientOrder = order;
    linkClientSearch = "";
    linkClientResults = [];
    linkClientSelected = null;
    showCreateClientForm = false;
    showAddContactForm = false;
    selectedContactId = null;
    newClientForm = { name: "", mobile: "", email: "", address: "" };
    newContactForm = { name: "", mobile: "", email: "" };
    // pre-check all existing orderClients
    legacyChecked = (order.orderClients || []).filter((oc) => !oc.deletedAt).map((oc) => oc.id);
    showLinkClientModal = true;
  }

  function closeLinkClientModal() {
    showLinkClientModal = false;
    linkClientOrderId = null;
    linkClientOrder = null;
    linkClientSelected = null;
    linkClientSearch = "";
    linkClientResults = [];
    showCreateClientForm = false;
    showAddContactForm = false;
    selectedContactId = null;
    legacyChecked = [];
    newClientForm = { name: "", mobile: "", email: "", address: "" };
    newContactForm = { name: "", mobile: "", email: "" };
  }

  $: legacyContacts = (linkClientOrder?.orderClients || []).filter((oc) => !oc.deletedAt);

  async function migrateLegacyContacts(client) {
    const toMigrate = legacyContacts.filter((oc) => legacyChecked.includes(oc.id));
    for (const oc of toMigrate) {
      try {
        const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
          method: "POST",
          data: JSON.stringify({
            clientId: client.id,
            name: oc.name,
            mobile: oc.mobile || undefined,
            email: oc.email || undefined,
            designation: oc.designation || undefined,
            whatsapp: oc.whatsapp || undefined,
            alternateMobile: oc.alternateMobile || undefined,
            address: oc.address || undefined,
          }),
        });
        const contact = contactRes.data ?? contactRes;
        await authApiFetch(API_ROUTES.ORDER_CONTACT, {
          method: "POST",
          data: JSON.stringify({ orderId: linkClientOrderId, clientContactId: contact.id }),
        });
      } catch (e) {}
    }
  }

  // Mode detection
  $: linkedClient = linkClientOrder?.client ?? null;
  $: linkedClientContacts = linkedClient?.contacts ?? [];

  // ── Inline contact (cell-level, no modal) ───────────────
  let inlineContactName = {}; // { [orderId]: string }
  let inlineContactMobile = {}; // { [orderId]: string }
  let savingInlineContact = {}; // { [orderId]: boolean }

  async function saveInlineContact(order) {
    const name = (inlineContactName[order.id] || "").trim();
    if (!name || savingInlineContact[order.id]) return;
    savingInlineContact[order.id] = true;
    try {
      const clientId = order.client?.id;
      const mobile = (inlineContactMobile[order.id] || "").trim();
      // Check if contact with same mobile already exists → update, else create
      const existing = order.client?.contacts?.find((c) => mobile && c.mobile === mobile);
      if (!existing && clientId) {
        await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
          method: "POST",
          data: JSON.stringify({ clientId, name, mobile: mobile || "" }),
        });
      }
      // Create orderClient row
      await authApiFetch(API_ROUTES.ORDER_CLIENT, {
        method: "POST",
        data: JSON.stringify({ orderId: order.id, name, mobile: mobile || "" }),
      });
      inlineContactName[order.id] = "";
      inlineContactMobile[order.id] = "";
      await refreshOrder(order.id);
    } catch (err) {
    } finally {
      savingInlineContact[order.id] = false;
    }
  }

  async function searchLinkClients(q) {
    if (!q || q.length < 1) {
      linkClientResults = [];
      return;
    }
    linkClientSearching = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.CLIENT}?search=${encodeURIComponent(q)}&limit=20`,
      );
      linkClientResults = res.data ?? res ?? [];
    } catch (_) {
      linkClientResults = [];
    } finally {
      linkClientSearching = false;
    }
  }

  function onLinkClientSearchInput(e) {
    linkClientSearch = e.target.value;
    linkClientSelected = null;
    clearTimeout(linkClientDebounce);
    linkClientDebounce = setTimeout(() => searchLinkClients(linkClientSearch), 300);
  }

  async function confirmLinkClient() {
    if (!linkClientOrderId) return;
    linkingClient = true;
    try {
      let clientId = null;
      let clientName = "";
      let contactData = {};

      if (linkedClient) {
        // Mode: client already linked — pick existing contact or add new one
        clientId = linkedClient.id;
        clientName = linkedClient.name;
        if (showAddContactForm) {
          if (!newContactForm.name.trim()) {
            linkingClient = false;
            return;
          }
          // Create new contact for this client
          const created = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
            method: "POST",
            data: JSON.stringify({
              clientId,
              name: newContactForm.name.trim(),
              mobile: newContactForm.mobile || "",
              ...(newContactForm.email ? { email: newContactForm.email } : {}),
            }),
          });
          contactData = {
            name: newContactForm.name.trim(),
            mobile: newContactForm.mobile || "",
            ...(newContactForm.email ? { email: newContactForm.email } : {}),
          };
        } else {
          // Pick selected existing contact
          const contact =
            linkedClientContacts.find((c) => c.id === selectedContactId) ??
            linkedClientContacts[0] ??
            {};
          contactData = {
            name: contact.name || linkedClient.name,
            mobile: contact.mobile || "",
            ...(contact.email ? { email: contact.email } : {}),
          };
        }
      } else if (showCreateClientForm) {
        if (!newClientForm.name.trim()) {
          linkingClient = false;
          return;
        }
        const created = await authApiFetch(API_ROUTES.CLIENT, {
          method: "POST",
          data: JSON.stringify({
            name: newClientForm.name.trim(),
            address: newClientForm.address || "",
          }),
        });
        clientId = created?.id ?? created?.data?.id;
        // Create contact separately
        if (clientId && (newClientForm.mobile || newClientForm.email)) {
          await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
            method: "POST",
            data: JSON.stringify({
              clientId,
              name: newClientForm.name.trim(),
              mobile: newClientForm.mobile || "",
              ...(newClientForm.email ? { email: newClientForm.email } : {}),
            }),
          });
        }
        clientName = newClientForm.name.trim();
        contactData = {
          name: newClientForm.name.trim(),
          mobile: newClientForm.mobile || "",
          address: newClientForm.address || "",
          ...(newClientForm.email ? { email: newClientForm.email } : {}),
        };
      } else {
        if (!linkClientSelected) {
          linkingClient = false;
          return;
        }
        const c = linkClientSelected;
        const contact = c.contacts?.[0] ?? {};
        clientId = c.id;
        clientName = c.name;
        contactData = {
          name: contact.name || c.name,
          designation: contact.designation || "",
          mobile: contact.mobile || "",
          alternateMobile: contact.alternateMobile || "",
          whatsapp: contact.whatsapp || "",
          address: c.address || "",
          ...(contact.email ? { email: contact.email } : {}),
        };
      }

      await authApiFetch(API_ROUTES.ORDER_CLIENT, {
        method: "POST",
        data: JSON.stringify({ orderId: linkClientOrderId, ...contactData }),
      });
      if (!linkedClient) {
        await authApiFetch(`${API_ROUTES.ORDER}/${linkClientOrderId}`, {
          method: "PUT",
          data: JSON.stringify({ ...(clientId ? { clientId } : {}) }),
        });
        // migrate pre-checked orderClients into formal contacts
        if (legacyChecked.length > 0) {
          const resolvedClient = linkClientSelected ?? { id: clientId, name: clientName };
          await migrateLegacyContacts(resolvedClient);
        }
      }
      await refreshOrder(linkClientOrderId);
      closeLinkClientModal();
    } catch (err) {
    } finally {
      linkingClient = false;
    }
  }

  $: visibleCols = cols.filter((c) => c.visible !== false);
  $: pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  $: snoWidth = visibleCols.find((c) => c.key === "sno")?.width ?? 50;
  $: dateRangeLabel =
    filterDateRange === "custom" && customStartDate && customEndDate
      ? `${customStartDate} to ${customEndDate}`
      : DATE_RANGE_OPTIONS.find((d) => d.value === filterDateRange)?.label || "All Time";
</script>

<div class="page-wrapper excel-page">
  <div class="content container-fluid">
    <!-- Page Header -->
    <div class="page-header mb-3">
      <div class="row align-items-center">
        <div class="col">
          <h4 class="mb-1">
            Orders Excel View
            <span class="font-normal text-muted excel-meta">({dateRangeLabel})</span>
          </h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/order">Orders</a></li>
              <li class="breadcrumb-item active" aria-current="page">Excel View</li>
            </ol>
          </nav>
        </div>
        <div class="col-auto">
          <button class="btn btn-danger" on:click={openDrawer}>
            <i class="ti ti-plus me-1"></i>Add Order
          </button>
        </div>
      </div>
    </div>

    <!-- Filters toolbar -->
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <!-- Search -->
      <div class="input-icon input-icon-start position-relative">
        <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
        <input
          type="text"
          class="form-control"
          placeholder="Search..."
          bind:value={searchTerm}
          on:keydown={(e) => {
            if (e.key === "Enter") {
              saveFilterStore();
              fetchOrders(1);
            }
          }}
        />
      </div>
      <!-- Date Range -->
      <select
        class="form-select"
        style="width:160px;"
        bind:value={filterDateRange}
        on:change={() => {
          saveFilterStore();
          fetchOrders(1);
        }}
      >
        {#each DATE_RANGE_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
      <!-- Custom date range inputs -->
      {#if filterDateRange === "custom"}
        <input
          type="date"
          class="form-control"
          style="width:145px;"
          bind:value={customStartDate}
          on:change={() => {
            saveFilterStore();
            fetchOrders(1);
          }}
        />
        <input
          type="date"
          class="form-control"
          style="width:145px;"
          bind:value={customEndDate}
          on:change={() => {
            saveFilterStore();
            fetchOrders(1);
          }}
        />
      {/if}
      <!-- Status filter -->
      <select
        class="form-select"
        style="width:155px;"
        bind:value={filterStatus}
        on:change={() => {
          saveFilterStore();
          fetchOrders(1);
        }}
      >
        <option value="">All Status</option>
        {#each STATUS_OPTIONS as s}<option value={s}>{$statusNamesStore[s]?.name ?? s}</option
          >{/each}
      </select>
      <!-- User filter (master / admin only) -->
      {#if (isMaster || currentUser?.role === "admin") && allUsers.length > 0}
        <select
          class="form-select"
          style="width:165px;"
          bind:value={filterUserId}
          on:change={() => {
            saveFilterStore();
            fetchOrders(1);
          }}
        >
          <option value="">All Users</option>
          {#each allUsers as u}
            <option value={String(u.id)}>{u.name} ({u.role})</option>
          {/each}
        </select>
      {/if}
      <!-- Company filter (master / admin only) -->
      {#if (isMaster || currentUser?.role === "admin") && allCompanies.length > 0}
        <select
          class="form-select"
          style="width:165px;"
          bind:value={filterCompanyId}
          on:change={() => {
            saveFilterStore();
            fetchOrders(1);
          }}
        >
          <option value="">All Companies</option>
          {#each allCompanies as c}
            <option value={String(c.id)}>{c.name}</option>
          {/each}
        </select>
      {/if}
      <!-- Category filter -->
      <input
        type="text"
        class="form-control"
        style="width:140px;"
        placeholder="Category..."
        bind:value={filterCategory}
        on:keydown={(e) => {
          if (e.key === "Enter") {
            saveFilterStore();
            fetchOrders(1);
          }
        }}
      />
      <!-- Source filter -->
      <select
        class="form-select"
        style="width:145px;"
        bind:value={filterSource}
        on:change={() => {
          saveFilterStore();
          fetchOrders(1);
        }}
      >
        <option value="">All Sources</option>
        <option value="old_import">Old Import</option>
      </select>
      <!-- Sort -->
      <select
        class="form-select"
        style="width:155px;"
        bind:value={orderBy}
        on:change={() => {
          saveFilterStore();
          fetchOrders(1);
        }}
      >
        {#each ORDER_BY_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
      <!-- Columns panel -->
      <div class="position-relative">
        <button
          class="btn btn-outline-light shadow"
          on:click={() => (colPanelOpen = !colPanelOpen)}
          title="Show/hide & reorder columns"
        >
          <i class="ti ti-columns me-1"></i>Columns
          {#if cols.some((c) => c.visible === false)}
            <span class="badge bg-warning text-dark ms-1" style="font-size:9px;"
              >{cols.filter((c) => c.visible === false).length} hidden</span
            >
          {/if}
        </button>
        {#if colPanelOpen}
          <div class="fixed inset-0 z-[98]" on:click={() => (colPanelOpen = false)}></div>
          <div
            class="position-absolute bg-white border rounded shadow-lg z-[99]"
            style="top:42px;right:0;width:230px;max-height:380px;display:flex;flex-direction:column;"
          >
            <div
              class="px-3 py-2 border-bottom d-flex justify-content-between align-items-center bg-gray-50"
            >
              <span class="text-xs font-semibold text-gray-600">Columns</span>
              <span class="text-[10px] text-gray-400">Drag to reorder</span>
            </div>
            <div style="overflow-y:auto;flex:1;">
              {#each cols as col, i}
                <div
                  draggable="true"
                  on:dragstart={() => onPanelDragStart(i)}
                  on:dragover|preventDefault={() => onPanelDragOver(i)}
                  on:drop|preventDefault={() => onPanelDrop(i)}
                  on:dragend={() => {
                    dragColIdx = null;
                    dragOverColIdx = null;
                  }}
                  class="d-flex align-items-center gap-2 px-3 py-1.5 border-bottom cursor-grab"
                  style="background:{dragOverColIdx === i
                    ? '#eff6ff'
                    : 'white'}; border-left:{dragOverColIdx === i
                    ? '2px solid #3b82f6'
                    : '2px solid transparent'};"
                >
                  <i class="ti ti-grip-vertical text-gray-300 text-xs flex-shrink-0"></i>
                  <input
                    type="checkbox"
                    class="form-check-input m-0 flex-shrink-0"
                    bind:checked={col.visible}
                    on:change={() => {
                      cols = [...cols];
                      saveColPrefs();
                    }}
                  />
                  <span
                    class="text-xs flex-1 truncate"
                    style="opacity:{col.visible === false ? 0.4 : 1};">{col.label}</span
                  >
                </div>
              {/each}
            </div>
            <div class="px-3 py-2 border-top">
              <button class="btn btn-sm btn-outline-secondary w-100" on:click={resetColWidths}>
                <i class="ti ti-refresh me-1"></i>Reset to Default
              </button>
            </div>
          </div>
        {/if}
      </div>
      <!-- Refresh -->
      <a
        href="#refresh"
        on:click|preventDefault={refreshPage}
        class="btn btn-icon btn-outline-light shadow"
        title="Refresh"
        aria-label="Refresh"
      >
        <i class="ti ti-refresh" class:animate-spin={refresh}></i>
      </a>
    </div>

    {#if loadingData}
      <Loader />
    {:else}
      <!-- Card wrapping table + pagination -->
      <div class="card mb-0">
        <div class="card-body p-0">
          <!-- Grid -->
          <div class="overflow-auto rounded-top" style="max-height:calc(100vh - 230px);">
            <table
              class="border-collapse text-xs"
              style="table-layout:fixed; width:{visibleCols.reduce((s, c) => s + c.width, 0)}px;"
            >
              <colgroup>
                {#each visibleCols as col}
                  <col style="width:{col.width}px; min-width:{col.minWidth}px;" />
                {/each}
              </colgroup>

              <thead>
                <tr>
                  {#each visibleCols as col, i}
                    <th
                      class="p-0 border border-gray-200 bg-gray-100 sticky top-0 z-10 whitespace-nowrap text-xs font-semibold select-none"
                      class:sticky-th-sno={col.key === "sno"}
                      class:sticky-th-pid={col.key === "pId"}
                      style={col.key === "pId" ? `left:${snoWidth}px;` : ""}
                    >
                      <div class="flex items-center justify-between px-2 py-1.5 gap-1">
                        <span class="excel-th uppercase tracking-wide font-semibold text-gray-600"
                          >{col.label}</span
                        >
                        <div
                          class="resize-handle w-1.5 min-w-[6px] h-full min-h-[20px] cursor-col-resize bg-transparent border-r-2 border-gray-300 -mr-2"
                          on:mousedown={(e) => startResize(e, i)}
                          title="Drag to resize"
                        ></div>
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>

              <tbody>
                {#each orders as order, i}
                  {@const chats = order.orderChats || []}
                  {@const attachments = order.orderAttachments || []}
                  {@const reminders = order.orderReminders || []}
                  {@const lastChat = chats[chats.length - 1]}
                  {@const lastAttach = attachments[attachments.length - 1]}
                  {@const lastRemind = reminders[reminders.length - 1]}
                  {@const isExp = expandedRow === order.id}
                  {@const rowBg = isExp ? "#fffbea" : i % 2 === 0 ? "#fff" : "#f9f9f9"}
                  {@const isTitleEdit =
                    editingCell?.orderId === order.id && editingCell?.field === "title"}
                  {@const isCompanyEdit =
                    editingCell?.orderId === order.id && editingCell?.field === "company"}
                  {@const isMobileEdit =
                    editingCell?.orderId === order.id && editingCell?.field === "mobile"}
                  {@const isNameEdit =
                    editingCell?.orderId === order.id && editingCell?.field === "name"}
                  {@const isAddressEdit =
                    editingCell?.orderId === order.id && editingCell?.field === "address"}
                  {@const isTitleSaving =
                    savingCell?.orderId === order.id && savingCell?.field === "title"}
                  {@const isCompanySaving =
                    savingCell?.orderId === order.id && savingCell?.field === "company"}
                  {@const isMobileSaving =
                    savingCell?.orderId === order.id && savingCell?.field === "mobile"}
                  {@const isNameSaving =
                    savingCell?.orderId === order.id && savingCell?.field === "name"}
                  {@const isAddressSaving =
                    savingCell?.orderId === order.id && savingCell?.field === "address"}

                  <tr
                    class="excel-row cursor-pointer"
                    style="background:{rowBg};"
                    class:excel-row--chat-active={activeChatOrderId === order.id}
                    on:click={() => toggleRow(order.id)}
                  >
                    {#each visibleCols as col}
                      {#if col.key === "sno"}
                        <!-- S.No -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs overflow-hidden h-[54px] text-center sticky-td-sno"
                          style="background:{rowBg};"
                        >
                          <div class="flex flex-col items-center justify-center gap-0.5">
                            <span>{(currentPage - 1) * pageSize + i + 1}</span>
                            {#if isExp}<i
                                class="ti ti-chevron-up text-blue-500"
                                style="font-size:11px;line-height:1;"
                              ></i>{/if}
                          </div>
                        </td>
                      {:else if col.key === "pId"}
                        <!-- pId -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs overflow-hidden h-[54px] sticky-td-pid"
                          style="background:{rowBg}; left:{snoWidth}px;"
                          on:click|stopPropagation
                        >
                          <a
                            href="/admin/order/{order.id}"
                            class="text-blue-600 no-underline font-semibold text-xs hover:underline"
                            on:click|preventDefault={() => goto(`/admin/order/${order.id}`)}
                            >#{order.pId || order.id}</a
                          >
                          {#if order.workOrderNumber}<div
                              class="mt-0.5 text-[10px] text-gray-500 truncate"
                            >
                              {order.workOrderNumber}
                            </div>{/if}
                        </td>
                      {:else if col.key === "inqCode"}
                        <!-- Inq. Code -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs overflow-hidden h-[54px]"
                          style="background:{rowBg};"
                        >
                          {#if order.inqCode}<span class="font-mono text-[11px] text-gray-700"
                              >{order.inqCode}</span
                            >
                          {:else}<span class="text-gray-300">—</span>{/if}
                        </td>
                      {:else if col.key === "title"}
                        <!-- Title -->
                        <td
                          class="px-2 py-2 border text-xs overflow-hidden h-[54px] align-middle group"
                          class:cursor-text={isExp}
                          class:border-blue-400={isTitleEdit}
                          class:border-gray-100={!isTitleEdit}
                          title={isTitleEdit ? "" : order.title || ""}
                          on:click={(e) => {
                            if (!isExp) return;
                            e.stopPropagation();
                            if (!isTitleEdit) startEdit(e, order.id, "title", order.title);
                          }}
                        >
                          {#if isTitleEdit}
                            <input
                              id="cell-input-{order.id}-title"
                              class="w-full h-full text-xs bg-transparent outline-none border-none p-0 leading-normal"
                              bind:value={editingValue}
                              on:keydown={onCellKeydown}
                              on:blur={saveEdit}
                              on:click|stopPropagation
                            />
                          {:else if isTitleSaving}
                            <div class="flex items-center gap-1 text-gray-400">
                              <span
                                class="spinner-border spinner-border-sm"
                                style="width:10px;height:10px;border-width:1.5px;"
                              ></span> <span class="truncate">{order.title || "-"}</span>
                            </div>
                          {:else}
                            <div
                              class="line-clamp-2 break-words leading-normal"
                              class:group-hover:text-blue-600={isExp}
                            >
                              {order.title || "-"}
                              {#if order.source === "old_import"}
                                <span
                                  style="display:inline-block;font-size:9px;font-weight:600;background:#e8f4ff;color:#1971c2;border:1px solid #a5d8ff;border-radius:4px;padding:0 5px;letter-spacing:0.2px;margin-left:4px;vertical-align:middle;"
                                  >Old Import</span
                                >
                              {/if}
                            </div>
                          {/if}
                        </td>
                      {:else if col.key === "company"}
                        <!-- Company: client.name takes priority over order.company text -->
                        <td
                          class="px-2 py-2 border text-xs h-[54px] align-middle group cursor-pointer"
                          class:border-blue-400={isCompanyEdit}
                          class:border-gray-100={!isCompanyEdit}
                          on:click={(e) => {
                            e.stopPropagation();
                            if (order.client) {
                              openClientEditModal(order, "company");
                            } else if (!isCompanyEdit) {
                              startEdit(e, order.id, "company", order.company);
                            }
                          }}
                        >
                          {#if isCompanyEdit}
                            <input
                              id="cell-input-{order.id}-company"
                              class="w-full text-xs bg-transparent outline-none border-none p-0"
                              bind:value={editingValue}
                              on:keydown={onCellKeydown}
                              on:blur={saveEdit}
                              on:click|stopPropagation
                            />
                          {:else if isCompanySaving}
                            <div class="flex items-center gap-1 text-gray-400">
                              <span
                                class="spinner-border spinner-border-sm"
                                style="width:10px;height:10px;border-width:1.5px;"
                              ></span>
                              <span class="truncate"
                                >{order.client?.name || order.company || "-"}</span
                              >
                            </div>
                          {:else}
                            <div
                              class="truncate"
                              class:group-hover:text-blue-600={isExp && !order.client}
                            >
                              {order.client?.name || order.company || "-"}
                              {#if order.client}
                                <span
                                  title="From linked client — edit via client record"
                                  class="ms-1 text-blue-400 cursor-default">●</span
                                >
                              {/if}
                            </div>
                          {/if}
                        </td>
                      {:else if col.key === "mobile"}
                        <!-- Mobile: primary orderContact.clientContact > orderClients[0]. Read-only if client linked. -->
                        {@const primaryOC =
                          order.orderContacts?.find((oc) => oc.isPrimary) ??
                          order.orderContacts?.[0]}
                        {@const mobileFromContact = primaryOC?.clientContact?.mobile}
                        {@const mobileFromLegacy = order.orderClients?.[0]?.mobile}
                        {@const displayMobile = mobileFromContact || mobileFromLegacy || ""}
                        {@const mobileReadOnly = !!order.client}
                        {@const mobileCopyKey = `mobile-${order.id}`}
                        <td
                          class="px-2 py-2 border text-xs h-[54px] align-middle group cursor-pointer"
                          class:border-blue-400={isMobileEdit}
                          class:border-gray-100={!isMobileEdit}
                          on:click={(e) => {
                            e.stopPropagation();
                            if (mobileReadOnly) {
                              openClientEditModal(order, "mobile");
                            } else if (!isMobileEdit) {
                              startEdit(e, order.id, "mobile", mobileFromLegacy);
                            }
                          }}
                        >
                          {#if isMobileEdit}
                            <input
                              id="cell-input-{order.id}-mobile"
                              class="w-full text-xs bg-transparent outline-none border-none p-0"
                              bind:value={editingValue}
                              on:keydown={onCellKeydown}
                              on:blur={saveEdit}
                              on:click|stopPropagation
                            />
                          {:else if isMobileSaving}
                            <div class="flex items-center gap-1 text-gray-400">
                              <span
                                class="spinner-border spinner-border-sm"
                                style="width:10px;height:10px;border-width:1.5px;"
                              ></span> <span class="truncate">{displayMobile || "-"}</span>
                            </div>
                          {:else}
                            <div class="flex items-center gap-1 min-w-0">
                              <span
                                class="truncate"
                                class:group-hover:text-blue-600={isExp}
                                class:text-gray-500={!isExp}
                                class:tracking-wider={!isExp}
                              >
                                {isExp ? displayMobile || "-" : maskMobile(displayMobile)}
                              </span>
                              {#if mobileReadOnly && displayMobile && isExp}<span
                                  title="From linked client — edit via order detail"
                                  class="text-blue-400 cursor-default shrink-0">●</span
                                >{/if}
                              {#if displayMobile}
                                <button
                                  type="button"
                                  class="btn btn-xs p-0 shrink-0 text-muted"
                                  title="Copy mobile"
                                  on:click|stopPropagation={() =>
                                    copyField(mobileCopyKey, displayMobile)}
                                >
                                  <i
                                    class="ti {copiedFieldKey === mobileCopyKey
                                      ? 'ti-check text-success'
                                      : 'ti-copy'}"
                                    style="font-size:12px;"
                                  ></i>
                                </button>
                              {/if}
                            </div>
                          {/if}
                        </td>
                      {:else if col.key === "email"}
                        {@const primaryEC =
                          order.orderContacts?.find((oc) => oc.isPrimary) ??
                          order.orderContacts?.[0]}
                        {@const emailFromContact = primaryEC?.clientContact?.email}
                        {@const emailFromLegacy = order.orderClients?.[0]?.email}
                        {@const displayEmail =
                          emailFromContact || emailFromLegacy || order.client?.email || ""}
                        {@const emailReadOnly = !!order.client}
                        {@const emailCopyKey = `email-${order.id}`}
                        <td
                          class="px-2 py-2 border text-xs h-[54px] align-middle group cursor-pointer"
                          class:border-gray-100={true}
                          title={isExp ? displayEmail : ""}
                          on:click={(e) => {
                            e.stopPropagation();
                            if (emailReadOnly) openClientEditModal(order, "email");
                          }}
                        >
                          <div class="flex items-center gap-1 min-w-0">
                            <span
                              class="truncate"
                              class:group-hover:text-blue-600={isExp && emailReadOnly}
                              class:text-gray-500={!isExp}
                              class:tracking-wider={!isExp}
                            >
                              {isExp ? displayEmail || "-" : maskEmail(displayEmail)}
                            </span>
                            {#if displayEmail}
                              <button
                                type="button"
                                class="btn btn-xs p-0 shrink-0 text-muted"
                                title="Copy email"
                                on:click|stopPropagation={() =>
                                  copyField(emailCopyKey, displayEmail)}
                              >
                                <i
                                  class="ti {copiedFieldKey === emailCopyKey
                                    ? 'ti-check text-success'
                                    : 'ti-copy'}"
                                  style="font-size:12px;"
                                ></i>
                              </button>
                            {/if}
                          </div>
                        </td>
                      {:else if col.key === "name"}
                        <!-- Client Name: primary orderContact.clientContact > orderClients[0]. Read-only if client linked. -->
                        {@const primaryNC =
                          order.orderContacts?.find((oc) => oc.isPrimary) ??
                          order.orderContacts?.[0]}
                        {@const nameFromContact = primaryNC?.clientContact?.name}
                        {@const nameFromLegacy = order.orderClients?.[0]?.name}
                        {@const hasLinkedClient = !!order.client}
                        {@const displayName =
                          nameFromContact || nameFromLegacy || order.client?.name || ""}
                        {@const nameReadOnly = hasLinkedClient}
                        <td
                          class="px-2 py-2 border text-xs h-[54px] align-middle group cursor-pointer"
                          class:border-blue-400={isNameEdit}
                          class:border-gray-100={!isNameEdit}
                          on:click={(e) => {
                            e.stopPropagation();
                            if (nameReadOnly) {
                              openClientEditModal(order, "name");
                            } else if (!isNameEdit && nameFromLegacy) {
                              startEdit(e, order.id, "name", nameFromLegacy);
                            }
                          }}
                        >
                          {#if isNameEdit}
                            <input
                              id="cell-input-{order.id}-name"
                              class="w-full text-xs bg-transparent outline-none border-none p-0"
                              bind:value={editingValue}
                              on:keydown={onCellKeydown}
                              on:blur={saveEdit}
                              on:click|stopPropagation
                            />
                          {:else if isNameSaving}
                            <div class="flex items-center gap-1 text-gray-400">
                              <span
                                class="spinner-border spinner-border-sm"
                                style="width:10px;height:10px;border-width:1.5px;"
                              ></span> <span class="truncate">{displayName || "-"}</span>
                            </div>
                          {:else if !displayName && !hasLinkedClient}
                            <div class="flex items-center gap-1 flex-wrap" on:click|stopPropagation>
                              <span
                                class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style="background:#fff3cd;color:#856404;">⚠ No Client</span
                              >
                              <button
                                class="btn btn-xs text-[10px] py-0 px-1.5"
                                style="background:#e8f4fd;color:#0d6efd;border:1px solid #b6d4fe;"
                                on:click={(e) => openLinkClientModal(e, order)}>+ Link</button
                              >
                            </div>
                          {:else}
                            <div class="truncate">
                              {displayName || "-"}
                              {#if nameReadOnly && displayName}<span
                                  title="From linked client — edit via order detail"
                                  class="ms-1 text-blue-400 cursor-default">●</span
                                >{/if}
                            </div>
                          {/if}
                        </td>
                      {:else if col.key === "address"}
                        <!-- Address: primary orderContact.clientContact > orderClients[0]. Read-only if client linked. -->
                        {@const primaryAC =
                          order.orderContacts?.find((oc) => oc.isPrimary) ??
                          order.orderContacts?.[0]}
                        {@const addrFromContact = primaryAC?.clientContact?.address}
                        {@const addrFromLegacy = order.orderClients?.[0]?.address}
                        {@const displayAddr = addrFromContact || addrFromLegacy || ""}
                        {@const addrReadOnly = !!order.client}
                        <td
                          class="px-2 py-2 border text-xs h-[54px] align-middle group cursor-pointer"
                          class:border-blue-400={isAddressEdit}
                          class:border-gray-100={!isAddressEdit}
                          title={isExp && !isAddressEdit ? displayAddr : ""}
                          on:click={(e) => {
                            e.stopPropagation();
                            if (addrReadOnly) {
                              openClientEditModal(order, "address");
                            } else if (!isAddressEdit) {
                              startEdit(e, order.id, "address", addrFromLegacy);
                            }
                          }}
                        >
                          {#if isAddressEdit}
                            <input
                              id="cell-input-{order.id}-address"
                              class="w-full text-xs bg-transparent outline-none border-none p-0"
                              bind:value={editingValue}
                              on:keydown={onCellKeydown}
                              on:blur={saveEdit}
                              on:click|stopPropagation
                            />
                          {:else if isAddressSaving}
                            <div class="flex items-center gap-1 text-gray-400">
                              <span
                                class="spinner-border spinner-border-sm"
                                style="width:10px;height:10px;border-width:1.5px;"
                              ></span> <span class="truncate">{displayAddr || "-"}</span>
                            </div>
                          {:else if isExp}
                            <div class="truncate group-hover:text-blue-600">
                              {displayAddr || "-"}
                              {#if addrReadOnly && displayAddr}<span
                                  title="From linked client — edit via order detail"
                                  class="ms-1 text-blue-400 cursor-default">●</span
                                >{/if}
                            </div>
                          {:else}
                            <div class="truncate text-gray-700">{extractCity(displayAddr)}</div>
                          {/if}
                        </td>
                      {:else if col.key === "chats"}
                        <!-- Chats -->
                        <td
                          class="px-2 py-2 border border-gray-100 text-xs overflow-visible align-middle"
                          class:h-[54px]={!isExp}
                          class:h-auto={isExp}
                          on:click|stopPropagation
                        >
                          {#if !isExp}
                            <div class="relative w-full h-full pr-7">
                              <div
                                class="text-xs cursor-pointer text-gray-600 max-w-full"
                                on:click={() => toggleRow(order.id)}
                              >
                                {#if lastChat}
                                  <div class="flex items-center gap-1 mb-0.5">
                                    {#each normalizeTypes(lastChat.type) as nt}
                                      <span
                                        class="rounded px-1 py-0 text-[9px] font-semibold flex-shrink-0"
                                        style={chatTypeBadgeStyle(nt)}>{nt}</span
                                      >
                                    {/each}
                                    <div class="truncate">
                                      <b>{maskAssignedName(lastChat.user, currentUser) || ""}:</b>
                                      {lastChat.message || ""}
                                    </div>
                                  </div>
                                  <div class="text-[10px] text-gray-400 mt-px whitespace-nowrap">
                                    {formatDateTime(lastChat.createdAt)}
                                  </div>
                                {:else}<span class="text-gray-400 italic text-[11px]">No chats</span
                                  >{/if}
                              </div>

                              <!-- icon-only quick open -->
                              <button
                                type="button"
                                class="btn btn-xs btn-light absolute right-0 top-1/2 -translate-y-1/2"
                                title="Open Chat Sidebar"
                                aria-label="Open Chat Sidebar"
                                style="width:24px;height:24px;border:1px solid #dbeafe;color:#2563eb;display:flex;align-items:center;justify-content:center;"
                                on:click|stopPropagation={() => openChatQuickModal(order)}
                              >
                                <i class="ti ti-circle-plus" style="font-size:10px;"></i>
                              </button>
                            </div>
                          {:else}
                            {@const inlineSelectedTypes = chatTypeInput[order.id] || []}
                            {@const inlineAllSelected =
                              inlineSelectedTypes.length === CHAT_TYPES.length}

                            <div class="flex gap-2 w-full">
                              <div class="flex-1 flex flex-col gap-2">
                                <!-- inline chat list -->
                                <div
                                  id={"chat-scroll-" + order.id}
                                  class="max-h-[140px] overflow-y-auto border border-gray-100 rounded p-1 bg-white text-[11px]"
                                >
                                  {#if chats.length}
                                    {#each chats as c}
                                      <div class="py-1 border-b border-gray-100 last:border-b-0">
                                        <div class="flex items-start justify-between gap-2">
                                          <div class="min-w-0 flex-1">
                                            {#if normalizeTypes(c.type).length}
                                              <div class="flex flex-wrap gap-1 mb-0.5">
                                                {#each normalizeTypes(c.type) as nt}
                                                  <span
                                                    class="rounded px-1 py-0 text-[9px] font-semibold flex-shrink-0"
                                                    style={chatTypeBadgeStyle(nt)}>{nt}</span
                                                  >
                                                {/each}
                                              </div>
                                            {/if}
                                            <div class="break-words">
                                              <b class="text-[11px]"
                                                >{maskAssignedName(c.user, currentUser) || ""}:</b
                                              >
                                              <span class="text-[11px]">{c.message || ""}</span>
                                            </div>
                                          </div>
                                          <div class="text-[10px] text-gray-400 whitespace-nowrap">
                                            {formatDateTime(c.createdAt)}
                                          </div>
                                        </div>
                                      </div>
                                    {/each}
                                  {:else}
                                    <div class="text-gray-400 italic text-[11px]">No chats yet</div>
                                  {/if}
                                </div>

                                <div class="flex gap-2 items-start">
                                  <div class="flex-1">
                                    <!-- inline composer -->
                                    <div class="border border-gray-100 rounded p-1 bg-white">
                                        <div class="flex flex-wrap justify-between gap-1 mb-1">
                                        <div class="flex gap-1 mb-1">
                                          {#each CHAT_TYPES as t}
                                            <button
                                              type="button"
                                              class="btn btn-xs"
                                              style={inlineSelectedTypes.includes(t)
                                                ? "background:#fff4e6;color:#d9480f;border:1px solid #ffb020;"
                                                : "background:#ffffff;color:#6b7280;border:1px solid #dfe5ef;"}
                                              on:click|stopPropagation={() =>
                                                toggleInlineChatType(order.id, t)}
                                            >
                                              {t}
                                            </button>
                                          {/each}
                                          <button
                                            type="button"
                                            class="btn btn-xs"
                                            style={inlineAllSelected
                                              ? "background:#fff4e6;color:#d9480f;border:1px solid #ffb020;"
                                              : "background:#ffffff;color:#6b7280;border:1px solid #dfe5ef;"}
                                            on:click|stopPropagation={() =>
                                              toggleInlineChatAll(order.id)}
                                          >
                                            All
                                          </button>
                                          </div>  
                                          <!-- icon-only open sidebar -->
                                          <div
                                            class="flex flex-col items-end"
                                           
                                          >
                                            <div
                                              type="button"
                                              class="btn btn-xs btn-light"
                                              title="Open Chat Sidebar"
                                              aria-label="Open Chat Sidebar"
                                              style="width:22px;height:22px;border:1px solid #dbeafe;color:#2563eb;display:flex;align-items:center;justify-content:center;"
                                              on:click|stopPropagation={() =>
                                                openChatQuickModal(order)}
                                            >
                                              <i class="ti ti-circle-plus" style="font-size:10px;"></i>
                                            </div>
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-2">
                                          <input
                                            type="text"
                                            class="form-control form-control-sm !text-[11px] flex-1"
                                            placeholder="Message..."
                                            bind:value={chatMsg[order.id]}
                                            on:keydown={(e) => {
                                              if (e.key !== "Enter") return;
                                              e.preventDefault();
                                              sendChat(order.id);
                                            }}
                                          />
                                          <button
                                            type="button"
                                            class="btn btn-danger btn-sm"
                                            on:click|stopPropagation={() => sendChat(order.id)}
                                            disabled={!(chatMsg[order.id] || "").trim() ||
                                              !(chatTypeInput[order.id] || []).length}
                                          >
                                            <i class="ti ti-send"></i>
                                          </button>
                                        </div>
                                      </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          {/if}
                        </td>
                      {:else if col.key === "attach"}
                        <!-- Attachments -->
                        <td
                          class="px-2 py-2 border border-gray-100 text-xs overflow-visible align-middle min-h-[54px] relative top-[2px]"
                          on:click|stopPropagation
                        >
                          {#if !isExp}
                            <div
                              class="text-xs cursor-pointer text-gray-600 max-w-full"
                              on:click={() => toggleRow(order.id)}
                            >
                              {#if lastAttach}
                                {@const pf = previewFile(lastAttach)}
                                {#if pf}
                                  {#if fileIsImage(pf)}
                                    <div class="flex items-center gap-1">
                                      <img
                                        src={fileUrl(pf)}
                                        alt=""
                                        class="h-7 w-7 object-cover rounded border border-gray-200 flex-shrink-0"
                                      />
                                      <div class="min-w-0">
                                        <div class="truncate text-[11px]">{fileName(pf)}</div>
                                        <div class="text-[10px] text-gray-400">
                                          {formatDateTime(lastAttach.createdAt)}
                                        </div>
                                      </div>
                                    </div>
                                  {:else}
                                    <div class="truncate">{fileTypeIcon(pf)} {fileName(pf)}</div>
                                    <div class="text-[10px] text-gray-400 mt-px whitespace-nowrap">
                                      {formatDateTime(lastAttach.createdAt)}
                                    </div>
                                  {/if}
                                {/if}
                              {:else}<span class="text-gray-400 italic text-[11px]"
                                  >No attachments</span
                                >{/if}
                            </div>
                          {:else}
                            <div
                              id="attach-scroll-{order.id}"
                              class="max-h-[110px] overflow-y-auto border border-gray-100 rounded p-1 bg-white text-[11px]"
                            >
                              {#each attachments as a}
                                {@const aImgUrls = (a.files || []).filter(fileIsImage).map(fileUrl)}
                                {#each a.files || [] as f}
                                  {@const fImgIdx = aImgUrls.indexOf(fileUrl(f))}
                                  <div class="py-1 border-b border-gray-100 last:border-b-0">
                                    {#if fileIsImage(f)}
                                      <div class="flex items-center gap-1.5">
                                        <button
                                          class="flex-shrink-0 focus:outline-none"
                                          on:click|stopPropagation={() =>
                                            openLightbox(aImgUrls, fImgIdx)}
                                        >
                                          <img
                                            src={fileUrl(f)}
                                            alt=""
                                            class="h-9 w-9 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
                                          />
                                        </button>
                                        <div class="min-w-0 flex-1">
                                          <div class="truncate text-[11px]">{fileName(f)}</div>
                                          <div class="text-[10px] text-gray-400">
                                            {formatDateTime(a.createdAt)}
                                          </div>
                                          <button
                                            class="text-[10px] text-blue-500 hover:underline"
                                            on:click|stopPropagation={() =>
                                              openLightbox(aImgUrls, fImgIdx)}>View</button
                                          >
                                        </div>
                                      </div>
                                    {:else}
                                      <div class="flex items-center gap-1.5">
                                        <span class="text-base flex-shrink-0"
                                          >{fileTypeIcon(f)}</span
                                        >
                                        <div class="min-w-0 flex-1">
                                          <a
                                            href={fileUrl(f)}
                                            target="_blank"
                                            class="truncate block text-blue-500 hover:underline"
                                            on:click|stopPropagation>{fileName(f)}</a
                                          >
                                          <div class="text-[10px] text-gray-400">
                                            {formatDateTime(a.createdAt)}
                                          </div>
                                        </div>
                                      </div>
                                    {/if}
                                  </div>
                                {/each}
                              {/each}
                              {#if attachments.length === 0}<div
                                  class="text-gray-400 italic text-[11px]"
                                >
                                  No files yet
                                </div>{/if}
                            </div>
                            <label
                              class="btn btn-sm btn-outline-secondary mt-1 cursor-pointer !text-[11px]"
                            >
                              + Upload
                              <input
                                type="file"
                                class="hidden"
                                on:change={(e) => handleFileUpload(order.id, e)}
                                on:click|stopPropagation
                              />
                            </label>
                          {/if}
                        </td>
                      {:else if col.key === "remind"}
                        <!-- Reminders -->
                        <td
                          class="px-2 py-2 border border-gray-100 text-xs overflow-visible align-top h-[54px]"
                          on:click|stopPropagation
                        >
                          {#if !isExp}
                            <div
                              class="text-xs cursor-pointer text-gray-600 max-w-full"
                              on:click={() => toggleRow(order.id)}
                            >
                              {#if lastRemind}
                                <div class="truncate">🔔 {lastRemind.message || ""}</div>
                                <div class="text-[10px] text-gray-400 mt-px whitespace-nowrap">
                                  {formatDateTime(lastRemind.reminderTime || lastRemind.createdAt)}
                                </div>
                              {:else}<span class="text-gray-400 italic text-[11px]"
                                  >No reminders</span
                                >{/if}
                            </div>
                          {:else}
                            <div
                              id="remind-scroll-{order.id}"
                              class="max-h-[90px] overflow-y-auto border border-gray-100 rounded p-1 bg-white text-[11px]"
                            >
                              {#each reminders as r}
                                <div
                                  class="py-0.5 border-b border-gray-100 last:border-b-0 break-words"
                                >
                                  <div>🔔 {r.message || ""}</div>
                                  {#if r.reminderTime}<div
                                      class="text-[10px] text-orange-500 mt-px"
                                    >
                                      🕐 {formatDateTime(r.reminderTime)}
                                    </div>{/if}
                                  <div class="text-[10px] text-gray-400">
                                    {formatDateTime(r.createdAt)}
                                  </div>
                                </div>
                              {/each}
                              {#if reminders.length === 0}<div
                                  class="text-gray-400 italic text-[11px]"
                                >
                                  No reminders yet
                                </div>{/if}
                            </div>
                            <div class="mt-1" on:click|stopPropagation>
                              <input
                                type="datetime-local"
                                class="form-control form-control-sm !text-[11px] mb-1"
                                bind:value={reminderTimeInput[order.id]}
                                on:click|stopPropagation
                              />
                              <div class="flex gap-1">
                                <input
                                  class="form-control form-control-sm !text-[11px]"
                                  placeholder="Message..."
                                  bind:value={reminderInput[order.id]}
                                  on:keydown={(e) => e.key === "Enter" && addReminder(order.id)}
                                  on:click|stopPropagation
                                />
                                <button
                                  class="btn btn-sm btn-warning"
                                  on:click|stopPropagation={() => addReminder(order.id)}>+</button
                                >
                              </div>
                            </div>
                          {/if}
                        </td>
                      {:else if col.key === "status"}
                        <!-- Status -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px]"
                          on:click|stopPropagation
                        >
                          <select
                            class="status-select w-full rounded-full border-0 text-[11px] font-medium px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300"
                            style={statusStyle(order.status)}
                            value={order.status}
                            on:change={(e) => updateStatus(order.id, e.target.value)}
                          >
                            {#each STATUS_OPTIONS as s}
                              <option value={s}>{$statusNamesStore[s]?.name ?? s}</option>
                            {/each}
                          </select>
                        </td>
                      {:else if col.key === "user"}
                        <!-- Sales User -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px] truncate"
                        >
                          {maskAssignedName(
                            order.assignedUsers?.find((u) => u.role === "user"),
                            currentUser,
                          ) || "-"}
                        </td>
                      {:else if col.key === "date"}
                        <!-- Date -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px] truncate"
                          >{formatDate(order.createdAt)}</td
                        >
                      {:else if col.key === "actions"}
                        <!-- PI / WO / TI + Feedback -->
                        <td
                          class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px]"
                          on:click|stopPropagation
                        >
                          {#if order.status === "Deal Won"}
                            {@const pi = order.orderPayments?.[0]}
                            {@const wo = order.workOrders?.[0]}
                            {@const ti = order.invoices?.[0]}
                            <div class="flex gap-1">
                              <button
                                class="btn btn-xs text-[10px] font-semibold {pi
                                  ? 'btn-soft-success'
                                  : 'btn-soft-secondary'}"
                                title={pi
                                  ? `PI: ${pi.financialYear}/${String(pi.invoiceNo).padStart(6, "0")}`
                                  : "Create PI"}
                                on:click|stopPropagation={() => openPIWOTIModal("PI", order)}
                                >PI{pi ? " ✓" : ""}</button
                              >
                              {#if pi}
                                <button
                                  class="btn btn-xs text-[10px] font-semibold {wo
                                    ? 'btn-soft-success'
                                    : 'btn-soft-secondary'}"
                                  title={wo ? `WO: ${wo.workOrderNo}` : "Create WO"}
                                  on:click|stopPropagation={() => openPIWOTIModal("WO", order)}
                                  >WO{wo ? " ✓" : ""}</button
                                >
                              {:else}
                                <span
                                  class="btn btn-xs btn-soft-secondary text-[10px] font-semibold opacity-40"
                                  style="cursor:not-allowed"
                                  title="Create PI first">WO</span
                                >
                              {/if}
                              {#if wo}
                                <button
                                  class="btn btn-xs text-[10px] font-semibold {ti
                                    ? 'btn-soft-success'
                                    : 'btn-soft-secondary'}"
                                  title={ti
                                    ? `TI: ${ti.financialYear}/${String(ti.invoiceNo).padStart(6, "0")}`
                                    : "Create TI"}
                                  on:click|stopPropagation={() => openPIWOTIModal("TI", order)}
                                  >TI{ti ? " ✓" : ""}</button
                                >
                              {:else}
                                <span
                                  class="btn btn-xs btn-soft-secondary text-[10px] font-semibold opacity-40"
                                  style="cursor:not-allowed"
                                  title="Create WO first">TI</span
                                >
                              {/if}
                            </div>
                          {:else}
                            <span class="text-gray-300">—</span>
                          {/if}
                          <button
                            class="btn btn-xs btn-soft-primary mt-1"
                            title="Add Feedback"
                            on:click|stopPropagation={() => openFeedbackModal(order)}
                            ><i class="ti ti-message-star" style="font-size:11px;"></i></button
                          >
                          <button
                            class="btn btn-xs btn-soft-warning mt-1"
                            title="Queries"
                            on:click|stopPropagation={() => openQueriesModal(order)}
                            ><i class="ti ti-help-circle" style="font-size:11px;"></i></button
                          >
                        </td>
                      {/if}
                    {/each}
                  </tr>
                {/each}

                {#if orders.length === 0}
                  <tr>
                    <td colspan={visibleCols.length} class="text-center py-4 text-gray-400"
                      >No orders found</td
                    >
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
          <!-- /overflow-auto -->

          <!-- Pagination inside card footer -->
          <div
            class="card-footer bg-white border-top d-flex align-items-center justify-content-between flex-wrap gap-2 py-2 px-3"
          >
            <div class="d-flex align-items-center gap-2">
              <span class="text-muted" style="font-size:13px;"
                >Page {currentPage} of {totalPages} &nbsp;·&nbsp; {total} records</span
              >
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted" style="font-size:13px;">Rows:</span>
                <select
                  class="form-select form-select-sm"
                  style="width:70px;"
                  bind:value={pageSize}
                  on:change={() => {
                    saveFilterStore();
                    fetchOrders(1);
                  }}
                >
                  {#each PAGE_SIZE_OPTIONS as n}<option value={n}>{n}</option>{/each}
                </select>
              </div>
            </div>
            <div class="d-flex gap-1 flex-wrap">
              <button
                class="btn btn-sm btn-outline-secondary"
                disabled={currentPage === 1}
                on:click={() => fetchOrders(currentPage - 1)}>‹ Prev</button
              >
              {#each pageNumbers as p}
                {#if p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)}
                  <button
                    class="btn btn-sm"
                    class:btn-danger={p === currentPage}
                    class:btn-outline-secondary={p !== currentPage}
                    on:click={() => fetchOrders(p)}>{p}</button
                  >
                {:else if p === currentPage - 3 || p === currentPage + 3}
                  <span class="btn btn-sm btn-outline-secondary disabled">…</span>
                {/if}
              {/each}
              <button
                class="btn btn-sm btn-outline-secondary"
                disabled={currentPage === totalPages}
                on:click={() => fetchOrders(currentPage + 1)}>Next ›</button
              >
            </div>
          </div>
        </div>
        <!-- /card-body -->
      </div>
      <!-- /card -->
    {/if}
  </div>
</div>

<!-- Client Edit Modal -->
{#if clientEditModal}
  <div
    class="modal fade show d-block excel-page"
    tabindex="-1"
    style="background:rgba(0,0,0,0.45);"
    on:click|self={closeClientEditModal}
  >
    <div class="modal-dialog modal-md modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-3">
        <div class="modal-header py-2 px-3 border-bottom">
          <div>
            {#if clientEditModal.isCompany}
              <h6 class="modal-title mb-0">Edit Company Name</h6>
            {:else if clientEditModal.noContact}
              <h6 class="modal-title mb-0">Add Contact</h6>
              <div class="text-muted" style="font-size:11px;">
                Create a new contact for this order
              </div>
            {:else}
              <h6 class="modal-title mb-0">Edit Contact</h6>
              <div class="text-muted" style="font-size:11px;">
                Linked to Client record — changes affect all orders using this contact
              </div>
            {/if}
          </div>
          <button type="button" class="btn-close btn-close-sm" on:click={closeClientEditModal}
          ></button>
        </div>
        <div class="modal-body px-3 py-3">
          {#if clientEditModal.isCompany}
            <!-- Company name single field -->
            <div
              class="alert alert-warning py-2 px-3 mb-3 d-flex align-items-start justify-content-between gap-2"
              style="font-size:12px;"
            >
              <div class="d-flex align-items-start gap-2">
                <i class="ti ti-alert-triangle flex-shrink-0 mt-1"></i>
                <span
                  >This updates the <strong>Client record</strong> and affects all orders linked to this
                  client.</span
                >
              </div>
              <a
                href="/admin/client/{clientEditModal.clientId}"
                class="btn btn-xs btn-outline-secondary flex-shrink-0 d-flex align-items-center gap-1"
                style="font-size:11px;white-space:nowrap;padding:2px 8px;"
                on:click={closeClientEditModal}
              >
                <i class="ti ti-external-link"></i> Full Edit
              </a>
            </div>
            <div class="mb-3">
              <label class="form-label small mb-1">Company / Client Name</label>
              <input
                type="text"
                class="form-control"
                class:is-invalid={!!clientEditError}
                bind:value={clientEditCompanyName}
                placeholder="Client name"
                autofocus
                on:keydown={(e) => {
                  if (e.key === "Enter") saveClientEdit();
                  if (e.key === "Escape") closeClientEditModal();
                }}
              />
              {#if clientEditError}<div class="invalid-feedback d-block" style="font-size:11px;">
                  {clientEditError}
                </div>{/if}
            </div>
          {:else}
            <!-- Full contact form — create or edit -->
            {#if !clientEditModal.noContact}
              <div
                class="alert alert-info py-2 px-3 mb-3 d-flex align-items-start gap-2"
                style="font-size:12px;"
              >
                <i class="ti ti-info-circle flex-shrink-0 mt-1"></i>
                <span>This contact is shared across orders. Saving will update it everywhere.</span>
              </div>
            {/if}

            <div class="row g-2">
              <div class="col-12">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "name"}
                  class:text-primary={clientEditModal.focusField === "name"}
                  >Name <span class="text-danger">*</span></label
                >
                <input
                  type="text"
                  class="form-control"
                  style={clientEditModal.focusField === "name"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  bind:value={clientEditForm.name}
                  placeholder="Contact name"
                  autofocus={clientEditModal.focusField === "name"}
                />
              </div>
              <div class="col-6">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "mobile"}
                  class:text-primary={clientEditModal.focusField === "mobile"}>Mobile</label
                >
                <input
                  type="text"
                  class="form-control"
                  style={clientEditModal.focusField === "mobile"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  bind:value={clientEditForm.mobile}
                  placeholder="Mobile"
                  autofocus={clientEditModal.focusField === "mobile"}
                />
              </div>
              <div class="col-6">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "alternateMobile"}
                  class:text-primary={clientEditModal.focusField === "alternateMobile"}
                  >Alternate Mobile</label
                >
                <input
                  type="text"
                  class="form-control"
                  style={clientEditModal.focusField === "alternateMobile"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  bind:value={clientEditForm.alternateMobile}
                  placeholder="Alternate mobile"
                  autofocus={clientEditModal.focusField === "alternateMobile"}
                />
              </div>
              <div class="col-6">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "whatsapp"}
                  class:text-primary={clientEditModal.focusField === "whatsapp"}>WhatsApp</label
                >
                <input
                  type="text"
                  class="form-control"
                  style={clientEditModal.focusField === "whatsapp"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  bind:value={clientEditForm.whatsapp}
                  placeholder="WhatsApp"
                  autofocus={clientEditModal.focusField === "whatsapp"}
                />
              </div>
              <div class="col-6">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "email"}
                  class:text-primary={clientEditModal.focusField === "email"}>Email</label
                >
                <input
                  type="email"
                  class="form-control"
                  style={clientEditModal.focusField === "email"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  bind:value={clientEditForm.email}
                  placeholder="Email"
                  autofocus={clientEditModal.focusField === "email"}
                />
              </div>
              <div class="col-6">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "designation"}
                  class:text-primary={clientEditModal.focusField === "designation"}
                  >Designation</label
                >
                <input
                  type="text"
                  class="form-control"
                  style={clientEditModal.focusField === "designation"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  bind:value={clientEditForm.designation}
                  placeholder="Designation"
                  autofocus={clientEditModal.focusField === "designation"}
                />
              </div>
              <div class="col-12">
                <label
                  class="form-label small mb-1"
                  class:fw-bold={clientEditModal.focusField === "address"}
                  class:text-primary={clientEditModal.focusField === "address"}>Address</label
                >
                <textarea
                  class="form-control"
                  style={clientEditModal.focusField === "address"
                    ? "border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.15);"
                    : ""}
                  rows="2"
                  bind:value={clientEditForm.address}
                  placeholder="Address"
                ></textarea>
              </div>
            </div>
            {#if clientEditError}
              <div class="text-danger mt-2" style="font-size:12px;">{clientEditError}</div>
            {/if}
          {/if}
        </div>
        <div class="modal-footer py-2 px-3 border-top">
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            on:click={closeClientEditModal}
            disabled={clientEditSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            on:click={saveClientEdit}
            disabled={clientEditSaving}
          >
            {#if clientEditSaving}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            {clientEditModal.noContact ? "Create Contact" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Feedback Modal -->
<OrderFeedbackModal
  show={feedbackModalShow}
  triggerStatus={feedbackTriggerStatus}
  loading={feedbackLoading}
  on:close={() => {
    feedbackModalShow = false;
    feedbackTriggerStatus = null;
  }}
  on:submit={submitFeedback}
/>

<OrderQueriesModal
  bind:open={queriesModalOpen}
  order={queriesModalOrder}
  {currentUser}
  startWithRaise={queriesModalStartRaise}
  on:close={() => {
    queriesModalOpen = false;
    queriesModalStartRaise = false;
  }}
/>

<!-- PI/WO/TI Modal -->
<PIWOTIModal
  bind:open={piwotiModalOpen}
  type={piwotiModalType}
  order={piwotiModalOrder}
  on:close={() => (piwotiModalOpen = false)}
  on:refresh={onPIWOTIRefresh}
/>

<!-- Order Chat Quick Modal -->
<OrderChatQuickModal
  bind:open={chatQuickOpen}
  order={chatQuickOrder}
  {currentUser}
  on:close={closeChatQuickModal}
  on:chatAdded={async (e) => {
    await refreshOrder(e.detail.orderId);
    chatQuickOrder = orders.find((o) => o.id === e.detail.orderId) ?? chatQuickOrder;
  }}
  on:chatDeleted={async (e) => {
    await refreshOrder(e.detail.orderId);
    chatQuickOrder = orders.find((o) => o.id === e.detail.orderId) ?? chatQuickOrder;
  }}
/>

<!-- Add Order Drawer -->
{#if drawerOpen}
  <div class="fixed inset-0 bg-black/30 z-[1040]" on:click={closeDrawer}></div>
{/if}
<div
  class="excel-page fixed top-0 right-0 w-[380px] h-screen bg-white z-[1050] flex flex-col shadow-[-4px_0_16px_rgba(0,0,0,0.12)] transition-transform duration-[250ms] ease-in-out"
  class:translate-x-full={!drawerOpen}
  class:translate-x-0={drawerOpen}
>
  <!-- Drawer Header -->
  <div class="flex items-center justify-between px-4 py-3.5 border-b border-gray-200">
    <h5 class="mb-0 font-semibold">Add Order</h5>
    <button class="btn-close" on:click={closeDrawer}></button>
  </div>

  <!-- Drawer Body -->
  <div class="flex-1 overflow-y-auto p-4">
    <div
      class="text-[11px] font-semibold uppercase text-gray-500 tracking-wide mb-2.5 pb-1 border-b border-gray-100"
    >
      Order Info
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Title <span class="text-danger">*</span></label>
      <input
        class="form-control form-control-sm"
        class:is-invalid={drawerErrors.title}
        bind:value={f_title}
        placeholder="Title"
      />
      {#if drawerErrors.title}<div class="invalid-feedback">{drawerErrors.title}</div>{/if}
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Category</label>
        <select class="form-select form-select-sm" bind:value={f_category}>
          <option value="">— Select —</option>
          {#each categories as grp}
            {#if grp.options}
              <optgroup label={grp.label}>
                {#each grp.options as opt}<option value={opt}>{opt}</option>{/each}
              </optgroup>
            {:else}
              <option value={grp}>{grp}</option>
            {/if}
          {/each}
        </select>
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Source</label>
        <select class="form-select form-select-sm" bind:value={f_source}>
          <option value="">— Select —</option>
          {#each SOURCES as s}<option value={s}>{s}</option>{/each}
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Order Date</label>
        <input type="date" class="form-control form-control-sm" bind:value={f_orderDate} />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Start Date</label>
        <input type="date" class="form-control form-control-sm" bind:value={f_startDate} />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Deadline Date</label>
        <input type="date" class="form-control form-control-sm" bind:value={f_deadlineDate} />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Price Terms</label>
        <input
          class="form-control form-control-sm"
          bind:value={f_priceTerms}
          placeholder="Price Terms"
        />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Price</label>
      <div class="input-group input-group-sm">
        <span class="input-group-text">{CURRENCIES.find((c) => c.code === f_currency)?.symbol}</span
        >
        <input
          type="number"
          class="form-control form-control-sm"
          bind:value={f_price}
          placeholder="0.00"
        />
        <select class="form-select form-select-sm" style="max-width:80px;" bind:value={f_currency}>
          {#each CURRENCIES as c}<option value={c.code}>{c.code}</option>{/each}
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Company</label>
        <input class="form-control form-control-sm" bind:value={f_company} placeholder="Company" />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">GST Number</label>
        <input
          class="form-control form-control-sm"
          bind:value={f_gstNumber}
          placeholder="GST Number"
        />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Description</label>
      <textarea
        class="form-control form-control-sm"
        rows="2"
        bind:value={f_description}
        placeholder="Description"
      ></textarea>
    </div>

    <div
      class="text-[11px] font-semibold uppercase text-gray-500 tracking-wide mb-2.5 pb-1 border-b border-gray-100"
    >
      Client Details
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Name <span class="text-danger">*</span></label>
        <input
          class="form-control form-control-sm"
          class:is-invalid={drawerErrors.name}
          bind:value={f_name}
          placeholder="Name"
        />
        {#if drawerErrors.name}<div class="invalid-feedback">{drawerErrors.name}</div>{/if}
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Designation</label>
        <input
          class="form-control form-control-sm"
          bind:value={f_designation}
          placeholder="Designation"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Mobile</label>
        <input class="form-control form-control-sm" bind:value={f_mobile} placeholder="Mobile" />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Alternate Mobile</label>
        <input
          class="form-control form-control-sm"
          bind:value={f_alternateMobile}
          placeholder="Alternate Mobile"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Email</label>
        <input
          type="email"
          class="form-control form-control-sm"
          bind:value={f_email}
          placeholder="Email"
        />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Whatsapp</label>
        <input
          class="form-control form-control-sm"
          bind:value={f_whatsapp}
          placeholder="Whatsapp"
        />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Address</label>
      <textarea
        class="form-control form-control-sm"
        rows="2"
        bind:value={f_address}
        placeholder="Address"
      ></textarea>
    </div>
  </div>

  <!-- Drawer Footer -->
  <div class="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
    <button class="btn btn-sm btn-secondary" on:click={closeDrawer}>Cancel</button>
    <button class="btn btn-sm btn-primary" on:click={submitOrder} disabled={drawerLoading}>
      {#if drawerLoading}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      Save Order
    </button>
  </div>
</div>

<LightBox bind:data={lightboxImages} startIndex={lightboxStart} />

<!-- Link Client Modal -->
{#if showLinkClientModal}
  <div class="excel-page fixed inset-0 bg-black/40 z-[1060] flex items-center justify-center">
    <div
      class="bg-white rounded-xl shadow-xl z-[1061] w-full max-w-md mx-3 overflow-hidden"
      on:click|stopPropagation
    >
      <div class="d-flex align-items-center justify-content-between px-4 py-3 border-bottom">
        <h6 class="mb-0 fw-semibold">
          {#if linkedClient}
            {linkedClientContacts.length > 0 ? "Select Contact" : "Add Contact"}
            <span class="text-muted fw-normal" style="font-size:12px;"> — {linkedClient.name}</span>
          {:else}
            Link Client to Order
          {/if}
        </h6>
        <button class="btn-close" on:click={closeLinkClientModal}></button>
      </div>
      <div class="p-4">
        {#if linkedClient}
          <!-- MODE 2 & 3: Client already linked -->
          {#if linkedClientContacts.length > 0 && !showAddContactForm}
            <!-- MODE 2: Has contacts — pick one -->
            <div class="mb-3">
              <div class="text-muted mb-2" style="font-size:12px;">
                Select a contact to use for this order:
              </div>
              <div class="border rounded" style="max-height:220px;overflow-y:auto;">
                {#each linkedClientContacts as contact}
                  <button
                    type="button"
                    class="d-block w-100 text-start px-3 py-2"
                    style="background:{selectedContactId === contact.id
                      ? '#e8f4fd'
                      : 'white'};border:none;border-bottom:1px solid #f0f0f0;"
                    on:click={() => (selectedContactId = contact.id)}
                  >
                    <div class="fw-semibold" style="font-size:13px;">{contact.name}</div>
                    {#if contact.mobile}<div class="text-muted" style="font-size:11px;">
                        📞 {contact.mobile}
                      </div>{/if}
                    {#if contact.email}<div class="text-muted" style="font-size:11px;">
                        ✉ {contact.email}
                      </div>{/if}
                  </button>
                {/each}
              </div>
              <button
                class="btn btn-link btn-sm p-0 mt-2"
                style="font-size:12px;"
                on:click={() => (showAddContactForm = true)}
              >
                <i class="ti ti-plus me-1"></i>Add new contact instead
              </button>
            </div>
          {:else}
            <!-- MODE 3: No contacts or adding new contact -->
            <div class="rounded p-3 mb-3" style="background:#f8f9fa;border:1px solid #e9ecef;">
              <div class="fw-semibold mb-3" style="font-size:13px;color:#185FA5;">
                <i class="ti ti-user-plus me-1"></i>New Contact for {linkedClient.name}
              </div>
              <div class="mb-2">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;"
                  >Name <span class="text-danger">*</span></label
                >
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Contact name"
                  bind:value={newContactForm.name}
                  autofocus
                />
              </div>
              <div class="mb-2">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;">Mobile</label
                >
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Mobile number"
                  bind:value={newContactForm.mobile}
                />
              </div>
              <div class="mb-1">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;">Email</label>
                <input
                  type="email"
                  class="form-control form-control-sm"
                  placeholder="Email address"
                  bind:value={newContactForm.email}
                />
              </div>
            </div>
            {#if linkedClientContacts.length > 0}
              <button
                class="btn btn-link btn-sm p-0 text-muted"
                style="font-size:12px;"
                on:click={() => (showAddContactForm = false)}
              >
                ← Back to contacts
              </button>
            {/if}
          {/if}
        {:else}
          <!-- MODE 1: No client linked — search / create -->
          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="form-label fw-semibold mb-0" style="font-size:13px;">Search Client</label>
            {#if !showCreateClientForm}
              <button
                class="btn btn-sm btn-outline-primary"
                style="font-size:12px;"
                on:click={() => {
                  showCreateClientForm = true;
                  newClientForm.name = linkClientSearch;
                }}
              >
                <i class="ti ti-plus me-1"></i>New Client
              </button>
            {/if}
          </div>

          {#if legacyContacts.length > 0}
            <div class="rounded p-3 mb-3" style="background:#fffbea;border:1px solid #fde68a;">
              <div class="fw-semibold mb-2" style="font-size:12px;color:#92400e;">
                <i class="ti ti-users me-1"></i>Existing contacts — will be migrated on link:
              </div>
              {#each legacyContacts as oc}
                <label
                  class="d-flex align-items-center gap-2 mb-1 cursor-pointer"
                  style="font-size:12px;"
                >
                  <input
                    type="checkbox"
                    checked={legacyChecked.includes(oc.id)}
                    on:change={() => {
                      if (legacyChecked.includes(oc.id))
                        legacyChecked = legacyChecked.filter((id) => id !== oc.id);
                      else legacyChecked = [...legacyChecked, oc.id];
                    }}
                  />
                  <span class="fw-semibold">{oc.name}</span>
                  {#if oc.mobile}<span class="text-muted">· {oc.mobile}</span>{/if}
                </label>
              {/each}
            </div>
          {/if}

          <div class="position-relative mb-3">
            <input
              type="text"
              class="form-control"
              placeholder="Type client name..."
              value={linkClientSearch}
              on:input={onLinkClientSearchInput}
              autofocus
            />
            {#if linkClientSearching}
              <div class="position-absolute top-50 end-0 translate-middle-y pe-3">
                <span class="spinner-border spinner-border-sm text-muted"></span>
              </div>
            {/if}
          </div>

          {#if !showCreateClientForm}
            {#if linkClientResults.length > 0}
              <div class="border rounded mb-3" style="max-height:200px;overflow-y:auto;">
                {#each linkClientResults as client}
                  <button
                    type="button"
                    class="d-block w-100 text-start px-3 py-2"
                    style="background:{linkClientSelected?.id === client.id
                      ? '#e8f4fd'
                      : 'white'};border:none;border-bottom:1px solid #f0f0f0;"
                    on:click={() => {
                      linkClientSelected = client;
                      linkClientSearch = client.name;
                      linkClientResults = [];
                    }}
                  >
                    <div class="fw-semibold" style="font-size:13px;">{client.name}</div>
                    {#if client.contacts?.length}
                      <div class="text-muted" style="font-size:11px;">
                        {client.contacts.map((c) => c.name).join(", ")}
                      </div>
                    {/if}
                    {#if client.address}
                      <div class="text-muted" style="font-size:11px;">{client.address}</div>
                    {/if}
                  </button>
                {/each}
              </div>
            {:else if linkClientSearch.length > 0 && !linkClientSearching}
              <div class="text-center py-3">
                <div class="text-muted" style="font-size:13px;">
                  No clients found for "<strong>{linkClientSearch}</strong>"
                </div>
              </div>
            {/if}
            {#if linkClientSelected}
              <div class="rounded p-3 mb-3" style="background:#f0fdf4;border:1px solid #bbf7d0;">
                <div class="fw-semibold text-success" style="font-size:13px;">
                  ✓ Selected: {linkClientSelected.name}
                </div>
                {#if linkClientSelected.contacts?.[0]}
                  <div class="text-muted mt-1" style="font-size:12px;">
                    Contact: {linkClientSelected.contacts[0].name}
                    {#if linkClientSelected.contacts[0].mobile}
                      · {linkClientSelected.contacts[0].mobile}{/if}
                  </div>
                {/if}
              </div>
            {/if}
          {:else}
            <!-- Inline Create Client Form -->
            <div class="rounded p-3 mb-2" style="background:#f8f9fa;border:1px solid #e9ecef;">
              <div class="fw-semibold mb-3" style="font-size:13px;color:#185FA5;">
                <i class="ti ti-user-plus me-1"></i>Create New Client
              </div>
              <div class="mb-2">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;"
                  >Name <span class="text-danger">*</span></label
                >
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Client / Company name"
                  bind:value={newClientForm.name}
                />
              </div>
              <div class="mb-2">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;">Mobile</label
                >
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Mobile number"
                  bind:value={newClientForm.mobile}
                />
              </div>
              <div class="mb-2">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;">Email</label>
                <input
                  type="email"
                  class="form-control form-control-sm"
                  placeholder="Email address"
                  bind:value={newClientForm.email}
                />
              </div>
              <div class="mb-1">
                <label class="form-label mb-1" style="font-size:12px;font-weight:600;"
                  >Address</label
                >
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Address / City"
                  bind:value={newClientForm.address}
                />
              </div>
            </div>
            <button
              class="btn btn-link btn-sm p-0 text-muted"
              style="font-size:12px;"
              on:click={() => (showCreateClientForm = false)}
            >
              ← Back to search
            </button>
          {/if}
        {/if}
      </div>
      <div class="d-flex justify-content-end gap-2 px-4 py-3 border-top">
        <button class="btn btn-secondary btn-sm" on:click={closeLinkClientModal}>Cancel</button>
        <button
          class="btn btn-primary btn-sm"
          disabled={linkingClient ||
            (linkedClient
              ? showAddContactForm || linkedClientContacts.length === 0
                ? !newContactForm.name.trim()
                : !selectedContactId
              : showCreateClientForm
                ? !newClientForm.name.trim()
                : !linkClientSelected)}
          on:click={confirmLinkClient}
        >
          {#if linkingClient}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
          {linkedClient
            ? showAddContactForm || linkedClientContacts.length === 0
              ? "Add & Link"
              : "Use Contact"
            : showCreateClientForm
              ? "Create & Link"
              : "Link Client"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* parent-hover → child filter: can't be done in Tailwind */
  .excel-row:hover td {
    filter: brightness(0.96);
  }

  /* Highlight row when its chat sidebar/modal is open */
  .excel-row--chat-active td {
    background: #eff6ff !important;
    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.55);
  }

  /* sticky columns — needs !important to override table stacking context */
  .sticky-th-sno {
    position: sticky !important;
    left: 0;
    z-index: 13 !important;
  }
  .sticky-th-pid {
    position: sticky !important;
    z-index: 13 !important;
  }
  .sticky-td-sno {
    position: sticky !important;
    left: 0;
    z-index: 11 !important;
  }
  .sticky-td-pid {
    position: sticky !important;
    z-index: 11 !important;
  }

  /* resize handle hover — pseudo-class on a dynamic element */
  .resize-handle:hover {
    border-right-color: #0d6efd;
  }

  /* status badge-select — remove browser default appearance */
  .status-select {
    appearance: none;
    -webkit-appearance: none;
    text-align: center;
  }

  /* ── Typography: Cursor-like clean / clear / small (12px base) ── */
  :global(.excel-page) {
    font-size: var(--app-font-size, 0.75rem);
    line-height: var(--app-line-height, 1.45);
  }

  :global(.excel-page),
  :global(.excel-page .content),
  :global(.excel-page .card-body),
  :global(.excel-page .breadcrumb),
  :global(.excel-page table),
  :global(.excel-page th),
  :global(.excel-page td),
  :global(.excel-page label),
  :global(.excel-page .form-label),
  :global(.excel-page .form-control),
  :global(.excel-page .form-select),
  :global(.excel-page .form-control-sm),
  :global(.excel-page .form-select-sm),
  :global(.excel-page .btn),
  :global(.excel-page .btn-sm),
  :global(.excel-page .btn-xs),
  :global(.excel-page .input-group-text),
  :global(.excel-page .dropdown-item),
  :global(.excel-page .modal-body),
  :global(.excel-page .modal-footer),
  :global(.excel-page .alert),
  :global(.excel-page .invalid-feedback),
  :global(.excel-page input),
  :global(.excel-page select),
  :global(.excel-page textarea),
  :global(.excel-page .status-select) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  /* Normalize Tailwind arbitrary / utility sizes that were too tiny */
  :global(.excel-page .text-\[9px\]),
  :global(.excel-page .text-\[10px\]),
  :global(.excel-page .text-\[11px\]),
  :global(.excel-page .\!text-\[11px\]),
  :global(.excel-page .text-xs),
  :global(.excel-page .\!text-xs),
  :global(.excel-page .text-sm) {
    font-size: var(--app-font-size, 0.75rem) !important;
  }

  :global(.excel-page .excel-meta),
  :global(.excel-page .text-muted),
  :global(.excel-page .text-gray-400),
  :global(.excel-page .text-gray-500),
  :global(.excel-page small),
  :global(.excel-page .badge) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  /* Table headers — same clear 12px as body (not muted meta size) */
  :global(.excel-page thead th),
  :global(.excel-page thead th *),
  :global(.excel-page .excel-th) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: 1.35 !important;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  :global(.excel-page h4) {
    font-size: var(--app-font-size-xl, 1rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  :global(.excel-page h5),
  :global(.excel-page h6),
  :global(.excel-page .modal-title) {
    font-size: var(--app-font-size-lg, 0.875rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }
</style>
