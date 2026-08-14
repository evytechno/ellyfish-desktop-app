<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { goto } from "$app/navigation";
  import { checkAuth } from "$lib/utils/auth";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { companiesAllStore, usersAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { page } from "$app/stores";
  import { showToast } from "$lib/stores/uiToast";
  import { clientVisitFilterStore } from "$lib/stores/filterStore";
  import ClientVisitQuickView from "$lib/components/ClientVisitQuickView.svelte";

  let currentUser = null;
  let visits = [];
  let users = [];
  let companies = [];
  let loadingData = true;
  let refresh = false;
  let drawerOpen = false;
  let drawerVisitId = null;

  function openQuickView(id) {
    drawerVisitId = id;
    drawerOpen = true;
  }

  function closeQuickView() {
    drawerOpen = false;
    drawerVisitId = null;
  }

  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let visitTypeFilter = "";
  let statusFilter = "";
  let outcomeFilter = "";
  let cityFilter = "";
  let stateFilter = "";
  let followUpFilter = "";
  let overdueOnly = false;
  let hasOrderFilter = "";
  let byUserId = null;
  let byCompanyId = null;
  let firstLoad = false;
  let cityOptions = [];
  let stateOptions = [];

  async function loadFilterOptions() {
    try {
      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/filter-options`);
      cityOptions = data?.cities ?? [];
      stateOptions = data?.states ?? [];
    } catch (_) {
      cityOptions = [];
      stateOptions = [];
    }
  }

  $: hasActiveExtraFilters = !!(
    cityFilter || stateFilter || followUpFilter || overdueOnly || hasOrderFilter
  );

  function updateFilterStore(newValues) {
    clientVisitFilterStore.update((s) => ({ ...s, ...newValues }));
  }

  function persistFilters() {
    updateFilterStore({
      searchTerm,
      currentPage,
      rowsPerPage,
      selectedFilter,
      customStartDate,
      customEndDate,
      visitTypeFilter,
      statusFilter,
      outcomeFilter,
      cityFilter,
      stateFilter,
      followUpFilter,
      overdueOnly,
      hasOrderFilter,
      byUserId,
      byCompanyId,
    });
  }

  function clearExtraFilters() {
    cityFilter = "";
    stateFilter = "";
    followUpFilter = "";
    overdueOnly = false;
    hasOrderFilter = "";
    visitTypeFilter = "";
    statusFilter = "";
    outcomeFilter = "";
    byUserId = null;
    byCompanyId = null;
    currentPage = 1;
  }

  function getDateRange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (selectedFilter === "upcoming") {
      const end = new Date(today); end.setDate(end.getDate() + 7);
      return { startDate: today.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    } else if (selectedFilter === "upcoming_all") {
      return { startDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "today") {
      return { startDate: today.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "last7days") {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { startDate: s.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "last30days") {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { startDate: s.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    return {};
  }

  async function fetchVisits() {
    loadingData = true;
    persistFilters();
    try {
      // Overdue filter is date-absolute; don't also clamp to the period dropdown
      const { startDate, endDate } = overdueOnly ? {} : getDateRange();
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage) });
      if (searchTerm) params.set("search", searchTerm);
      if (visitTypeFilter) params.set("visitType", visitTypeFilter);
      if (statusFilter && !overdueOnly) params.set("status", statusFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (stateFilter) params.set("state", stateFilter);
      if (followUpFilter) params.set("followUp", followUpFilter);
      if (overdueOnly) params.set("overdue", "true");
      if (hasOrderFilter) params.set("hasOrder", hasOrderFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (byUserId) params.set("byUserId", String(byUserId));
      if (byCompanyId) params.set("byCompanyId", String(byCompanyId));

      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}?${params}`);
      visits = data.data ?? [];
      totalItems = data.total ?? 0;
    } catch (e) {
    } finally {
      loadingData = false;
    }
  }

  async function getAllUsers() {
    const cached = get(usersAllStore);
    if (cached?.length > 0) { users = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch (_) {}
  }

  async function getAllCompanies() {
    const cached = get(companiesAllStore);
    if (cached?.length > 0) { companies = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
    } catch (_) {}
  }

  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      await fetchVisits();
      refresh = false;
    }, 200);
  }

  let debounceTimeout;
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => { searchTerm = value; currentPage = 1; }, 300);
  }

  $: [searchTerm, selectedFilter, customStartDate, customEndDate, currentPage, rowsPerPage, visitTypeFilter, statusFilter, outcomeFilter, cityFilter, stateFilter, followUpFilter, overdueOnly, hasOrderFilter, byUserId, byCompanyId], checkFetch();
  function checkFetch() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        loadingData = false;
        return;
      }
      fetchVisits();
    }
  }

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Indian date: DD-MM-YYYY with weekday, e.g. Sat, 01-08-2026 */
  function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    const day = WEEKDAYS[dt.getDay()];
    const datePart = `${String(dt.getDate()).padStart(2, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
    return `${day}, ${datePart}`;
  }

  /** HH:mm → 10:30 AM */
  function formatTime12(t) {
    if (!t) return "";
    const [hStr, mStr = "00"] = String(t).split(":");
    let h = parseInt(hStr, 10);
    if (Number.isNaN(h)) return "";
    const m = mStr.slice(0, 2).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  /** Visit date with day + meeting time: Sat, 01-08-2026 · 10:30 AM */
  function formatVisitDateTime(date, meetingTime) {
    const dateStr = formatDate(date);
    if (dateStr === "—") return "—";
    const timeStr = formatTime12(meetingTime);
    return timeStr ? `${dateStr} · ${timeStr}` : dateStr;
  }

  const STATUS_BADGE = {
    scheduled: { cls: "bg-primary",  label: "Scheduled" },
    completed:  { cls: "bg-success",  label: "Completed" },
    cancelled:  { cls: "bg-danger",   label: "Cancelled" },
  };

  // ── Column visibility (Actions + By hidden by default) ────────────────────
  const COL_STORAGE_KEY = "cv-list-col-vis";
  const DEFAULT_COL_VIS = {
    status: true,
    visitType: true,
    visitDate: true,
    client: true,
    location: true,
    order: true,
    purpose: true,
    outcome: true,
    attendees: true,
    nextFollowUpDate: true,
    createdBy: false, // By — off by default
    company: true,
    _actions: false,  // Actions — off by default
  };

  let colVis = { ...DEFAULT_COL_VIS };
  let colPanelOpen = false;

  function loadColVis() {
    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) return { ...DEFAULT_COL_VIS, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...DEFAULT_COL_VIS };
  }

  function saveColVis() {
    try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(colVis)); } catch (_) {}
  }

  function toggleCol(key) {
    colVis = { ...colVis, [key]: !colVis[key] };
    saveColVis();
  }

  function resetColVis() {
    colVis = { ...DEFAULT_COL_VIS };
    saveColVis();
    colPanelOpen = false;
  }

  function statusDueMeta(visitDate) {
    if (!visitDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vd = new Date(visitDate); vd.setHours(0, 0, 0, 0);
    const diff = Math.round((vd - today) / 86400000);
    if (diff === 0) return { text: "Today", tone: "today" };
    if (diff === 1) return { text: "Tomorrow", tone: "soon" };
    if (diff > 1) return { text: `In ${diff} days`, tone: "soon" };
    if (diff === -1) return { text: "Yesterday · Overdue", tone: "overdue" };
    return { text: `${-diff} days ago · Overdue`, tone: "overdue" };
  }

  $: allColumnDefs = [
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        const s = STATUS_BADGE[row.status] ?? { cls: "bg-secondary", label: row.status ?? "—" };
        const badge = `<span class="badge ${s.cls} status-change-btn cv-status-badge" data-id="${row.id}" data-status="${row.status}" title="Click to change status">${s.label}<i class="ti ti-chevron-down ms-1"></i></span>`;
        if (row.status !== "scheduled") {
          return `<div class="cv-status-cell">${badge}</div>`;
        }
        const due = statusDueMeta(row.visitDate);
        if (!due) return `<div class="cv-status-cell">${badge}</div>`;
        return `<div class="cv-status-cell">${badge}<span class="cv-status-due cv-status-due--${due.tone}">${due.text}</span></div>`;
      },
    },
    {
      key: "visitType",
      label: "Type",
      render: (val, row) => {
        const BADGES = { incoming: 'bg-info text-white', outgoing: 'bg-warning text-dark', joint: 'bg-primary', job_discussion: 'bg-success', job_received: 'bg-secondary', sample_sent: 'bg-danger' };
        const LABELS = { incoming: 'They Came To Us', outgoing: 'We Visited Client', joint: 'Joint Site Visit', job_discussion: 'Client Gave Job Details', job_received: 'Job Received', sample_sent: 'Sample Sent' };
        return `<span class="badge ${BADGES[row.visitType] ?? 'bg-secondary'}">${LABELS[row.visitType] ?? row.visitType}</span>`;
      },
    },
    {
      key: "visitDate",
      label: "Visit Date",
      minWidth: "190px",
      width: "190px",
      render: (val, row) => formatVisitDateTime(row.visitDate, row.meetingTime),
    },
    {
      key: "client",
      label: "Client",
      render: (val, row) => {
        const name = row.client?.name ?? "—";
        return `<button type="button" class="cv-qv-open btn btn-link p-0 text-start text-decoration-none fw-medium" data-id="${row.id}" title="Quick view">${escapeHtml(name)}</button>`;
      },
    },
    {
      key: "location",
      label: "Location",
      render: (val, row) => {
        const parts = [row.city, row.state].filter(Boolean);
        if (!parts.length) return `<span class="text-muted">—</span>`;
        return `<div class="cv-location"><span class="cv-location-city">${row.city ?? "—"}</span>${row.state ? `<span class="cv-location-state text-muted">${row.state}</span>` : ""}</div>`;
      },
    },
    {
      key: "order",
      label: "Order",
      render: (val, row) => row.order
        ? `<a href="/admin/order/${row.order.id}" class="text-primary">#${row.order.id}</a>`
        : "—",
    },
    {
      key: "purpose",
      label: "Purpose",
      render: (val, row) => {
        const text = row.purpose ?? "—";
        const shown = text.length > 25 ? text.slice(0, 25) + "…" : text;
        return `<button type="button" class="cv-qv-open btn btn-link p-0 text-start text-decoration-none text-body" data-id="${row.id}" title="${escapeHtml(text)}">${escapeHtml(shown)}</button>`;
      },
    },
    {
      key: "outcome",
      label: "Outcome",
      render: (val, row) => {
        const colors = { Positive: "bg-success", Negative: "bg-danger", Pending: "bg-warning text-dark", "No Response": "bg-secondary" };
        return row.outcome ? `<span class="badge ${colors[row.outcome] ?? 'bg-secondary'}">${row.outcome}</span>` : "—";
      },
    },
    {
      key: "attendees",
      label: "Attendees",
      render: (val, row) => String(row.attendees?.length ?? 0),
    },
    {
      key: "nextFollowUpDate",
      label: "Follow Up",
      render: (val, row) => formatDate(row.nextFollowUpDate),
    },
    ...(currentUser?.role !== "user" ? [
      {
        key: "createdBy",
        label: "By",
        render: (val, row) => row.createdBy?.name ?? "—",
      },
      {
        key: "company",
        label: "Company",
        render: (val, row) => row.company?.name ?? "—",
      },
    ] : []),
  ];

  $: columns = allColumnDefs.filter((c) => colVis[c.key] !== false);
  $: colPanelItems = [
    ...allColumnDefs.map((c) => ({ key: c.key, label: c.label })),
    { key: "_actions", label: "Actions" },
  ];
  $: hiddenColCount = colPanelItems.filter((i) => colVis[i.key] === false).length;

  let actions = [
    {
      label: "Quick View",
      icon: "ti ti-eye",
      onClick: (id) => openQuickView(id),
      color: "btn-soft-success",
    },
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: (id) => goto(`/admin/client-visit/edit/${id}`),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteVisit(id),
      color: "btn-soft-danger",
    },
  ];

  $: tableActions = colVis._actions ? actions : [];

  onMount(() => {
    currentUser = checkAuth();
    colVis = loadColVis();

    const saved = $clientVisitFilterStore;
    if (saved && Object.keys(saved).length > 0) {
      if (saved.searchTerm !== undefined) searchTerm = saved.searchTerm || "";
      if (saved.currentPage !== undefined) currentPage = saved.currentPage || 1;
      if (saved.rowsPerPage !== undefined) rowsPerPage = saved.rowsPerPage || 10;
      if (saved.selectedFilter !== undefined) selectedFilter = saved.selectedFilter || "last7days";
      if (saved.customStartDate !== undefined) customStartDate = saved.customStartDate || null;
      if (saved.customEndDate !== undefined) customEndDate = saved.customEndDate || null;
      if (saved.visitTypeFilter !== undefined) visitTypeFilter = saved.visitTypeFilter || "";
      if (saved.statusFilter !== undefined) statusFilter = saved.statusFilter || "";
      if (saved.outcomeFilter !== undefined) outcomeFilter = saved.outcomeFilter || "";
      if (saved.cityFilter !== undefined) cityFilter = saved.cityFilter || "";
      if (saved.stateFilter !== undefined) stateFilter = saved.stateFilter || "";
      if (saved.followUpFilter !== undefined) followUpFilter = saved.followUpFilter || "";
      if (saved.overdueOnly !== undefined) overdueOnly = !!saved.overdueOnly;
      if (saved.hasOrderFilter !== undefined) hasOrderFilter = saved.hasOrderFilter || "";
      if (saved.byUserId !== undefined) byUserId = saved.byUserId ?? null;
      if (saved.byCompanyId !== undefined) byCompanyId = saved.byCompanyId ?? null;
    }
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      selectedFilter = "last7days";
      customStartDate = null;
      customEndDate = null;
    }

    fetchVisits();
    loadFilterOptions();
    getAllUsers();
    getAllCompanies();
    setTimeout(() => { firstLoad = true; }, 500);
  });

  async function quickStatusChange(id, currentStatus) {
    const options = [
      { value: "scheduled", label: "📅 Scheduled", color: "#0d6efd" },
      { value: "completed", label: "✓ Completed", color: "#198754" },
      { value: "cancelled", label: "✕ Cancelled", color: "#dc3545" },
    ].filter(o => o.value !== currentStatus);

    const today = new Date().toISOString().slice(0, 10);

    const btns = options.map(o =>
      `<button class="swal2-status-btn" data-val="${o.value}"
        style="background:${o.color};color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;flex:1;transition:opacity .15s;"
        onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        ${o.label}
      </button>`
    ).join("");

    const { value: result } = await Swal.fire({
      title: "Change Status",
      html: `
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">${btns}</div>
        <div id="swal-extra" style="display:none;">
          <div style="margin-bottom:10px;">
            <label style="font-size:11px;color:#6c757d;display:block;text-align:left;margin-bottom:4px;" id="swal-date-label">Date</label>
            <input id="swal-date" type="date" value="${today}"
              style="width:100%;padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:12px;" />
          </div>
          <div id="swal-reason-wrap" style="display:none;margin-bottom:10px;">
            <label style="font-size:11px;color:#6c757d;display:block;text-align:left;margin-bottom:4px;">Reason</label>
            <select id="swal-reason" style="width:100%;padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:12px;">
              <option value="">Select reason...</option>
              <option>Client unavailable</option>
              <option>Internal conflict</option>
              <option>Rescheduled by client</option>
              <option>Weather / travel issue</option>
              <option>Other</option>
            </select>
          </div>
          <div style="margin-bottom:4px;">
            <label style="font-size:11px;color:#6c757d;display:block;text-align:left;margin-bottom:4px;">Note (optional)</label>
            <input id="swal-note" type="text" placeholder="Add a note..."
              style="width:100%;padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:12px;" />
          </div>
        </div>`,
      showConfirmButton: true,
      confirmButtonText: "Update",
      showCancelButton: true,
      didOpen: (popup) => {
        let picked = null;
        const extra = popup.querySelector('#swal-extra');
        const reasonWrap = popup.querySelector('#swal-reason-wrap');
        const dateLabel = popup.querySelector('#swal-date-label');
        popup.querySelectorAll('.swal2-status-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            picked = btn.dataset.val;
            popup.querySelectorAll('.swal2-status-btn').forEach(b => b.style.opacity = '0.5');
            btn.style.opacity = '1';
            btn.style.outline = '2px solid #333';
            extra.style.display = 'block';
            if (picked === 'completed') {
              dateLabel.textContent = 'Completed On';
              reasonWrap.style.display = 'none';
            } else if (picked === 'cancelled') {
              dateLabel.textContent = 'Cancelled On';
              reasonWrap.style.display = 'block';
            } else {
              dateLabel.textContent = 'New Visit Date';
              reasonWrap.style.display = 'none';
            }
          });
        });
        popup._getPicked = () => picked;
      },
      preConfirm: () => {
        const popup = document.querySelector('.swal2-popup');
        const picked = popup?._getPicked?.();
        if (!picked) { Swal.showValidationMessage('Please select a status'); return false; }
        return {
          status: picked,
          date: document.querySelector('#swal-date')?.value || today,
          note: document.querySelector('#swal-note')?.value || '',
          reason: document.querySelector('#swal-reason')?.value || '',
        };
      },
    });

    if (!result) return;
    try {
      await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${id}/status`, {
        method: "PATCH",
        data: result,
      });
      visits = visits.map(v => v.id === id ? { ...v, status: result.status,
        ...(result.status === 'completed' ? { completedAt: result.date } : {}),
        ...(result.status === 'cancelled' ? { cancelledAt: result.date } : {}),
        ...(result.status === 'scheduled' ? { visitDate: result.date } : {}),
      } : v);
      const label = STATUS_BADGE[result.status]?.label ?? result.status;
      showToast({ type: "success", message: `Visit status updated to ${label}` });
    } catch (e) {
      errorHandle(e);
      showToast({ type: "error", message: "Failed to update visit status" });
    }
  }

  async function deleteVisit(id) {
    const result = await Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this visit?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!result.isConfirmed) return;
    try {
      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${id}`, { method: "DELETE" });
      visits = visits.filter((v) => v.id !== id);
      Swal.fire("Deleted!", data.message, "success");
      refreshPage();
    } catch (err) {
      errorHandle(err);
    }
  }
