<script>
  import { createEventDispatcher } from "svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { maskAssignedName } from "$lib/utils/maskUser";

  export let listOrders = [];
  export let loadingData = false;
  export let currentUser = null;
  export let listCurrentPage = 1;
  export let listRowsPerPage = 10;
  export let listTotalItems = 0;
  export let listTotalPages = 1;
  export let selectedOrders = new Set();

  const dispatch = createEventDispatcher();

  const statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
  };

  $: columns = [
    {
      key: "title",
      label: "Title",
      render: (val, row) => {
        const sub = [
          row?.pId ? `#${String(row.pId).padStart(6, "0")}` : null,
          row?.inqCode ? row.inqCode : null,
        ].filter(Boolean).join(" · ");
        const label = row?.pId ? `#${row.pId} - ${row?.title || ""}` : (row?.title || "");
        const pendingReminder = row?.orderReminders?.find(r => !r.sent && !r.deletedAt);
        const reminderBadge = pendingReminder
          ? `<span class="order-reminder-chip" title="Reminder: ${new Date(pendingReminder.reminderTime).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})}"><i class="ti ti-clock"></i>${new Date(pendingReminder.reminderTime).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>`
          : "";
        const importBadge = row?.source === 'old_import'
          ? `<span class="order-import-chip">Old Import</span>`
          : "";
        return `<a href="/admin/order/${row.id}" class="order-title-link"><div class="order-title-main">${label}${reminderBadge}${importBadge}</div>${sub ? `<div class="order-title-sub">${sub}</div>` : ""}</a>`;
      },
    },
    { key: "workOrderNumber", label: "Work Order No." },
    {
      key: "inqCode",
      label: "Inq. Code",
      render: (val) => val
        ? `<span class="order-cell-text">${val}</span>`
        : `<span class="text-muted">—</span>`,
    },
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        const color = statusesColors[row?.status] || "bg-gray";
        const darkText = color === "bg-yellow" || color === "bg-[#FFBF00]";
        return `<span class="badge order-status-badge ${color}${darkText ? " is-dark-text" : ""}">${
          $statusNamesStore[row?.status]?.name || row?.status || "—"
        }</span>`;
      },
    },
    {
      key: "orderDate",
      label: "Order Date",
      render: (val, row) =>
        row?.orderDate
          ? `<span class="order-cell-text">${new Date(row.orderDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>`
          : "",
    },
    {
      key: "createdAt",
      label: "Created Date",
      render: (val, row) =>
        row?.createdAt
          ? `<span class="order-cell-text">${new Date(row.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit", hour12: true,
            })}</span>`
          : "",
    },
    ...(currentUser?.role !== "user"
      ? [{
          key: "user",
          label: "User",
          render: (val, row) =>
            `<span class="order-cell-text">${(row?.assignedUsers || []).map((user) => maskAssignedName(user, currentUser)).join(", ")}</span>`,
        }]
      : []),
    {
      key: "piwoTi",
      label: "PI / WO / TI",
      render: (val, row) => {
        if (row.status !== "Deal Won") return '<span class="text-muted">—</span>';
        const pi = row.orderPayments?.[0];
        const wo = row.workOrders?.[0];
        const ti = row.invoices?.[0];
        const piBtn = `<button onclick="window.__openPIWOTI('PI',${row.id})" class="order-pi-btn order-pi-btn--pi ${pi ? "is-done" : ""}" title="${pi ? `PI: ${pi.financialYear}/${String(pi.invoiceNo).padStart(6, "0")}` : "Create PI"}">PI${pi ? " ✓" : ""}</button>`;
        const woBtn = pi
          ? `<button onclick="window.__openPIWOTI('WO',${row.id})" class="order-pi-btn order-pi-btn--wo ${wo ? "is-done" : ""}" title="${wo ? `WO: ${wo.workOrderNo}` : "Create WO"}">WO${wo ? " ✓" : ""}</button>`
          : `<span class="order-pi-btn order-pi-btn--wo is-disabled" title="Create PI first">WO</span>`;
        const tiBtn = wo
          ? `<button onclick="window.__openPIWOTI('TI',${row.id})" class="order-pi-btn order-pi-btn--ti ${ti ? "is-done" : ""}" title="${ti ? `TI: ${ti.financialYear}/${String(ti.invoiceNo).padStart(6, "0")}` : "Create TI"}">TI${ti ? " ✓" : ""}</button>`
          : `<span class="order-pi-btn order-pi-btn--ti is-disabled" title="Create WO first">TI</span>`;
        return `<div class="order-pi-wrap">${piBtn}${woBtn}${tiBtn}</div>`;
      },
    },
  ];

  const actions = [
    { label: "Invoice", icon: "ti ti-eye", onClick: (id) => dispatch("viewRecord", id), color: "btn-soft-success" },
    { label: "Feedback", icon: "ti ti-message-star", onClick: (id) => dispatch("addFeedback", id), color: "btn-soft-primary" },
  ];
</script>

<div class="card border-0 rounded-0 order-list-table">
  <div class="card-body">
    <DynamicDataTable
      serverMode={true}
      search={null}
      loading={loadingData}
      {columns}
      {actions}
      data={listOrders}
      currentPage={listCurrentPage}
      rowsPerPage={listRowsPerPage}
      totalItems={listTotalItems}
      totalPages={listTotalPages}
      selectable={["master", "admin"].includes(currentUser?.role)}
      selectedIds={selectedOrders}
      on:selectRow={(e) => dispatch("selectRow", e.detail.id)}
      on:selectAll={(e) => dispatch("selectAll", e.detail)}
      on:pageChange={(e) => dispatch("pageChange", e.detail)}
      on:rowsPerPageChange={(e) => dispatch("rowsPerPageChange", e.detail)}
    />
  </div>
