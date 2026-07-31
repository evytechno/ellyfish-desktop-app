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
          ? `<span title="Reminder: ${new Date(pendingReminder.reminderTime).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})}" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:12px;padding:1px 6px;margin-left:6px;font-weight:600;vertical-align:middle;"><i class="ti ti-clock" style="font-size:11px;"></i>${new Date(pendingReminder.reminderTime).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>`
          : "";
        const importBadge = row?.source === 'old_import'
          ? `<span style="display:inline-block;font-size:9px;font-weight:600;background:#e8f4ff;color:#1971c2;border:1px solid #a5d8ff;border-radius:4px;padding:0 5px;letter-spacing:0.2px;margin-left:5px;vertical-align:middle;">Old Import</span>`
          : "";
        return `<a href="/admin/order/${row.id}" class="flex flex-col gap-0.5"><div class="max-w-[300px] truncate">${label}${reminderBadge}${importBadge}</div>${sub ? `<div class="text-[10px] text-[#e41f07] font-mono">${sub}</div>` : ""}</a>`;
      },
    },
    { key: "workOrderNumber", label: "Work Order No." },
    {
      key: "inqCode",
      label: "Inq. Code",
      render: (val) => val
        ? `<span class="font-mono text-xs">${val}</span>`
        : `<span class="text-muted">—</span>`,
    },
    {
      key: "status",
      label: "Status",
      render: (val, row) =>
        `<span class="badge ${statusesColors[row?.status] || "bg-gray"}">${
          $statusNamesStore[row?.status]?.name || row?.status
        }</span>`,
    },
    {
      key: "orderDate",
      label: "Order Date",
      render: (val, row) =>
        row?.orderDate
          ? new Date(row.orderDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "",
    },
    {
      key: "createdAt",
      label: "Created Date",
      render: (val, row) =>
        row?.createdAt
          ? new Date(row.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit", hour12: true,
            })
          : "",
    },
    ...(currentUser?.role !== "user"
      ? [{
          key: "user",
          label: "User",
          render: (val, row) =>
            (row?.assignedUsers || []).map((user) => maskAssignedName(user, currentUser)).join(", "),
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
        const piBtn = `<button onclick="window.__openPIWOTI('PI',${row.id})" class="btn btn-xs ${pi ? "btn-soft-success" : "btn-soft-secondary"} me-1" title="${pi ? `PI: ${pi.financialYear}/${String(pi.invoiceNo).padStart(6, "0")}` : "Create PI"}">PI${pi ? " ✓" : ""}</button>`;
        const woBtn = pi
          ? `<button onclick="window.__openPIWOTI('WO',${row.id})" class="btn btn-xs ${wo ? "btn-soft-success" : "btn-soft-secondary"} me-1" title="${wo ? `WO: ${wo.workOrderNo}` : "Create WO"}">WO${wo ? " ✓" : ""}</button>`
          : `<span class="btn btn-xs btn-soft-secondary me-1 opacity-40" style="cursor:not-allowed" title="Create PI first">WO</span>`;
        const tiBtn = wo
          ? `<button onclick="window.__openPIWOTI('TI',${row.id})" class="btn btn-xs ${ti ? "btn-soft-success" : "btn-soft-secondary"}" title="${ti ? `TI: ${ti.financialYear}/${String(ti.invoiceNo).padStart(6, "0")}` : "Create TI"}">TI${ti ? " ✓" : ""}</button>`
          : `<span class="btn btn-xs btn-soft-secondary opacity-40" style="cursor:not-allowed" title="Create WO first">TI</span>`;
        return `<div class="d-flex gap-1 flex-nowrap">${piBtn}${woBtn}${tiBtn}</div>`;
      },
    },
  ];

  const actions = [
    { label: "Invoice", icon: "ti ti-eye", onClick: (id) => dispatch("viewRecord", id), color: "btn-soft-success" },
    { label: "Feedback", icon: "ti ti-message-star", onClick: (id) => dispatch("addFeedback", id), color: "btn-soft-primary" },
  ];
</script>

<div class="card border-0 rounded-0">
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
