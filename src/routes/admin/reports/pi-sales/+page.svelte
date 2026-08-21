<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { checkAuth, canAccess } from "$lib/utils/auth";
  import { usersAllStore } from "$lib/stores/dataStores";
  import { piSalesFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  import * as XLSX from "xlsx";
  import Loader from "$lib/components/Loader.svelte";
  import OrderQuickView from "$lib/components/OrderQuickView.svelte";

  let currentUser = null;
  let loading = false;
  let users = [];
  let extraAssignedUsers = [];
  let rows = [];
  let personTotals = [];
  let totals = { count: 0, withoutGst: 0, withGst: 0 };

  let selectedYear = getCurrentFiscalYear();
  let datePreset = "fy";
  let customStartDate = "";
  let customEndDate = "";
  let selectedUserIds = [];
  let salesUserMenuOpen = false;
  let selectedTelecallerId = "";
  let selectedTechId = "";
  let searchTerm = "";
  let searchTimeout;
  let filterReady = false;
  let summaryOpen = false;
  let hidePrices = true;
  let orderDrawerOpen = false;
  let drawerOrderId = null;

  restoreFilters();

  function restoreFilters() {
    const saved = get(piSalesFilterStore);
    if (!saved || typeof saved !== "object") return;
    if (saved.datePreset) datePreset = saved.datePreset;
    if (saved.selectedYear != null && saved.selectedYear !== "") {
      selectedYear = Number(saved.selectedYear);
    }
    if (saved.customStartDate != null) customStartDate = saved.customStartDate;
    if (saved.customEndDate != null) customEndDate = saved.customEndDate;
    if (Array.isArray(saved.selectedUserIds)) {
      selectedUserIds = saved.selectedUserIds.map(Number).filter((n) => n > 0);
    }
    if (saved.selectedTelecallerId != null) selectedTelecallerId = saved.selectedTelecallerId;
    if (saved.selectedTechId != null) selectedTechId = saved.selectedTechId;
    if (saved.searchTerm != null) searchTerm = saved.searchTerm;
    if (typeof saved.hidePrices === "boolean") hidePrices = saved.hidePrices;
    if (datePreset === "custom" && (!customStartDate || !customEndDate)) {
      datePreset = "fy";
      customStartDate = "";
      customEndDate = "";
    }
  }

  function saveFilters() {
    piSalesFilterStore.set({
      selectedYear,
      datePreset,
      customStartDate,
      customEndDate,
      selectedUserIds,
      selectedTelecallerId,
      selectedTechId,
      searchTerm,
      hidePrices,
    });
  }

  function toggleHidePrices() {
    hidePrices = !hidePrices;
    saveFilters();
  }

  function getCurrentFiscalYear() {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }

  function fiscalYearLabel(y) {
    const n = Number(y);
    return `${n}-${String(n + 1).slice(2)}`;
  }

  $: yearOptions = (() => {
    const cur = getCurrentFiscalYear();
    const years = [];
    for (let y = cur + 1; y >= 2022; y--) years.push(y);
    return years;
  })();

  $: salesUsers = (() => {
    const map = new Map();
    for (const u of users) {
      if (!u?.id || u.role === "master") continue;
      map.set(Number(u.id), { id: u.id, name: u.name });
    }
    for (const u of extraAssignedUsers) {
      const id = Number(u?.id);
      if (!id || map.has(id)) continue;
      map.set(id, { id, name: u.name });
    }
    return [...map.values()].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
    );
  })();
  $: telecallers = users.filter((u) => u.subRole === "telecaller");
  $: techs = users.filter((u) => u.subRole === "tech");
  $: selectedSalesUserLabel = (() => {
    if (!selectedUserIds.length) return "All";
    if (selectedUserIds.length === 1) {
      const u = salesUsers.find((x) => Number(x.id) === Number(selectedUserIds[0]));
      return u?.name || "1 selected";
    }
    return `${selectedUserIds.length} selected`;
  })();

  function toggleSalesUser(id) {
    const n = Number(id);
    if (selectedUserIds.includes(n)) {
      selectedUserIds = selectedUserIds.filter((x) => x !== n);
    } else {
      selectedUserIds = [...selectedUserIds, n];
    }
  }

  function clearSalesUsers() {
    selectedUserIds = [];
  }

  function onDocClickSalesUser(e) {
    if (!salesUserMenuOpen) return;
    const root = e.target?.closest?.("[data-ps-sales-user]");
    if (!root) salesUserMenuOpen = false;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function dateRange() {
    const now = new Date();
    if (datePreset === "today") {
      const d = isoDate(now);
      return { startDate: d, endDate: d };
    }
    if (datePreset === "last7") {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { startDate: isoDate(start), endDate: isoDate(now) };
    }
    if (datePreset === "last30") {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { startDate: isoDate(start), endDate: isoDate(now) };
    }
    if (datePreset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: isoDate(start), endDate: isoDate(now) };
    }
    if (datePreset === "custom" && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    const y = Number(selectedYear);
    return {
      startDate: `${y}-04-01`,
      endDate: `${y + 1}-03-31`,
    };
  }

  async function fetchReport() {
    if (datePreset === "custom" && (!customStartDate || !customEndDate)) return;
    loading = true;
    try {
      const { startDate, endDate } = dateRange();
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedUserIds.length) {
        params.set("byUserId", selectedUserIds.join(","));
      }
      if (selectedTelecallerId) params.set("telecallerId", String(selectedTelecallerId));
      if (selectedTechId) params.set("techId", String(selectedTechId));
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const res = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/pi-sales-report?${params}`);
      rows = res?.data ?? [];
      personTotals = res?.personTotals ?? [];
      totals = res?.totals ?? { count: 0, withoutGst: 0, withGst: 0 };
      if (!selectedUserIds.length) {
        const extras = [];
        const seen = new Set();
        for (const p of personTotals) {
          const id = Number(p?.userId);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          extras.push({ id, name: p.name });
        }
        extraAssignedUsers = extras;
      }
    } catch (e) {
      errorHandle(e);
      rows = [];
      personTotals = [];
      totals = { count: 0, withoutGst: 0, withGst: 0 };
    } finally {
      loading = false;
    }
  }

  async function loadUsers() {
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/all`);
      users = data ?? [];
      if (users.length) usersAllStore.set(users);
    } catch {
      users = get(usersAllStore) ?? [];
    }
  }

  onMount(() => {
    currentUser = checkAuth();
    if (!currentUser) {
      goto("/login");
      return;
    }
    if (
      (currentUser.role !== "master" && currentUser.role !== "admin") ||
      !canAccess("reports", "view", currentUser)
    ) {
      goto("/admin/dashboard");
      return;
    }
    loadUsers();
    fetchReport();
    document.addEventListener("click", onDocClickSalesUser);
    setTimeout(() => {
      filterReady = true;
    }, 400);
    return () => document.removeEventListener("click", onDocClickSalesUser);
  });

  $: if (filterReady) {
    selectedYear;
    datePreset;
    customStartDate;
    customEndDate;
    selectedUserIds;
    selectedTelecallerId;
    selectedTechId;
    saveFilters();
    fetchReport();
  }

  function onSearchInput(e) {
    clearTimeout(searchTimeout);
    const v = e.target.value;
    searchTimeout = setTimeout(() => {
      searchTerm = v;
      saveFilters();
      fetchReport();
    }, 300);
  }

  function names(list) {
    if (!list?.length) return "—";
    return list.map((u) => u.name).join(", ");
  }

  function inr(n) {
    return (
      "₹" +
      Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function piNo(n) {
    if (n == null || n === "") return "—";
    return String(n).padStart(6, "0");
  }

  function orderLabel(row) {
    if (row.orderPid) return `#${row.orderPid} - ${row.orderTitle || ""}`.trim();
    return row.orderTitle || "—";
  }

  function orderSub(row) {
    return [row.inqCode, row.clientName, row.orderStatus].filter(Boolean).join(" · ");
  }

  function openOrderQuickView(id) {
    if (!id) return;
    drawerOrderId = id;
    orderDrawerOpen = true;
  }

  function closeOrderQuickView() {
    orderDrawerOpen = false;
    drawerOrderId = null;
  }

  function personKey(row) {
    return row.assignedUsers?.length
      ? row.assignedUsers.map((u) => u.name).join(", ")
      : "Unassigned";
  }

  $: groupedRows = (() => {
    const groups = [];
    let current = null;
    for (const row of rows) {
      const key = personKey(row);
      if (!current || current.key !== key) {
        current = { key, rows: [] };
        groups.push(current);
      }
      current.rows.push(row);
    }
    return groups;
  })();

  function groupTotals(list) {
    return list.reduce(
      (acc, r) => ({
        withoutGst: acc.withoutGst + Number(r.withoutGst || 0),
        withGst: acc.withGst + Number(r.withGst || 0),
        advanceAmount: acc.advanceAmount + Number(r.advanceAmount || 0),
      }),
      { withoutGst: 0, withGst: 0, advanceAmount: 0 },
    );
  }

  function exportExcel() {
    const price = (n) => (hidePrices ? "" : Number(n || 0));
    const header = [
      "Person",
      "Telecaller",
      "Tech",
      "Order #",
      "Order Title",
      "Client",
      "Status",
      "Inq. Code",
      "WO No.",
      "PI No.",
      "Without GST",
      "With GST",
      "Advance / Override",
      "PI Create Date",
    ];
    const dataRows = rows.map((r) => [
      names(r.assignedUsers) === "—" ? "Unassigned" : names(r.assignedUsers),
      names(r.telecallers),
      names(r.techs),
      r.orderPid ?? "—",
      r.orderTitle || "—",
      r.clientName || "—",
      r.orderStatus || "—",
      r.inqCode || "—",
      r.woNumber || "—",
      piNo(r.invoiceNo),
      price(r.withoutGst),
      price(r.withGst),
      hidePrices ? "" : Number(r.advanceAmount || 0) || "",
      fmtDate(r.createdAt),
    ]);
    const totalRow = [
      "GRAND TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      `${totals.count} PI`,
      price(totals.withoutGst),
      price(totals.withGst),
      "",
      "",
    ];
    const personHeader = ["Person", "PI Count", "Without GST", "With GST"];
    const personRows = personTotals.map((p) => [
      p.name,
      p.count,
      price(p.withoutGst),
      price(p.withGst),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([
      header,
      ...dataRows,
      [],
      totalRow,
      [],
      ["Person-wise totals (shared orders count for each assigned user)"],
      personHeader,
      ...personRows,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PI Sales");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pi-sales-${datePreset === "fy" ? fiscalYearLabel(selectedYear) : isoDate(new Date())}.xlsx`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }
</script>

{#if loading}
  <Loader />
{/if}

<div class="page-wrapper ps-page">
  <div class="content">
    <div class="ps-toolbar mb-3">
      <div>
        <h4 class="mb-0 ps-title">PI Sales Report</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">PI Sales</li>
          </ol>
        </nav>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button
          type="button"
          class="btn btn-sm {hidePrices ? 'btn-outline-secondary' : 'btn-outline-primary'}"
          on:click={toggleHidePrices}
          title={hidePrices ? "Show prices" : "Hide prices"}
        >
          <i class="ti {hidePrices ? 'ti-eye-off' : 'ti-eye'} me-1"></i>
          {hidePrices ? "Show prices" : "Hide prices"}
        </button>
        <button type="button" class="btn btn-sm btn-outline-success" on:click={exportExcel} disabled={!rows.length}>
          <i class="ti ti-file-type-xls me-1"></i>Export Excel
        </button>
      </div>
    </div>

    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body py-2 px-3">
        <div class="ps-filters">
          <div class="ps-filter">
            <label class="form-label mb-1 text-muted">Period</label>
            <select bind:value={datePreset} class="form-select form-select-sm">
              <option value="fy">Financial Year</option>
              <option value="month">This Month</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="today">Today</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {#if datePreset === "fy"}
            <div class="ps-filter">
              <label class="form-label mb-1 text-muted">FY</label>
              <select bind:value={selectedYear} class="form-select form-select-sm">
                {#each yearOptions as y}
                  <option value={y}>{fiscalYearLabel(y)}</option>
                {/each}
              </select>
            </div>
          {/if}
          {#if datePreset === "custom"}
            <div class="ps-filter">
              <label class="form-label mb-1 text-muted">From</label>
              <input type="date" class="form-control form-control-sm" bind:value={customStartDate} />
            </div>
            <div class="ps-filter">
              <label class="form-label mb-1 text-muted">To</label>
              <input type="date" class="form-control form-control-sm" bind:value={customEndDate} />
            </div>
          {/if}
          <div class="ps-filter ps-filter--sales" data-ps-sales-user>
            <label class="form-label mb-1 text-muted">Sales User</label>
            <div class="ps-ms">
              <button
                type="button"
                class="form-select form-select-sm ps-ms-btn text-start"
                on:click|stopPropagation={() => (salesUserMenuOpen = !salesUserMenuOpen)}
              >
                <span class="ps-ms-label">{selectedSalesUserLabel}</span>
              </button>
              {#if salesUserMenuOpen}
                <div class="ps-ms-menu" on:click|stopPropagation>
                  <div class="ps-ms-actions">
                    <button type="button" class="btn btn-link btn-sm p-0" on:click={clearSalesUsers}
                      >All</button
                    >
                    {#if selectedUserIds.length}
                      <button
                        type="button"
                        class="btn btn-link btn-sm p-0 text-danger"
                        on:click={clearSalesUsers}>Clear</button
                      >
                    {/if}
                  </div>
                  <div class="ps-ms-list">
                    {#each salesUsers as u}
                      <label class="ps-ms-item">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(Number(u.id))}
                          on:change={() => toggleSalesUser(u.id)}
                        />
                        <span>{u.name}</span>
                      </label>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
          <div class="ps-filter">
            <label class="form-label mb-1 text-muted">Telecaller</label>
            <select bind:value={selectedTelecallerId} class="form-select form-select-sm">
              <option value="">All</option>
              {#each telecallers as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          </div>
          <div class="ps-filter">
            <label class="form-label mb-1 text-muted">Tech</label>
            <select bind:value={selectedTechId} class="form-select form-select-sm">
              <option value="">All</option>
              {#each techs as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          </div>
          <div class="ps-filter ps-filter--search">
            <label class="form-label mb-1 text-muted">Search</label>
            <input
              type="text"
              class="form-control form-control-sm"
              placeholder="WO / PI / Order / Client"
              value={searchTerm}
              on:input={onSearchInput}
            />
          </div>
          <div class="ps-filter ps-filter--action">
            <button type="button" class="btn btn-sm btn-primary" on:click={fetchReport}>
              <i class="ti ti-refresh me-1"></i>Refresh
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm mb-3">
      <button
        type="button"
        class="ps-collapse-toggle"
        aria-expanded={summaryOpen}
        on:click={() => (summaryOpen = !summaryOpen)}
      >
        <span class="ps-collapse-title">Summary totals</span>
        <span class="ps-collapse-hint text-muted">{totals.count} PIs</span>
        <i class="ti {summaryOpen ? 'ti-chevron-up' : 'ti-chevron-down'} ms-auto"></i>
      </button>
      {#if summaryOpen}
        <div class="card-body pt-0">
          <div class="ps-summary mb-3">
            <div class="ps-summary-card bg-blue-50 text-blue-700 border-blue-200">
              <i class="ti ti-file-invoice text-blue-500 ps-summary-icon"></i>
              <div>
                <div class="ps-summary-label">PIs</div>
                <div class="ps-summary-value">{totals.count}</div>
              </div>
            </div>
            <div class="ps-summary-card bg-amber-50 text-amber-800 border-amber-200">
              <i class="ti ti-receipt-tax text-amber-500 ps-summary-icon"></i>
              <div>
                <div class="ps-summary-label">Without GST</div>
                <div class="ps-summary-value">{hidePrices ? "—" : inr(totals.withoutGst)}</div>
              </div>
            </div>
            <div class="ps-summary-card bg-green-50 text-green-700 border-green-200">
              <i class="ti ti-currency-rupee text-green-500 ps-summary-icon"></i>
              <div>
                <div class="ps-summary-label">With GST</div>
                <div class="ps-summary-value">{hidePrices ? "—" : inr(totals.withGst)}</div>
              </div>
            </div>
          </div>

          {#if personTotals.length}
            <div class="ps-section-title px-0">Person-wise totals</div>
            <div class="table-responsive">
              <table class="table table-sm mb-0 ps-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th class="text-center">PIs</th>
                    <th class="text-end">Without GST</th>
                    <th class="text-end">With GST</th>
                  </tr>
                </thead>
                <tbody>
                  {#each personTotals as p}
                    <tr>
                      <td>{p.name}</td>
                      <td class="text-center">{p.count}</td>
                      <td class="text-end">{hidePrices ? "—" : inr(p.withoutGst)}</td>
                      <td class="text-end">{hidePrices ? "—" : inr(p.withGst)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <div class="ps-note px-0">Shared orders are counted for each assigned user. Grand total below is unique PIs.</div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0 ps-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Telecaller</th>
                <th>Tech</th>
                <th>Order</th>
                <th>WO No.</th>
                <th>PI</th>
                <th class="text-end">Without GST</th>
                <th class="text-end">With GST</th>
                <th class="text-end">Advance</th>
                <th>PI Date</th>
              </tr>
            </thead>
            <tbody>
              {#if !rows.length && !loading}
                <tr>
                  <td colspan="10" class="text-center text-muted py-4">No PIs in this period</td>
                </tr>
              {/if}
              {#each groupedRows as group}
                {#each group.rows as row, i}
                  <tr>
                    <td>
                      {#if i === 0}
                        <span class="ps-person">{group.key}</span>
                      {/if}
                    </td>
                    <td>{names(row.telecallers)}</td>
                    <td>{names(row.techs)}</td>
                    <td>
                      {#if row.orderId}
                        <button
                          type="button"
                          class="ps-order-link"
                          title="Order quick view — {orderLabel(row)}"
                          on:click={() => openOrderQuickView(row.orderId)}
                        >
                          <div class="ps-order-main">{orderLabel(row)}</div>
                          {#if orderSub(row)}
                            <div class="ps-order-sub">{orderSub(row)}</div>
                          {/if}
                        </button>
                      {:else}
                        —
                      {/if}
                    </td>
                    <td>{row.woNumber || "—"}</td>
                    <td>
                      <a href="/admin/invoice/{row.id}">#{piNo(row.invoiceNo)}</a>
                    </td>
                    <td class="text-end">{hidePrices ? "—" : inr(row.withoutGst)}</td>
                    <td class="text-end">{hidePrices ? "—" : inr(row.withGst)}</td>
                    <td class="text-end text-muted">
                      {#if hidePrices || !(Number(row.advanceAmount || 0) > 0)}
                        —
                      {:else}
                        {inr(row.advanceAmount)}
                      {/if}
                    </td>
                    <td>{fmtDate(row.createdAt)}</td>
                  </tr>
                {/each}
                {#if group.rows.length > 1}
                  {@const gt = groupTotals(group.rows)}
                  <tr class="ps-subtotal">
                    <td colspan="6">Subtotal · {group.key}</td>
                    <td class="text-end">{hidePrices ? "—" : inr(gt.withoutGst)}</td>
                    <td class="text-end">{hidePrices ? "—" : inr(gt.withGst)}</td>
                    <td class="text-end">{hidePrices ? "—" : inr(gt.advanceAmount)}</td>
                    <td></td>
                  </tr>
                {/if}
              {/each}
            </tbody>
            {#if rows.length}
              <tfoot>
                <tr class="ps-grand">
                  <td colspan="6">Grand total · {totals.count} PI</td>
                  <td class="text-end">{hidePrices ? "—" : inr(totals.withoutGst)}</td>
                  <td class="text-end">{hidePrices ? "—" : inr(totals.withGst)}</td>
                  <td class="text-end">
                    {hidePrices
                      ? "—"
                      : inr(rows.reduce((s, r) => s + Number(r.advanceAmount || 0), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            {/if}
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<OrderQuickView
  bind:open={orderDrawerOpen}
  orderId={drawerOrderId}
  {currentUser}
  on:close={closeOrderQuickView}
/>

<style>
  .ps-page :global(.content) {
    padding-bottom: 32px;
  }

  .ps-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .ps-title {
    font-weight: 600;
  }

  .ps-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 12px;
    align-items: flex-end;
  }

  .ps-filter {
    min-width: 140px;
  }

  .ps-filter--sales {
    min-width: 170px;
    position: relative;
    z-index: 20;
  }

  .ps-ms {
    position: relative;
  }

  .ps-ms-btn {
    display: flex;
    align-items: center;
    width: 100%;
    overflow: hidden;
  }

  .ps-ms-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ps-ms-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    min-width: 220px;
    max-height: 280px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
    z-index: 30;
  }

  .ps-ms-actions {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px 4px;
    border-bottom: 1px solid #f1f3f5;
  }

  .ps-ms-list {
    overflow-y: auto;
    padding: 4px 0;
  }

  .ps-ms-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    margin: 0;
    font-size: 13px;
    cursor: pointer;
  }

  .ps-ms-item:hover {
    background: #f8f9fa;
  }

  .ps-ms-item input {
    margin: 0;
  }

  .ps-filter--search {
    min-width: 180px;
    flex: 1;
  }

  .ps-filter--action {
    min-width: auto;
  }

  .ps-filter .form-label {
    font-size: 11px;
  }

  .ps-collapse-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }

  .ps-collapse-toggle:hover {
    background: #f8f9fa;
  }

  .ps-collapse-title {
    font-size: 13px;
    font-weight: 600;
    color: #343a40;
  }

  .ps-collapse-hint {
    font-size: 12px;
  }

  .ps-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .ps-summary-card {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid;
    border-radius: 10px;
    padding: 12px 14px;
  }

  .ps-summary-icon {
    font-size: 22px;
  }

  .ps-summary-label {
    font-size: 11px;
    opacity: 0.8;
  }

  .ps-summary-value {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
  }

  .ps-section-title {
    font-size: 12px;
    font-weight: 600;
    padding: 10px 14px 0;
    color: #495057;
  }

  .ps-note {
    font-size: 11px;
    color: #868e96;
    padding: 6px 14px 10px;
  }

  .ps-table th {
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    background: #f8f9fa;
  }

  .ps-table td {
    font-size: 12px;
    vertical-align: middle;
  }

  .ps-person {
    font-weight: 600;
    color: #212529;
  }

  .ps-order-link {
    display: block;
    width: 100%;
    max-width: 280px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }

  .ps-order-link:hover .ps-order-main {
    color: #405189;
    text-decoration: underline;
  }

  .ps-order-main {
    font-weight: 600;
    color: #0d6efd;
    line-height: 1.25;
  }

  .ps-order-sub {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
    line-height: 1.3;
  }

  .ps-subtotal td {
    background: #f8f9fa;
    font-weight: 600;
    font-size: 12px;
  }

  .ps-grand td {
    background: #eef2ff;
    font-weight: 700;
    font-size: 12.5px;
  }

  @media (max-width: 900px) {
    .ps-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
