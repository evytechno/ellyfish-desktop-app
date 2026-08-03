<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { checkAuth } from "$lib/utils/auth";
  import { usersAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import * as XLSX from "xlsx";
  import Loader from "$lib/components/Loader.svelte";
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let currentUser = null;
  let loading = false;

  // Filters
  let selectedYear = getCurrentFiscalYear();
  let selectedUserId = "";
  let selectedRole = "telecaller";   // "admin" | "manager" | "user" | ""
  let selectedSubRole = ""; // "telecaller" | "tech" | ""
  let users = [];

  // Role filter options — shown to master/admin
  const roleOptions = [
    { value: "", label: "All Roles" },
    { value: "admin", label: "Admin", isRole: true },
    { value: "manager", label: "Manager", isRole: true },
    { value: "user", label: "User", isRole: true },
    { value: "telecaller", label: "Telecaller (subRole)", isSubRole: true },
    { value: "tech", label: "Tech (subRole)", isSubRole: true },
  ];

  // Data
  let rows = []; // raw from API: [{userId, userName, month, orderCount, wonCount, lostCount, totalValue}]

  // Fiscal year helpers
  function getCurrentFiscalYear() {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }

  function fiscalYearLabel(y) {
    return `${y}-${String(y + 1).slice(2)}`;
  }

  // Generate list of fiscal years from 2022 to current+1
  $: yearOptions = (() => {
    const cur = getCurrentFiscalYear();
    const years = [];
    for (let y = cur + 1; y >= 2022; y--) years.push(y);
    return years;
  })();

  // The 12 months of the selected fiscal year (Apr → Mar)
  $: fiscalMonths = (() => {
    const months = [];
    for (let m = 0; m < 12; m++) {
      const monthIdx = (3 + m) % 12; // Apr=3, May=4 ... Mar=2
      const y = m < 9 ? selectedYear : selectedYear + 1;
      const key = `${y}-${String(monthIdx + 1).padStart(2, "0")}`;
      const label = new Date(y, monthIdx, 1).toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      });
      months.push({ key, label });
    }
    return months;
  })();

  // Group rows by userId → { userId, userName, userRole, months: {key: {orderCount, wonCount, lostCount, totalValue}} }
  $: userMap = (() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.userId)) {
        map.set(r.userId, {
          userId: r.userId,
          userName: r.userName,
          userRole: r.userRole,
          userSubRole: r.userSubRole,
          months: {},
          totals: { orderCount: 0, wonCount: 0, lostCount: 0, totalValue: 0 },
        });
      }
      const entry = map.get(r.userId);
      entry.months[r.month] = {
        orderCount: r.orderCount,
        wonCount: r.wonCount,
        lostCount: r.lostCount,
        totalValue: r.totalValue,
      };
      entry.totals.orderCount += r.orderCount;
      entry.totals.wonCount += r.wonCount;
      entry.totals.lostCount += r.lostCount;
      entry.totals.totalValue += r.totalValue;
    }
    return map;
  })();

  $: userRows = [...userMap.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName)
  );

  // Grand totals per month
  $: monthTotals = (() => {
    const t = {};
    for (const { key } of fiscalMonths) {
      t[key] = { orderCount: 0, wonCount: 0, lostCount: 0, totalValue: 0 };
    }
    for (const r of rows) {
      if (t[r.month]) {
        t[r.month].orderCount += r.orderCount;
        t[r.month].wonCount += r.wonCount;
        t[r.month].lostCount += r.lostCount;
        t[r.month].totalValue += r.totalValue;
      }
    }
    return t;
  })();

  // Grand totals overall
  $: grandTotal = userRows.reduce(
    (acc, u) => ({
      orderCount: acc.orderCount + u.totals.orderCount,
      wonCount: acc.wonCount + u.totals.wonCount,
      lostCount: acc.lostCount + u.totals.lostCount,
      totalValue: acc.totalValue + u.totals.totalValue,
    }),
    { orderCount: 0, wonCount: 0, lostCount: 0, totalValue: 0 }
  );

  // Summary cards
  $: summaryCards = [
    {
      label: "Total Orders",
      value: grandTotal.orderCount,
      icon: "ti ti-shopping-cart",
      color: "bg-blue-50 text-blue-700 border-blue-200",
      iconColor: "text-blue-500",
    },
    {
      label: "Won",
      value: grandTotal.wonCount,
      icon: "ti ti-trophy",
      color: "bg-green-50 text-green-700 border-green-200",
      iconColor: "text-green-500",
    },
    {
      label: "Lost",
      value: grandTotal.lostCount,
      icon: "ti ti-x",
      color: "bg-red-50 text-red-700 border-red-200",
      iconColor: "text-red-500",
    },
    {
      label: "Revenue",
      value: "₹" + grandTotal.totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      icon: "ti ti-currency-rupee",
      color: "bg-purple-50 text-purple-700 border-purple-200",
      iconColor: "text-purple-500",
    },
  ];

  async function fetchStats() {
    loading = true;
    try {
      const params = new URLSearchParams({ year: String(selectedYear) });
      if (selectedUserId) params.set("byUserId", String(selectedUserId));
      // selectedRole holds either a role value or a subRole value
      const roleOpt = roleOptions.find(r => r.value === selectedRole);
      if (roleOpt?.isRole) params.set("byRole", selectedRole);
      if (roleOpt?.isSubRole) params.set("bySubRole", selectedRole);
      rows = await authApiFetch(
        `${API_ROUTES.ORDER}/user-monthly-stats?${params}`,
        { method: "GET" }
      );
    } catch (e) {
      errorHandle(e);
      rows = [];
    } finally {
      loading = false;
    }
  }

  async function loadUsers() {
    const cached = get(usersAllStore);
    if (cached && cached.length > 0) { users = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch {}
  }

  let filterReady = false;

  onMount(() => {
    currentUser = checkAuth();
    loadUsers();
    fetchStats();
    setTimeout(() => { filterReady = true; }, 400);
  });

  $: if (filterReady) { selectedYear; selectedUserId; selectedRole; fetchStats(); }

  function cellColor(count, max) {
    if (!count) return "";
    const ratio = max > 0 ? count / max : 0;
    if (ratio >= 0.7) return "bg-green-100 font-semibold text-green-800";
    if (ratio >= 0.35) return "bg-yellow-50 text-yellow-800";
    return "text-gray-600";
  }

  // Per-month max across all users (for heat-map)
  $: monthMaxes = (() => {
    const m = {};
    for (const { key } of fiscalMonths) {
      m[key] = Math.max(
        0,
        ...userRows.map((u) => u.months[key]?.orderCount ?? 0)
      );
    }
    return m;
  })();

  // Expanded rows (show won/lost/value breakdown)
  let expandedUsers = new Set();
  function toggleExpand(userId) {
    const s = new Set(expandedUsers);
    s.has(userId) ? s.delete(userId) : s.add(userId);
    expandedUsers = s;
  }

  // Role badge
  function roleBadge(role, subRole) {
    if (subRole === "telecaller") return { label: "Telecaller", cls: "ua-role--tc" };
    if (subRole === "tech_helper") return { label: "Sr. Tech", cls: "ua-role--helper" };
    if (subRole === "tech") return { label: "Tech", cls: "ua-role--tech" };
    if (role === "manager") return { label: "Manager", cls: "ua-role--mgr" };
    if (role === "admin") return { label: "Admin", cls: "ua-role--admin" };
    if (role === "master") return { label: "Master", cls: "ua-role--admin" };
    return { label: role || "User", cls: "ua-role--user" };
  }

  function fmt(val) {
    return val ? "₹" + Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—";
  }

  // Excel export
  function exportExcel() {
    const headerRow1 = ["User", "Role", ...fiscalMonths.map((m) => m.label), "Total"];
    const subHeader = ["", "", ...fiscalMonths.map(() => "Orders"), "Orders"];

    const dataRows = userRows.map((u) => [
      u.userName,
      roleBadge(u.userRole, u.userSubRole).label,
      ...fiscalMonths.map((m) => u.months[m.key]?.orderCount ?? 0),
      u.totals.orderCount,
    ]);

    const wonRows = userRows.map((u) => [
      u.userName + " (Won)",
      "",
      ...fiscalMonths.map((m) => u.months[m.key]?.wonCount ?? 0),
      u.totals.wonCount,
    ]);

    const valueRows = userRows.map((u) => [
      u.userName + " (Revenue ₹)",
      "",
      ...fiscalMonths.map((m) => u.months[m.key]?.totalValue ?? 0),
      u.totals.totalValue,
    ]);

    const totalRow = [
      "TOTAL",
      "",
      ...fiscalMonths.map((m) => monthTotals[m.key]?.orderCount ?? 0),
      grandTotal.orderCount,
    ];

    const ws = XLSX.utils.aoa_to_sheet([
      headerRow1,
      ...dataRows,
      [],
      ["Won breakdown"],
      ...wonRows,
      [],
      ["Revenue breakdown"],
      ...valueRows,
      [],
      totalRow,
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "User Activity");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-activity-${fiscalYearLabel(selectedYear)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }
</script>

{#if loading}
  <Loader />
{/if}

<div class="page-wrapper ua-page">
  <div class="content">

    <!-- Page Header -->
    <div class="ua-toolbar mb-3">
      <div>
        <h4 class="mb-0 ua-title">User Activity Report</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">User Activity</li>
          </ol>
        </nav>
      </div>
      <button type="button" class="btn btn-sm btn-outline-success" on:click={exportExcel}>
        <i class="ti ti-file-type-xls me-1"></i>Export Excel
      </button>
    </div>

    <!-- Filters -->
    <div class="card border-0 shadow-sm mb-3 ua-filter-card">
      <div class="card-body py-2 px-3">
        <div class="ua-filters">
          <div class="ua-filter">
            <label class="form-label mb-1 text-muted">Financial Year</label>
            <select bind:value={selectedYear} class="form-select form-select-sm">
              {#each yearOptions as y}
                <option value={y}>{fiscalYearLabel(y)}</option>
              {/each}
            </select>
          </div>
          {#if currentUser?.role !== "user"}
            <div class="ua-filter">
              <label class="form-label mb-1 text-muted">Role</label>
              <select
                bind:value={selectedRole}
                on:change={() => { selectedUserId = ""; }}
                class="form-select form-select-sm"
              >
                {#each roleOptions as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="ua-filter">
              <label class="form-label mb-1 text-muted">User</label>
              <select bind:value={selectedUserId} class="form-select form-select-sm">
                <option value="">All Users</option>
                {#each users.filter(u => {
                  if (u.role === "master") return false;
                  const roleOpt = roleOptions.find(r => r.value === selectedRole);
                  if (!selectedRole) return true;
                  if (roleOpt?.isRole) return u.role === selectedRole;
                  if (roleOpt?.isSubRole) return u.subRole === selectedRole;
                  return true;
                }) as u}
                  <option value={u.id}>{u.name}</option>
                {/each}
              </select>
            </div>
          {/if}
          <div class="ua-filter ua-filter--action">
            <button type="button" class="btn btn-sm btn-primary" on:click={fetchStats}>
              <i class="ti ti-refresh me-1"></i>Refresh
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="ua-summary mb-3">
      {#each summaryCards as card}
        <div class="ua-summary-card {card.color}">
          <i class="{card.icon} {card.iconColor} ua-summary-icon"></i>
          <div>
            <div class="ua-summary-label">{card.label}</div>
            <div class="ua-summary-value">{card.value}</div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Monthly Breakdown Table -->
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0 ua-table">
            <thead>
              <tr>
                <th class="ua-sticky ua-sticky--user">User</th>
                <th class="ua-sticky ua-sticky--role">Role</th>
                {#each fiscalMonths as m}
                  <th class="text-center">{m.label}</th>
                {/each}
                <th class="text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {#if userRows.length === 0 && !loading}
                <tr>
                  <td colspan={fiscalMonths.length + 3} class="text-center text-muted py-4">
                    No data for {fiscalYearLabel(selectedYear)}
                  </td>
                </tr>
              {/if}

              {#each userRows as u}
                {@const badge = roleBadge(u.userRole, u.userSubRole)}
                {@const isExpanded = expandedUsers.has(u.userId)}

                <tr class="align-middle" class:ua-row--open={isExpanded}>
                  <td class="ua-sticky ua-sticky--user">
                    <button
                      type="button"
                      class="ua-expand-btn"
                      class:ua-expand-btn--open={isExpanded}
                      on:click={() => toggleExpand(u.userId)}
                      title={isExpanded ? "Collapse" : "Expand"}
                      aria-expanded={isExpanded}
                    >
                      <i class="ti ti-chevron-right"></i>
                    </button>
                    {u.userName}
                  </td>
                  <td class="ua-sticky ua-sticky--role">
                    <span class="ua-role-badge {badge.cls}">{badge.label}</span>
                  </td>
                  {#each fiscalMonths as m}
                    {@const cell = u.months[m.key]}
                    <td class="text-center {cellColor(cell?.orderCount ?? 0, monthMaxes[m.key])}">
                      {cell?.orderCount ?? "—"}
                    </td>
                  {/each}
                  <td class="text-center ua-total-cell">{u.totals.orderCount}</td>
                </tr>

                {#if isExpanded}
                  <tr class="ua-detail-row">
                    <td colspan={fiscalMonths.length + 3} class="ua-detail-cell">
                      <div
                        class="ua-detail-panel"
                        transition:slide={{ duration: 240, easing: quintOut }}
                      >
                        <table class="ua-detail-table">
                          <tbody>
                            <tr class="ua-subrow">
                              <td class="ua-sticky ua-sticky--user ua-subrow-label">Won</td>
                              <td class="ua-sticky ua-sticky--role"></td>
                              {#each fiscalMonths as m}
                                {@const cell = u.months[m.key]}
                                <td class="text-center text-success">{cell?.wonCount ?? "—"}</td>
                              {/each}
                              <td class="text-center text-success">{u.totals.wonCount}</td>
                            </tr>
                            <tr class="ua-subrow">
                              <td class="ua-sticky ua-sticky--user ua-subrow-label">Lost</td>
                              <td class="ua-sticky ua-sticky--role"></td>
                              {#each fiscalMonths as m}
                                {@const cell = u.months[m.key]}
                                <td class="text-center text-danger">{cell?.lostCount ?? "—"}</td>
                              {/each}
                              <td class="text-center text-danger">{u.totals.lostCount}</td>
                            </tr>
                            <tr class="ua-subrow ua-subrow--last">
                              <td class="ua-sticky ua-sticky--user ua-subrow-label">Revenue</td>
                              <td class="ua-sticky ua-sticky--role"></td>
                              {#each fiscalMonths as m}
                                {@const cell = u.months[m.key]}
                                <td class="text-center">{cell?.totalValue ? "₹" + Number(cell.totalValue).toLocaleString("en-IN", {maximumFractionDigits:0}) : "—"}</td>
                              {/each}
                              <td class="text-center">{fmt(u.totals.totalValue)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>

            <tfoot>
              <tr>
                <td class="ua-sticky ua-sticky--user">Total</td>
                <td class="ua-sticky ua-sticky--role"></td>
                {#each fiscalMonths as m}
                  <td class="text-center">{monthTotals[m.key]?.orderCount ?? 0}</td>
                {/each}
                <td class="text-center">{grandTotal.orderCount}</td>
              </tr>
              <tr class="ua-subrow">
                <td class="ua-sticky ua-sticky--user">Won</td>
                <td class="ua-sticky ua-sticky--role"></td>
                {#each fiscalMonths as m}
                  <td class="text-center text-success">{monthTotals[m.key]?.wonCount ?? 0}</td>
                {/each}
                <td class="text-center text-success">{grandTotal.wonCount}</td>
              </tr>
              <tr class="ua-subrow">
                <td class="ua-sticky ua-sticky--user">Revenue</td>
                <td class="ua-sticky ua-sticky--role"></td>
                {#each fiscalMonths as m}
                  <td class="text-center">{monthTotals[m.key]?.totalValue ? "₹" + Number(monthTotals[m.key].totalValue).toLocaleString("en-IN",{maximumFractionDigits:0}) : "—"}</td>
                {/each}
                <td class="text-center">{fmt(grandTotal.totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- Trend Bars per User -->
    {#if userRows.length > 0}
      <div class="ua-trends">
        <h6 class="ua-section-title mb-2">Monthly Trend — Orders Created</h6>
        <div class="ua-trend-grid">
          {#each userRows as u}
            {@const maxVal = Math.max(1, ...fiscalMonths.map(m => u.months[m.key]?.orderCount ?? 0))}
            <div class="ua-trend-card">
              <div class="ua-trend-head">
                <span class="ua-trend-name">{u.userName}</span>
                <span class="text-muted">{u.totals.orderCount} total</span>
              </div>
              <div class="ua-trend-bars">
                {#each fiscalMonths as m}
                  {@const val = u.months[m.key]?.orderCount ?? 0}
                  {@const pct = Math.round((val / maxVal) * 100)}
                  <div class="ua-trend-col" title="{m.label}: {val} orders">
                    <div
                      class="ua-trend-bar"
                      style="height:{Math.max(pct * 0.52, val > 0 ? 4 : 0)}px; background: {val === 0 ? '#e9ecef' : val === maxVal ? '#364fc7' : '#91a7ff'};"
                    ></div>
                    <span class="ua-trend-lbl">{m.label.split(" ")[0]}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
</div>

<style>
  /* Cursor-like — 12px, clean, clear */
  .ua-page,
  .ua-page :global(.content) {
    font-size: 12px !important;
    line-height: 1.45 !important;
    -webkit-font-smoothing: antialiased;
  }

  .ua-page :global(.card-body),
  .ua-page :global(.breadcrumb),
  .ua-page :global(.breadcrumb-item),
  .ua-page :global(.form-label),
  .ua-page :global(.form-select),
  .ua-page :global(.form-select-sm),
  .ua-page :global(.btn),
  .ua-page :global(.btn-sm),
  .ua-page :global(table),
  .ua-page :global(th),
  .ua-page :global(td),
  .ua-page :global(label),
  .ua-page :global(select) {
    font-size: 12px !important;
    line-height: 1.45 !important;
    font-weight: 400 !important;
  }

  .ua-page :global(.form-select),
  .ua-page :global(.form-select-sm) {
    height: 28px !important;
    min-height: 28px !important;
    padding: 2px 8px !important;
  }

  .ua-page :global(.btn-sm) {
    padding: 4px 10px !important;
    border-radius: 4px !important;
  }

  .ua-page :global(.text-muted),
  .ua-page :global(small),
  .ua-page :global(.small) {
    font-size: 11px !important;
    font-weight: 400 !important;
  }

  .ua-page :global(.badge) {
    font-size: 10px !important;
    font-weight: 400 !important;
    padding: 2px 6px !important;
  }

  .ua-page :global(.fw-bold),
  .ua-page :global(.fw-semibold),
  .ua-page :global(.font-bold),
  .ua-page :global(.font-semibold),
  .ua-page :global(.font-medium) {
    font-weight: 500 !important;
  }

  .ua-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .ua-title {
    font-size: 15px !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em;
    color: #212529;
    line-height: 1.3;
  }

  .ua-section-title {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: #495057 !important;
    margin: 0;
  }

  .ua-filters {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .ua-filter {
    min-width: 130px;
  }

  .ua-filter :global(.form-label) {
    font-size: 11px !important;
    font-weight: 400 !important;
    margin-bottom: 4px;
  }

  .ua-filter--action {
    min-width: auto;
    padding-bottom: 0;
  }

  .ua-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .ua-summary-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid;
    border-radius: 6px;
    background: #fff;
  }

  .ua-summary-icon {
    font-size: 16px !important;
    flex-shrink: 0;
  }

  .ua-summary-label {
    font-size: 11px !important;
    font-weight: 400 !important;
    color: #868e96;
    line-height: 1.2;
  }

  .ua-summary-value {
    font-size: 15px !important;
    font-weight: 600 !important;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    color: #212529;
  }

  .ua-table {
    min-width: 900px;
    font-size: 12px !important;
    border: none !important;
  }

  .ua-table :global(thead th) {
    font-size: 11px !important;
    font-weight: 400 !important;
    color: #868e96 !important;
    background: #f8f9fa !important;
    border-top: none !important;
    border-bottom: 1px solid #eef1f4 !important;
    padding: 7px 8px !important;
    white-space: nowrap;
    letter-spacing: 0;
    text-transform: none;
  }

  .ua-table :global(td) {
    font-size: 12px !important;
    font-weight: 400 !important;
    padding: 6px 8px !important;
    vertical-align: middle;
    border-color: #f1f3f5 !important;
    color: #343a40;
  }

  .ua-table :global(tfoot td) {
    font-size: 12px !important;
    font-weight: 500 !important;
    background: #f8f9fa !important;
    border-top: 1px solid #e9ecef !important;
    padding: 7px 8px !important;
  }

  .ua-sticky {
    position: sticky;
    z-index: 2;
    background: #fff;
    white-space: nowrap;
  }

  .ua-sticky--user {
    left: 0;
    min-width: 150px;
    max-width: 200px;
    box-shadow: 1px 0 0 #eef1f4;
  }

  .ua-sticky--role {
    left: 150px;
    min-width: 88px;
    width: 88px;
    box-shadow: 2px 0 6px rgba(15, 23, 42, 0.06);
  }

  .ua-table :global(thead .ua-sticky),
  .ua-table :global(tfoot .ua-sticky) {
    background: #f8f9fa !important;
    z-index: 3;
  }

  .ua-role-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px !important;
    font-weight: 400 !important;
    line-height: 1.3;
    white-space: nowrap;
  }

  .ua-role--tc {
    background: #fff9db;
    color: #e67700;
  }
  .ua-role--tech {
    background: #e6fcf5;
    color: #0ca678;
  }
  .ua-role--helper {
    background: #f3f0ff;
    color: #7048e8;
  }
  .ua-role--mgr {
    background: #edf2ff;
    color: #364fc7;
  }
  .ua-role--admin {
    background: #fff5f5;
    color: #c92a2a;
  }
  .ua-role--user {
    background: #f1f3f5;
    color: #495057;
  }

  .ua-expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    margin-right: 4px;
    border: none;
    background: transparent;
    color: #868e96;
    cursor: pointer;
    vertical-align: middle;
  }

  .ua-expand-btn :global(i) {
    display: inline-block;
    font-size: 14px;
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ua-expand-btn--open :global(i) {
    transform: rotate(90deg);
  }

  .ua-expand-btn:hover {
    color: #364fc7;
  }

  .ua-detail-cell {
    padding: 0 !important;
    border: none !important;
    background: transparent !important;
  }

  .ua-detail-panel {
    overflow: hidden;
    border-bottom: 1px solid #e9ecef;
  }

  .ua-detail-table {
    width: 100%;
    min-width: 900px;
    border-collapse: collapse;
    table-layout: auto;
  }

  .ua-detail-table :global(td) {
    font-size: 11px !important;
    font-weight: 400 !important;
    padding: 5px 8px !important;
    vertical-align: middle;
    border-color: #f1f3f5 !important;
    color: #868e96;
    background: #fafbfc !important;
  }

  .ua-total-cell {
    background: #f8f9fa;
    font-weight: 500 !important;
  }

  .ua-subrow :global(td) {
    font-size: 11px !important;
    color: #868e96;
    background: #fafbfc !important;
  }

  .ua-subrow :global(.ua-sticky) {
    background: #fafbfc !important;
  }

  .ua-subrow-label {
    padding-left: 1.75rem !important;
  }

  .ua-subrow--last :global(td) {
    border-bottom: 1px solid #e9ecef !important;
  }

  .ua-trends {
    margin-top: 4px;
  }

  .ua-trend-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .ua-trend-card {
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 10px 12px;
  }

  .ua-trend-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .ua-trend-name {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: #343a40;
  }

  .ua-trend-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 56px;
  }

  .ua-trend-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    min-width: 0;
  }

  .ua-trend-bar {
    width: 100%;
    border-radius: 2px 2px 0 0;
  }

  .ua-trend-lbl {
    font-size: 9px !important;
    font-weight: 400 !important;
    color: #adb5bd;
    line-height: 1;
  }

  @media (max-width: 900px) {
    .ua-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .ua-trend-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
