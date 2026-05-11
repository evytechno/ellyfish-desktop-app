<script>
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import Loader from "$lib/components/Loader.svelte";
  import LightBox from "$lib/components/LightBox.svelte";
  import { categoriesAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { checkAuth } from "$lib/utils/auth";

  // ── auth ─────────────────────────────────────────────────
  const currentUser = checkAuth();
  const isMaster = currentUser?.role === "master";

  // ── data ────────────────────────────────────────────────
  let orders = [];
  let totalPages = 1;
  let total = 0;
  let loadingData = true;
  let searchTerm = "";
  let orderBy = "createdAt";
  let filterStatus = "";
  let filterDateRange = "7d";
  let pageSize = 10;

  const ORDER_BY_OPTIONS = [
    { value: "createdAt", label: "Date Created" },
    { value: "updatedAt", label: "Date Updated" },
    { value: "title",     label: "Title" },
    { value: "status",    label: "Status" },
    { value: "pId",       label: "pId" },
  ];

  const DATE_RANGE_OPTIONS = [
    { value: "all",  label: "All Time" },
    { value: "7d",   label: "Last 7 Days" },
    { value: "30d",  label: "Last 30 Days" },
    { value: "3m",   label: "Last 3 Months" },
    { value: "fy",   label: "This Financial Year" },
  ];

  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  const STATUS_COLORS = {
    "New Lead":                 { bg: "#cff4fc", color: "#055160" },
    "Contacted":                { bg: "#dbeafe", color: "#1d4ed8" },
    "Follow Up":                { bg: "#ede9fe", color: "#6d28d9" },
    "Qualified":                { bg: "#dcfce7", color: "#15803d" },
    "Unqualified":              { bg: "#f3f4f6", color: "#6b7280" },
    "Needs Assessment":         { bg: "#ffedd5", color: "#c2410c" },
    "Quotation Sent":           { bg: "#faf5ff", color: "#7e22ce" },
    "Negotiation In Progress":  { bg: "#fefce8", color: "#a16207" },
    "Deal Won":                 { bg: "#d1fae5", color: "#047857" },
    "Deal Lost":                { bg: "#fee2e2", color: "#b91c1c" },
  };

  function statusStyle(s) {
    const c = STATUS_COLORS[s] || { bg: "#f3f4f6", color: "#374151" };
    return `background:${c.bg};color:${c.color};`;
  }

  function getDateRangeParams(range) {
    if (range === "all") return {};
    const now = new Date();
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    if (range === "7d")  start.setDate(start.getDate() - 6);
    else if (range === "30d") start.setDate(start.getDate() - 29);
    else if (range === "3m")  start.setMonth(start.getMonth() - 3);
    else if (range === "fy")  {
      const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      start.setFullYear(yr, 3, 1);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  let currentPage = 1;

  // ── inline expand ────────────────────────────────────────
  let expandedRow = null;
  let chatMsg = {}, reminderInput = {}, reminderTimeInput = {};

  // ── inline edit ──────────────────────────────────────────
  let editingCell  = null; // { orderId, field }
  let editingValue = "";
  let editingSaving = false;

  // Fields that belong to orderClients[0]; all others are on the order itself
  const CLIENT_FIELDS = { mobile: true, email: true, address: true };

  async function startEdit(e, orderId, field, currentValue) {
    e.stopPropagation();
    editingCell  = { orderId, field };
    editingValue = currentValue || "";
    await tick();
    const el = document.getElementById(`cell-input-${orderId}-${field}`);
    if (el) { el.focus(); el.select(); }
  }

  function cancelEdit() {
    editingCell  = null;
    editingValue = "";
  }

  async function saveEdit() {
    if (!editingCell || editingSaving) return;
    const { orderId, field } = editingCell;
    const order = orders.find(o => o.id === orderId);
    if (!order) { cancelEdit(); return; }

    // Skip if unchanged
    const isClientField = CLIENT_FIELDS[field];
    const oldVal = isClientField
      ? (order.orderClients?.[0]?.[field] || "")
      : (order[field] || "");
    if (editingValue.trim() === oldVal.trim()) { cancelEdit(); return; }

    // Capture value before cancelEdit() wipes it
    const savedValue = editingValue.trim();

    // Optimistic update — show new value immediately
    if (isClientField) {
      orders = orders.map(o => {
        if (o.id !== orderId) return o;
        const clients = (o.orderClients || []).map((c, idx) =>
          idx === 0 ? { ...c, [field]: savedValue } : c
        );
        return { ...o, orderClients: clients };
      });
    } else {
      orders = orders.map(o => o.id === orderId ? { ...o, [field]: savedValue } : o);
    }

    cancelEdit();
    editingSaving = true;
    try {
      if (isClientField) {
        const clientId = order.orderClients?.[0]?.id;
        if (clientId) {
          await authApiFetch(`${API_ROUTES.ORDER_CLIENT}/${clientId}`, {
            method: "PUT",
            data: JSON.stringify({ [field]: savedValue }),
          });
        }
      } else {
        await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`, {
          method: "PUT",
          data: JSON.stringify({
            [field]: savedValue,
            orderActivity: { title: "Order Updated", description: `${field} updated via excel view.` },
          }),
        });
      }
      await refreshOrder(orderId);
    } catch (e) {
      // Revert optimistic update on failure
      await refreshOrder(orderId);
      console.error(e);
    }
    finally { editingSaving = false; }
  }

  function onCellKeydown(e) {
    if (e.key === "Enter")  { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
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

  const CURRENCIES = [{ code: "INR", symbol: "₹" }, { code: "USD", symbol: "$" }];
  const SOURCES = ["Whatsapp", "Website", "Mail"];

  // ── lightbox ─────────────────────────────────────────────
  let lightboxImages = [];

  function openLightbox(url) {
    lightboxImages = [url];
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
    return ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext);
  }

  function fileTypeIcon(f) {
    const mime = f?.mimeType || "";
    if (mime === "application/pdf")                                          return "📕";
    if (mime.includes("spreadsheet") || mime.includes("excel"))             return "📊";
    if (mime.includes("word") || mime.includes("document"))                 return "📝";
    if (mime.includes("zip") || mime.includes("rar"))                       return "🗜️";
    const ext = (f?.originalName || "").split(".").pop()?.toLowerCase();
    if (ext === "pdf")                       return "📕";
    if (["xls","xlsx","csv"].includes(ext))  return "📊";
    if (["doc","docx"].includes(ext))        return "📝";
    if (["zip","rar","7z"].includes(ext))    return "🗜️";
    return "📄";
  }

  // returns the first file of an attachment for preview use
  function previewFile(a) { return a?.files?.[0] ?? null; }

  let categories = [];

  onMount(() => {
    const cached = get(categoriesAllStore);
    categories = (cached && cached.length > 0) ? cached : [];
  });

  function openDrawer() {
    f_title = ""; f_category = ""; f_orderDate = null; f_startDate = null;
    f_deadlineDate = null; f_price = null; f_currency = "INR"; f_priceTerms = "";
    f_source = ""; f_company = ""; f_gstNumber = ""; f_description = "";
    f_name = ""; f_designation = ""; f_email = ""; f_mobile = "";
    f_alternateMobile = ""; f_whatsapp = ""; f_address = "";
    drawerErrors = {};
    drawerOpen = true;
  }
  function closeDrawer() { drawerOpen = false; }

  async function submitOrder() {
    drawerErrors = {};
    if (!f_title.trim()) { drawerErrors.title = "Title is required."; return; }
    if (!f_name.trim())  { drawerErrors.name  = "Name is required."; return; }
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
        ...(f_orderDate    && { orderDate: f_orderDate }),
        ...(f_startDate    && { startDate: f_startDate }),
        ...(f_deadlineDate && { deadlineDate: f_deadlineDate }),
        ...(f_price        && { price: Number(f_price) }),
        orderClients: [{
          name: f_name.trim(), designation: f_designation, email: f_email,
          mobile: f_mobile, alternateMobile: f_alternateMobile,
          whatsapp: f_whatsapp, address: f_address,
        }],
        orderActivity: { title: "Order Created", description: "A new order has been created." },
      };
      await authApiFetch(API_ROUTES.ORDER, { method: "POST", data: JSON.stringify(payload) });
      closeDrawer();
      await fetchOrders(1);
    } catch (e) { console.error(e); }
    finally { drawerLoading = false; }
  }

  // ── column resize ────────────────────────────────────────
  const ALL_COLS = [
    { key: "sno",     label: "#",           width: 50,  minWidth: 40 },
    { key: "pId",     label: "Order No.",         width: 80,  minWidth: 60 },
    { key: "title",   label: "Title",       width: 160, minWidth: 80 },
    { key: "company", label: "Company",     width: 100, minWidth: 80 },
    { key: "mobile",  label: "Mobile",      width: 100, minWidth: 80 },
    { key: "email",   label: "Email",       width: 100, minWidth: 80 },
    { key: "address", label: "Address",     width: 100, minWidth: 80 },
    { key: "chats",   label: "Chats",       width: 220, minWidth: 160 },
    { key: "attach",  label: "Attachments", width: 200, minWidth: 140 },
    { key: "remind",  label: "Reminders",   width: 200, minWidth: 140 },
    { key: "status",  label: "Status",      width: 140, minWidth: 100 },
    { key: "user",    label: "Sales User",  width: 110, minWidth: 80,  masterOnly: true },
    { key: "date",    label: "Date",        width: 110, minWidth: 80 },
  ];
  const DEFAULT_COLS = ALL_COLS.filter(c => !c.masterOnly || isMaster);
  let cols = DEFAULT_COLS.map(c => ({ ...c }));
  let resizing = null;

  function startResize(e, idx) {
    e.preventDefault();
    resizing = { colIdx: idx, startX: e.clientX, startWidth: cols[idx].width };
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
  }
  function resetColWidths() { cols = DEFAULT_COLS.map(c => ({ ...c })); }

  // ── lifecycle ────────────────────────────────────────────
  onMount(() => { fetchOrders(); });

  // ── API ──────────────────────────────────────────────────
  async function fetchOrders(page = 1) {
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
        ...(filterStatus && { status: filterStatus }),
        ...dateParams,
      });
      const res = await authApiFetch(`${API_ROUTES.ORDER}?${q}`, { method: "GET" });
      orders = res.data || res;
      total = res.total || orders.length;
      totalPages = res.totalPages || 1;
    } catch (e) { console.error(e); }
    finally { loadingData = false; }
  }

  async function refreshOrder(orderId) {
    try {
      const res = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`, { method: "GET" });
      orders = orders.map(o => o.id === orderId ? res : o);
    } catch (e) { console.error(e); }
  }

  async function toggleRow(orderId) {
    expandedRow = expandedRow === orderId ? null : orderId;
    if (expandedRow) {
      await tick();
      for (const id of [`chat-scroll-${orderId}`, `attach-scroll-${orderId}`, `remind-scroll-${orderId}`]) {
        const el = document.getElementById(id);
        if (el) el.scrollTop = el.scrollHeight;
      }
    }
  }

  async function sendChat(orderId) {
    const msg = (chatMsg[orderId] || "").trim();
    if (!msg) return;
    try {
      await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify({ orderId, message: msg, type: "" }),
      });
      chatMsg[orderId] = "";
      await refreshOrder(orderId);
      await tick();
      const el = document.getElementById(`chat-scroll-${orderId}`);
      if (el) el.scrollTop = el.scrollHeight;
    } catch (e) { console.error(e); }
  }

  async function addReminder(orderId) {
    const msg  = (reminderInput[orderId] || "").trim();
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
    } catch (e) { console.error(e); }
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
    } catch (err) { console.error(err); }
    finally { e.target.value = ""; }
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
      orders = orders.map(o => o.id === orderId ? { ...o, status } : o);
    } catch (e) { console.error(e); }
  }

  function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateTime(d) {
    if (!d) return "";
    let s = String(d);
    // If no timezone info, treat as UTC (API stores UTC but may omit Z)
    if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
    return new Date(s).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  const STATUS_OPTIONS = [
    "New Lead", "Contacted", "Follow Up", "Qualified", "Unqualified",
    "Needs Assessment", "Quotation Sent", "Negotiation In Progress",
    "Deal Won", "Deal Lost",
  ];

  $: pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  $: snoWidth = cols[0]?.width ?? 50;
  $: dateRangeLabel = DATE_RANGE_OPTIONS.find(d => d.value === filterDateRange)?.label || "All Time";
</script>

<div class="page-wrapper">
  <div class="content container-fluid">

    <!-- Page Header -->
    <div class="page-header mb-3">
      <div class="row align-items-center">
        <div class="col">
          <h4 class="mb-1">Orders Excel View
            <span class="text-xs font-normal text-muted">({dateRangeLabel})</span>
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
          on:keydown={(e) => e.key === "Enter" && fetchOrders(1)}
        />
      </div>
      <!-- Date Range -->
      <select class="form-select" style="width:155px;" bind:value={filterDateRange} on:change={() => fetchOrders(1)}>
        {#each DATE_RANGE_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
      <!-- Status filter -->
      <select class="form-select" style="width:155px;" bind:value={filterStatus} on:change={() => fetchOrders(1)}>
        <option value="">Select Status</option>
        {#each STATUS_OPTIONS as s}<option value={s}>{s}</option>{/each}
      </select>
      <!-- Sort -->
      <select class="form-select" style="width:155px;" bind:value={orderBy} on:change={() => fetchOrders(1)}>
        {#each ORDER_BY_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
      <!-- Reset columns -->
      <button class="btn btn-outline-light shadow" on:click={resetColWidths} title="Reset column widths">
        <i class="ti ti-layout-columns me-1"></i>Reset Columns
      </button>
    </div>

    {#if loadingData}
      <Loader />
    {:else}

      <!-- Card wrapping table + pagination -->
      <div class="card mb-0">
        <div class="card-body p-0">

      <!-- Grid -->
      <div class="overflow-auto rounded-top" style="max-height:calc(100vh - 230px);">
        <table class="border-collapse text-xs" style="table-layout:fixed; width:{cols.reduce((s,c)=>s+c.width,0)}px;">
          <colgroup>
            {#each cols as col}
              <col style="width:{col.width}px; min-width:{col.minWidth}px;" />
            {/each}
          </colgroup>

          <thead>
            <tr>
              {#each cols as col, i}
                <th
                  class="p-0 border border-gray-200 bg-gray-100 sticky top-0 z-10 whitespace-nowrap text-xs font-semibold select-none"
                  class:sticky-th-sno={col.key === 'sno'}
                  class:sticky-th-pid={col.key === 'pId'}
                  style={col.key === 'pId' ? `left:${snoWidth}px;` : ''}
                >
                  <div class="flex items-center justify-between px-2 py-1.5 gap-1">
                    <span class="uppercase tracking-wide text-[10px] font-semibold text-gray-500">{col.label}</span>
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
              {@const chats      = order.orderChats      || []}
              {@const attachments= order.orderAttachments|| []}
              {@const reminders  = order.orderReminders  || []}
              {@const lastChat   = chats[chats.length - 1]}
              {@const lastAttach = attachments[attachments.length - 1]}
              {@const lastRemind = reminders[reminders.length - 1]}
              {@const isExp          = expandedRow === order.id}
              {@const rowBg          = isExp ? "#fffbea" : i % 2 === 0 ? "#fff" : "#f9f9f9"}
              {@const isTitleEdit    = editingCell?.orderId === order.id && editingCell?.field === "title"}
              {@const isCompanyEdit  = editingCell?.orderId === order.id && editingCell?.field === "company"}
              {@const isMobileEdit   = editingCell?.orderId === order.id && editingCell?.field === "mobile"}
              {@const isEmailEdit    = editingCell?.orderId === order.id && editingCell?.field === "email"}
              {@const isAddressEdit  = editingCell?.orderId === order.id && editingCell?.field === "address"}

              <tr class="excel-row cursor-pointer" style="background:{rowBg};" on:click={() => toggleRow(order.id)}>

                <!-- S.No -->
                <td class="px-2 py-2 border border-gray-100 align-middle text-xs overflow-hidden h-[54px] text-center sticky-td-sno" style="background:{rowBg};">
                  {(currentPage - 1) * pageSize + i + 1}
                </td>

                <!-- pId -->
                <td class="px-2 py-2 border border-gray-100 align-middle text-xs overflow-hidden h-[54px] sticky-td-pid" style="background:{rowBg}; left:{snoWidth}px;" on:click|stopPropagation>
                  <a
                    href="/admin/order/{order.id}"
                    class="text-blue-600 no-underline font-semibold text-xs hover:underline"
                    on:click|preventDefault={() => goto(`/admin/order/${order.id}`)}
                  >#{order.pId || order.id}</a>
                  {#if order.workOrderNumber}
                    <div class="mt-0.5 text-[10px] text-gray-500 truncate">{order.workOrderNumber}</div>
                  {/if}
                </td>

                <!-- Title -->
                <td
                  class="px-2 py-2 border text-xs overflow-hidden h-[54px] align-middle cursor-text group"
                  class:border-blue-400={isTitleEdit}
                  class:border-gray-100={!isTitleEdit}
                  title={isTitleEdit ? "" : (order.title || "")}
                  on:click={(e) => !isTitleEdit && startEdit(e, order.id, "title", order.title)}
                  on:click|stopPropagation
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
                  {:else}
                    <div class="line-clamp-2 break-words leading-normal group-hover:text-blue-600">{order.title || "-"}</div>
                  {/if}
                </td>

                <!-- Company -->
                <td
                  class="px-2 py-2 border text-xs h-[54px] align-middle cursor-text group"
                  class:border-blue-400={isCompanyEdit}
                  class:border-gray-100={!isCompanyEdit}
                  on:click={(e) => !isCompanyEdit && startEdit(e, order.id, "company", order.company)}
                  on:click|stopPropagation
                >
                  {#if isCompanyEdit}
                    <input id="cell-input-{order.id}-company" class="w-full text-xs bg-transparent outline-none border-none p-0" bind:value={editingValue} on:keydown={onCellKeydown} on:blur={saveEdit} on:click|stopPropagation />
                  {:else}
                    <div class="truncate group-hover:text-blue-600">{order.company || "-"}</div>
                  {/if}
                </td>

                <!-- Mobile -->
                <td
                  class="px-2 py-2 border text-xs h-[54px] align-middle cursor-text group"
                  class:border-blue-400={isMobileEdit}
                  class:border-gray-100={!isMobileEdit}
                  on:click={(e) => !isMobileEdit && startEdit(e, order.id, "mobile", order.orderClients?.[0]?.mobile)}
                  on:click|stopPropagation
                >
                  {#if isMobileEdit}
                    <input id="cell-input-{order.id}-mobile" class="w-full text-xs bg-transparent outline-none border-none p-0" bind:value={editingValue} on:keydown={onCellKeydown} on:blur={saveEdit} on:click|stopPropagation />
                  {:else}
                    <div class="truncate group-hover:text-blue-600">{order.orderClients?.[0]?.mobile || "-"}</div>
                  {/if}
                </td>

                <!-- Email -->
                <td
                  class="px-2 py-2 border text-xs h-[54px] align-middle cursor-text group"
                  class:border-blue-400={isEmailEdit}
                  class:border-gray-100={!isEmailEdit}
                  on:click={(e) => !isEmailEdit && startEdit(e, order.id, "email", order.orderClients?.[0]?.email)}
                  on:click|stopPropagation
                >
                  {#if isEmailEdit}
                    <input id="cell-input-{order.id}-email" class="w-full text-xs bg-transparent outline-none border-none p-0" bind:value={editingValue} on:keydown={onCellKeydown} on:blur={saveEdit} on:click|stopPropagation />
                  {:else}
                    <div class="truncate group-hover:text-blue-600">{order.orderClients?.[0]?.email || "-"}</div>
                  {/if}
                </td>

                <!-- Address -->
                <td
                  class="px-2 py-2 border text-xs h-[54px] align-middle cursor-text group"
                  class:border-blue-400={isAddressEdit}
                  class:border-gray-100={!isAddressEdit}
                  title={isAddressEdit ? "" : (order.orderClients?.[0]?.address || "")}
                  on:click={(e) => !isAddressEdit && startEdit(e, order.id, "address", order.orderClients?.[0]?.address)}
                  on:click|stopPropagation
                >
                  {#if isAddressEdit}
                    <input id="cell-input-{order.id}-address" class="w-full text-xs bg-transparent outline-none border-none p-0" bind:value={editingValue} on:keydown={onCellKeydown} on:blur={saveEdit} on:click|stopPropagation />
                  {:else}
                    <div class="truncate group-hover:text-blue-600">{order.orderClients?.[0]?.address || "-"}</div>
                  {/if}
                </td>

                <!-- Chats -->
                <td class="px-2 py-2 border border-gray-100 text-xs overflow-visible align-top h-[54px]" on:click|stopPropagation>
                  {#if !isExp}
                    <div class="text-xs cursor-pointer text-gray-600 max-w-full" on:click={() => toggleRow(order.id)}>
                      {#if lastChat}
                        <div class="truncate"><b>{lastChat.user?.name || ""}:</b> {lastChat.message || ""}</div>
                        <div class="text-[10px] text-gray-400 mt-px whitespace-nowrap">{formatDateTime(lastChat.createdAt)}</div>
                      {:else}
                        <span class="text-gray-400 italic text-[11px]">No chats</span>
                      {/if}
                    </div>
                  {:else}
                    <div id="chat-scroll-{order.id}" class="max-h-[90px] overflow-y-auto border border-gray-100 rounded p-1 bg-white text-[11px]">
                      {#each chats as c}
                        <div class="py-0.5 border-b border-gray-100 last:border-b-0 break-words">
                          <div><b>{c.user?.name || ""}:</b> {c.message}</div>
                          <div class="text-[10px] text-gray-400 mt-px">{formatDateTime(c.createdAt)}</div>
                        </div>
                      {/each}
                      {#if chats.length === 0}<div class="text-gray-400 italic text-[11px]">No chats yet</div>{/if}
                    </div>
                    <div class="flex gap-1 mt-1">
                      <input class="form-control form-control-sm !text-[11px]" placeholder="Message..."
                        bind:value={chatMsg[order.id]}
                        on:keydown={(e) => e.key === "Enter" && sendChat(order.id)}
                        on:click|stopPropagation />
                      <button class="btn btn-sm btn-primary" on:click|stopPropagation={() => sendChat(order.id)}>↵</button>
                    </div>
                  {/if}
                </td>

                <!-- Attachments -->
                <td class="px-2 py-2 border border-gray-100 text-xs overflow-visible align-top h-[54px]" on:click|stopPropagation>
                  {#if !isExp}
                    <div class="text-xs cursor-pointer text-gray-600 max-w-full" on:click={() => toggleRow(order.id)}>
                      {#if lastAttach}
                        {@const pf = previewFile(lastAttach)}
                        {#if pf}
                          {#if fileIsImage(pf)}
                            <div class="flex items-center gap-1">
                              <img src={fileUrl(pf)} alt="" class="h-7 w-7 object-cover rounded border border-gray-200 flex-shrink-0" />
                              <div class="min-w-0">
                                <div class="truncate text-[11px]">{fileName(pf)}</div>
                                <div class="text-[10px] text-gray-400">{formatDateTime(lastAttach.createdAt)}</div>
                              </div>
                            </div>
                          {:else}
                            <div class="truncate">{fileTypeIcon(pf)} {fileName(pf)}</div>
                            <div class="text-[10px] text-gray-400 mt-px whitespace-nowrap">{formatDateTime(lastAttach.createdAt)}</div>
                          {/if}
                        {/if}
                      {:else}
                        <span class="text-gray-400 italic text-[11px]">No attachments</span>
                      {/if}
                    </div>
                  {:else}
                    <div id="attach-scroll-{order.id}" class="max-h-[110px] overflow-y-auto border border-gray-100 rounded p-1 bg-white text-[11px]">
                      {#each attachments as a}
                        {#each (a.files || []) as f}
                          <div class="py-1 border-b border-gray-100 last:border-b-0">
                            {#if fileIsImage(f)}
                              <div class="flex items-center gap-1.5">
                                <button class="flex-shrink-0 focus:outline-none" on:click|stopPropagation={() => openLightbox(fileUrl(f))} title="View image">
                                  <img src={fileUrl(f)} alt="" class="h-9 w-9 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                                </button>
                                <div class="min-w-0 flex-1">
                                  <div class="truncate text-[11px]">{fileName(f)}</div>
                                  <div class="text-[10px] text-gray-400">{formatDateTime(a.createdAt)}</div>
                                  <button class="text-[10px] text-blue-500 hover:underline" on:click|stopPropagation={() => openLightbox(fileUrl(f))}>View</button>
                                </div>
                              </div>
                            {:else}
                              <div class="flex items-center gap-1.5">
                                <span class="text-base flex-shrink-0">{fileTypeIcon(f)}</span>
                                <div class="min-w-0 flex-1">
                                  <a href={fileUrl(f)} target="_blank" class="truncate block text-blue-500 hover:underline" on:click|stopPropagation>
                                    {fileName(f)}
                                  </a>
                                  <div class="text-[10px] text-gray-400">{formatDateTime(a.createdAt)}</div>
                                </div>
                              </div>
                            {/if}
                          </div>
                        {/each}
                      {/each}
                      {#if attachments.length === 0}<div class="text-gray-400 italic text-[11px]">No files yet</div>{/if}
                    </div>
                    <label class="btn btn-sm btn-outline-secondary mt-1 cursor-pointer !text-[11px]">
                      + Upload
                      <input type="file" class="hidden" on:change={(e) => handleFileUpload(order.id, e)} on:click|stopPropagation />
                    </label>
                  {/if}
                </td>

                <!-- Reminders -->
                <td class="px-2 py-2 border border-gray-100 text-xs overflow-visible align-top h-[54px]" on:click|stopPropagation>
                  {#if !isExp}
                    <div class="text-xs cursor-pointer text-gray-600 max-w-full" on:click={() => toggleRow(order.id)}>
                      {#if lastRemind}
                        <div class="truncate">🔔 {lastRemind.message || ""}</div>
                        <div class="text-[10px] text-gray-400 mt-px whitespace-nowrap">{formatDateTime(lastRemind.reminderTime || lastRemind.createdAt)}</div>
                      {:else}
                        <span class="text-gray-400 italic text-[11px]">No reminders</span>
                      {/if}
                    </div>
                  {:else}
                    <div id="remind-scroll-{order.id}" class="max-h-[90px] overflow-y-auto border border-gray-100 rounded p-1 bg-white text-[11px]">
                      {#each reminders as r}
                        <div class="py-0.5 border-b border-gray-100 last:border-b-0 break-words">
                          <div>🔔 {r.message || ""}</div>
                          {#if r.reminderTime}
                            <div class="text-[10px] text-orange-500 mt-px">🕐 {formatDateTime(r.reminderTime)}</div>
                          {/if}
                          <div class="text-[10px] text-gray-400">{formatDateTime(r.createdAt)}</div>
                        </div>
                      {/each}
                      {#if reminders.length === 0}<div class="text-gray-400 italic text-[11px]">No reminders yet</div>{/if}
                    </div>
                    <div class="mt-1" on:click|stopPropagation>
                      <input type="datetime-local" class="form-control form-control-sm !text-[11px] mb-1"
                        bind:value={reminderTimeInput[order.id]} on:click|stopPropagation />
                      <div class="flex gap-1">
                        <input class="form-control form-control-sm !text-[11px]" placeholder="Message..."
                          bind:value={reminderInput[order.id]}
                          on:keydown={(e) => e.key === "Enter" && addReminder(order.id)}
                          on:click|stopPropagation />
                        <button class="btn btn-sm btn-warning" on:click|stopPropagation={() => addReminder(order.id)}>+</button>
                      </div>
                    </div>
                  {/if}
                </td>

                <!-- Status -->
                <td class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px]" on:click|stopPropagation>
                  <select
                    class="status-select w-full rounded-full border-0 text-[11px] font-medium px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300"
                    style={statusStyle(order.status)}
                    value={order.status}
                    on:change={(e) => updateStatus(order.id, e.target.value)}
                  >
                    {#each STATUS_OPTIONS as s}
                      <option value={s}>{s}</option>
                    {/each}
                  </select>
                </td>

                <!-- Sales User (master only) -->
                {#if isMaster}
                  <td class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px] truncate">
                    {order.assignedUsers?.find(u => u.role === "user")?.name || "-"}
                  </td>
                {/if}

                <!-- Date -->
                <td class="px-2 py-2 border border-gray-100 align-middle text-xs h-[54px] truncate">{formatDate(order.createdAt)}</td>
              </tr>
            {/each}

            {#if orders.length === 0}
              <tr>
                <td colspan={cols.length} class="text-center py-4 text-gray-400">No orders found</td>
              </tr>
            {/if}
          </tbody>
        </table>
        </div><!-- /overflow-auto -->

        <!-- Pagination inside card footer -->
        <div class="card-footer bg-white border-top d-flex align-items-center justify-content-between flex-wrap gap-2 py-2 px-3">
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted" style="font-size:13px;">Page {currentPage} of {totalPages} &nbsp;·&nbsp; {total} records</span>
            <div class="d-flex align-items-center gap-1">
              <span class="text-muted" style="font-size:13px;">Rows:</span>
              <select class="form-select form-select-sm" style="width:70px;"
                bind:value={pageSize}
                on:change={() => fetchOrders(1)}>
                {#each PAGE_SIZE_OPTIONS as n}<option value={n}>{n}</option>{/each}
              </select>
            </div>
          </div>
          <div class="d-flex gap-1 flex-wrap">
            <button class="btn btn-sm btn-outline-secondary" disabled={currentPage === 1}
              on:click={() => fetchOrders(currentPage - 1)}>‹ Prev</button>
            {#each pageNumbers as p}
              {#if p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)}
                <button
                  class="btn btn-sm"
                  class:btn-danger={p === currentPage}
                  class:btn-outline-secondary={p !== currentPage}
                  on:click={() => fetchOrders(p)}>{p}</button>
              {:else if p === currentPage - 3 || p === currentPage + 3}
                <span class="btn btn-sm btn-outline-secondary disabled">…</span>
              {/if}
            {/each}
            <button class="btn btn-sm btn-outline-secondary" disabled={currentPage === totalPages}
              on:click={() => fetchOrders(currentPage + 1)}>Next ›</button>
          </div>
        </div>

      </div><!-- /card-body -->
      </div><!-- /card -->

    {/if}
  </div>
</div>

<!-- Add Order Drawer -->
{#if drawerOpen}
  <div class="fixed inset-0 bg-black/30 z-[1040]" on:click={closeDrawer}></div>
{/if}
<div
  class="fixed top-0 right-0 w-[380px] h-screen bg-white z-[1050] flex flex-col shadow-[-4px_0_16px_rgba(0,0,0,0.12)] transition-transform duration-[250ms] ease-in-out"
  class:translate-x-full={!drawerOpen}
  class:translate-x-0={drawerOpen}
>
  <!-- Drawer Header -->
  <div class="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 text-sm">
    <h5 class="mb-0 text-sm font-semibold">Add Order</h5>
    <button class="btn-close" on:click={closeDrawer}></button>
  </div>

  <!-- Drawer Body -->
  <div class="flex-1 overflow-y-auto p-4">

    <div class="text-[11px] font-semibold uppercase text-gray-500 tracking-wide mb-2.5 pb-1 border-b border-gray-100">Order Info</div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Title <span class="text-danger">*</span></label>
      <input class="form-control form-control-sm" class:is-invalid={drawerErrors.title} bind:value={f_title} placeholder="Title" />
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
        <input class="form-control form-control-sm" bind:value={f_priceTerms} placeholder="Price Terms" />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Price</label>
      <div class="input-group input-group-sm">
        <span class="input-group-text">{CURRENCIES.find(c => c.code === f_currency)?.symbol}</span>
        <input type="number" class="form-control form-control-sm" bind:value={f_price} placeholder="0.00" />
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
        <input class="form-control form-control-sm" bind:value={f_gstNumber} placeholder="GST Number" />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Description</label>
      <textarea class="form-control form-control-sm" rows="2" bind:value={f_description} placeholder="Description"></textarea>
    </div>

    <div class="text-[11px] font-semibold uppercase text-gray-500 tracking-wide mb-2.5 pb-1 border-b border-gray-100">Client Details</div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Name <span class="text-danger">*</span></label>
        <input class="form-control form-control-sm" class:is-invalid={drawerErrors.name} bind:value={f_name} placeholder="Name" />
        {#if drawerErrors.name}<div class="invalid-feedback">{drawerErrors.name}</div>{/if}
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Designation</label>
        <input class="form-control form-control-sm" bind:value={f_designation} placeholder="Designation" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Mobile</label>
        <input class="form-control form-control-sm" bind:value={f_mobile} placeholder="Mobile" />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Alternate Mobile</label>
        <input class="form-control form-control-sm" bind:value={f_alternateMobile} placeholder="Alternate Mobile" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="form-label !text-xs !mb-1">Email</label>
        <input type="email" class="form-control form-control-sm" bind:value={f_email} placeholder="Email" />
      </div>
      <div>
        <label class="form-label !text-xs !mb-1">Whatsapp</label>
        <input class="form-control form-control-sm" bind:value={f_whatsapp} placeholder="Whatsapp" />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label !text-xs !mb-1">Address</label>
      <textarea class="form-control form-control-sm" rows="2" bind:value={f_address} placeholder="Address"></textarea>
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

<LightBox bind:data={lightboxImages} />

<style>
  /* parent-hover → child filter: can't be done in Tailwind */
  .excel-row:hover td { filter: brightness(0.96); }

  /* sticky columns — needs !important to override table stacking context */
  .sticky-th-sno { position: sticky !important; left: 0; z-index: 13 !important; }
  .sticky-th-pid { position: sticky !important; z-index: 13 !important; }
  .sticky-td-sno { position: sticky !important; left: 0; z-index: 11 !important; }
  .sticky-td-pid { position: sticky !important; z-index: 11 !important; }

  /* resize handle hover — pseudo-class on a dynamic element */
  .resize-handle:hover { border-right-color: #0d6efd; }

  /* status badge-select — remove browser default appearance */
  .status-select { appearance: none; -webkit-appearance: none; text-align: center; }
</style>
