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
    if (subRole === "telecaller") return { label: "Telecaller", cls: "bg-yellow-100 text-yellow-800" };
    if (subRole === "tech") return { label: "Tech", cls: "bg-teal-100 text-teal-800" };
    if (role === "manager") return { label: "Manager", cls: "bg-blue-100 text-blue-800" };
    if (role === "admin") return { label: "Admin", cls: "bg-red-100 text-red-800" };
    return { label: "User", cls: "bg-gray-100 text-gray-700" };
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

<div class="page-wrapper">
  <div class="content">

    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">User Activity Report</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">User Activity</li>
          </ol>
        </nav>
      </div>
      <button class="btn btn-outline-success" on:click={exportExcel}>
        <i class="ti ti-file-type-xls me-1"></i>Export Excel
      </button>
    </div>

    <!-- Filters -->
    <div class="card border-0 mb-4">
      <div class="card-body py-3">
        <div class="flex items-center gap-3 flex-wrap">
          <div>
            <label class="form-label mb-1 text-xs text-muted">Financial Year</label>
            <select
              bind:value={selectedYear}
              class="form-select form-select-sm"
              style="min-width:130px"
            >
              {#each yearOptions as y}
                <option value={y}>{fiscalYearLabel(y)}</option>
              {/each}
            </select>
          </div>
          {#if currentUser?.role !== "user"}
            <div>
              <label class="form-label mb-1 text-xs text-muted">Role</label>
              <select
                bind:value={selectedRole}
                on:change={() => { selectedUserId = ""; }}
                class="form-select form-select-sm"
                style="min-width:160px"
              >
                {#each roleOptions as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="form-label mb-1 text-xs text-muted">User</label>
              <select
                bind:value={selectedUserId}
                class="form-select form-select-sm"
                style="min-width:160px"
              >
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
          <div class="mt-4">
            <button class="btn btn-sm btn-primary" on:click={fetchStats}>
              <i class="ti ti-refresh me-1"></i>Refresh
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {#each summaryCards as card}
        <div class="card border {card.color} mb-0">
          <div class="card-body py-3 px-4 flex items-center gap-3">
            <div class="rounded-lg p-2 {card.color}">
              <i class="{card.icon} {card.iconColor} text-xl"></i>
            </div>
            <div>
              <div class="text-xs text-muted">{card.label}</div>
              <div class="text-lg font-bold">{card.value}</div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Monthly Breakdown Table -->
    <div class="card border-0">
      <div class="card-body p-0">
        <div class="overflow-x-auto">
          <table class="table table-bordered table-hover mb-0 text-sm" style="min-width:900px">
            <thead class="table-light">
              <tr>
                <th class="sticky left-0 bg-light z-10" style="min-width:160px">User</th>
                <th style="min-width:80px">Role</th>
                {#each fiscalMonths as m}
                  <th class="text-center" style="min-width:72px">{m.label}</th>
                {/each}
                <th class="text-center bg-light" style="min-width:72px">Total</th>
              </tr>
            </thead>
            <tbody>
              {#if userRows.length === 0 && !loading}
                <tr>
                  <td colspan={fiscalMonths.length + 3} class="text-center text-muted py-5">
                    No data for {fiscalYearLabel(selectedYear)}
                  </td>
                </tr>
              {/if}

              {#each userRows as u}
                {@const badge = roleBadge(u.userRole, u.userSubRole)}
                {@const isExpanded = expandedUsers.has(u.userId)}

                <!-- Main row: order counts -->
                <tr class="align-middle">
                  <td class="sticky left-0 bg-white z-10 font-medium">
                    <button
                      class="btn btn-link btn-sm p-0 me-1 text-muted"
                      on:click={() => toggleExpand(u.userId)}
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      <i class="ti {isExpanded ? 'ti-chevron-down' : 'ti-chevron-right'} text-xs"></i>
                    </button>
                    {u.userName}
                  </td>
                  <td>
                    <span class="badge {badge.cls} text-xs">{badge.label}</span>
                  </td>
                  {#each fiscalMonths as m}
                    {@const cell = u.months[m.key]}
                    <td class="text-center {cellColor(cell?.orderCount ?? 0, monthMaxes[m.key])}">
                      {cell?.orderCount ?? "—"}
                    </td>
                  {/each}
                  <td class="text-center font-bold bg-gray-50">{u.totals.orderCount}</td>
                </tr>

                <!-- Expanded: won / lost / revenue sub-rows -->
                {#if isExpanded}
                  <tr class="bg-gray-50 text-xs text-muted">
                    <td class="sticky left-0 bg-gray-50 ps-8">Won</td>
                    <td></td>
                    {#each fiscalMonths as m}
                      {@const cell = u.months[m.key]}
                      <td class="text-center text-green-700">{cell?.wonCount ?? "—"}</td>
                    {/each}
                    <td class="text-center text-green-700 font-semibold">{u.totals.wonCount}</td>
                  </tr>
                  <tr class="bg-gray-50 text-xs text-muted">
                    <td class="sticky left-0 bg-gray-50 ps-8">Lost</td>
                    <td></td>
                    {#each fiscalMonths as m}
                      {@const cell = u.months[m.key]}
                      <td class="text-center text-red-600">{cell?.lostCount ?? "—"}</td>
                    {/each}
                    <td class="text-center text-red-600 font-semibold">{u.totals.lostCount}</td>
                  </tr>
                  <tr class="bg-gray-50 text-xs text-muted border-b-2">
                    <td class="sticky left-0 bg-gray-50 ps-8">Revenue</td>
                    <td></td>
                    {#each fiscalMonths as m}
                      {@const cell = u.months[m.key]}
                      <td class="text-center">{cell?.totalValue ? "₹" + Number(cell.totalValue).toLocaleString("en-IN", {maximumFractionDigits:0}) : "—"}</td>
                    {/each}
                    <td class="text-center font-semibold">{fmt(u.totals.totalValue)}</td>
                  </tr>
                {/if}
              {/each}
            </tbody>

            <!-- Footer totals row -->
            <tfoot class="table-light fw-bold">
              <tr>
                <td class="sticky left-0 bg-light">Total</td>
                <td></td>
                {#each fiscalMonths as m}
                  <td class="text-center">{monthTotals[m.key]?.orderCount ?? 0}</td>
                {/each}
                <td class="text-center">{grandTotal.orderCount}</td>
              </tr>
              <tr class="text-xs text-green-700">
                <td class="sticky left-0 bg-light">Won</td>
                <td></td>
                {#each fiscalMonths as m}
                  <td class="text-center">{monthTotals[m.key]?.wonCount ?? 0}</td>
                {/each}
                <td class="text-center">{grandTotal.wonCount}</td>
              </tr>
              <tr class="text-xs text-purple-700">
                <td class="sticky left-0 bg-light">Revenue</td>
                <td></td>
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
      <div class="mt-4">
        <h6 class="mb-3 text-sm font-semibold text-muted">Monthly Trend — Orders Created</h6>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each userRows as u}
            {@const maxVal = Math.max(1, ...fiscalMonths.map(m => u.months[m.key]?.orderCount ?? 0))}
            <div class="card border-0 shadow-sm">
              <div class="card-body py-3 px-4">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold text-sm">{u.userName}</span>
                  <span class="text-xs text-muted">{u.totals.orderCount} total</span>
                </div>
                <div class="flex items-end gap-1" style="height:56px">
                  {#each fiscalMonths as m}
                    {@const val = u.months[m.key]?.orderCount ?? 0}
                    {@const pct = Math.round((val / maxVal) * 100)}
                    <div
                      class="flex-1 flex flex-col items-center justify-end gap-0.5"
                      title="{m.label}: {val} orders"
                    >
                      <div
                        class="w-full rounded-t"
                        style="height:{Math.max(pct * 0.52, val > 0 ? 4 : 0)}px; background: {val === 0 ? '#e9ecef' : val === maxVal ? '#0d6efd' : '#86b7fe'};"
                      ></div>
                      <span class="text-[9px] text-muted">{m.label.split(" ")[0]}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
</div>