</div>

<style>
  /* All column body text — same size, normal weight */
  .order-list-table :global(td),
  .order-list-table :global(.order-cell-text),
  .order-list-table :global(.order-title-main),
  .order-list-table :global(.order-title-sub),
  .order-list-table :global(.text-muted) {
    font-size: 12px !important;
    font-weight: 400 !important;
    line-height: 1.45 !important;
  }

  .order-list-table :global(thead th) {
    font-size: 12px !important;
    font-weight: 400 !important;
    letter-spacing: 0;
    color: #495057;
  }

  .order-list-table :global(.order-title-link) {
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-decoration: none;
    color: inherit;
    max-width: 320px;
  }
  .order-list-table :global(.order-title-main) {
    color: #212529;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .order-list-table :global(.order-title-link:hover .order-title-main) {
    color: #364fc7;
  }
  .order-list-table :global(.order-title-sub) {
    color: #868e96;
  }

  /* Labels / badges — smaller, normal weight */
  .order-list-table :global(.order-reminder-chip),
  .order-list-table :global(.order-import-chip) {
    display: inline-flex !important;
    align-items: center;
    font-size: 10px !important;
    font-weight: 400 !important;
    letter-spacing: 0.01em;
    line-height: 1.3 !important;
    padding: 1px 6px !important;
    border-radius: 4px;
    vertical-align: middle;
  }

  .order-list-table :global(.order-status-badge.badge) {
    display: inline-flex !important;
    align-items: center;
    font-size: 11px !important;
    font-weight: 400 !important;
    letter-spacing: 0.01em;
    line-height: 1.35 !important;
    padding: 2px 7px !important;
    border-radius: 4px;
    color: #fff !important;
    border: none;
    white-space: nowrap;
  }
  .order-list-table :global(.order-status-badge.is-dark-text) {
    color: #212529 !important;
  }

  .order-list-table :global(.order-reminder-chip) {
    gap: 3px;
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffc107;
    margin-left: 6px;
  }
  .order-list-table :global(.order-reminder-chip .ti) {
    font-size: 10px !important;
  }

  .order-list-table :global(.order-import-chip) {
    background: #e8f4ff;
    color: #1971c2;
    border: 1px solid #a5d8ff;
    margin-left: 5px;
  }

  .order-list-table :global(.order-pi-wrap) {
    display: flex;
    gap: 4px;
    flex-wrap: nowrap;
  }
  .order-list-table :global(.order-pi-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    border: 1px solid transparent;
    font-size: 10px !important;
    font-weight: 500 !important;
    line-height: 1.3;
    padding: 3px 7px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
  }

  /* PI — indigo */
  .order-list-table :global(.order-pi-btn--pi) {
    background: #edf2ff;
    border-color: #bac8ff;
    color: #364fc7;
  }
  .order-list-table :global(.order-pi-btn--pi:hover:not(.is-disabled)) {
    background: #364fc7;
    border-color: #364fc7;
    color: #fff;
    box-shadow: 0 2px 6px rgba(54, 79, 199, 0.28);
    transform: translateY(-1px);
  }
  .order-list-table :global(.order-pi-btn--pi.is-done) {
    background: #364fc7;
    border-color: #364fc7;
    color: #fff;
  }
  .order-list-table :global(.order-pi-btn--pi.is-done:hover:not(.is-disabled)) {
    background: #3b5bdb;
    border-color: #3b5bdb;
    box-shadow: 0 2px 6px rgba(54, 79, 199, 0.35);
  }

  /* WO — teal */
  .order-list-table :global(.order-pi-btn--wo) {
    background: #e6fcf5;
    border-color: #96f2d7;
    color: #0ca678;
  }
  .order-list-table :global(.order-pi-btn--wo:hover:not(.is-disabled)) {
    background: #0ca678;
    border-color: #0ca678;
    color: #fff;
    box-shadow: 0 2px 6px rgba(12, 166, 120, 0.28);
    transform: translateY(-1px);
  }
  .order-list-table :global(.order-pi-btn--wo.is-done) {
    background: #0ca678;
    border-color: #0ca678;
    color: #fff;
  }
  .order-list-table :global(.order-pi-btn--wo.is-done:hover:not(.is-disabled)) {
    background: #099268;
    border-color: #099268;
    box-shadow: 0 2px 6px rgba(12, 166, 120, 0.35);
  }

  /* TI — amber */
  .order-list-table :global(.order-pi-btn--ti) {
    background: #fff9db;
    border-color: #ffe066;
    color: #e67700;
  }
  .order-list-table :global(.order-pi-btn--ti:hover:not(.is-disabled)) {
    background: #e67700;
    border-color: #e67700;
    color: #fff;
    box-shadow: 0 2px 6px rgba(230, 119, 0, 0.28);
    transform: translateY(-1px);
  }
  .order-list-table :global(.order-pi-btn--ti.is-done) {
    background: #e67700;
    border-color: #e67700;
    color: #fff;
  }
  .order-list-table :global(.order-pi-btn--ti.is-done:hover:not(.is-disabled)) {
    background: #d9480f;
    border-color: #d9480f;
    box-shadow: 0 2px 6px rgba(230, 119, 0, 0.35);
  }

  .order-list-table :global(.order-pi-btn.is-disabled) {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .order-list-table :global(.btn-sm),
  .order-list-table :global(.btn-xs) {
    font-size: 11px !important;
    font-weight: 400 !important;
  }
</style>
