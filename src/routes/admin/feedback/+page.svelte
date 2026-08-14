<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";
  import Swal from "sweetalert2";
  import { usersAllStore } from "$lib/stores/dataStores";

  let currentUser = null;
  let loadingData = true;
  let loading = false;

  // Data
  let feedbacks = [];
  let total = 0;
  let stats = null;

  // Filters
  let search = "";
  let searchInput = "";
  let satisfactionLevel = "";
  let reason = "";
  let byUserId = "";
  let selectedFilter = "last30days";
  let customStartDate = "";
  let customEndDate = "";
  let page = 1;
  let limit = 20;

  let users = [];

  const SATISFACTION_OPTIONS = [
    { value: "", label: "All Satisfaction" },
    { value: "SATISFIED", label: "Satisfied" },
    { value: "NEUTRAL", label: "Neutral" },
    { value: "DISSATISFIED", label: "Dissatisfied" },
  ];

  const REASON_OPTIONS = [
    { value: "", label: "All Reasons" },
    { value: "Call Not Pick", label: "Call Not Pick" },
    { value: "Transportation Issue", label: "Transportation Issue" },
    { value: "Damaged", label: "Damaged / Poor Quality Material" },
    { value: "Delay", label: "Delay Machine / Material" },
    { value: "Satisfied", label: "Satisfied" },
    { value: "Documentation", label: "Documentation Issue" },
    { value: "Wrong Material", label: "Wrong Material Dispatch" },
    { value: "Timely Installation", label: "Timely Installation Pending" },
    { value: "Other", label: "Other" },
  ];

  const REASON_LABELS = {
    CALL_NOT_PICKED: "Call Not Pick",
    TRANSPORTATION_ISSUE: "Transportation Issue",
    DAMAGED_POOR_QUALITY_MATERIAL: "Damaged / Poor Quality Material Rcv",
    DELAY_MACHINE_MATERIAL: "Delay Machine / Material",
    SATISFIED: "Satisfied",
    DOCUMENTATION_ISSUE: "Documentation Issue",
    WRONG_MATERIAL_DISPATCH: "Wrong Material Dispatch",
    TIMELY_INSTALLATION_PENDING: "Timely Installation Pending",
    OTHER: "Other",
  };

  const SATISFACTION_CONFIG = {
    SATISFIED:    { cls: "bg-success", icon: "ti-mood-smile",  label: "Satisfied"    },
    NEUTRAL:      { cls: "bg-warning", icon: "ti-mood-empty",  label: "Neutral"       },
    DISSATISFIED: { cls: "bg-danger",  icon: "ti-mood-sad",    label: "Dissatisfied"  },
  };

  const DATE_FILTERS = [
    { value: "today",      label: "Today" },
    { value: "yesterday",  label: "Yesterday" },
    { value: "last7days",  label: "Last 7 Days" },
    { value: "last30days", label: "Last 30 Days" },
    { value: "custom",     label: "Custom" },
  ];

  function buildDateRange() {
    const today = new Date();
    const fmt = (d) => d.toLocaleDateString("en-CA");
    if (selectedFilter === "today") return { startDate: fmt(today), endDate: fmt(today) };
    if (selectedFilter === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { startDate: fmt(y), endDate: fmt(y) };
    }
    if (selectedFilter === "last7days") {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    if (selectedFilter === "last30days") {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    if (selectedFilter === "custom" && customStartDate && customEndDate)
      return { startDate: customStartDate, endDate: customEndDate };
    return {};
  }

  async function fetchFeedbacks() {
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      loading = false;
      return;
    }
    loading = true;
    try {
      const { startDate, endDate } = buildDateRange();
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) q.set("search", search);
      if (satisfactionLevel) q.set("satisfactionLevel", satisfactionLevel);
      if (reason) q.set("reason", reason);
      if (byUserId) q.set("byUserId", String(byUserId));
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      const res = await authApiFetch(`${API_ROUTES.ORDER_FEEDBACK}?${q}`);
      feedbacks = res?.data ?? [];
      total = res?.total ?? 0;
    } catch (e) { errorHandle(e); }
    finally { loading = false; }
  }

  async function fetchStats() {
    try {
      const { startDate, endDate } = buildDateRange();
      const q = new URLSearchParams();
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      const res = await authApiFetch(`${API_ROUTES.ORDER_FEEDBACK}/stats?${q}`);
      stats = res?.data ?? null;
    } catch (_) {}
  }

  async function refresh() {
    page = 1;
    await Promise.all([fetchFeedbacks(), fetchStats()]);
  }

  async function deleteFeedback(id) {
    const r = await Swal.fire({
      title: "Delete Feedback?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete!",
    });
    if (!r.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.ORDER_FEEDBACK}/${id}`, { method: "DELETE" });
      feedbacks = feedbacks.filter((f) => f.id !== id);
      total = Math.max(0, total - 1);
      Swal.fire("Deleted!", "Feedback removed.", "success");
    } catch (e) { errorHandle(e); }
  }

  function formatDate(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }

  let searchTimer;
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { search = searchInput; page = 1; fetchFeedbacks(); }, 400);
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

  $: totalPages = Math.ceil(total / limit);

  onMount(async () => {
    currentUser = checkAuth();
    await Promise.all([refresh(), getAllUsers()]);
    loadingData = false;
  });
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content pb-0">

    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
      <div>
        <h4 class="mb-0 fw-bold"><i class="ti ti-message-star me-2 text-primary"></i>Customer Feedback</h4>
        <p class="text-muted small mb-0">All order feedbacks with filters</p>
      </div>
    </div>

    <!-- Stats Cards -->
    {#if stats}
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body d-flex align-items-center gap-3 py-3">
              <div class="rounded-circle d-flex align-items-center justify-content-center" style="width:44px;height:44px;background:#f1f3f5;">
                <i class="ti ti-messages" style="font-size:1.3rem;color:#495057;"></i>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;font-weight:600;">Total</div>
                <div class="fw-bold" style="font-size:1.4rem;line-height:1.1;">{stats.total}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body d-flex align-items-center gap-3 py-3">
              <div class="rounded-circle d-flex align-items-center justify-content-center" style="width:44px;height:44px;background:#ebfbee;">
                <i class="ti ti-mood-smile" style="font-size:1.3rem;color:#2f9e44;"></i>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;font-weight:600;">Satisfied</div>
                <div class="fw-bold text-success" style="font-size:1.4rem;line-height:1.1;">{stats.satisfactionCounts?.SATISFIED ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body d-flex align-items-center gap-3 py-3">
              <div class="rounded-circle d-flex align-items-center justify-content-center" style="width:44px;height:44px;background:#fff9db;">
                <i class="ti ti-mood-empty" style="font-size:1.3rem;color:#e67700;"></i>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;font-weight:600;">Neutral</div>
                <div class="fw-bold text-warning" style="font-size:1.4rem;line-height:1.1;">{stats.satisfactionCounts?.NEUTRAL ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body d-flex align-items-center gap-3 py-3">
              <div class="rounded-circle d-flex align-items-center justify-content-center" style="width:44px;height:44px;background:#fff5f5;">
                <i class="ti ti-mood-sad" style="font-size:1.3rem;color:#e03131;"></i>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;font-weight:600;">Dissatisfied</div>
                <div class="fw-bold text-danger" style="font-size:1.4rem;line-height:1.1;">{stats.satisfactionCounts?.DISSATISFIED ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div class="row g-2 align-items-center mb-3">

      <!-- Search -->
      <div class="col-auto" style="flex:1;min-width:220px;">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input
            type="text"
            value={searchInput}
            on:input={(e) => { searchInput = e.target.value; onSearchInput(); }}
            class="form-control"
            placeholder="Search order, client, remarks..."
          />
        </div>
      </div>

      <!-- Date -->
      <div class="col-auto">
        <select class="form-select w-auto" bind:value={selectedFilter} on:change={refresh}>
          {#each DATE_FILTERS as f}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
      </div>

      {#if selectedFilter === "custom"}
        <div class="col-auto">
          <input type="date" bind:value={customStartDate} class="form-control" style="min-width:140px;" on:change={refresh} />
        </div>
        <div class="col-auto">
          <input type="date" bind:value={customEndDate} class="form-control" style="min-width:140px;" on:change={refresh} />
        </div>
      {/if}

      <!-- Satisfaction -->
      <div class="col-auto">
        <select class="form-select w-auto" bind:value={satisfactionLevel} on:change={refresh}>
          {#each SATISFACTION_OPTIONS as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <!-- Reason -->
      <div class="col-auto">
        <select class="form-select w-auto" bind:value={reason} on:change={refresh} style="min-width:180px;">
          {#each REASON_OPTIONS as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      <!-- User filter (master/admin/manager only) -->
      {#if currentUser?.role !== "user"}
        <div class="col-auto">
          <select class="form-select w-auto" bind:value={byUserId} on:change={refresh}>
            <option value="">All Users</option>
            {#each users as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Reset -->
      <div class="col-auto">
        <button class="btn btn-outline-secondary" on:click={() => {
          searchInput = ""; search = ""; satisfactionLevel = ""; reason = "";
          byUserId = ""; selectedFilter = "last30days"; customStartDate = ""; customEndDate = "";
          refresh();
        }}>
          <i class="ti ti-refresh me-1"></i>Reset
        </button>
      </div>

    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-header d-flex align-items-center justify-content-between py-2">
        <span style="font-size:13px;font-weight:600;">
          {#if loading}Loading...{:else}{total} feedback{total !== 1 ? 's' : ''}{/if}
        </span>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" bind:value={limit} on:change={refresh} style="width:80px;">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
      <div class="card-body p-0">
        {#if loading}
          <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
        {:else if feedbacks.length === 0}
          <div class="text-center py-5 text-muted">
            <i class="ti ti-message-off" style="font-size:2.5rem;"></i>
            <p class="mt-2 mb-0">No feedback found for the selected filters.</p>
          </div>
        {:else}
          <div class="table-responsive">
            <table class="table table-hover table-sm mb-0 align-middle">
              <thead class="table-light">
                <tr>
                  <th>#</th>
                  <th>Order</th>
                  <th>Client</th>
                  <th>Satisfaction</th>
                  <th>Reason</th>
                  <th>Type</th>
                  <th>Trigger Status</th>
                  <th>Remarks</th>
                  {#if currentUser?.role === "master" || currentUser?.role === "admin"}
                    <th>Submitted By</th>
                  {/if}
                  <th>Date</th>
                  {#if currentUser?.role !== "user"}
                    <th></th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#each feedbacks as fb, i}
                  {@const cfg = SATISFACTION_CONFIG[fb.satisfactionLevel] || {}}
                  <tr>
                    <td style="font-size:12px;">{(page - 1) * limit + i + 1}</td>
                    <td>
                      {#if fb.order}
                        <a
                          href="/admin/order/{fb.order.id}"
                          class="fw-semibold text-primary"
                          style="font-size:12px;text-decoration:none;"
                          title={fb.order.title}
                        >
                          <i class="ti ti-external-link me-1" style="font-size:10px;"></i>
                          {fb.order.financialYear}/{String(fb.order.pId).padStart(6, "0")}
                        </a>
                        <div class="text-muted text-truncate" style="font-size:11px;max-width:140px;" title={fb.order.title}>{fb.order.title}</div>
                      {:else}—{/if}
                    </td>
                    <td style="font-size:12px;">{fb.order?.client?.name ?? "—"}</td>
                    <td>
                      <span class="badge {cfg.cls} d-inline-flex align-items-center gap-1" style="font-size:11px;">
                        <i class="ti {cfg.icon}"></i>{cfg.label}
                      </span>
                    </td>
                    <td style="font-size:12px;">{REASON_LABELS[fb.reason] ?? fb.reason}</td>
                    <td>
                      <span class="badge {fb.feedbackType === 'TRIGGERED' ? 'bg-info' : 'bg-secondary'}" style="font-size:10px;">
                        {fb.feedbackType === 'TRIGGERED' ? 'Auto' : 'Manual'}
                      </span>
                    </td>
                    <td style="font-size:12px;">{fb.triggerStatus || "—"}</td>
                    <td style="font-size:12px;max-width:180px;">
                      <span class="d-block text-truncate" title={fb.remarks}>{fb.remarks || "—"}</span>
                    </td>
                    {#if currentUser?.role === "master" || currentUser?.role === "admin"}
                      <td style="font-size:12px;">{fb.submittedBy?.name ?? "—"}</td>
                    {/if}
                    <td style="font-size:12px;white-space:nowrap;">{formatDate(fb.createdAt)}</td>
                    {#if currentUser?.role !== "user"}
                      <td>
                        <button
                          class="btn btn-sm btn-outline-danger p-0 px-1"
                          title="Delete"
                          on:click={() => deleteFeedback(fb.id)}
                        >
                          <i class="ti ti-trash" style="font-size:13px;"></i>
                        </button>
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          {#if totalPages > 1}
            <div class="d-flex align-items-center justify-content-between px-3 py-2 border-top">
              <span class="text-muted" style="font-size:12px;">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-secondary" disabled={page <= 1} on:click={() => { page--; fetchFeedbacks(); }}>
                  <i class="ti ti-chevron-left"></i>
                </button>
                {#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const half = 2;
                  let start = Math.max(1, page - half);
                  let end = Math.min(totalPages, start + 4);
                  start = Math.max(1, end - 4);
                  return start + i;
                }) as p}
                  <button
                    class="btn btn-sm {p === page ? 'btn-primary' : 'btn-outline-secondary'}"
                    on:click={() => { page = p; fetchFeedbacks(); }}
                  >{p}</button>
                {/each}
                <button class="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} on:click={() => { page++; fetchFeedbacks(); }}>
                  <i class="ti ti-chevron-right"></i>
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

  </div>
</div>
