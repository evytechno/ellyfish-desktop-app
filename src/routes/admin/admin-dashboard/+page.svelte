<script>
  import { onMount } from "svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { usersAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { setUser } from "../../../stores/userStore";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import Loader from "$lib/components/Loader.svelte";
  import Swal from "sweetalert2";

  let currentUser;
  let loadingData = true;
  let users = [];
  let mounted = false;

  // Section 1 — Role-wise sales
  let s1SubRole = "telecaller";
  let s1Filter = "today";
  let s1CustomStart = "";
  let s1CustomEnd = "";
  let s1ByUserId = "";
  let s1Data = [];
  let s1Loading = false;

  // Section 2 — Category-wise sales
  let s2Filter = "last7days";
  let s2CustomStart = "";
  let s2CustomEnd = "";
  let s2Status = "";
  let s2SubRole = "";
  let s2ByUserId = "";
  let s2Data = [];
  let s2Loading = false;

  // Section 3 — Contact report
  let s3Filter = "last7days";
  let s3CustomStart = "";
  let s3CustomEnd = "";
  let s3SubRole = "";
  let s3ByUserId = "";
  let s3Data = [];
  let s3Loading = false;

  // Section 4 — Last activity
  let s4Filter = "today";
  let s4CustomStart = "";
  let s4CustomEnd = "";
  let s4SubRole = "";
  let s4ByUserId = "";
  let s4Data = [];
  let s4Total = 0;
  let s4Page = 1;
  let s4Limit = 10;
  let s4TotalPages = 0;
  let s4Loading = false;

  // Section 5 — Category × Status breakdown
  let s5Filter = "last7days";
  let s5CustomStart = "";
  let s5CustomEnd = "";
  let s5SubRole = "";
  let s5ByUserId = "";
  let s5Data = [];
  let s5Loading = false;

  const ROLE_TABS = [
    { val: "telecaller",  label: "Telecaller", color: "#3b5bdb" },
    { val: "tech",        label: "Tech",        color: "#0ca678" },
    { val: "tech_helper", label: "Sr. Tech",    color: "#7950f2" },
  ];

  const STATUSES = [
    "New Lead","Contacted","Follow Up","Needs Assessment","Quotation Sent",
    "Qualified","Negotiation In Progress","Deal Won","Unqualified","Deal Lost",
    "Dispatched","Completed",
  ];

  const statusCls = {
    "New Lead":                "dsb--primary",
    "Contacted":               "dsb--info",
    "Follow Up":               "dsb--secondary",
    "Needs Assessment":        "dsb--warning",
    "Quotation Sent":          "dsb--warning",
    "Qualified":               "dsb--success",
    "Negotiation In Progress": "dsb--dark",
    "Deal Won":                "dsb--success",
    "Unqualified":             "dsb--danger",
    "Deal Lost":               "dsb--danger",
    "Dispatched":              "dsb--info",
    "Completed":               "dsb--success",
  };

  // Derive display name from store (respects admin renames), fall back to key
  $: statusLabel = (key) => $statusNamesStore[key]?.name ?? key;

  // ── helpers ───────────────────────────────────────────────────────────────
  function buildDateRange(filter, customStart, customEnd) {
    const today = new Date();
    const fmt = (d) => d.toLocaleDateString("en-CA");
    if (filter === "today") return { startDate: fmt(today), endDate: fmt(today) };
    if (filter === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { startDate: fmt(y), endDate: fmt(y) };
    }
    if (filter === "last7days") {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    if (filter === "last30days") {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      return { startDate: fmt(d), endDate: fmt(today) };
    }
    if (filter === "custom" && customStart && customEnd)
      return { startDate: customStart, endDate: customEnd };
    return {};
  }

  function filterLabel(filter, customStart, customEnd) {
    if (filter === "today") return "Today";
    if (filter === "yesterday") return "Yesterday";
    if (filter === "last7days") return "Last 7 Days";
    if (filter === "last30days") return "Last 30 Days";
    if (filter === "custom" && customStart && customEnd) return `${customStart} → ${customEnd}`;
    return "All Time";
  }

  function fmtINR(val) {
    if (!val && val !== 0) return "—";
    return "₹" + Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  function isStale(order) {
    const acts = order.orderActivities ?? [];
    if (!acts.length) return true;
    return Date.now() - new Date(acts[0].createdAt).getTime() > 2 * 86400000;
  }

  function timeAgo(order) {
    const acts = order.orderActivities ?? [];
    if (!acts.length) return null;
    const diff = Math.floor((Date.now() - new Date(acts[0].createdAt).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ── fetch ─────────────────────────────────────────────────────────────────
  async function fetchS1() {
    if (s1Filter === "custom" && (!s1CustomStart || !s1CustomEnd)) return;
    s1Loading = true;
    try {
      const { startDate, endDate } = buildDateRange(s1Filter, s1CustomStart, s1CustomEnd);
      const q = new URLSearchParams({ subRole: s1SubRole });
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      if (s1ByUserId) q.set("byUserId", s1ByUserId);
      s1Data = await authApiFetch(`${API_ROUTES.ORDER}/role-sales?${q}`);
    } catch (e) { errorHandle(e); }
    finally { s1Loading = false; }
  }

  async function fetchS2() {
    if (s2Filter === "custom" && (!s2CustomStart || !s2CustomEnd)) return;
    s2Loading = true;
    try {
      const { startDate, endDate } = buildDateRange(s2Filter, s2CustomStart, s2CustomEnd);
      const q = new URLSearchParams();
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      if (s2Status) q.set("status", s2Status);
      if (s2ByUserId) q.set("byUserId", s2ByUserId);
      else if (s2SubRole) q.set("subRole", s2SubRole);
      s2Data = await authApiFetch(`${API_ROUTES.ORDER}/category-sales?${q}`);
    } catch (e) { errorHandle(e); }
    finally { s2Loading = false; }
  }

  async function fetchS3() {
    if (s3Filter === "custom" && (!s3CustomStart || !s3CustomEnd)) return;
    s3Loading = true;
    try {
      const { startDate, endDate } = buildDateRange(s3Filter, s3CustomStart, s3CustomEnd);
      const q = new URLSearchParams();
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      if (s3ByUserId) q.set("byUserId", s3ByUserId);
      else if (s3SubRole) q.set("subRole", s3SubRole);
      s3Data = await authApiFetch(`${API_ROUTES.ORDER_CHAT}/contact-report?${q}`);
    } catch (e) { errorHandle(e); }
    finally { s3Loading = false; }
  }

  async function fetchS4() {
    if (s4Filter === "custom" && (!s4CustomStart || !s4CustomEnd)) return;
    s4Loading = true;
    try {
      const { startDate, endDate } = buildDateRange(s4Filter, s4CustomStart, s4CustomEnd);
      const q = new URLSearchParams({ limit: String(s4Limit), page: String(s4Page) });
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      if (s4ByUserId) q.set("byUserId", s4ByUserId);
      else if (s4SubRole) q.set("subRole", s4SubRole);
      const res = await authApiFetch(`${API_ROUTES.ORDER}/last-activity?${q}`);
      s4Data = res.data ?? [];
      s4Total = res.total ?? 0;
      s4TotalPages = res.totalPages ?? 0;
    } catch (e) { errorHandle(e); }
    finally { s4Loading = false; }
  }

  async function fetchS5() {
    if (s5Filter === "custom" && (!s5CustomStart || !s5CustomEnd)) return;
    s5Loading = true;
    try {
      const { startDate, endDate } = buildDateRange(s5Filter, s5CustomStart, s5CustomEnd);
      const q = new URLSearchParams();
      if (startDate) q.set("startDate", startDate);
      if (endDate) q.set("endDate", endDate);
      if (s5ByUserId) q.set("byUserId", s5ByUserId);
      else if (s5SubRole) q.set("subRole", s5SubRole);
      s5Data = await authApiFetch(`${API_ROUTES.ORDER}/category-stats?${q}`);
    } catch (e) { errorHandle(e); }
    finally { s5Loading = false; }
  }

  // ── mount ─────────────────────────────────────────────────────────────────
  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser) {
      setUser(currentUser);
      if (currentUser.role === "user") {
        loadingData = false;
        Swal.fire({
          icon: "warning", title: "Access Denied",
          text: "You are not authorized to view this page.",
          confirmButtonText: "Go Back",
        }).then(() => window.history.back());
        return;
      }
    }
    const cached = get(usersAllStore);
    if (cached?.length > 0) {
      users = cached;
    } else {
      try {
        const data = await authApiFetch(API_ROUTES.USER + "/all");
        users = data;
        usersAllStore.set(data);
      } catch (_) {}
    }
    await Promise.all([fetchS1(), fetchS2(), fetchS3(), fetchS4(), fetchS5()]);
    loadingData = false;
    mounted = true;
  });

  // ── reactivity ────────────────────────────────────────────────────────────
  $: if (mounted) { s1SubRole; s1Filter; s1CustomStart; s1CustomEnd; s1ByUserId; fetchS1(); }
  $: if (mounted) { s2SubRole; s2ByUserId; s2Filter; s2CustomStart; s2CustomEnd; s2Status; fetchS2(); }
  $: if (mounted) { s3SubRole; s3ByUserId; s3Filter; s3CustomStart; s3CustomEnd; fetchS3(); }
  $: if (mounted) { s4SubRole; s4ByUserId; s4Filter; s4CustomStart; s4CustomEnd; s4Page; fetchS4(); }
  $: if (mounted) { s5SubRole; s5ByUserId; s5Filter; s5CustomStart; s5CustomEnd; fetchS5(); }

  // ── computed ──────────────────────────────────────────────────────────────
  $: s1Total      = s1Data.reduce((s, r) => s + r.orderCount, 0);
  $: s1TotalValue = s1Data.reduce((s, r) => s + r.totalValue, 0);
  $: s2TotalOrders = s2Data.reduce((s, r) => s + r.orderCount, 0);
  $: s2TotalValue  = s2Data.reduce((s, r) => s + r.totalValue, 0);
  $: s3GrandTotal  = s3Data.reduce((s, r) => s + r.total, 0);
  $: s4StaleCount  = s4Data.filter(isStale).length;
  $: s5GrandTotal = s5Data.reduce((s, r) => s + r.total, 0);
  function s5ColTotal(status) {
    return s5Data.reduce((sum, r) => {
      const f = r.statusBreakdown.find((s) => s.status === status);
      return sum + (f ? f.count : 0);
    }, 0);
  }
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content pb-4">

    <!-- ── Page Title ──────────────────────────────────────────────────── -->
    <div class="db-title-bar mb-4">
      <div>
        <h4 class="mb-0 fw-bold">Admin Dashboard</h4>
        <p class="text-muted small mb-0">Sales & activity overview</p>
      </div>
    </div>

    <!-- ── ROW 1: Section 1 + Section 2 ───────────────────────────────── -->
    <div class="db-grid-2 mb-4">

      <!-- ── SECTION 1: Role-wise Sales ─────────────────────────────── -->
      <div class="db-card">
        <!-- header -->
        <div class="db-card-head">
          <div class="db-card-title-block">
            <span class="db-section-icon bg-primary-soft text-primary">
              <i class="ti ti-users"></i>
            </span>
            <div>
              <div class="db-card-title">Role-wise Sales</div>
              <div class="db-card-subtitle">{filterLabel(s1Filter, s1CustomStart, s1CustomEnd)}</div>
            </div>
          </div>
          <!-- filters row -->
          <div class="db-filters">
            <div class="db-role-tabs">
              {#each [["telecaller","Telecaller","#3b5bdb"],["tech","Tech","#0ca678"],["tech_helper","Sr. Tech","#7950f2"]] as [val, label, color]}
                <button
                  class="db-role-btn"
                  class:active={s1SubRole === val}
                  style="--rc:{color}"
                  on:click={() => { s1SubRole = val; s1ByUserId = ""; }}
                >{label}</button>
              {/each}
            </div>
            <select bind:value={s1Filter} class="db-select">
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom</option>
            </select>
            {#if s1Filter === "custom"}
              <input type="date" bind:value={s1CustomStart} class="db-date" />
              <input type="date" bind:value={s1CustomEnd} class="db-date" />
            {/if}
            <select bind:value={s1ByUserId} class="db-select">
              <option value="">All Users</option>
              {#each users.filter(u => u.subRole === s1SubRole) as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          </div>
        </div>
        <!-- summary chips -->
        <div class="db-chips">
          <div class="db-chip db-chip--blue">
            <span class="db-chip-val">{s1Total}</span>
            <span class="db-chip-lbl">Orders</span>
          </div>
          <div class="db-chip db-chip--green">
            <span class="db-chip-val">{fmtINR(s1TotalValue)}</span>
            <span class="db-chip-lbl">Total Value</span>
          </div>
        </div>
        <!-- body -->
        <div class="db-card-body">
          {#if s1Loading}
            <div class="db-loading"><span class="spinner-border spinner-border-sm text-primary"></span></div>
          {:else if s1Data.length === 0}
            <div class="db-empty"><i class="ti ti-mood-empty"></i> No data found</div>
          {:else}
            <table class="db-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th class="text-center">Orders</th>
                  <th class="text-end">Value</th>
                  <th class="text-end">Share</th>
                </tr>
              </thead>
              <tbody>
                {#each s1Data as row}
                  {@const pct = s1Total > 0 ? Math.round((row.orderCount / s1Total) * 100) : 0}
                  <tr>
                    <td class="fw-medium">{row.userName}</td>
                    <td class="text-center">
                      <span class="db-badge db-badge--blue">{row.orderCount}</span>
                    </td>
                    <td class="text-end text-muted">{fmtINR(row.totalValue)}</td>
                    <td class="text-end">
                      <div class="db-bar-cell">
                        <div class="db-bar"><div class="db-bar-fill bg-primary" style="width:{pct}%"></div></div>
                        <span class="db-bar-pct">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="fw-bold">Total</td>
                  <td class="text-center fw-bold">{s1Total}</td>
                  <td class="text-end fw-bold">{fmtINR(s1TotalValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          {/if}
        </div>
      </div>

      <!-- ── SECTION 2: Category-wise Sales ─────────────────────────── -->
      <div class="db-card">
        <div class="db-card-head">
          <div class="db-card-title-block">
            <span class="db-section-icon bg-success-soft text-success">
              <i class="ti ti-category"></i>
            </span>
            <div>
              <div class="db-card-title">Category-wise Sales</div>
              <div class="db-card-subtitle">{filterLabel(s2Filter, s2CustomStart, s2CustomEnd)}</div>
            </div>
          </div>
          <div class="db-filters">
            <div class="db-role-tabs">
              <button class="db-role-btn" class:active={s2SubRole === ""} style="--rc:#6c757d" on:click={() => { s2SubRole = ""; s2ByUserId = ""; }}>All</button>
              {#each ROLE_TABS as rt}
                <button class="db-role-btn" class:active={s2SubRole === rt.val} style="--rc:{rt.color}" on:click={() => { s2SubRole = rt.val; s2ByUserId = ""; }}>{rt.label}</button>
              {/each}
            </div>
            <select bind:value={s2ByUserId} class="db-select">
              <option value="">All Users</option>
              {#each users.filter(u => u.role === "user" && (!s2SubRole || u.subRole === s2SubRole)) as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
            <select bind:value={s2Filter} class="db-select">
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom</option>
            </select>
            {#if s2Filter === "custom"}
              <input type="date" bind:value={s2CustomStart} class="db-date" />
              <input type="date" bind:value={s2CustomEnd} class="db-date" />
            {/if}
            <select bind:value={s2Status} class="db-select">
              <option value="">All Statuses</option>
              {#each STATUSES as st}<option value={st}>{statusLabel(st)}</option>{/each}
            </select>
          </div>
        </div>
        <div class="db-chips">
          <div class="db-chip db-chip--green">
            <span class="db-chip-val">{s2TotalOrders}</span>
            <span class="db-chip-lbl">Orders</span>
          </div>
          <div class="db-chip db-chip--teal">
            <span class="db-chip-val">{fmtINR(s2TotalValue)}</span>
            <span class="db-chip-lbl">Total Value</span>
          </div>
          <div class="db-chip db-chip--purple">
            <span class="db-chip-val">{s2Data.length}</span>
            <span class="db-chip-lbl">Categories</span>
          </div>
        </div>
        <div class="db-card-body">
          {#if s2Loading}
            <div class="db-loading"><span class="spinner-border spinner-border-sm text-success"></span></div>
          {:else if s2Data.length === 0}
            <div class="db-empty"><i class="ti ti-mood-empty"></i> No data found</div>
          {:else}
            <table class="db-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="text-center">Orders</th>
                  <th class="text-end">Value</th>
                  <th class="text-end">Share</th>
                </tr>
              </thead>
              <tbody>
                {#each s2Data as row}
                  {@const pct = s2TotalOrders > 0 ? Math.round((row.orderCount / s2TotalOrders) * 100) : 0}
                  <tr>
                    <td class="fw-medium">{row.category}</td>
                    <td class="text-center">
                      <span class="db-badge db-badge--green">{row.orderCount}</span>
                    </td>
                    <td class="text-end text-muted">{fmtINR(row.totalValue)}</td>
                    <td class="text-end">
                      <div class="db-bar-cell">
                        <div class="db-bar"><div class="db-bar-fill bg-success" style="width:{pct}%"></div></div>
                        <span class="db-bar-pct">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="fw-bold">Total</td>
                  <td class="text-center fw-bold">{s2TotalOrders}</td>
                  <td class="text-end fw-bold">{fmtINR(s2TotalValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          {/if}
        </div>
      </div>

    </div>
    <!-- end row 1 -->

    <!-- ── ROW 2: Section 3 + Section 5 ───────────────────────────────── -->
    <div class="db-grid-2 mb-4">

      <!-- ── SECTION 3: Contact Report ──────────────────────────────── -->
      <div class="db-card">
        <div class="db-card-head">
          <div class="db-card-title-block">
            <span class="db-section-icon bg-warning-soft text-warning">
              <i class="ti ti-phone-call"></i>
            </span>
            <div>
              <div class="db-card-title">Contact Report</div>
              <div class="db-card-subtitle">{filterLabel(s3Filter, s3CustomStart, s3CustomEnd)}</div>
            </div>
          </div>
          <div class="db-filters">
            <div class="db-role-tabs">
              <button class="db-role-btn" class:active={s3SubRole === ""} style="--rc:#6c757d" on:click={() => { s3SubRole = ""; s3ByUserId = ""; }}>All</button>
              {#each ROLE_TABS as rt}
                <button class="db-role-btn" class:active={s3SubRole === rt.val} style="--rc:{rt.color}" on:click={() => { s3SubRole = rt.val; s3ByUserId = ""; }}>{rt.label}</button>
              {/each}
            </div>
            <select bind:value={s3ByUserId} class="db-select">
              <option value="">All Users</option>
              {#each users.filter(u => u.role === "user" && (!s3SubRole || u.subRole === s3SubRole)) as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
            <select bind:value={s3Filter} class="db-select">
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom</option>
            </select>
            {#if s3Filter === "custom"}
              <input type="date" bind:value={s3CustomStart} class="db-date" />
              <input type="date" bind:value={s3CustomEnd} class="db-date" />
            {/if}
          </div>
        </div>
        <div class="db-chips">
          <div class="db-chip db-chip--green">
            <span class="db-chip-val">{s3Data.reduce((s,r)=>s+r.call,0)}</span>
            <span class="db-chip-lbl"><i class="ti ti-phone me-1"></i>Calls</span>
          </div>
          <div class="db-chip db-chip--teal">
            <span class="db-chip-val">{s3Data.reduce((s,r)=>s+r.whatsapp,0)}</span>
            <span class="db-chip-lbl"><i class="ti ti-brand-whatsapp me-1"></i>WhatsApp</span>
          </div>
          <div class="db-chip db-chip--blue">
            <span class="db-chip-val">{s3Data.reduce((s,r)=>s+r.email,0)}</span>
            <span class="db-chip-lbl"><i class="ti ti-mail me-1"></i>Email</span>
          </div>
          <div class="db-chip db-chip--purple">
            <span class="db-chip-val">{s3GrandTotal}</span>
            <span class="db-chip-lbl">Total</span>
          </div>
        </div>
        <div class="db-card-body">
          {#if s3Loading}
            <div class="db-loading"><span class="spinner-border spinner-border-sm text-warning"></span></div>
          {:else if s3Data.length === 0}
            <div class="db-empty"><i class="ti ti-mood-empty"></i> No contact data found</div>
          {:else}
            <table class="db-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th class="text-center"><i class="ti ti-phone text-success"></i></th>
                  <th class="text-center"><i class="ti ti-brand-whatsapp text-success"></i></th>
                  <th class="text-center"><i class="ti ti-mail text-primary"></i></th>
                  <th class="text-center"><i class="ti ti-message text-secondary"></i></th>
                  <th class="text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {#each s3Data as row}
                  <tr>
                    <td class="fw-medium">{row.userName}</td>
                    <td class="text-center">{#if row.call > 0}<span class="db-badge db-badge--green">{row.call}</span>{:else}<span class="text-muted">—</span>{/if}</td>
                    <td class="text-center">{#if row.whatsapp > 0}<span class="db-badge db-badge--teal">{row.whatsapp}</span>{:else}<span class="text-muted">—</span>{/if}</td>
                    <td class="text-center">{#if row.email > 0}<span class="db-badge db-badge--blue">{row.email}</span>{:else}<span class="text-muted">—</span>{/if}</td>
                    <td class="text-center">{#if row.all > 0}<span class="db-badge db-badge--gray">{row.all}</span>{:else}<span class="text-muted">—</span>{/if}</td>
                    <td class="text-center"><span class="db-badge db-badge--purple">{row.total}</span></td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="fw-bold">Total</td>
                  <td class="text-center fw-bold">{s3Data.reduce((s,r)=>s+r.call,0)||"—"}</td>
                  <td class="text-center fw-bold">{s3Data.reduce((s,r)=>s+r.whatsapp,0)||"—"}</td>
                  <td class="text-center fw-bold">{s3Data.reduce((s,r)=>s+r.email,0)||"—"}</td>
                  <td class="text-center fw-bold">{s3Data.reduce((s,r)=>s+r.all,0)||"—"}</td>
                  <td class="text-center"><span class="db-badge db-badge--purple">{s3GrandTotal}</span></td>
                </tr>
              </tfoot>
            </table>
          {/if}
        </div>
      </div>

      <!-- ── SECTION 5: Category × Status Breakdown ────────────────── -->
      <div class="db-card">
        <div class="db-card-head">
          <div class="db-card-title-block">
            <span class="db-section-icon bg-purple-soft text-purple">
              <i class="ti ti-layout-columns"></i>
            </span>
            <div>
              <div class="db-card-title">Category Status Breakdown</div>
              <div class="db-card-subtitle">{filterLabel(s5Filter, s5CustomStart, s5CustomEnd)}</div>
            </div>
          </div>
          <div class="db-filters">
            <div class="db-role-tabs">
              <button class="db-role-btn" class:active={s5SubRole === ""} style="--rc:#6c757d" on:click={() => { s5SubRole = ""; s5ByUserId = ""; }}>All</button>
              {#each ROLE_TABS as rt}
                <button class="db-role-btn" class:active={s5SubRole === rt.val} style="--rc:{rt.color}" on:click={() => { s5SubRole = rt.val; s5ByUserId = ""; }}>{rt.label}</button>
              {/each}
            </div>
            <select bind:value={s5ByUserId} class="db-select">
              <option value="">All Users</option>
              {#each users.filter(u => u.role === "user" && (!s5SubRole || u.subRole === s5SubRole)) as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
            <select bind:value={s5Filter} class="db-select">
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom</option>
            </select>
            {#if s5Filter === "custom"}
              <input type="date" bind:value={s5CustomStart} class="db-date" />
              <input type="date" bind:value={s5CustomEnd} class="db-date" />
            {/if}
          </div>
        </div>
        <div class="db-chips">
          <div class="db-chip db-chip--purple">
            <span class="db-chip-val">{s5GrandTotal}</span>
            <span class="db-chip-lbl">Total Orders</span>
          </div>
          <div class="db-chip db-chip--blue">
            <span class="db-chip-val">{s5Data.length}</span>
            <span class="db-chip-lbl">Categories</span>
          </div>
          <div class="db-chip db-chip--green">
            <span class="db-chip-val">{s5ColTotal("Deal Won")}</span>
            <span class="db-chip-lbl">Deal Won</span>
          </div>
          <div class="db-chip db-chip--red">
            <span class="db-chip-val">{s5ColTotal("Deal Lost")}</span>
            <span class="db-chip-lbl">Deal Lost</span>
          </div>
        </div>
        <div class="db-card-body" style="overflow-x:auto;">
          {#if s5Loading}
            <div class="db-loading"><span class="spinner-border spinner-border-sm text-purple"></span></div>
          {:else if s5Data.length === 0}
            <div class="db-empty"><i class="ti ti-mood-empty"></i> No data found</div>
          {:else}
            <table class="db-table" style="min-width:700px;">
              <thead>
                <tr>
                  <th style="position:sticky;left:0;background:#f8f9fa;z-index:2;white-space:nowrap;min-width:140px;">Category</th>
                  <th class="text-center">Total</th>
                  {#each STATUSES as st}
                    <th class="text-center" title={st} style="white-space:nowrap;min-width:80px;">
                      {statusLabel(st)}
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each s5Data as row}
                  {@const barPct = s5GrandTotal > 0 ? Math.round((row.total / s5GrandTotal) * 100) : 0}
                  <tr>
                    <td class="fw-medium" style="position:sticky;left:0;background:#fff;z-index:1;white-space:nowrap;min-width:140px;">
                      {row.category}
                    </td>
                    <td class="text-center">
                      <span class="db-badge db-badge--purple">{row.total}</span>
                      <div class="db-bar mt-1 mx-auto" style="max-width:50px;">
                        <div class="db-bar-fill" style="width:{barPct}%;background:#7950f2;"></div>
                      </div>
                    </td>
                    {#each STATUSES as st}
                      {@const found = row.statusBreakdown.find(s => s.status === st)}
                      {@const count = found ? found.count : 0}
                      <td class="text-center">
                        {#if count > 0}
                          <span class="db-status-badge {statusCls[st] ?? ''}">{count}</span>
                        {:else}
                          <span class="text-muted">—</span>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="fw-bold" style="position:sticky;left:0;background:#f8f9fa;z-index:1;white-space:nowrap;min-width:140px;">Grand Total</td>
                  <td class="text-center fw-bold">{s5GrandTotal}</td>
                  {#each STATUSES as st}
                    {@const col = s5ColTotal(st)}
                    <td class="text-center">
                      {#if col > 0}
                        <span class="db-status-badge {statusCls[st] ?? ''}">{col}</span>
                      {:else}
                        <span class="text-muted">—</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              </tfoot>
            </table>
          {/if}
        </div>
      </div>

    </div>
    <!-- end row 2 -->

    <!-- ── ROW 3: Section 4 — Order Activity Status (full width) ──────── -->
    <div class="db-card mb-4">
      <div class="db-card-head">
        <div class="db-card-title-block">
          <span class="db-section-icon bg-danger-soft text-danger">
            <i class="ti ti-clock-exclamation"></i>
          </span>
          <div>
            <div class="db-card-title">Order Activity Status</div>
            <div class="db-card-subtitle">{filterLabel(s4Filter, s4CustomStart, s4CustomEnd)} · Orders created in range · No activity 2+ days flagged red</div>
          </div>
        </div>
        <div class="db-filters">
          <div class="db-role-tabs">
            <button class="db-role-btn" class:active={s4SubRole === ""} style="--rc:#6c757d" on:click={() => { s4SubRole = ""; s4ByUserId = ""; }}>All</button>
            {#each ROLE_TABS as rt}
              <button class="db-role-btn" class:active={s4SubRole === rt.val} style="--rc:{rt.color}" on:click={() => { s4SubRole = rt.val; s4ByUserId = ""; }}>{rt.label}</button>
            {/each}
          </div>
          <select bind:value={s4ByUserId} class="db-select">
            <option value="">All Users</option>
            {#each users.filter(u => u.role === "user" && (!s4SubRole || u.subRole === s4SubRole)) as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
          <select bind:value={s4Filter} class="db-select">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="custom">Custom</option>
          </select>
          {#if s4Filter === "custom"}
            <input type="date" bind:value={s4CustomStart} class="db-date" />
            <input type="date" bind:value={s4CustomEnd} class="db-date" />
          {/if}
        </div>
      </div>
      <!-- chips -->
      <div class="db-chips">
        <div class="db-chip db-chip--blue">
          <span class="db-chip-val">{s4Total}</span>
          <span class="db-chip-lbl">Total Orders</span>
        </div>
        <div class="db-chip db-chip--red">
          <span class="db-chip-val">{s4StaleCount}</span>
          <span class="db-chip-lbl">No Activity</span>
        </div>
        <div class="db-chip db-chip--green">
          <span class="db-chip-val">{s4Data.length - s4StaleCount}</span>
          <span class="db-chip-lbl">Active</span>
        </div>
      </div>
      <div class="db-card-body">
        {#if s4Loading}
          <div class="db-loading"><span class="spinner-border spinner-border-sm text-danger"></span></div>
        {:else if s4Data.length === 0}
          <div class="db-empty"><i class="ti ti-mood-empty"></i> No orders found</div>
        {:else}
          <div class="table-responsive">
            <table class="db-table">
              <thead>
                <tr>
                  <th style="width:40px">#</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th class="text-center">Last Activity</th>
                  <th class="text-center">Flag</th>
                </tr>
              </thead>
              <tbody>
                {#each s4Data as order, i}
                  {@const stale = isStale(order)}
                  {@const ago = timeAgo(order)}
                  <tr class:db-row-stale={stale}>
                    <td class="text-muted small">{(s4Page-1)*s4Limit+i+1}</td>
                    <td>
                      <a href="/admin/order/{order.id}" class="fw-semibold text-primary text-decoration-none">
                        #{order.pId}{order.title ? ` — ${order.title}` : ""}
                      </a>
                    </td>
                    <td>
                      <span class="db-status-pill">{order.status ? statusLabel(order.status) : "—"}</span>
                    </td>
                    <td class="text-muted small">
                      {order.assignedUsers?.map(u => u.name).join(", ") || "—"}
                    </td>
                    <td class="text-center small">
                      {#if ago}{ago}{:else}<span class="text-muted">—</span>{/if}
                    </td>
                    <td class="text-center">
                      {#if stale}
                        <span class="db-flag db-flag--red"><i class="ti ti-alert-circle me-1"></i>No Activity</span>
                      {:else}
                        <span class="db-flag db-flag--green"><i class="ti ti-check me-1"></i>Active</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <!-- Pagination -->
          {#if s4TotalPages > 1}
            <div class="db-pagination">
              <span class="text-muted small">{s4Total} orders</span>
              <div class="d-flex gap-1 align-items-center">
                <button class="db-page-btn" disabled={s4Page <= 1} on:click={() => s4Page--}>‹</button>
                <span class="db-page-info">{s4Page} / {s4TotalPages}</span>
                <button class="db-page-btn" disabled={s4Page >= s4TotalPages} on:click={() => s4Page++}>›</button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

  </div>
</div>

<style>
  /* ── Layout ── */
  .db-title-bar { display: flex; align-items: center; justify-content: space-between; }
  .db-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .db-grid-2 { grid-template-columns: 1fr; } }

  /* ── Card ── */
  .db-card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.04);
    overflow: hidden;
  }
  .db-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 14px 18px 12px;
    border-bottom: 1px solid #f1f3f5;
  }
  .db-card-title-block { display: flex; align-items: center; gap: 10px; }
  .db-section-icon {
    width: 36px; height: 36px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; flex-shrink: 0;
  }
  .db-card-title { font-size: 13.5px; font-weight: 700; color: #1a1a2e; line-height: 1.2; }
  .db-card-subtitle { font-size: 11px; color: #adb5bd; margin-top: 2px; }

  /* ── Filters ── */
  .db-filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .db-select {
    font-size: 12px; padding: 4px 8px; height: 30px;
    border: 1px solid #dee2e6; border-radius: 6px;
    background: #f8f9fa; color: #495057;
    min-width: 100px; max-width: 150px;
    cursor: pointer; outline: none;
  }
  .db-select:focus { border-color: #3b5bdb; box-shadow: 0 0 0 2px rgba(59,91,219,0.12); }
  .db-date {
    font-size: 12px; padding: 4px 6px; height: 30px;
    border: 1px solid #dee2e6; border-radius: 6px;
    background: #f8f9fa; color: #495057; width: 130px;
  }

  /* ── Role tabs ── */
  .db-role-tabs { display: flex; gap: 3px; }
  .db-role-btn {
    font-size: 11.5px; font-weight: 600; padding: 3px 10px; height: 28px;
    border: 1.5px solid #dee2e6; border-radius: 6px;
    background: #fff; color: #6c757d; cursor: pointer;
    transition: all 0.15s ease;
  }
  .db-role-btn.active {
    background: var(--rc); border-color: var(--rc);
    color: #fff;
  }
  .db-role-btn:not(.active):hover { background: #f1f3f5; }

  /* ── Summary chips ── */
  .db-chips {
    display: flex; gap: 0; border-bottom: 1px solid #f1f3f5;
  }
  .db-chip {
    flex: 1; padding: 10px 14px; text-align: center;
    border-right: 1px solid #f1f3f5;
  }
  .db-chip:last-child { border-right: none; }
  .db-chip-val { display: block; font-size: 18px; font-weight: 700; line-height: 1.1; }
  .db-chip-lbl { display: block; font-size: 10.5px; color: #adb5bd; margin-top: 2px; }
  .db-chip--blue  .db-chip-val { color: #3b5bdb; }
  .db-chip--green .db-chip-val { color: #2f9e44; }
  .db-chip--teal  .db-chip-val { color: #0ca678; }
  .db-chip--purple .db-chip-val { color: #7950f2; }
  .db-chip--yellow .db-chip-val { color: #f08c00; }
  .db-chip--red   .db-chip-val { color: #e03131; }
  .db-chip--gray  .db-chip-val { color: #495057; }

  /* ── Table ── */
  .db-card-body { padding: 0; }
  .db-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .db-table thead tr { background: #f8f9fa; }
  .db-table th {
    padding: 8px 14px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.4px;
    color: #868e96; border-bottom: 1px solid #f1f3f5;
    white-space: nowrap;
  }
  .db-table td {
    padding: 9px 14px; border-bottom: 1px solid #f8f9fa;
    vertical-align: middle; color: #343a40;
  }
  .db-table tbody tr:last-child td { border-bottom: none; }
  .db-table tbody tr:hover td { background: #f8f9fb; }
  .db-table tfoot td {
    padding: 9px 14px; border-top: 2px solid #f1f3f5;
    background: #f8f9fa; font-size: 12px;
  }
  .db-row-stale td { background: #fff5f5 !important; }
  .db-row-stale:hover td { background: #ffeded !important; }

  /* ── Badges ── */
  .db-badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 24px; padding: 2px 8px; border-radius: 20px;
    font-size: 11.5px; font-weight: 700; line-height: 1.4;
  }
  .db-badge--blue   { background: #e7f0ff; color: #3b5bdb; }
  .db-badge--green  { background: #ebfbee; color: #2f9e44; }
  .db-badge--teal   { background: #e6fcf5; color: #0ca678; }
  .db-badge--purple { background: #f3f0ff; color: #7950f2; }
  .db-badge--yellow { background: #fff9db; color: #f08c00; }
  .db-badge--red    { background: #fff5f5; color: #e03131; }
  .db-badge--gray   { background: #f1f3f5; color: #495057; }

  /* ── Progress bar ── */
  .db-bar-cell { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .db-bar { flex: 1; height: 5px; background: #e9ecef; border-radius: 99px; min-width: 40px; max-width: 80px; }
  .db-bar-fill { height: 5px; border-radius: 99px; transition: width 0.3s ease; }
  .db-bar-pct { font-size: 11px; color: #adb5bd; min-width: 30px; text-align: right; }

  /* ── Status pill ── */
  .db-status-pill {
    display: inline-block; font-size: 11px; padding: 2px 8px;
    border-radius: 20px; background: #f1f3f5; color: #495057;
    border: 1px solid #dee2e6;
  }

  /* ── Flags ── */
  .db-flag {
    display: inline-flex; align-items: center; font-size: 11px;
    font-weight: 600; padding: 3px 8px; border-radius: 6px;
  }
  .db-flag--red   { background: #fff5f5; color: #e03131; }
  .db-flag--green { background: #ebfbee; color: #2f9e44; }

  /* ── Loading / empty ── */
  .db-loading { text-align: center; padding: 32px; }
  .db-empty { text-align: center; padding: 32px; color: #adb5bd; font-size: 13px; }

  /* ── Pagination ── */
  .db-pagination {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-top: 1px solid #f1f3f5;
  }
  .db-page-btn {
    width: 28px; height: 28px; border: 1px solid #dee2e6;
    background: #fff; border-radius: 6px; font-size: 14px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .db-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .db-page-info { font-size: 12px; color: #6c757d; padding: 0 4px; }

  /* ── Status badges (Section 5) ── */
  :global(.db-status-badge) {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; padding: 2px 7px; border-radius: 20px;
    font-size: 11px; font-weight: 700; line-height: 1.4;
    border: 1px solid transparent;
  }
  :global(.dsb--primary)   { background: #dbe4ff; color: #3b5bdb; border-color: #bac8ff; }
  :global(.dsb--info)      { background: #e3fafc; color: #0c8599; border-color: #99e9f2; }
  :global(.dsb--secondary) { background: #f1f3f5; color: #495057; border-color: #dee2e6; }
  :global(.dsb--warning)   { background: #fff9db; color: #e67700; border-color: #ffe066; }
  :global(.dsb--success)   { background: #ebfbee; color: #2f9e44; border-color: #b2f2bb; }
  :global(.dsb--danger)    { background: #fff5f5; color: #e03131; border-color: #ffc9c9; }
  :global(.dsb--dark)      { background: #f1f3f5; color: #212529; border-color: #ced4da; }

  /* ── Soft icon backgrounds ── */
  :global(.bg-primary-soft) { background: #e7f0ff; }
  :global(.bg-success-soft) { background: #ebfbee; }
  :global(.bg-warning-soft) { background: #fff9db; }
  :global(.bg-danger-soft)  { background: #fff5f5; }
  :global(.bg-purple-soft)  { background: #f3f0ff; }
  :global(.text-purple) { color: #7950f2; }
</style>