</script>

<div class="page-wrapper cv-list-page">
  <div class="content">
    <!-- Page Header + Search -->
    <div class="cv-list-header mb-3">
      <div class="cv-list-heading">
        <h4 class="mb-1 cv-list-title">Client Visits</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Client Visits</li>
          </ol>
        </nav>
      </div>

      <div class="cv-list-search">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input
            type="text"
            value={searchTerm}
            on:input={(e) => handleSearchChange(e.target.value)}
            class="form-control form-control-sm"
            placeholder="Search client, purpose, address…"
          />
        </div>
      </div>

      <div class="cv-list-header-actions">
        <div class="cv-col-panel-wrap">
          <button
            type="button"
            class="btn btn-sm btn-outline-light shadow"
            on:click={() => (colPanelOpen = !colPanelOpen)}
            title="Show / hide columns"
          >
            <i class="ti ti-columns me-1"></i>Columns
            {#if hiddenColCount > 0}
              <span class="badge bg-warning text-dark ms-1">{hiddenColCount}</span>
            {/if}
          </button>
          {#if colPanelOpen}
            <div class="cv-col-panel-backdrop" on:click={() => (colPanelOpen = false)}></div>
            <div class="cv-col-panel" role="dialog" aria-label="Column visibility">
              <div class="cv-col-panel-head">
                <span>Columns</span>
                <button type="button" class="btn btn-link btn-sm p-0" on:click={resetColVis}>Reset</button>
              </div>
              <div class="cv-col-panel-body">
                {#each colPanelItems as item}
                  <label class="cv-col-item">
                    <input
                      type="checkbox"
                      class="form-check-input m-0"
                      checked={colVis[item.key] !== false}
                      on:change={() => toggleCol(item.key)}
                    />
                    <span class:cv-col-item--off={colVis[item.key] === false}>{item.label}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <a href="#refresh" on:click|preventDefault={refreshPage}
          class="btn btn-icon btn-sm btn-outline-light shadow"
          data-bs-toggle="tooltip" data-bs-placement="top"
          aria-label="Refresh" data-bs-original-title="Refresh">
          <i class="ti ti-refresh"></i>
        </a>
        <a href="/admin/client-visit/add" class="btn btn-primary btn-sm">
          <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Visit
        </a>
      </div>
    </div>

    <!-- Filters row -->
    <div class="cv-list-filters mb-3">
      <select bind:value={selectedFilter} class="form-select form-select-sm">
        <option value="all">All Time</option>
        <option value="upcoming">Upcoming (Next 7 Days)</option>
        <option value="upcoming_all">Upcoming (All Future)</option>
        <option value="today">Today</option>
        <option value="last7days">Last 7 Days</option>
        <option value="last30days">Last 30 Days</option>
        <option value="custom">Custom Range</option>
      </select>
      {#if selectedFilter === "custom"}
        <input type="date" bind:value={customStartDate} class="form-control form-control-sm cv-filter-date" />
        <input type="date" bind:value={customEndDate} class="form-control form-control-sm cv-filter-date" />
      {/if}
      <select bind:value={visitTypeFilter} class="form-select form-select-sm">
        <option value="">All Types</option>
        <option value="incoming">They Came To Us</option>
        <option value="outgoing">We Visited Client</option>
        <option value="joint">Joint Site Visit</option>
        <option value="job_discussion">Client Gave Job Details</option>
        <option value="job_received">Job Received</option>
        <option value="sample_sent">Sample Sent</option>
      </select>
      <select bind:value={statusFilter} class="form-select form-select-sm">
        <option value="">All Statuses</option>
        <option value="scheduled">Scheduled</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select bind:value={outcomeFilter} class="form-select form-select-sm">
        <option value="">All Outcomes</option>
        <option value="Positive">Positive</option>
        <option value="Negative">Negative</option>
        <option value="Pending">Pending</option>
        <option value="No Response">No Response</option>
      </select>
      <select bind:value={stateFilter} class="form-select form-select-sm" on:change={() => { currentPage = 1; }}>
        <option value="">All States</option>
        {#each stateOptions as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
      <select bind:value={cityFilter} class="form-select form-select-sm" on:change={() => { currentPage = 1; }}>
        <option value="">All Cities</option>
        {#each cityOptions as c}
          <option value={c}>{c}</option>
        {/each}
      </select>
      <select bind:value={followUpFilter} class="form-select form-select-sm">
        <option value="">Follow-up: All</option>
        <option value="upcoming">Follow-up: Upcoming</option>
        <option value="overdue">Follow-up: Overdue</option>
        <option value="has">Has Follow-up</option>
        <option value="none">No Follow-up</option>
      </select>
      <select bind:value={hasOrderFilter} class="form-select form-select-sm">
        <option value="">Order link: All</option>
        <option value="yes">Linked to Order</option>
        <option value="no">No Order</option>
      </select>
      <label class="cv-overdue-toggle mb-0">
        <input type="checkbox" bind:checked={overdueOnly} on:change={() => { currentPage = 1; }} />
        <span>Overdue</span>
      </label>
      {#if currentUser?.role !== "user"}
        <select bind:value={byUserId} class="form-select form-select-sm">
          <option value={null}>All Users</option>
          {#each users as u}
            <option value={u.id}>{u.name}</option>
          {/each}
        </select>
        <select bind:value={byCompanyId} class="form-select form-select-sm">
          <option value={null}>All Companies</option>
          {#each companies as c}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      {/if}
      {#if hasActiveExtraFilters || visitTypeFilter || statusFilter || outcomeFilter || byUserId || byCompanyId}
        <button type="button" class="btn btn-sm btn-outline-secondary" on:click={clearExtraFilters} title="Clear filters">
          <i class="ti ti-filter-off me-1"></i>Clear
        </button>
      {/if}
    </div>

    <!-- Table -->
    <div class="card border-0 rounded-0 cv-list-card">
      <div class="card-body" on:click={(e) => {
        const qv = e.target.closest('.cv-qv-open');
        if (qv) {
          openQuickView(Number(qv.dataset.id));
          return;
        }
        const btn = e.target.closest('.status-change-btn');
        if (btn) quickStatusChange(Number(btn.dataset.id), btn.dataset.status);
      }}>
        <DynamicDataTable
          loading={loadingData}
          {columns}
          actions={tableActions}
          data={[...visits]}
          {currentPage}
          {rowsPerPage}
          totalItems={totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
          serverMode={true}
          headersItemShow={false}
          on:pageChange={(e) => (currentPage = e.detail)}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; }}
          on:search={(e) => { searchTerm = e.detail; currentPage = 1; }}
        />
      </div>
    </div>
  </div>
</div>

<ClientVisitQuickView
  bind:open={drawerOpen}
  visitId={drawerVisitId}
  {currentUser}
  on:close={closeQuickView}
/>

<style>
  .cv-list-page {
    font-size: var(--app-font-size, 0.75rem);
    line-height: var(--app-line-height, 1.45);
  }

  .cv-list-page :global(.content),
  .cv-list-page :global(.card-body),
  .cv-list-page :global(.card-header),
  .cv-list-page :global(.breadcrumb),
  .cv-list-page :global(.form-control),
  .cv-list-page :global(.form-select),
  .cv-list-page :global(.form-control-sm),
  .cv-list-page :global(.form-select-sm),
  .cv-list-page :global(.btn),
  .cv-list-page :global(.btn-sm),
  .cv-list-page :global(table),
  .cv-list-page :global(th),
  .cv-list-page :global(td),
  .cv-list-page :global(.dataTables_wrapper),
  .cv-list-page :global(.dataTables_info),
  .cv-list-page :global(.dataTables_paginate),
  .cv-list-page :global(.pagination),
  .cv-list-page :global(.page-link) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  .cv-list-title {
    font-size: var(--app-font-size-xl, 1rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .cv-list-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .cv-list-heading {
    flex: 0 0 auto;
    min-width: 140px;
  }

  .cv-list-search {
    flex: 1 1 220px;
    max-width: 360px;
  }

  .cv-list-search :global(.form-control) {
    width: 100%;
  }

  .cv-list-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .cv-col-panel-wrap {
    position: relative;
  }

  .cv-col-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 98;
  }

  .cv-col-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 99;
    width: 220px;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .cv-col-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #f1f3f5;
    font-size: var(--app-font-size, 0.75rem);
    font-weight: 600;
    color: #495057;
  }

  .cv-col-panel-body {
    overflow-y: auto;
    padding: 4px 0;
  }

  .cv-col-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    margin: 0;
    cursor: pointer;
    font-size: var(--app-font-size, 0.75rem);
    color: #343a40;
  }

  .cv-col-item:hover {
    background: #f8f9fa;
  }

  .cv-col-item--off {
    opacity: 0.45;
  }

  .cv-list-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .cv-list-filters :global(.form-control),
  .cv-list-filters :global(.form-select) {
    min-height: 32px;
    flex: 1 1 118px;
    max-width: 148px;
    min-width: 0;
    width: auto;
    padding-left: 6px;
    padding-right: 22px;
    font-size: 0.72rem;
  }

  .cv-list-filters .cv-filter-date {
    flex: 1 1 128px;
    max-width: 140px;
  }

  .cv-list-filters .cv-overdue-toggle {
    flex: 0 0 auto;
  }

  .cv-list-filters :global(.btn) {
    flex: 0 0 auto;
  }

  .cv-list-card :global(th),
  .cv-list-card :global(td) {
    font-size: var(--app-font-size, 0.75rem) !important;
    vertical-align: middle;
    padding: 0.45rem 0.6rem;
  }

  .cv-list-card :global(.cv-qv-open) {
    color: #185fa5 !important;
    font-size: inherit !important;
    line-height: inherit !important;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cv-list-card :global(.cv-qv-open:hover) {
    text-decoration: underline !important;
  }

  .cv-list-card :global(.badge) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
    font-weight: 600;
  }

  .cv-list-card :global(small),
  .cv-list-card :global(.text-muted),
  .cv-list-page :global(.cv-meta) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .cv-list-page :global(.btn-icon) {
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Status column */
  .cv-list-card :global(.cv-status-cell) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 108px;
  }

  .cv-list-card :global(.cv-status-badge) {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .cv-list-card :global(.cv-status-badge .ti) {
    font-size: 0.7rem !important;
    opacity: 0.9;
  }

  .cv-list-card :global(.cv-status-due) {
    display: inline-block;
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
    font-weight: 600;
    line-height: 1.25;
    white-space: nowrap;
  }

  .cv-list-card :global(.cv-status-due--today) {
    color: #e67700;
  }

  .cv-list-card :global(.cv-status-due--soon) {
    color: #2b8a3e;
  }

  .cv-list-card :global(.cv-status-due--overdue) {
    color: #c92a2a;
  }

  .cv-list-card :global(.cv-location) {
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.3;
  }

  .cv-list-card :global(.cv-location-city) {
    font-weight: 500;
  }

  .cv-list-card :global(.cv-location-state) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .cv-list-card :global(th.ddt-sn),
  .cv-list-card :global(td.ddt-sn) {
    width: 56px !important;
    max-width: 64px !important;
    min-width: 52px !important;
    padding-left: 0.35rem !important;
    padding-right: 0.35rem !important;
    white-space: nowrap;
    text-align: center;
  }

  .cv-list-card :global(th.ddt-col-visit-date),
  .cv-list-card :global(td.ddt-col-visit-date) {
    min-width: 190px !important;
    width: 190px !important;
    white-space: nowrap;
  }

  .cv-overdue-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #fff;
    font-size: var(--app-font-size, 0.75rem);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    min-height: 32px;
  }

  .cv-overdue-toggle:has(input:checked) {
    border-color: #f03e3e;
    background: #fff5f5;
    color: #c92a2a;
    font-weight: 600;
  }

  .cv-overdue-toggle input {
    margin: 0;
    accent-color: #c92a2a;
  }
</style>
