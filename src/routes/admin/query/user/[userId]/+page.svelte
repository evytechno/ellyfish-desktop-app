<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Pagination from "$lib/components/Pagination.svelte";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";
  import { tick } from "svelte";
  import Swal from "sweetalert2";
  import html2canvas from "html2canvas";
  import pdfMake from "pdfmake/build/pdfmake";
  import * as pdfFonts from "pdfmake/build/vfs_fonts";

  let currentUser;
  let userId = Number($page.params.userId);

  // ── User info ────────────────────────────────────────────────────────────────
  let user          = null;
  let allQueryUsers = [];
  let userLoading   = true;

  // ── Dashboard stats (existing) ───────────────────────────────────────────────
  let stats        = null;
  let statsLoading = true;
  let statsError   = "";

  // ── Detailed stats (new) ─────────────────────────────────────────────────────
  let detail        = null;
  let detailLoading = true;
  let detailError   = "";
  let showMistakes  = false;
  let exportingPdf  = false;

  // ── Query list ───────────────────────────────────────────────────────────────
  let queries     = [];
  let listLoading = true;
  let currentPage = 1;
  let totalPages  = 0;
  let totalItems  = 0;
  let rowsPerPage = 10;

  // ── Filters ──────────────────────────────────────────────────────────────────
  let selectedFilter  = "last7days";
  let customStartDate = "";
  let customEndDate   = "";
  let filterStatus    = "";
  let filterType      = "";
  let filterPriority  = "";
  let search          = "";
  let searchTimeout;

  const STATUS_COLORS = {
    open:        "badge bg-primary text-white",
    in_progress: "badge bg-warning text-dark",
    resolved:    "badge bg-success text-white",
    reopened:    "badge bg-danger text-white",
    closed:      "badge bg-secondary text-white",
  };
  const PRIORITY_COLORS = {
    high: "badge bg-danger text-white", medium: "badge bg-warning text-dark", low: "badge bg-success text-white",
  };
  const QUERY_TYPES = [
    { value: "",                   label: "All Types" },
    { value: "order_issue",        label: "Order Issue" },
    { value: "payment_issue",      label: "Payment Issue" },
    { value: "invoice_issue",      label: "Invoice Issue" },
    { value: "stock_issue",        label: "Stock Issue" },
    { value: "technical",          label: "Technical" },
    { value: "customer_complaint", label: "Customer Complaint" },
    { value: "access_issue",       label: "Access Issue" },
    { value: "other",              label: "Other" },
  ];
  const STATUSES = [
    { value: "", label: "All Statuses" }, { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" }, { value: "resolved", label: "Resolved" },
    { value: "reopened", label: "Reopened" }, { value: "closed", label: "Closed" },
  ];

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user") { goto("/admin/dashboard"); return; }
    await Promise.all([loadUser(), loadQueryUsers()]);
    // After loadUser(), check if this admin has permission to view this subRole
    if (user) {
      const canTelecaller = currentUser.role === "master" || (currentUser.queryAccessTelecaller ?? true);
      const canTech       = currentUser.role === "master" || (currentUser.queryAccessTech ?? true);
      if ((user.subRole === "telecaller" && !canTelecaller) || (user.subRole === "tech" && !canTech)) {
        goto("/admin/query/user");
        return;
      }
    }
    await Promise.all([loadStats(), loadDetail(), loadList()]);
  });

  $: if (userId !== Number($page.params.userId)) {
    userId = Number($page.params.userId);
    user = null; stats = null; detail = null;
    Promise.all([loadUser(), loadStats(), loadDetail(), loadList()]);
  }

  async function loadUser() {
    userLoading = true;
    try { user = await authApiFetch(`${API_ROUTES.USER}/${userId}`); }
    catch (e) { if (!e?.isNetworkError && e?.status !== 0) errorHandle(e); }
    finally { userLoading = false; }
  }

  async function loadQueryUsers() {
    try {
      const all = await authApiFetch(`${API_ROUTES.USER}/all`);
      const canTelecaller = currentUser?.role === "master" || (currentUser?.queryAccessTelecaller ?? true);
      const canTech       = currentUser?.role === "master" || (currentUser?.queryAccessTech ?? true);
      allQueryUsers = (all ?? []).filter(u =>
        (u.subRole === "telecaller" && canTelecaller) ||
        (u.subRole === "tech" && canTech)
      );
    } catch (_) {}
  }

  function buildDateParams() {
    const p = {}, today = new Date(), fmt = d => d.toLocaleDateString("en-CA");
    if (selectedFilter === "today")      { p.dateFrom = fmt(today);                                  p.dateTo = fmt(today); }
    else if (selectedFilter === "yesterday") { const y = new Date(today); y.setDate(y.getDate()-1); p.dateFrom = fmt(y); p.dateTo = fmt(y); }
    else if (selectedFilter === "last7days") { const d = new Date(today); d.setDate(d.getDate()-6); p.dateFrom = fmt(d); p.dateTo = fmt(today); }
    else if (selectedFilter === "last30days"){ const d = new Date(today); d.setDate(d.getDate()-29);p.dateFrom = fmt(d); p.dateTo = fmt(today); }
    else if (selectedFilter === "custom" && customStartDate && customEndDate) { p.dateFrom = customStartDate; p.dateTo = customEndDate; }
    return p;
  }

  function buildUserParams(extra = {}) {
    const dp = buildDateParams(), p = new URLSearchParams();
    if (!user) return p;
    if (user.subRole === "telecaller") p.set("raisedById",   String(userId));
    else                               p.set("assignedToId", String(userId));
    if (dp.dateFrom)    p.set("dateFrom",  dp.dateFrom);
    if (dp.dateTo)      p.set("dateTo",    dp.dateTo);
    if (filterStatus)   p.set("status",    filterStatus);
    if (filterType)     p.set("type",      filterType);
    if (filterPriority) p.set("priority",  filterPriority);
    if (search)         p.set("search",    search);
    Object.entries(extra).forEach(([k,v]) => v && p.set(k, String(v)));
    return p;
  }

  function buildDetailParams() {
    const dp = buildDateParams(), p = new URLSearchParams();
    if (dp.dateFrom)    p.set("dateFrom",  dp.dateFrom);
    if (dp.dateTo)      p.set("dateTo",    dp.dateTo);
    if (filterStatus)   p.set("status",    filterStatus);
    if (filterType)     p.set("type",      filterType);
    if (filterPriority) p.set("priority",  filterPriority);
    return p;
  }

  async function loadStats() {
    if (!user) return;
    statsLoading = true; statsError = "";
    try {
      const q = buildUserParams();
      stats = await authApiFetch(`${API_ROUTES.QUERY}/dashboard?${q}`);
    } catch { statsError = "Failed to load stats."; }
    finally { statsLoading = false; }
  }

  async function loadDetail() {
    if (!user) return;
    detailLoading = true; detailError = "";
    try {
      const q = buildDetailParams();
      detail = await authApiFetch(`${API_ROUTES.QUERY}/user-detail/${userId}?${q}`);
    } catch { detailError = "Failed to load detailed stats."; }
    finally { detailLoading = false; }
  }

  async function loadList() {
    if (!user) return;
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) return;
    listLoading = true;
    try {
      const q = buildUserParams({ page: currentPage, limit: rowsPerPage });
      const res = await authApiFetch(`${API_ROUTES.QUERY}?${q}`);
      queries = res.data ?? []; totalItems = res.total ?? 0; totalPages = res.totalPages ?? 0;
    } catch (e) { if (!e?.isNetworkError && e?.status !== 0) errorHandle(e); }
    finally { listLoading = false; }
  }

  function onFilterChange() { currentPage = 1; if (user) { loadStats(); loadDetail(); loadList(); } }
  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; if (user) { loadStats(); loadDetail(); loadList(); } }, 400);
  }
  function clearFilters() {
    search = ""; filterStatus = ""; filterType = ""; filterPriority = "";
    selectedFilter = "last7days"; customStartDate = ""; customEndDate = "";
    currentPage = 1; if (user) { loadStats(); loadDetail(); loadList(); }
  }
  function switchUser(id) { id = Number(id); if (id !== userId) goto(`/admin/query/user/${id}`); }

  $: hasFilters = search || filterStatus || filterType || filterPriority || selectedFilter !== "last7days";

  // keep switcher dropdown in sync when userId changes (e.g. back/forward navigation)
  let selectedUserId = userId;
  $: selectedUserId = userId;

  // ── Chart / display helpers ──────────────────────────────────────────────────
  function fmtMins(m) {
    if (m === null || m === undefined) return "-";
    if (m < 1) return `${Math.round(m * 60)}s`;
    if (m < 60) return `${Math.round(m)}m`;
    return `${Math.floor(m/60)}h ${Math.round(m%60)}m`;
  }
  function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }
  function formatDateShort(d) {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short" });
  }
  function initials(name) { return name ? name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?"; }
  function subRoleLabel(sr) { return sr === "telecaller" ? "Telecaller" : sr === "tech" ? "Tech" : sr ?? "-"; }
  const isTelecaller = u => u?.subRole === "telecaller";
  function typeLabel(v) { return QUERY_TYPES.find(t => t.value === v)?.label ?? v ?? "-"; }

  function trendMax(data) { return Math.max(...data.map(d => d.total), 1); }

  function heatColor(count, max) {
    if (!count || !max) return "#f3f4f6";
    const intensity = Math.min(count / max, 1);
    // from light-blue to deep blue
    const r = Math.round(219 - intensity * 160);
    const g = Math.round(234 - intensity * 140);
    const b = Math.round(254 - intensity * 50);
    return `rgb(${r},${g},${b})`;
  }

  $: heatMax = detail ? Math.max(...detail.activityHeatmap, 1) : 1;

  function replyPct(count, total) { return total > 0 ? Math.round(count / total * 100) : 0; }

  $: maskTC   = (name) => (currentUser?.role === "master" && $queryPrivacy.telecaller && name) ? "Telecaller" : (name ?? "-");
  $: maskTech = (name) => (currentUser?.role === "master" && $queryPrivacy.tech       && name) ? "Tech"        : (name ?? "-");
  $: maskedUserName     = user ? (isTelecaller(user) ? maskTC(user.name) : maskTech(user.name)) : "";
  $: maskedUserInitials = maskedUserName ? initials(maskedUserName) : "?";
  $: replyTotal = detail
    ? detail.replyDistribution.under1min + detail.replyDistribution._1to5min +
      detail.replyDistribution._5to15min + detail.replyDistribution.over15min
    : 0;

  function compLabel(userVal, teamVal, lower = true) {
    if (teamVal === null || userVal === null) return null;
    const better = lower ? userVal <= teamVal : userVal >= teamVal;
    return { better, diff: Math.abs(userVal - teamVal) };
  }

  // ── PDF Export ────────────────────────────────────────────────────────────────
  async function exportPdf() {
    if (exportingPdf) return;
    exportingPdf = true;
    await tick(); // let Svelte hide filter bar before capture

    try {
      pdfMake.vfs = pdfFonts.vfs;

      // 1. Build PDF header text
      const dp = buildDateParams();
      const periodLabel = dp.dateFrom ? `${dp.dateFrom}  →  ${dp.dateTo}` : "All Time";
      const content = [];
      content.push({
        text: `Query Stats — ${maskedUserName} (${subRoleLabel(user?.subRole)})`,
        fontSize: 14, bold: true, margin: [0, 0, 0, 3],
      });
      content.push({
        text: `Period: ${periodLabel}   ·   Exported: ${new Date().toLocaleString("en-IN")}`,
        fontSize: 8.5, color: "#6c757d", margin: [0, 0, 0, 12],
      });

      // 2. Capture each visual section via html2canvas
      const sections = Array.from(document.querySelectorAll(".pdf-section"));
      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: 1.5,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        content.push({
          image: canvas.toDataURL("image/jpeg", 0.88),
          width: 515,
          margin: [0, 0, 0, 8],
        });
      }

      // 3. Fetch ALL queries for the current filters (no pagination)
      const allQ = buildUserParams({ page: 1, limit: 1000 });
      let allQueries = [];
      try {
        const res = await authApiFetch(`${API_ROUTES.QUERY}?${allQ}`);
        allQueries = res.data ?? [];
      } catch (_) {}

      // 4. Build query list table
      if (allQueries.length > 0) {
        const isTc = isTelecaller(user);
        const tableBody = [
          // header row
          [
            { text: "#",                                 bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: "Subject",                           bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: isTc ? "Assigned To" : "Raised By", bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: "Type",                              bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: "Priority",                          bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: "Status",                            bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: "Delay",                             bold: true, fontSize: 8, fillColor: "#f1f3f5" },
            { text: "Raised At",                         bold: true, fontSize: 8, fillColor: "#f1f3f5" },
          ],
          // data rows
          ...allQueries.map((q, i) => {
            const person = isTc
              ? (q.assignedTo?.name ? maskTech(q.assignedTo.name) : "Unassigned")
              : maskTC(q.raisedBy?.name ?? "-");
            const delay = q.slaBreached
              ? `! ${fmtMins(q.firstResponseMins)}`
              : q.firstResponseMins != null ? fmtMins(q.firstResponseMins) : "-";
            const fill = i % 2 === 1 ? "#fafafa" : null;
            return [
              { text: String(i + 1),                              fontSize: 7.5, fillColor: fill },
              { text: q.subject ?? "-",                           fontSize: 7.5, fillColor: fill },
              { text: person,                                     fontSize: 7.5, fillColor: fill },
              { text: typeLabel(q.type),                          fontSize: 7.5, fillColor: fill },
              { text: q.priority ?? "-",                          fontSize: 7.5, fillColor: fill },
              { text: (q.status ?? "-").replace("_", " "),        fontSize: 7.5, fillColor: fill },
              { text: delay,                                      fontSize: 7.5, fillColor: fill },
              { text: formatDate(q.createdAt),                    fontSize: 7,   fillColor: fill },
            ];
          }),
        ];

        content.push({
          text: `${isTc ? "Queries Raised" : "Queries Assigned"} — ${allQueries.length} record${allQueries.length !== 1 ? "s" : ""}`,
          fontSize: 10, bold: true, pageBreak: "before", margin: [0, 0, 0, 8],
        });
        content.push({
          table: {
            headerRows: 1,
            widths: ["auto", "*", 75, 58, 38, 45, 36, 68],
            body: tableBody,
          },
          layout: "lightHorizontalLines",
        });
      }

      // 5. Download PDF
      const safeName = maskedUserName.replace(/\s+/g, "_").toLowerCase();
      const dateStr  = new Date().toISOString().split("T")[0];
      pdfMake.createPdf({ pageSize: "A4", pageMargins: [30, 30, 30, 30], content })
        .download(`${safeName}-stats-${dateStr}.pdf`);

    } catch (e) {
      console.error("PDF export failed:", e);
      Swal.fire({ icon: "error", title: "Export Failed", text: "Could not generate PDF. Please try again." });
    } finally {
      exportingPdf = false;
    }
  }
