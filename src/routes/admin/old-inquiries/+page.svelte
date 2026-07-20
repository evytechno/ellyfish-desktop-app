<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { goto } from "$app/navigation";
  import { checkAuth } from "$lib/utils/auth";
  import { usersAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import Swal from "sweetalert2";

  let currentUser = null;
  let loadingData = true;
  let firstLoad = false;
  let importing = false;
  let converting = null;

  let items = [];
  let totalItems = 0;
  let currentPage = 1;
  let rowsPerPage = 20;

  let searchTerm = "";
  let filterStatus = "";
  let filterAssignedTo = "";
  let filterDateField = "createdAt";
  let filterDateFrom = "";
  let filterDateTo = "";
  let filterDatePreset = "";

  function applyDatePreset(preset) {
    filterDatePreset = preset;
    if (preset === "custom" || preset === "") {
      filterDateFrom = "";
      filterDateTo = "";
      return;
    }
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const start = new Date(today);
    const end = new Date(today);
    if (preset === "today") {
      // from = to = today
    } else if (preset === "yesterday") {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset === "last7") {
      start.setDate(start.getDate() - 6);
    } else if (preset === "last30") {
      start.setDate(start.getDate() - 29);
    } else if (preset === "thisMonth") {
      start.setDate(1);
    } else if (preset === "lastMonth") {
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(0); // last day of previous month
    } else if (preset === "thisYear") {
      start.setMonth(0, 1);
    }
    filterDateFrom = fmt(start);
    filterDateTo = fmt(end);
  }

  let users = [];

  let assignModalOpen = false;
  let assignTarget = null;
  let assignUserId = "";

  let detailModalOpen = false;
  let detailItem = null;

  let importModalOpen = false;
  let parsedRows = [];
  let importError = "";

  // Import result modal
  let importResultOpen = false;
  let importResult = null; // { total, inserted, skipped, skippedRows }

  // Bulk selection
  let selectedIds = new Set();
  $: selectedCount = selectedIds.size;
  $: allPageSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  function toggleRow(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = selectedIds;
  }
  function toggleAll() {
    if (allPageSelected) items.forEach((i) => selectedIds.delete(i.id));
    else items.forEach((i) => selectedIds.add(i.id));
    selectedIds = selectedIds;
  }
  function clearSelection() { selectedIds = new Set(); }

  // Bulk delete
  async function confirmBulkDelete() {
    if (!selectedIds.size) return;
    const result = await Swal.fire({
      title: `Delete ${selectedIds.size} inquiries?`,
      text: "Converted inquiries will be skipped. This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, delete",
    });
    if (!result.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/bulk`, {
        method: "DELETE",
        data: { ids: [...selectedIds] },
      });
      clearSelection();
      await fetchList();
      Swal.fire({ icon: "success", title: "Deleted!", timer: 1500, showConfirmButton: false });
    } catch (e) {
      errorHandle(e);
    }
  }

  // Bulk assign
  let bulkAssignOpen = false;
  let bulkAssignUserId = "";
  let bulkAssigning = false;

  async function confirmBulkAssign() {
    if (!bulkAssignUserId || !selectedIds.size) return;
    bulkAssigning = true;
    try {
      await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/bulk/assign`, {
        method: "PATCH",
        data: { ids: [...selectedIds], assignedTo: Number(bulkAssignUserId) },
      });
      bulkAssignOpen = false;
      clearSelection();
      await fetchList();
    } catch (e) {
      errorHandle(e);
    } finally {
      bulkAssigning = false;
    }
  }

  // Bulk convert
  let bulkConverting = false;
  let bulkConvertResultOpen = false;
  let bulkConvertResult = null;

  $: assignedSelectedCount = items.filter(i => selectedIds.has(i.id) && i.status === 'assigned').length;

  async function confirmBulkConvert() {
    if (!assignedSelectedCount) return;
    const result = await Swal.fire({
      title: `Convert ${assignedSelectedCount} inquiries?`,
      html: `Each will become a new order using the inquiry data.<br><span class="text-muted small">Unassigned and already-converted selections will be skipped.</span>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#198754",
      confirmButtonText: "Yes, convert all",
    });
    if (!result.isConfirmed) return;
    bulkConverting = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/bulk/convert`, {
        method: "POST",
        data: { ids: [...selectedIds] },
      });
      clearSelection();
      await fetchList();
      bulkConvertResult = res;
      bulkConvertResultOpen = true;
    } catch (e) {
      errorHandle(e);
    } finally {
      bulkConverting = false;
    }
  }

  // Convert form
  let convertModalOpen = false;
  let convertSource = null; // old_inquiry item
  let convertForm = {
    title: "", description: "", category: "",
    customerName: "", phone: "", whatsapp: "", companyName: "", address: "",
  };

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) {
      goto("/admin/dashboard");
      return;
    }
    await Promise.all([fetchList(), loadUsers()]);
    firstLoad = true;
  });

  async function fetchList() {
    loadingData = true;
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage) });
      if (searchTerm) params.set("search", searchTerm);
      if (filterStatus) params.set("status", filterStatus);
      if (filterAssignedTo) params.set("assignedTo", filterAssignedTo);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      if (filterDateFrom || filterDateTo) params.set("dateField", filterDateField);
      const res = await authApiFetch(`${API_ROUTES.OLD_INQUIRY}?${params}`);
      items = res.data ?? [];
      totalItems = res.total ?? 0;
    } catch (e) {
      errorHandle(e);
    } finally {
      loadingData = false;
    }
  }

  async function loadUsers() {
    const cached = get(usersAllStore);
    if (cached?.length) { users = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data ?? [];
      usersAllStore.set(data);
    } catch (_) {}
  }

  let debounce;
  $: [searchTerm, filterStatus, filterAssignedTo, filterDateField, filterDateFrom, filterDateTo, filterDatePreset, currentPage, rowsPerPage], (() => {
    if (!firstLoad) return;
    clearSelection();
    clearTimeout(debounce);
    debounce = setTimeout(fetchList, 250);
  })();

  // ── Columns ───────────────────────────────────────────────────────────────
  $: columns = [
    {
      key: "inquiryCode",
      label: "Code",
      render: (val) => `<span class="text-muted small">${val || "—"}</span>`,
    },
    {
      key: "customerName",
      label: "Customer",
      render: (val, row) =>
        `<a href="#" class="text-primary fw-semibold detail-btn" data-id="${row.id}">${val || "—"}</a>`,
    },
    { key: "companyName", label: "Company", render: (val) => val || "—" },
    { key: "phone", label: "Phone", render: (val) => val || "—" },
    { key: "productInterest", label: "Product", render: (val) => val || "—" },
    {
      key: "followups",
      label: "History",
      render: (val) =>
        `<span class="badge bg-light text-dark border">${Array.isArray(val) ? val.length : 0} notes</span>`,
    },
    {
      key: "status",
      label: "Status",
      render: (val) => {
        const c = val === "unassigned" ? "bg-warning text-dark" : val === "assigned" ? "bg-info" : "bg-success";
        return `<span class="badge ${c}">${val}</span>`;
      },
    },
    {
      key: "assignedUser",
      label: "Assigned To",
      render: (val, row) => row.assignedUser?.name || "—",
    },
  ];

  $: actions = [
    {
      label: "View",
      icon: "ti ti-eye",
      color: "btn-soft-info",
      onClick: (id) => {
        const item = items.find((i) => i.id === id);
        if (item) openDetail(item);
      },
    },
    {
      label: "Assign",
      icon: "ti ti-user-check",
      color: "btn-soft-warning",
      hidden: (row) => row.status === "converted",
      onClick: (id) => {
        const item = items.find((i) => i.id === id);
        if (item) openAssign(item);
      },
    },
    {
      label: "→ Order",
      icon: "ti ti-arrow-right",
      color: "btn-soft-success",
      hidden: (row) => row.status === "unassigned",
      disabled: (row) => row.status === "converted",
      onClick: (id) => {
        const item = items.find((i) => i.id === id);
        if (item && item.status !== "converted") convertToOrder(item);
      },
    },
  ];

  // ── Import Excel ──────────────────────────────────────────────────────────
  function openImportModal() {
    parsedRows = [];
    importError = "";
    importModalOpen = true;
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importError = "";
    parsedRows = [];
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const inquiries = [];
      let current = null;

      // Returns true if value looks like a phone number
      function looksLikePhone(v) {
        const digits = String(v).replace(/\D/g, "");
        return digits.length >= 7 && digits.length <= 15 && /^\d/.test(String(v).trim());
      }

      // Append a value to description (pipe-separated)
      function addToDesc(inq, v) {
        const s = String(v).trim();
        if (!s) return;
        inq.description = inq.description ? inq.description + " | " + s : s;
      }

      for (let i = 0; i < raw.length; i++) {
        const row = raw[i];
        const col0 = row[0];

        // Followup cols — E=index4, F=index5
        const dateVal   = row[4];
        const remarkVal = row[5];
        const hasFollowup = dateVal || remarkVal;

        // ── New inquiry: col A is positive number ───────────────────────────
        if (typeof col0 === "number" && col0 > 0) {
          if (current) inquiries.push(current);
          current = {
            rowNumber:       i + 1,
            inquiryCode:     null,
            customerName:    null,
            productInterest: null,
            phone:           null,
            description:     "",
            followups:       [],
          };

          // Scan all non-followup cells in this row (cols B onward, skip E/F)
          for (let c = 1; c < row.length; c++) {
            if (c === 4 || c === 5) continue; // skip followup cols
            const v = row[c];
            if (v === null || v === undefined || String(v).trim() === "") continue;
            const s = String(v).trim();

            if (c === 1 && !looksLikePhone(s) && !current.customerName) {
              current.customerName = s; // first text in col B → name
            } else if (c === 2 && !looksLikePhone(s) && !current.productInterest) {
              current.productInterest = s; // first text in col C → product
            } else if (looksLikePhone(s) && !current.phone) {
              current.phone = s; // first phone found → phone field
            }
            addToDesc(current, s); // always add to description too
          }

          if (hasFollowup) {
            current.followups.push({ date: formatDate(dateVal), remark: remarkVal ? String(remarkVal).trim() : "", source: "import" });
          }
        }

        // ── Inquiry code: col A is string with "/" ──────────────────────────
        else if (col0 && typeof col0 === "string" && String(col0).includes("/")) {
          if (current) current.inquiryCode = String(col0).trim();
        }

        // ── Continuation row ────────────────────────────────────────────────
        else if (current) {
          if (hasFollowup) {
            // Followup row — save E+F, but also scan B-D for any data
            current.followups.push({ date: formatDate(dateVal), remark: remarkVal ? String(remarkVal).trim() : "", source: "import" });
            // Still capture any non-followup cell data into description
            for (let c = 1; c <= 3; c++) {
              const v = row[c];
              if (v === null || v === undefined || String(v).trim() === "") continue;
              const s = String(v).trim();
              if (looksLikePhone(s) && !current.phone) current.phone = s;
              addToDesc(current, s);
            }
          } else {
            // Pure data row — scan all cells, add to description + detect phone
            for (let c = 1; c < row.length; c++) {
              if (c === 4 || c === 5) continue;
              const v = row[c];
              if (v === null || v === undefined || String(v).trim() === "") continue;
              const s = String(v).trim();
              if (looksLikePhone(s) && !current.phone) current.phone = s;
              addToDesc(current, s);
            }
          }
        }
      }
      if (current) inquiries.push(current);
      parsedRows = inquiries.filter((r) => r.customerName || r.phone || r.inquiryCode || r.description);
    } catch (err) {
      importError = "Failed to parse Excel. Please check the file format.";
    }
  }

  function formatDate(val) {
    if (!val) return "";
    if (val instanceof Date) return val.toLocaleDateString("en-IN");
    return String(val);
  }

  async function confirmImport() {
    if (!parsedRows.length) return;
    importing = true;
    try {
      const res = await authApiFetch(API_ROUTES.OLD_INQUIRY + "/import", {
        method: "POST",
        data: { items: parsedRows },
      });
      importModalOpen = false;
      currentPage = 1;
      await fetchList();
      importResult = res;
      importResultOpen = true;
    } catch (e) {
      errorHandle(e);
    } finally {
      importing = false;
    }
  }

  function downloadSkippedCSV() {
    if (!importResult?.skippedRows?.length) return;
    const headers = ["Row", "Customer", "Phone", "Reason"];
    const rows = importResult.skippedRows.map((r) =>
      [r.row, r.customerName, r.phone, r.reason].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skipped_inquiries.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Assign ────────────────────────────────────────────────────────────────
  function openAssign(item) {
    assignTarget = item;
    assignUserId = item.assignedTo ? String(item.assignedTo) : "";
    assignModalOpen = true;
  }

  async function confirmAssign() {
    if (!assignTarget || !assignUserId) return;
    try {
      await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/${assignTarget.id}/assign`, {
        method: "PATCH",
        data: { assignedTo: Number(assignUserId) },
      });
      assignModalOpen = false;
      await fetchList();
    } catch (e) {
      errorHandle(e);
    }
  }

  // ── Convert ───────────────────────────────────────────────────────────────
  function convertToOrder(item) {
    convertSource = item;
    convertForm = {
      title: item.productInterest || "",
      description: `Imported from old inquiry${item.inquiryCode ? ": " + item.inquiryCode : ""}${item.description ? "\n\n[Raw Data]\n" + item.description : ""}`,
      category: "",
      customerName: item.customerName || "",
      phone: item.phone || "",
      whatsapp: item.phone || "",
      companyName: item.companyName || "",
      address: item.address || "",
    };
    convertModalOpen = true;
  }

  async function submitConvert() {
    if (!convertSource) return;
    converting = convertSource.id;
    try {
      const res = await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/${convertSource.id}/convert`, {
        method: "POST",
        data: convertForm,
      });
      convertModalOpen = false;
      Swal.fire("Done!", `Order created (PID: ${res.orderPId})`, "success").then(() => {
        goto(`/admin/order/${res.orderId}`);
      });
    } catch (e) {
      errorHandle(e);
    } finally {
      converting = null;
    }
  }

  function openDetail(item) {
    detailItem = item;
    detailModalOpen = true;
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Old Inquiries</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">Old Inquiries</li>
          </ol>
        </nav>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <button class="btn btn-icon btn-outline-light shadow" on:click={fetchList} title="Refresh">
          <i class="ti ti-refresh"></i>
        </button>
        <button class="btn btn-primary" on:click={openImportModal}>
          <i class="ti ti-file-upload me-1"></i>Import Excel
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="row g-2 align-items-center mb-3">
      <div class="col-auto">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input type="text" bind:value={searchTerm} class="form-control"
            placeholder="Search name, phone, product..." style="min-width:200px;" />
        </div>
      </div>
      <div class="col-auto">
        <select bind:value={filterStatus} class="form-select w-auto">
          <option value="">All Status</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
          <option value="converted">Converted</option>
        </select>
      </div>
      <div class="col-auto">
        <select bind:value={filterAssignedTo} class="form-select w-auto">
          <option value="">Assigned To</option>
          {#each users as u}
            <option value={u.id}>{u.name}</option>
          {/each}
        </select>
      </div>
      <div class="col-auto">
        <select bind:value={filterDateField} class="form-select w-auto">
          <option value="createdAt">Imported Date</option>
          <option value="assignedAt">Assigned Date</option>
        </select>
      </div>
      <div class="col-auto">
        <select
          class="form-select w-auto"
          value={filterDatePreset}
          on:change={(e) => applyDatePreset(e.currentTarget.value)}
        >
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="thisYear">This Year</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>
      {#if filterDatePreset === "custom"}
        <div class="col-auto">
          <input type="date" bind:value={filterDateFrom} class="form-control" style="min-width:140px;" title="From date" />
        </div>
        <div class="col-auto">
          <input type="date" bind:value={filterDateTo} class="form-control" style="min-width:140px;" title="To date" />
        </div>
      {/if}
      {#if filterAssignedTo || filterDatePreset}
        <div class="col-auto">
          <button class="btn btn-outline-secondary btn-sm" on:click={() => { filterAssignedTo = ""; filterDateFrom = ""; filterDateTo = ""; filterDateField = "createdAt"; filterDatePreset = ""; }}>
            <i class="ti ti-x me-1"></i>Clear Filters
          </button>
        </div>
      {/if}
    </div>

    <!-- Bulk Action Bar -->
    {#if selectedCount > 0}
      <div class="d-flex align-items-center gap-3 mb-2 p-2 px-3 bg-primary-subtle border border-primary rounded">
        <span class="fw-semibold text-primary">{selectedCount} selected</span>
        <button class="btn btn-sm btn-primary" on:click={() => { bulkAssignUserId = ""; bulkAssignOpen = true; }}>
          <i class="ti ti-user-check me-1"></i>Bulk Assign
        </button>
        <button
          class="btn btn-sm btn-success"
          disabled={bulkConverting || assignedSelectedCount === 0}
          on:click={confirmBulkConvert}
          title={assignedSelectedCount === 0 ? "Select assigned inquiries to convert" : `Convert ${assignedSelectedCount} assigned`}
        >
          {#if bulkConverting}
            <span class="spinner-border spinner-border-sm me-1"></span>Converting...
          {:else}
            <i class="ti ti-arrow-right me-1"></i>Bulk Convert ({assignedSelectedCount})
          {/if}
        </button>
        <button class="btn btn-sm btn-danger" on:click={confirmBulkDelete}>
          <i class="ti ti-trash me-1"></i>Delete
        </button>
        <button class="btn btn-sm btn-outline-secondary ms-auto" on:click={clearSelection}>
          <i class="ti ti-x me-1"></i>Clear
        </button>
      </div>
    {/if}

    <!-- Table -->
    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...items]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
          serverMode={true}
          headersItemShow={false}
          checkboxSelection={true}
          {selectedIds}
          {allPageSelected}
          on:toggleRow={(e) => toggleRow(e.detail)}
          on:toggleAll={toggleAll}
          on:pageChange={(e) => (currentPage = e.detail)}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; }}
          on:search={(e) => { searchTerm = e.detail; currentPage = 1; }}
        />
      </div>
    </div>
  </div>
</div>

<!-- Import Modal -->
{#if importModalOpen}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Import Old Inquiries from Excel</h5>
          <button type="button" class="btn-close" on:click={() => (importModalOpen = false)}></button>
        </div>
        <div class="modal-body">
          <input
            type="file"
            accept=".xlsx,.xls"
            class="form-control mb-3"
            on:change={handleFileChange}
          />
          {#if importError}
            <div class="alert alert-danger">{importError}</div>
          {/if}
          {#if parsedRows.length}
            <p class="text-success mb-2"><strong>{parsedRows.length}</strong> inquiries detected. Preview (first 50):</p>
            <div class="table-responsive" style="max-height:400px;overflow-y:auto;">
              <table class="table table-sm table-bordered">
                <thead class="table-light sticky-top">
                  <tr>
                    <th>#</th>
                    <th>Code</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Product</th>
                    <th>Description (Raw)</th>
                    <th>History</th>
                    <th>Last Note</th>
                  </tr>
                </thead>
                <tbody>
                  {#each parsedRows.slice(0, 50) as row, i}
                    <tr>
                      <td>{i + 1}</td>
                      <td class="text-muted small" style="white-space:nowrap;">{row.inquiryCode || "—"}</td>
                      <td style="min-width:130px;">{row.customerName || "—"}</td>
                      <td style="white-space:nowrap;">{row.phone || "—"}</td>
                      <td style="min-width:120px;">{row.productInterest || "—"}</td>
                      <td style="min-width:200px;max-width:300px;" class="text-muted small">
                        {row.description ? (row.description.length > 80 ? row.description.slice(0, 80) + "…" : row.description) : "—"}
                      </td>
                      <td class="text-center">
                        <span class="badge bg-light text-dark border">{row.followups?.length ?? 0}</span>
                      </td>
                      <td style="min-width:180px;max-width:240px;" class="text-muted small">
                        {row.followups?.length ? row.followups[row.followups.length - 1].remark || "—" : "—"}
                      </td>
                    </tr>
                  {/each}
                  {#if parsedRows.length > 50}
                    <tr><td colspan="8" class="text-center text-muted">…and {parsedRows.length - 50} more</td></tr>
                  {/if}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (importModalOpen = false)}>Cancel</button>
          <button
            class="btn btn-primary"
            disabled={importing || !parsedRows.length}
            on:click={confirmImport}
          >
            {importing ? "Importing..." : `Import ${parsedRows.length} Records`}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Bulk Assign Modal -->
{#if bulkAssignOpen}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);z-index:1070;">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-users me-2 text-primary"></i>Bulk Assign</h5>
          <button type="button" class="btn-close" on:click={() => (bulkAssignOpen = false)}></button>
        </div>
        <div class="modal-body">
          {#if items.filter(i => selectedIds.has(i.id) && i.status === 'converted').length > 0}
            {@const convertedCount = items.filter(i => selectedIds.has(i.id) && i.status === 'converted').length}
            <div class="alert alert-warning py-2 mb-3 small">
              <i class="ti ti-alert-triangle me-1"></i>
              <strong>{convertedCount} converted</strong> {convertedCount === 1 ? 'record is' : 'records are'} selected — {convertedCount === 1 ? 'it' : 'they'} will be skipped.
              Only <strong>{selectedCount - convertedCount}</strong> will be assigned.
            </div>
          {/if}
          <p class="mb-3 text-muted small">Assigning <strong>{selectedCount} inquiries</strong> to:</p>
          <div class="list-group" style="max-height:340px;overflow-y:auto;">
            {#each users.filter(u => !['tech','tech_helper'].includes(u.subRole)) as u}
              <button
                type="button"
                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center {bulkAssignUserId === String(u.id) ? 'active' : ''}"
                on:click={() => bulkAssignUserId = String(u.id)}
              >
                <div>
                  <div class="fw-semibold">{u.name}</div>
                  <div class="small {bulkAssignUserId === String(u.id) ? 'text-white-50' : 'text-muted'}">{u.company?.name || "—"}</div>
                </div>
                <div class="text-end">
                  <span class="badge {u.role === 'admin' ? 'bg-purple' : 'bg-secondary'} me-1">{u.role}</span>
                  {#if u.subRole}<span class="badge bg-light text-dark border">{u.subRole}</span>{/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (bulkAssignOpen = false)}>Cancel</button>
          <button class="btn btn-primary" disabled={!bulkAssignUserId || bulkAssigning} on:click={confirmBulkAssign}>
            {#if bulkAssigning}<span class="spinner-border spinner-border-sm me-1"></span>Assigning...
            {:else}<i class="ti ti-check me-1"></i>Assign {selectedCount} Records{/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Assign Modal -->
{#if assignModalOpen && assignTarget}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Assign Inquiry</h5>
          <button type="button" class="btn-close" on:click={() => (assignModalOpen = false)}></button>
        </div>
        <div class="modal-body">
          <p class="mb-2 text-muted small">Assigning: <strong>{assignTarget.customerName || assignTarget.inquiryCode}</strong></p>
          <div class="list-group" style="max-height:340px;overflow-y:auto;">
            {#each users.filter(u => !['tech','tech_helper'].includes(u.subRole)) as u}
              <button
                type="button"
                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center {assignUserId === String(u.id) ? 'active' : ''}"
                on:click={() => assignUserId = String(u.id)}
              >
                <div>
                  <div class="fw-semibold">{u.name}</div>
                  <div class="small {assignUserId === String(u.id) ? 'text-white-50' : 'text-muted'}">
                    {u.company?.name || "—"}
                  </div>
                </div>
                <div class="text-end">
                  <span class="badge {u.role === 'admin' ? 'bg-purple' : 'bg-secondary'} me-1">{u.role}</span>
                  {#if u.subRole}
                    <span class="badge bg-light text-dark border">{u.subRole}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (assignModalOpen = false)}>Cancel</button>
          <button class="btn btn-primary" disabled={!assignUserId} on:click={confirmAssign}>Assign</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Detail Modal -->
{#if detailModalOpen && detailItem}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{detailItem.customerName || "Detail"} {detailItem.inquiryCode ? `— ${detailItem.inquiryCode}` : ""}</h5>
          <button type="button" class="btn-close" on:click={() => (detailModalOpen = false)}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-4">
            <div class="col-6"><strong>Inquiry Code:</strong> {detailItem.inquiryCode || "—"}</div>
            <div class="col-6"><strong>Status:</strong>
              <span class="badge {detailItem.status === 'converted' ? 'bg-success' : detailItem.status === 'assigned' ? 'bg-info' : 'bg-warning text-dark'}">
                {detailItem.status}
              </span>
            </div>
            <div class="col-6"><strong>Customer Name:</strong> {detailItem.customerName || "—"}</div>
            <div class="col-6"><strong>Phone:</strong> {detailItem.phone || "—"}</div>
            <div class="col-6"><strong>Company:</strong> {detailItem.companyName || "—"}</div>
            <div class="col-6"><strong>Product:</strong> {detailItem.productInterest || "—"}</div>
            <div class="col-12"><strong>Address:</strong> {detailItem.address || "—"}</div>
            {#if detailItem.description}
              <div class="col-12">
                <strong>Description / Raw Data:</strong>
                <div class="mt-1 p-2 bg-light rounded small text-muted" style="white-space:pre-wrap;max-height:120px;overflow-y:auto;">{detailItem.description}</div>
              </div>
            {/if}
            <div class="col-6"><strong>Assigned To:</strong> {detailItem.assignedUser?.name || "—"}</div>
            <div class="col-6"><strong>Assigned At:</strong> {detailItem.assignedAt ? new Date(detailItem.assignedAt).toLocaleDateString('en-IN') : "—"}</div>
            {#if detailItem.convertedOrderId}
              <div class="col-6"><strong>Converted Order ID:</strong> #{detailItem.convertedOrderId}</div>
            {/if}
            <div class="col-6"><strong>Source:</strong> {detailItem.source || "—"}</div>
            <div class="col-6"><strong>Imported At:</strong> {detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleDateString('en-IN') : "—"}</div>
          </div>

          <h6 class="mb-2">Follow-up History ({detailItem.followups?.length ?? 0})</h6>
          <div style="max-height:300px;overflow-y:auto;">
            {#if detailItem.followups?.length}
              {#each detailItem.followups as f}
                <div class="d-flex gap-3 p-2 mb-1 bg-light rounded">
                  <span class="text-muted small" style="min-width:90px;">{f.date || "No date"}</span>
                  <span>{f.remark || "—"}</span>
                </div>
              {/each}
            {:else}
              <p class="text-muted">No follow-up history.</p>
            {/if}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (detailModalOpen = false)}>Close</button>
          {#if detailItem.status === "assigned"}
            <button
              class="btn btn-success"
              on:click={() => { detailModalOpen = false; convertToOrder(detailItem); }}
            >
              <i class="ti ti-arrow-right me-1"></i>Move to Order
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Convert to Order Modal -->
{#if convertModalOpen && convertSource}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);z-index:1060;">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-arrow-right me-2 text-success"></i>Convert to Order
            {#if convertSource.inquiryCode}
              <span class="text-muted small ms-2">— {convertSource.inquiryCode}</span>
            {/if}
          </h5>
          <button type="button" class="btn-close" on:click={() => (convertModalOpen = false)}></button>
        </div>
        <div class="modal-body">

          <!-- Order Details -->
          <p class="fw-semibold text-uppercase text-muted small mb-2 border-bottom pb-1">Order Details</p>
          <div class="row g-3 mb-4">
            <div class="col-12">
              <label class="form-label">Title <span class="text-danger">*</span></label>
              <input class="form-control" bind:value={convertForm.title} placeholder="Product / service title" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Category</label>
              <input class="form-control" bind:value={convertForm.category} placeholder="e.g. Thermal Spray, Blasting..." />
            </div>
            <div class="col-12">
              <label class="form-label">Description</label>
              <textarea class="form-control" rows="2" bind:value={convertForm.description}></textarea>
            </div>
          </div>

          <!-- Customer Details -->
          <p class="fw-semibold text-uppercase text-muted small mb-2 border-bottom pb-1">Customer Details</p>
          <div class="row g-3 mb-4">
            <div class="col-md-6">
              <label class="form-label">Customer Name</label>
              <input class="form-control" bind:value={convertForm.customerName} placeholder="Full name" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Company</label>
              <input class="form-control" bind:value={convertForm.companyName} placeholder="Company name" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Phone</label>
              <input class="form-control" bind:value={convertForm.phone} placeholder="Mobile number"
                on:input={() => { if (!convertForm.whatsapp) convertForm.whatsapp = convertForm.phone; }} />
            </div>
            <div class="col-md-6">
              <label class="form-label">WhatsApp</label>
              <input class="form-control" bind:value={convertForm.whatsapp} placeholder="WhatsApp number" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <input class="form-control" bind:value={convertForm.address} placeholder="Full address" />
            </div>
          </div>

          <!-- Follow-up History Preview -->
          {#if convertSource.followups?.length}
            <p class="fw-semibold text-uppercase text-muted small mb-2 border-bottom pb-1">
              Follow-up History — {convertSource.followups.length} notes will be saved as chat messages
            </p>
            <div style="max-height:180px;overflow-y:auto;" class="mb-2">
              {#each convertSource.followups as f}
                <div class="d-flex gap-3 p-2 mb-1 bg-light rounded">
                  <span class="text-muted small" style="min-width:90px;">{f.date || "No date"}</span>
                  <span class="small">{f.remark || "—"}</span>
                </div>
              {/each}
            </div>
          {/if}

        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (convertModalOpen = false)}>Cancel</button>
          <button
            class="btn btn-success"
            disabled={converting === convertSource.id || !convertForm.title}
            on:click={submitConvert}
          >
            {#if converting === convertSource.id}
              <span class="spinner-border spinner-border-sm me-1"></span>Creating...
            {:else}
              <i class="ti ti-check me-1"></i>Confirm & Create Order
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Bulk Convert Result Modal -->
{#if bulkConvertResultOpen && bulkConvertResult}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);z-index:1070;">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-circle-check text-success me-2"></i>Bulk Convert Complete
          </h5>
          <button type="button" class="btn-close" on:click={() => (bulkConvertResultOpen = false)}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-6">
              <div class="p-3 bg-success bg-opacity-10 rounded text-center">
                <div class="fs-4 fw-bold text-success">{bulkConvertResult.converted}</div>
                <div class="text-muted small">Converted ✅</div>
              </div>
            </div>
            <div class="col-6">
              <div class="p-3 {bulkConvertResult.skipped?.length > 0 ? 'bg-warning bg-opacity-10' : 'bg-light'} rounded text-center">
                <div class="fs-4 fw-bold {bulkConvertResult.skipped?.length > 0 ? 'text-warning' : ''}">{bulkConvertResult.skipped?.length ?? 0}</div>
                <div class="text-muted small">Skipped ⚠️</div>
              </div>
            </div>
          </div>
          {#if bulkConvertResult.skipped?.length}
            <h6 class="mb-2 small fw-semibold text-muted text-uppercase">Skipped</h6>
            <div style="max-height:200px;overflow-y:auto;">
              {#each bulkConvertResult.skipped as s}
                <div class="d-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded small">
                  <span>{s.customerName || `ID ${s.id}`}</span>
                  <span class="badge bg-warning text-dark">{s.reason}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" on:click={() => (bulkConvertResultOpen = false)}>Close</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Import Result Modal -->
{#if importResultOpen && importResult}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);z-index:1070;">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-circle-check text-success me-2"></i>Import Complete
          </h5>
          <button type="button" class="btn-close" on:click={() => (importResultOpen = false)}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-4">
            <div class="col-4">
              <div class="p-3 bg-light rounded text-center">
                <div class="fs-4 fw-bold">{importResult.total}</div>
                <div class="text-muted small">Total</div>
              </div>
            </div>
            <div class="col-4">
              <div class="p-3 bg-success bg-opacity-10 rounded text-center">
                <div class="fs-4 fw-bold text-success">{importResult.inserted}</div>
                <div class="text-muted small">Imported ✅</div>
              </div>
            </div>
            <div class="col-4">
              <div class="p-3 {importResult.skipped > 0 ? 'bg-warning bg-opacity-10' : 'bg-light'} rounded text-center">
                <div class="fs-4 fw-bold {importResult.skipped > 0 ? 'text-warning' : ''}}">{importResult.skipped}</div>
                <div class="text-muted small">Skipped ⚠️</div>
              </div>
            </div>
          </div>

          {#if importResult.skippedRows?.length}
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="mb-0">Skipped Records ({importResult.skippedRows.length})</h6>
              <button class="btn btn-sm btn-outline-secondary" on:click={downloadSkippedCSV}>
                <i class="ti ti-download me-1"></i>Download CSV
              </button>
            </div>
            <div class="table-responsive" style="max-height:320px;overflow-y:auto;">
              <table class="table table-sm table-bordered">
                <thead class="table-light sticky-top">
                  <tr>
                    <th style="width:80px;">Excel Row</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {#each importResult.skippedRows as r}
                    <tr>
                      <td class="text-center"><span class="badge bg-secondary">{r.row}</span></td>
                      <td>{r.customerName || "—"}</td>
                      <td>{r.phone || "—"}</td>
                      <td class="text-muted small">{r.reason}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="text-success text-center py-2">
              <i class="ti ti-circle-check me-1"></i>No duplicates — all records imported.
            </p>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" on:click={() => (importResultOpen = false)}>Close</button>
        </div>
      </div>
    </div>
  </div>
{/if}