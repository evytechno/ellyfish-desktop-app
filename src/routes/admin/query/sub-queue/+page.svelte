<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import Swal from "sweetalert2";
  import Pagination from "$lib/components/Pagination.svelte";

  let currentUser;
  let queries = [];
  let loading = true;
  let currentPage = 1;
  let totalItems = 0;
  let totalPages = 0;
  let rowsPerPage = 10;
  let search = "";
  let filterType = "";
  let filterPriority = "";
  let searchTimeout;
  let refreshInterval;
  let actionLoading = null; // queryId being picked up

  const STATUS_COLORS = {
    open: "badge bg-primary text-white",
    in_progress: "badge bg-warning text-dark",
    resolved: "badge bg-success text-white",
    reopened: "badge bg-danger text-white",
    closed: "badge bg-secondary text-white",
  };

  const PRIORITY_COLORS = {
    high: "badge bg-danger text-white",
    medium: "badge bg-warning text-dark",
    low: "badge bg-success text-white",
  };

  const SUB_QUERY_TYPES = [
    { value: "", label: "All Types" },
    { value: "price_check", label: "Price Check" },
    { value: "transport_check", label: "Transport Check" },
    { value: "delivery_check", label: "Delivery Check" },
    { value: "availability_check", label: "Availability Check" },
    { value: "design_check", label: "Design Check" },
    { value: "other_help", label: "Other Help" },
  ];

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.subRole !== "tech_helper" && currentUser.role === "user") {
      goto("/admin/dashboard"); return;
    }
    await loadQueries();
    // auto-refresh every 30 seconds
    refreshInterval = setInterval(loadQueries, 30000);
  });

  onDestroy(() => { if (refreshInterval) clearInterval(refreshInterval); });

  async function loadQueries(page = currentPage) {
    loading = true;
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(rowsPerPage),
      });
      if (search.trim()) params.set("search", search.trim());
      if (filterType) params.set("type", filterType);
      if (filterPriority) params.set("priority", filterPriority);

      const res = await authApiFetch(`${API_ROUTES.QUERY}/sub-queue?${params}`);
      queries = res.data ?? [];
      totalItems = res.total ?? 0;
      totalPages = res.totalPages ?? 1;
      currentPage = page;
    } catch (e) {
      queries = [];
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadQueries(1), 350);
  }

  function handlePageChange(e) { loadQueries(e.detail); }

  async function pickUp(queryId) {
    actionLoading = queryId;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/assign`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query picked up!", timer: 1500, showConfirmButton: false });
      goto(`/admin/query/${queryId}`);
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      if (status === 409) {
        Swal.fire({ icon: "warning", title: "Already picked up", text: "This query was just picked up by someone else.", timer: 2200, showConfirmButton: false });
        await loadQueries();
      } else {
        Swal.fire({ icon: "error", title: "Error", text: e?.data?.message ?? "Could not pick up query." });
      }
    } finally {
      actionLoading = null;
    }
  }

  function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function typeLabel(type) {
    return SUB_QUERY_TYPES.find(t => t.value === type)?.label ?? type ?? "Other";
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center gap-2 mb-3">
      <i class="ti ti-subtask text-primary fs-4"></i>
      <h4 class="fw-bold mb-0">Open Query Queue</h4>
      <span class="badge bg-primary ms-1">{totalItems}</span>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <div>
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input
            type="text"
            class="form-control"
            placeholder="Search queries…"
            bind:value={search}
            on:input={handleSearch}
          />
        </div>
      </div>
      <div>
        <select class="form-select" bind:value={filterType} on:change={() => loadQueries(1)}>
          {#each SUB_QUERY_TYPES as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <select class="form-select" bind:value={filterPriority} on:change={() => loadQueries(1)}>
          <option value="">All Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div>
        <button class="btn btn-outline-secondary" on:click={() => loadQueries(1)}>
          <i class="ti ti-refresh me-1"></i>Refresh
        </button>
      </div>
    </div>

    {#if loading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if queries.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-inbox fs-1 d-block mb-2"></i>
        No open queries right now.
      </div>
    {:else}
      <div class="card border-0 rounded-0 mb-0">
        <div class="card-body p-3">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Raised At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each queries as q, i}
                <tr>
                  <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                  <td>
                    <a href="/admin/query/{q.id}" class="text-primary fw-semibold">
                      {q.subject}
                    </a>
                    {#if q.description}
                      <div class="small text-muted text-truncate" style="max-width:280px">{q.description}</div>
                    {/if}
                  </td>
                  <td><span class="badge bg-light text-dark border" style="font-size:11px;">{typeLabel(q.type)}</span></td>
                  <td><span class={PRIORITY_COLORS[q.priority ?? "medium"]} style="font-size:11px;">{q.priority ?? "medium"}</span></td>
                  <td><span class={STATUS_COLORS[q.status] ?? "badge bg-secondary"}>{q.status?.replace("_", " ")}</span></td>
                  <td>{formatDate(q.createdAt)}</td>
                  <td>
                    <button
                      class="btn btn-sm btn-warning"
                      on:click={() => pickUp(q.id)}
                      disabled={actionLoading === q.id}
                    >
                      {#if actionLoading === q.id}
                        <span class="spinner-border spinner-border-sm me-1" style="width:12px;height:12px;border-width:1.5px;"></span>
                      {:else}
                        <i class="ti ti-hand-stop me-1"></i>
                      {/if}
                      Pick Up
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pagination
          {currentPage}
          {totalPages}
          {rowsPerPage}
          on:pageChange={(e) => { currentPage = e.detail; loadQueries(e.detail); }}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; loadQueries(1); }}
        />
        </div>
      </div>
    {/if}
  </div>
</div>