</script>

<div class="page-wrapper">
  <div class="content">

    <!-- Back + title -->
    <div class="d-flex align-items-center gap-2 mb-3">
      <button class="btn btn-sm btn-outline-secondary" on:click={() => history.back()}>
        <i class="ti ti-arrow-left"></i> Back
      </button>
      <h4 class="fw-bold mb-0">Query User Dashboard</h4>
      {#if user && stats && detail}
        <button class="btn btn-sm btn-outline-success ms-auto"
          on:click={exportPdf}
          disabled={exportingPdf || statsLoading || detailLoading || listLoading}>
          {#if exportingPdf}
            <span class="spinner-border spinner-border-sm me-1" style="width:12px;height:12px;"></span>Generating…
          {:else}
            <i class="ti ti-file-type-pdf me-1"></i>Export PDF
          {/if}
        </button>
      {/if}
    </div>

    <!-- ── User header ────────────────────────────────────────────────────────── -->
    {#if userLoading}
      <div class="user-header-card mb-4">
        <div class="placeholder-glow d-flex gap-3 align-items-center">
          <div class="placeholder rounded-circle" style="width:52px;height:52px;"></div>
          <div><div class="placeholder col-5 mb-1" style="height:18px;"></div><div class="placeholder col-3" style="height:12px;"></div></div>
        </div>
      </div>
    {:else if user}
      <div class="user-header-card mb-4 pdf-section">
        <div class="d-flex align-items-center gap-3">
          <div class="user-avatar user-avatar--{user.subRole ?? 'other'} flex-shrink-0">{maskedUserInitials}</div>
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-bold fs-5">{maskedUserName}</span>
              <span class="badge {isTelecaller(user) ? 'bg-warning text-dark' : 'bg-teal text-white'}">{subRoleLabel(user.subRole)}</span>
              <span class="badge {user.status === 'active' ? 'bg-success' : 'bg-secondary'}" style="font-size:10px;">{user.status ?? "active"}</span>
            </div>
            <div class="text-muted small mt-1">{user.email ?? ""}</div>
          </div>
          <div class="flex-shrink-0" class:pdf-hide={exportingPdf}>
            <label class="form-label mb-1 text-muted" style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Switch User</label>
            <select class="form-select form-select-sm" style="width:210px;"
              bind:value={selectedUserId} on:change={() => switchUser(selectedUserId)}>
              {#if allQueryUsers.filter(u => u.subRole === 'telecaller').length}
                <optgroup label="Telecallers">
                  {#each allQueryUsers.filter(u => u.subRole === 'telecaller') as u}
                    <option value={u.id}>{u.name}</option>
                  {/each}
                </optgroup>
              {/if}
              {#if allQueryUsers.filter(u => u.subRole === 'tech').length}
                <optgroup label="Tech">
                  {#each allQueryUsers.filter(u => u.subRole === 'tech') as u}
                    <option value={u.id}>{u.name}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="d-flex align-items-center gap-2 flex-wrap mt-3 pt-3 border-top" class:pdf-hide={exportingPdf}>
          <select class="form-select form-select-sm" style="width:155px;" bind:value={selectedFilter} on:change={onFilterChange}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>
          {#if selectedFilter === "custom"}
            <input type="date" class="form-control form-control-sm" style="width:140px;" bind:value={customStartDate} on:change={onFilterChange} />
            <input type="date" class="form-control form-control-sm" style="width:140px;" bind:value={customEndDate} on:change={onFilterChange} />
          {/if}
          <div class="input-icon input-icon-start position-relative" style="width:180px;">
            <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
            <input type="text" class="form-control form-control-sm" placeholder="Search…" bind:value={search} on:input={onSearchInput} />
          </div>
          <select class="form-select form-select-sm" style="width:135px;" bind:value={filterStatus}   on:change={onFilterChange}>
            {#each STATUSES    as s}<option value={s.value}>{s.label}</option>{/each}
          </select>
          <select class="form-select form-select-sm" style="width:145px;" bind:value={filterType}     on:change={onFilterChange}>
            {#each QUERY_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
          </select>
          <select class="form-select form-select-sm" style="width:125px;" bind:value={filterPriority} on:change={onFilterChange}>
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {#if hasFilters}
            <button class="btn btn-sm btn-outline-secondary" on:click={clearFilters}><i class="ti ti-x me-1"></i>Clear</button>
          {/if}
          <button class="btn btn-sm btn-outline-primary ms-auto"
            on:click={() => { loadStats(); loadDetail(); loadList(); }} disabled={statsLoading || detailLoading}>
            <i class="ti ti-refresh me-1"></i>Refresh
          </button>
        </div>
      </div>
    {/if}

    <!-- ── Stats cards ────────────────────────────────────────────────────────── -->
    {#if statsLoading}
      <div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span><span class="text-muted small ms-2">Loading…</span></div>
    {:else if stats && user}
      <div class="pdf-section">
      <div class="section-label">Status Overview</div>
      <div class="row g-3 mb-4">
        {#if isTelecaller(user)}
          <div class="col-6 col-md-2"><div class="stat-card stat-card--primary">  <div class="stat-icon"><i class="ti ti-help-circle"></i></div><div class="stat-value">{stats.open}</div><div class="stat-label">Open</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--warning">  <div class="stat-icon"><i class="ti ti-loader"></i></div><div class="stat-value">{stats.inProgress}</div><div class="stat-label">In Progress</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--danger">   <div class="stat-icon"><i class="ti ti-refresh"></i></div><div class="stat-value">{stats.reopened}</div><div class="stat-label">Reopened</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--success">  <div class="stat-icon"><i class="ti ti-circle-check"></i></div><div class="stat-value">{stats.resolvedToday}</div><div class="stat-label">Resolved Today</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--secondary"><div class="stat-icon"><i class="ti ti-check"></i></div><div class="stat-value">{stats.totalResolved}</div><div class="stat-label">Total Resolved</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--teal">     <div class="stat-icon"><i class="ti ti-flag-check"></i></div><div class="stat-value">{stats.finalQuotationSent}</div><div class="stat-label">Final Quot. Sent</div></div></div>
        {:else}
          <div class="col-6 col-md-2"><div class="stat-card stat-card--warning">  <div class="stat-icon"><i class="ti ti-loader"></i></div><div class="stat-value">{stats.inProgress}</div><div class="stat-label">In Progress</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--success">  <div class="stat-icon"><i class="ti ti-circle-check"></i></div><div class="stat-value">{stats.resolvedToday}</div><div class="stat-label">Resolved Today</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--secondary"><div class="stat-icon"><i class="ti ti-check"></i></div><div class="stat-value">{stats.totalResolved}</div><div class="stat-label">Total Resolved</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--danger">   <div class="stat-icon"><i class="ti ti-refresh"></i></div><div class="stat-value">{stats.reopened}</div><div class="stat-label">Reopened</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--primary">  <div class="stat-icon"><i class="ti ti-clock-exclamation"></i></div><div class="stat-value">{stats.slaBreachCount}</div><div class="stat-label">SLA Breaches</div></div></div>
          <div class="col-6 col-md-2"><div class="stat-card stat-card--orange">   <div class="stat-icon"><i class="ti ti-alert-triangle"></i></div><div class="stat-value">{stats.totalMistakes}</div><div class="stat-label">Total Mistakes</div></div></div>
        {/if}
      </div>

      <!-- Performance metrics -->
      <div class="section-label">Performance Metrics</div>
      <div class="row g-3 mb-4">
        <div class="col-md-3">
          <div class="perf-card perf-card--blue">
            <div class="perf-card-title"><i class="ti ti-clock-reply"></i> Reply Time</div>
            {#if isTelecaller(user)}
              <div class="perf-row"><span class="perf-label">Avg reply</span><span class="perf-val">{fmtMins(stats.avgTelecallerReplyMins)}</span></div>
            {:else}
              <div class="perf-row"><span class="perf-label">Avg first response</span><span class="perf-val">{fmtMins(stats.avgFirstResponseMins)}</span></div>
              <div class="perf-row"><span class="perf-label">Avg resolution</span><span class="perf-val">{fmtMins(stats.avgResolutionMins)}</span></div>
            {/if}
            {#if detail}
              <div class="perf-row"><span class="perf-label">Median reply</span><span class="perf-val">{fmtMins(detail.replyDistribution.medianMins)}</span></div>
              <div class="perf-row"><span class="perf-label">Fastest reply</span><span class="perf-val text-success">{fmtMins(detail.replyDistribution.minMins)}</span></div>
              <div class="perf-row"><span class="perf-label">Slowest reply</span><span class="perf-val text-danger">{fmtMins(detail.replyDistribution.maxMins)}</span></div>
            {/if}
          </div>
        </div>
        <div class="col-md-3">
          <div class="perf-card {stats.totalMistakes > 0 ? 'perf-card--red' : 'perf-card--green'}">
            <div class="perf-card-title">
              <i class="ti ti-alert-triangle"></i> Mistakes
              <span class="perf-badge {stats.totalMistakes > 0 ? 'perf-badge--red' : 'perf-badge--green'}">{stats.totalMistakes}</span>
            </div>
            <div class="perf-row"><span class="perf-label">Missed replies</span><span class="perf-val {stats.totalMissedReplies > 0 ? 'text-danger' : ''}">{stats.totalMissedReplies}</span></div>
            <div class="perf-row"><span class="perf-label">Slow replies</span><span class="perf-val {stats.totalSlowReplies > 0 ? 'text-warning' : ''}">{stats.totalSlowReplies}</span></div>
            <div class="perf-row"><span class="perf-label">Reopened</span><span class="perf-val {stats.totalReopenedQueries > 0 ? 'text-danger' : ''}">{stats.totalReopenedQueries}</span></div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="perf-card {stats.slaBreachCount > 0 ? 'perf-card--orange' : 'perf-card--green'}">
            <div class="perf-card-title">
              <i class="ti ti-clock-exclamation"></i> Delay
              {#if stats.slaBreachCount > 0}<span class="perf-badge perf-badge--orange">{stats.slaBreachCount} breached</span>{/if}
            </div>
            <div class="perf-row"><span class="perf-label">Avg first response</span><span class="perf-val">{fmtMins(stats.avgFirstResponseMins)}</span></div>
            <div class="perf-row"><span class="perf-label">SLA threshold</span><span class="perf-val">{stats.slaMinutes} min</span></div>
          </div>
        </div>
        {#if isTelecaller(user)}
          <div class="col-md-3">
            <div class="perf-card perf-card--teal">
              <div class="perf-card-title"><i class="ti ti-flag-check"></i> Final Quotation</div>
              <div class="perf-row"><span class="perf-label">Sent</span><span class="perf-val text-success fw-bold">{stats.finalQuotationSent}</span></div>
              <div class="perf-row"><span class="perf-label">Pending</span><span class="perf-val {stats.finalQuotationPending > 0 ? 'text-warning' : 'text-success'}">{stats.finalQuotationPending}</span></div>
              <div class="perf-row">
                <span class="perf-label">Coverage</span>
                <span class="perf-val">
                  {(stats.finalQuotationSent + stats.finalQuotationPending) > 0
                    ? Math.round(stats.finalQuotationSent / (stats.finalQuotationSent + stats.finalQuotationPending) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        {:else}
          <div class="col-md-3">
            <div class="perf-card perf-card--blue">
              <div class="perf-card-title"><i class="ti ti-chart-bar"></i> Activity</div>
              <div class="perf-row"><span class="perf-label">Resolved today</span><span class="perf-val text-success fw-bold">{stats.resolvedToday}</span></div>
              <div class="perf-row"><span class="perf-label">Total resolved</span><span class="perf-val">{stats.totalResolved}</span></div>
              <div class="perf-row"><span class="perf-label">Avg tech reply</span><span class="perf-val">{fmtMins(stats.avgTechReplyMins)}</span></div>
            </div>
          </div>
        {/if}
      </div>
      </div><!-- /pdf-section stats+perf -->
    {/if}

    <!-- ── Detailed analytics ─────────────────────────────────────────────────── -->
    {#if detailLoading}
      <div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span><span class="text-muted small ms-2">Loading analytics…</span></div>
    {:else if detail}

      <!-- Row 1: Trend chart + Resolution rate + Type breakdown -->
      <div class="row g-3 mb-4 pdf-section">

        <!-- Trend chart -->
        <div class="col-lg-6">
          <div class="detail-card h-100">
            <div class="detail-card-title"><i class="ti ti-chart-bar"></i> Activity Trend</div>
            {#if detail.trendData.length === 0}
              <div class="empty-hint">No data for selected period</div>
            {:else}
              {@const mx = trendMax(detail.trendData)}
              <div class="trend-chart">
                {#each detail.trendData as d}
                  <div class="trend-col" title="{formatDateShort(d.date)}: {d.total} raised, {d.resolved} resolved">
                    <div class="trend-bars">
                      <div class="trend-bar trend-bar--total"   style="height:{Math.round(d.total    / mx * 100)}%"></div>
                      <div class="trend-bar trend-bar--resolved"style="height:{Math.round(d.resolved / mx * 100)}%"></div>
                    </div>
                    <div class="trend-label">{formatDateShort(d.date)}</div>
                  </div>
                {/each}
              </div>
              <div class="trend-legend">
                <span class="trend-legend-dot trend-legend-dot--total"></span>Raised
                <span class="trend-legend-dot trend-legend-dot--resolved ms-3"></span>Resolved
              </div>
            {/if}
          </div>
        </div>

        <!-- Resolution rate + vs team -->
        <div class="col-lg-3">
          <div class="detail-card h-100">
            <div class="detail-card-title"><i class="ti ti-chart-pie"></i> Resolution Rate</div>
            <div class="res-rate-wrap">
              <svg viewBox="0 0 36 36" class="res-donut">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#f1f3f5" stroke-width="3.5"/>
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#198754" stroke-width="3.5"
                  stroke-dasharray="{detail.resolutionRate} {100 - detail.resolutionRate}"
                  stroke-dashoffset="25" stroke-linecap="round"/>
              </svg>
              <div class="res-rate-label">
                <span class="res-rate-pct">{detail.resolutionRate}%</span>
                <span class="res-rate-sub">resolved</span>
              </div>
            </div>
            <div class="res-stats">
              <div class="res-stat-row"><span class="perf-label">Total</span><span class="perf-val">{detail.totalQueries}</span></div>
              <div class="res-stat-row"><span class="perf-label">Resolved</span><span class="perf-val text-success">{detail.resolvedCount}</span></div>
              <div class="res-stat-row"><span class="perf-label">Reopened</span><span class="perf-val {detail.reopenedCount > 0 ? 'text-danger' : ''}">{detail.reopenedCount}</span></div>
              {#if detail.teamResolutionRate !== null}
                {@const cmp = compLabel(detail.resolutionRate, detail.teamResolutionRate, false)}
                <div class="res-stat-row border-top mt-1 pt-1">
                  <span class="perf-label">Team avg</span>
                  <span class="perf-val">{detail.teamResolutionRate}%</span>
                </div>
                <div class="vs-team-badge {cmp?.better ? 'vs-team--good' : 'vs-team--bad'}">
                  <i class="ti ti-{cmp?.better ? 'trending-up' : 'trending-down'}"></i>
                  {cmp?.better ? "Better" : "Below"} team by {cmp?.diff}%
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- Query type breakdown -->
        <div class="col-lg-3">
          <div class="detail-card h-100">
            <div class="detail-card-title"><i class="ti ti-tags"></i> Query Types</div>
            {#if detail.typeBreakdown.length === 0}
              <div class="empty-hint">No data</div>
            {:else}
              {@const typeMax = Math.max(...detail.typeBreakdown.map(t => t.count))}
              <div class="type-list">
                {#each detail.typeBreakdown as t}
                  <div class="type-row">
                    <span class="type-name">{typeLabel(t.type)}</span>
                    <div class="type-bar-wrap">
                      <div class="type-bar" style="width:{Math.round(t.count / typeMax * 100)}%"></div>
                    </div>
                    <span class="type-count">{t.count}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Row 2: Reply time distribution + Activity heatmap -->
      <div class="row g-3 mb-4 pdf-section">

        <!-- Reply time distribution -->
        <div class="col-lg-5">
          <div class="detail-card h-100">
            <div class="detail-card-title"><i class="ti ti-clock-reply"></i> Reply Time Distribution</div>
            {#if replyTotal === 0}
              <div class="empty-hint">No reply data for this period</div>
            {:else}
              <!-- Segmented bar -->
              <div class="dist-bar-wrap mb-3">
                {#if detail.replyDistribution.under1min > 0}
                  <div class="dist-seg dist-seg--green"  style="flex:{detail.replyDistribution.under1min}"  title="< 1 min: {detail.replyDistribution.under1min}"></div>
                {/if}
                {#if detail.replyDistribution._1to5min > 0}
                  <div class="dist-seg dist-seg--blue"   style="flex:{detail.replyDistribution._1to5min}"   title="1–5 min: {detail.replyDistribution._1to5min}"></div>
                {/if}
                {#if detail.replyDistribution._5to15min > 0}
                  <div class="dist-seg dist-seg--orange" style="flex:{detail.replyDistribution._5to15min}"  title="5–15 min: {detail.replyDistribution._5to15min}"></div>
                {/if}
                {#if detail.replyDistribution.over15min > 0}
                  <div class="dist-seg dist-seg--red"    style="flex:{detail.replyDistribution.over15min}"   title="> 15 min: {detail.replyDistribution.over15min}"></div>
                {/if}
              </div>
              <div class="dist-legend">
                <span class="dist-dot dist-dot--green"></span> &lt;1m <strong>{replyPct(detail.replyDistribution.under1min, replyTotal)}%</strong>
                <span class="dist-dot dist-dot--blue  ms-2"></span> 1–5m <strong>{replyPct(detail.replyDistribution._1to5min,  replyTotal)}%</strong>
                <span class="dist-dot dist-dot--orange ms-2"></span> 5–15m <strong>{replyPct(detail.replyDistribution._5to15min, replyTotal)}%</strong>
                <span class="dist-dot dist-dot--red   ms-2"></span> &gt;15m <strong>{replyPct(detail.replyDistribution.over15min,  replyTotal)}%</strong>
              </div>
              <div class="dist-stats mt-3">
                <div class="dist-stat"><span class="dist-stat-label">Min</span><span class="dist-stat-val text-success">{fmtMins(detail.replyDistribution.minMins)}</span></div>
                <div class="dist-stat"><span class="dist-stat-label">Median</span><span class="dist-stat-val">{fmtMins(detail.replyDistribution.medianMins)}</span></div>
                <div class="dist-stat"><span class="dist-stat-label">Max</span><span class="dist-stat-val text-danger">{fmtMins(detail.replyDistribution.maxMins)}</span></div>
                <div class="dist-stat"><span class="dist-stat-label">Total replies</span><span class="dist-stat-val">{replyTotal}</span></div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Activity heatmap -->
        <div class="col-lg-7">
          <div class="detail-card h-100">
            <div class="detail-card-title"><i class="ti ti-grid-dots"></i> Working Hours Heatmap <span class="text-muted fw-normal" style="font-size:10px;">(IST)</span></div>
            <div class="heatmap-grid">
              {#each detail.activityHeatmap as count, hr}
                <div class="heatmap-cell" style="background:{heatColor(count, heatMax)};"
                  title="{hr.toString().padStart(2,'0')}:00 — {count} message{count !== 1 ? 's' : ''}">
                  <span class="heatmap-hr">{hr.toString().padStart(2,'0')}</span>
                  {#if count > 0}<span class="heatmap-count">{count}</span>{/if}
                </div>
              {/each}
            </div>
            <div class="heatmap-legend mt-2">
              <span class="text-muted" style="font-size:10px;">Less</span>
              {#each [0.1, 0.3, 0.5, 0.7, 1.0] as i}
                <div class="heatmap-legend-cell" style="background:{heatColor(i, 1)};"></div>
              {/each}
              <span class="text-muted" style="font-size:10px;">More</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 3: Stuck queries + Mistake details -->
      <div class="row g-3 mb-4 pdf-section">

        <!-- Stuck / oldest open queries -->
        <div class="col-lg-6">
          <div class="detail-card">
            <div class="detail-card-title"><i class="ti ti-clock-pause text-warning"></i> Stuck Queries <span class="text-muted fw-normal" style="font-size:10px;">(oldest unresolved)</span></div>
            {#if detail.stuckQueries.length === 0}
              <div class="empty-hint text-success"><i class="ti ti-circle-check me-1"></i>No stuck queries — great!</div>
            {:else}
              <div class="table-responsive">
                <table class="table table-sm align-middle mb-0" style="font-size:12.5px;">
                  <thead class="table-light">
                    <tr><th>Subject</th><th>Status</th><th>Priority</th><th>Age</th><th></th></tr>
                  </thead>
                  <tbody>
                    {#each detail.stuckQueries as q}
                      <tr>
                        <td class="fw-semibold">{q.subject}</td>
                        <td><span class={STATUS_COLORS[q.status] ?? "badge bg-secondary"} style="font-size:10px;">{q.status?.replace("_"," ")}</span></td>
                        <td><span class={PRIORITY_COLORS[q.priority] ?? "badge bg-secondary"} style="font-size:10px;">{q.priority}</span></td>
                        <td>
                          <span class="fw-semibold {q.daysSince >= 3 ? 'text-danger' : q.daysSince >= 1 ? 'text-warning' : ''}">
                            {q.daysSince === 0 ? "Today" : q.daysSince === 1 ? "1 day" : `${q.daysSince} days`}
                          </span>
                        </td>
                        <td><a href="/admin/query/{q.id}" class="btn btn-xs btn-outline-primary"><i class="ti ti-eye"></i></a></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>

        <!-- Mistake details -->
        <div class="col-lg-6">
          <div class="detail-card">
            <div class="detail-card-title d-flex align-items-center">
              <span><i class="ti ti-alert-triangle text-danger"></i> Mistake Details</span>
              {#if detail.mistakeDetails.length > 0}
                <button class="btn btn-xs btn-outline-secondary ms-auto" on:click={() => showMistakes = !showMistakes}>
                  {showMistakes ? "Hide" : "Show all"} ({detail.mistakeDetails.length})
                </button>
              {/if}
            </div>
            {#if detail.mistakeDetails.length === 0}
              <div class="empty-hint text-success"><i class="ti ti-circle-check me-1"></i>No mistakes — perfect!</div>
            {:else}
              <div class="mistake-list">
                {#each (showMistakes ? detail.mistakeDetails : detail.mistakeDetails.slice(0, 4)) as m}
                  <div class="mistake-row mistake-row--{m.type}">
                    <div class="mistake-icon">
                      {#if m.type === "missed"}<i class="ti ti-message-off"></i>{:else}<i class="ti ti-clock-x"></i>{/if}
                    </div>
                    <div class="mistake-body">
                      <span class="mistake-subject">{m.subject ?? `Query #${m.queryId}`}</span>
                      <span class="mistake-meta">
                        {m.type === "missed" ? "No reply" : "Slow reply"} · {fmtMins(m.gapMins)} · {formatDate(m.at)}
                      </span>
                    </div>
                    <a href="/admin/query/{m.queryId}" class="btn btn-xs btn-outline-secondary ms-auto"><i class="ti ti-eye"></i></a>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Final quotation list (telecaller only) -->
      {#if isTelecaller(user) && detail.finalList.length > 0}
        <div class="detail-card mb-4 pdf-section">
          <div class="detail-card-title"><i class="ti ti-flag-check text-success"></i> Final Quotation List</div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0" style="font-size:12.5px;">
              <thead class="table-light">
                <tr><th>Subject</th><th>Status</th><th>Order</th><th>Flagged At</th><th></th></tr>
              </thead>
              <tbody>
                {#each detail.finalList as f}
                  <tr>
                    <td class="fw-semibold">{f.subject}</td>
                    <td><span class={STATUS_COLORS[f.status] ?? "badge bg-secondary"} style="font-size:10px;">{f.status?.replace("_"," ")}</span></td>
                    <td>
                      {#if f.orderId}
                        <a href="/admin/order/{f.orderId}" class="text-primary small">#{f.orderPId}{f.orderTitle ? ` — ${f.orderTitle}` : ""}</a>
                      {:else}<span class="text-muted">-</span>{/if}
                    </td>
                    <td class="text-muted small">{formatDate(f.flaggedAt)}</td>
                    <td><a href="/admin/query/{f.queryId}" class="btn btn-xs btn-outline-primary"><i class="ti ti-eye"></i></a></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}

    <!-- ── Query list ─────────────────────────────────────────────────────────── -->
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div class="section-label mb-0">{user ? (isTelecaller(user) ? "Queries Raised" : "Queries Assigned") : "Queries"}</div>
      <span class="text-muted small">{totalItems} total</span>
    </div>
    {#if listLoading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if queries.length === 0}
      <div class="text-center py-5 text-muted"><i class="ti ti-help-circle fs-1 d-block mb-2"></i>No queries found.</div>
    {:else}
      <div class="card border-0 shadow-sm mb-0">
        <div class="card-body p-3">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>#</th><th>Subject</th>
                  <th>{isTelecaller(user) ? "Assigned To" : "Raised By"}</th>
                  <th>Type</th><th>Priority</th><th>Status</th>
                  <th>Final Quot.</th><th>Delay</th><th>Raised At</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {#each queries as q, i}
                  <tr>
                    <td>{(currentPage-1)*rowsPerPage+i+1}</td>
                    <td><a href="/admin/query/{q.id}" class="text-primary fw-semibold">{q.subject}</a></td>
                    {#if isTelecaller(user)}
                      <td>{#if q.assignedTo?.name}{maskTech(q.assignedTo.name)}{:else}<span class="text-muted">Unassigned</span>{/if}</td>
                    {:else}
                      <td>{maskTC(q.raisedBy?.name)}</td>
                    {/if}
                    <td><span class="badge bg-light text-dark border" style="font-size:11px;">{typeLabel(q.type)}</span></td>
                    <td><span class={PRIORITY_COLORS[q.priority] ?? "badge bg-secondary"} style="font-size:11px;">{q.priority ?? "-"}</span></td>
                    <td><span class={STATUS_COLORS[q.status] ?? "badge bg-secondary"}>{q.status?.replace("_"," ")}</span></td>
                    <td>
                      {#if q.hasFinalQuotation}
                        <span class="badge bg-success" style="font-size:10px;"><i class="ti ti-flag-check me-1"></i>Sent</span>
                      {:else}
                        <span class="badge bg-light text-muted border" style="font-size:10px;">Pending</span>
                      {/if}
                    </td>
                    <td>
                      {#if q.slaBreached}
                        <span class="badge bg-danger" style="font-size:10px;"><i class="ti ti-clock-exclamation me-1"></i>{fmtMins(q.firstResponseMins)}</span>
                      {:else if q.firstResponseMins !== null && q.firstResponseMins !== undefined}
                        <span class="badge bg-success" style="font-size:10px;">{fmtMins(q.firstResponseMins)}</span>
                      {:else}
                        <span class="text-muted small">-</span>
                      {/if}
                    </td>
                    <td class="small text-muted">{formatDate(q.createdAt)}</td>
                    <td><a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary"><i class="ti ti-eye"></i></a></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <Pagination {currentPage} {totalPages} {rowsPerPage}
            on:pageChange={e => { currentPage = e.detail; loadList(); }}
            on:rowsPerPageChange={e => { rowsPerPage = e.detail; currentPage = 1; loadList(); }} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .bg-teal { background: #0ca678 !important; }
  .pdf-hide { display: none !important; }
  .section-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:#adb5bd; margin-bottom:10px; }

  /* User header */
  .user-header-card { background:#fff; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.07); padding:20px 22px; }
  .user-avatar { width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; flex-shrink:0; color:#fff; }
  .user-avatar--telecaller { background:#f59f00; }
  .user-avatar--tech { background:#0ca678; }
  .user-avatar--other { background:#6c757d; }

  /* Stat cards */
  .stat-card { background:#fff; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.06); padding:16px 14px 14px; text-align:center; border-top:3px solid transparent; }
  .stat-icon { font-size:20px; opacity:0.5; margin-bottom:4px; }
  .stat-value { font-size:1.6rem; font-weight:700; line-height:1.1; }
  .stat-label { font-size:11.5px; color:#868e96; margin-top:3px; }
  .stat-card--primary   { border-top-color:#3b5bdb; } .stat-card--primary   .stat-icon,.stat-card--primary   .stat-value { color:#3b5bdb; }
  .stat-card--warning   { border-top-color:#ffc107; } .stat-card--warning   .stat-icon,.stat-card--warning   .stat-value { color:#d97706; }
  .stat-card--danger    { border-top-color:#dc3545; } .stat-card--danger    .stat-icon,.stat-card--danger    .stat-value { color:#dc3545; }
  .stat-card--success   { border-top-color:#198754; } .stat-card--success   .stat-icon,.stat-card--success   .stat-value { color:#198754; }
  .stat-card--secondary { border-top-color:#6c757d; } .stat-card--secondary .stat-icon,.stat-card--secondary .stat-value { color:#6c757d; }
  .stat-card--teal      { border-top-color:#0ca678; } .stat-card--teal      .stat-icon,.stat-card--teal      .stat-value { color:#0ca678; }
  .stat-card--orange    { border-top-color:#fd7e14; } .stat-card--orange    .stat-icon,.stat-card--orange    .stat-value { color:#fd7e14; }

  /* Perf cards */
  .perf-card { background:#fff; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.06); padding:16px; border-left:4px solid transparent; height:100%; }
  .perf-card--blue   { border-left-color:#3b5bdb; } .perf-card--red  { border-left-color:#dc3545; }
  .perf-card--green  { border-left-color:#198754; } .perf-card--orange { border-left-color:#fd7e14; } .perf-card--teal { border-left-color:#0ca678; }
  .perf-card-title { font-size:12px; font-weight:700; color:#343a40; display:flex; align-items:center; gap:6px; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f3f5; }
  .perf-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0; border-bottom:1px solid #f8f9fa; font-size:12px; }
  .perf-row:last-child { border-bottom:none; }
  .perf-label { color:#868e96; } .perf-val { font-weight:600; color:#343a40; }
  .perf-badge { margin-left:auto; font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:20px; }
  .perf-badge--red   { background:#fff0f0; color:#dc3545; border:1px solid #f5c6cb; }
  .perf-badge--green { background:#edfaf3; color:#198754; border:1px solid #c3e6cb; }
  .perf-badge--orange{ background:#fff3e6; color:#fd7e14; border:1px solid #fcd3a5; }

  /* Detail cards */
  .detail-card { background:#fff; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.06); padding:18px; }
  .detail-card-title { font-size:12px; font-weight:700; color:#343a40; display:flex; align-items:center; gap:6px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #f1f3f5; }
  .detail-card-title i { font-size:14px; opacity:0.7; }
  .empty-hint { text-align:center; color:#adb5bd; font-size:13px; padding:20px 0; }

  /* Trend chart */
  .trend-chart { display:flex; align-items:flex-end; gap:4px; height:120px; overflow-x:auto; padding-bottom:4px; }
  .trend-col { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:28px; flex:1; }
  .trend-bars { display:flex; align-items:flex-end; gap:2px; height:100px; width:100%; justify-content:center; }
  .trend-bar { width:10px; border-radius:3px 3px 0 0; transition:height 0.3s; min-height:2px; }
  .trend-bar--total    { background:#c5cff9; }
  .trend-bar--resolved { background:#3b5bdb; }
  .trend-label { font-size:9px; color:#adb5bd; white-space:nowrap; }
  .trend-legend { display:flex; align-items:center; gap:4px; margin-top:8px; font-size:11px; color:#6c757d; }
  .trend-legend-dot { display:inline-block; width:10px; height:10px; border-radius:2px; }
  .trend-legend-dot--total    { background:#c5cff9; }
  .trend-legend-dot--resolved { background:#3b5bdb; }

  /* Resolution rate donut */
  .res-rate-wrap { position:relative; width:100px; height:100px; margin:0 auto 12px; }
  .res-donut { width:100%; height:100%; transform:rotate(-90deg); }
  .res-rate-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .res-rate-pct { font-size:1.4rem; font-weight:700; color:#198754; line-height:1; }
  .res-rate-sub { font-size:10px; color:#868e96; }
  .res-stats { display:flex; flex-direction:column; gap:3px; }
  .res-stat-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:3px 0; border-bottom:1px solid #f8f9fa; }
  .res-stat-row:last-child { border-bottom:none; }
  .vs-team-badge { margin-top:8px; font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px; }
  .vs-team--good { background:#edfaf3; color:#198754; }
  .vs-team--bad  { background:#fff0f0; color:#dc3545; }

  /* Type breakdown */
  .type-list { display:flex; flex-direction:column; gap:7px; }
  .type-row { display:flex; align-items:center; gap:8px; font-size:12px; }
  .type-name { width:110px; flex-shrink:0; color:#495057; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .type-bar-wrap { flex:1; background:#f1f3f5; border-radius:4px; height:8px; overflow:hidden; }
  .type-bar { height:100%; background:#3b5bdb; border-radius:4px; transition:width 0.3s; }
  .type-count { width:24px; text-align:right; font-weight:600; color:#343a40; flex-shrink:0; }

  /* Reply time distribution */
  .dist-bar-wrap { display:flex; height:14px; border-radius:6px; overflow:hidden; gap:1px; }
  .dist-seg { border-radius:3px; transition:flex 0.3s; }
  .dist-seg--green  { background:#198754; }
  .dist-seg--blue   { background:#3b5bdb; }
  .dist-seg--orange { background:#fd7e14; }
  .dist-seg--red    { background:#dc3545; }
  .dist-legend { display:flex; align-items:center; gap:3px; font-size:11px; color:#6c757d; flex-wrap:wrap; }
  .dist-dot { display:inline-block; width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .dist-dot--green { background:#198754; } .dist-dot--blue { background:#3b5bdb; }
  .dist-dot--orange { background:#fd7e14; } .dist-dot--red { background:#dc3545; }
  .dist-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .dist-stat { background:#f8f9fa; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; }
  .dist-stat-label { font-size:10px; color:#adb5bd; }
  .dist-stat-val { font-size:14px; font-weight:700; color:#343a40; }

  /* Heatmap */
  .heatmap-grid { display:grid; grid-template-columns:repeat(12,1fr); gap:3px; }
  .heatmap-cell { border-radius:5px; padding:4px 2px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:default; min-height:38px; transition:transform 0.1s; }
  .heatmap-cell:hover { transform:scale(1.08); }
  .heatmap-hr { font-size:9px; color:#6c757d; font-weight:500; }
  .heatmap-count { font-size:9px; font-weight:700; color:#3b5bdb; margin-top:1px; }
  .heatmap-legend { display:flex; align-items:center; gap:3px; }
  .heatmap-legend-cell { width:14px; height:10px; border-radius:2px; }

  /* Stuck queries */
  .btn-xs { padding:2px 7px; font-size:11px; }

  /* Mistake list */
  .mistake-list { display:flex; flex-direction:column; gap:6px; }
  .mistake-row { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:8px; background:#fafafa; border:1px solid #f1f3f5; }
  .mistake-row--missed { border-left:3px solid #dc3545; }
  .mistake-row--slow   { border-left:3px solid #fd7e14; }
  .mistake-icon { font-size:16px; flex-shrink:0; margin-top:1px; }
  .mistake-row--missed .mistake-icon { color:#dc3545; }
  .mistake-row--slow   .mistake-icon { color:#fd7e14; }
  .mistake-body { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
  .mistake-subject { font-size:12.5px; font-weight:600; color:#212529; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .mistake-meta { font-size:11px; color:#868e96; }
  .user-link:hover { text-decoration:underline !important; color:#3b5bdb !important; }
</style>
