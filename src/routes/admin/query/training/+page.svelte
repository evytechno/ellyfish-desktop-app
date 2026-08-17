<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { loadTrainingQueryCount } from "$lib/stores/queryStore";

  let currentUser;
  let queries = [];
  let loading = true;
  let now = Date.now();
  let tick;

  const STATUS_COLORS = {
    closed: "badge bg-secondary text-white",
    resolved: "badge bg-success text-white",
  };

  const QUERY_TYPES = {
    order_issue: "Order Issue",
    payment_issue: "Payment Issue",
    invoice_issue: "Invoice Issue",
    stock_issue: "Stock Issue",
    technical: "Technical",
    customer_complaint: "Customer Complaint",
    access_issue: "Access Issue",
    other: "Other",
  };

  function remaining(expiresAt) {
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return "Expired";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${Math.max(1, m)}m left`;
  }

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) {
      goto("/login");
      return;
    }
    if (currentUser.role === "user" && !currentUser.subRole) {
      goto("/admin/dashboard");
      return;
    }
    tick = setInterval(() => {
      now = Date.now();
    }, 30000);
    await load();
  });

  onDestroy(() => {
    if (tick) clearInterval(tick);
  });

  async function load() {
    loading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/training`);
      queries = Array.isArray(res) ? res : [];
    } catch (e) {
      errorHandle(e);
      queries = [];
    } finally {
      loading = false;
      loadTrainingQueryCount();
    }
  }

  $: visible = queries.filter((q) => new Date(q.trainingExpiresAt).getTime() > now);
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <h4 class="fw-bold mb-0">Training queries</h4>
        <p class="text-muted small mb-0">
          Closed or resolved samples assigned to you. Read-only — you can only view that query, with no other queries or actions. Access ends when the time is up.
        </p>
      </div>
    </div>

    {#if loading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if visible.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-school fs-1 d-block mb-2"></i>
        No training queries assigned right now.
      </div>
    {:else}
      <div class="card border-0 shadow-sm">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Ticket</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Status</th>
                <th>Access</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each visible as q}
                <tr>
                  <td class="text-nowrap small">{q.ticketCode ?? `#${q.id}`}</td>
                  <td>
                    <a href="/admin/query/{q.id}" class="text-decoration-none">{q.subject}</a>
                  </td>
                  <td>
                    <span class="badge bg-light text-dark border">
                      {QUERY_TYPES[q.type] ?? q.type ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span class={STATUS_COLORS[q.status] ?? "badge bg-secondary"}>{q.status === "resolved" ? "Resolved" : "Closed"}</span>
                  </td>
                  <td class="text-nowrap">
                    <span class="badge bg-warning-subtle text-warning-emphasis border">
                      {remaining(q.trainingExpiresAt)}
                    </span>
                  </td>
                  <td>
                    <a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary">Open</a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>
