<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { page } from "$app/stores";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { get } from "svelte/store";
  import { companiesAllStore } from "$lib/stores/dataStores";
  import { checkAuth } from "$lib/utils/auth";
  import OrderSearchSelect from "$lib/components/OrderSearchSelect.svelte";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  let loadingData = true;

  let companies = [];
  let selectedOrderTitle = "";
  let activeTab = 1;
  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos"];

  function handleBeforeUnload(e) {
    e.preventDefault(); e.returnValue = "";
  }

  // Form state
  let workOrderType = "order";
  let title = null;
  let orderId = null;
  let linkedOrder = null;
  let companyId = null;
  let workOrderDate = null;

  let poNumber = "";
  let items = [];
  let remarks = "";
  let dispatchAddress = "";
  let installationDate = null;
  let orderByName = "";
  let installationEngineer = "";
  let dispatchPincode = "";
  let packingType = null;
  let packingCharges = null;
  let inCoterms = null;
  let inCotermsBy = null;
  let transporterName = "";
  let paymentMethod = null;

  let workOrderNo = "";
  let woNoWarning = "";
  let woNoChecking = false;
  const _year2 = String(new Date().getFullYear()).slice(-2);
  $: woNoPrefix = (() => {
    if (!companyId) return "";
    const c = companies.find(c => c.id === companyId);
    if (!c) return "";
    return c.name.trim().split(/\s+/)[0].toUpperCase().slice(0, 4) + _year2 + "-";
  })();
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  let currentUser = null;
  let isMaster = false;

  let woNoTimer = null;
  async function onWoNoInput() {
    woNoWarning = "";
    if (!workOrderNo) return;
    clearTimeout(woNoTimer);
    woNoTimer = setTimeout(async () => {
      woNoChecking = true;
      try {
        const res = await authApiFetch(
          `${API_ROUTES.WORK_ORDER}/check-no?value=${encodeURIComponent(workOrderNo)}&excludeId=${workOrderId}`
        );
        if (res.exists) woNoWarning = `"${workOrderNo}" is already used by another work order.`;
      } catch (_) {}
      woNoChecking = false;
    }, 500);
  }

  let workOrderId;
  $: workOrderId = $page.params.id;

  const inCotermsArray = ["In India", "Outside India"];
  const inCotermsInArray = ["Ex", "Door Delivery", "Godown"];
  const inCotermsOutsideArray = ["Ex", "FOB", "CIF"];
  const paymentMethodArray = ["To Pay", "Paid"];

  $: [packingType], changeState();
  function changeState() {
    if (packingType != "Wooden Packing") packingCharges = null;
  }

  function formatDateForInput(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  }

  function scrollToId(id) {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function goToStep2() {
    formErrors = {};
    if (!companyId) {
      formErrors.companyId = ["Company is required."];
      scrollToId("field-company");
      return;
    }
    activeTab = 2;
  }

  function orderValueChange(id, text) {
    if (id) title = text || "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const newWorkOrder = {
      title, items, remarks, poNumber, dispatchAddress, orderByName,
      installationEngineer, dispatchPincode, packingType, packingCharges,
      inCoterms, inCotermsBy, transporterName, paymentMethod,
    };
    if (isMaster && workOrderNo) newWorkOrder.workOrderNo = workOrderNo;
    if (workOrderDate) newWorkOrder.workOrderDate = workOrderDate;
    if (installationDate) newWorkOrder.installationDate = installationDate;
    newWorkOrder.companyId = companyId;
    if (linkedOrder && orderId) newWorkOrder.orderId = orderId;
    if (companyId == null) { formErrors.companyId = ["Company is required."]; loading = false; return; }
    if (items.length == 0) { Swal.fire("Warning!", "Please add at least one item.", "warning"); loading = false; return; }

    try {
      const data = await authApiFetch(API_ROUTES.WORK_ORDER + "/" + workOrderId, {
        method: "PUT",
        data: JSON.stringify(newWorkOrder),
      });
      Swal.fire("Success!", data.message, "success");
      Object.keys(localStorage).filter(k => k.startsWith("workorders_")).forEach(k => localStorage.removeItem(k));
      goto("/admin/workorder/" + workOrderId);
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") formErrors = validationErrors;
      else errorMessage = "An unexpected error occurred.";
    } finally {
      loading = false;
    }
  }

  function addItem() {
    items = [...items, { item: "", quantity: "1", unit: "Pcs", price: 0, hsCode: "", total: 0 }];
  }

  function removeItem(index) {
    items = items.filter((_, i) => i !== index);
  }

  onMount(async () => {
    currentUser = checkAuth();
    isMaster = currentUser?.role === 'master';
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}`);
      workOrderType = data?.order ? "order" : "self";
      title = data?.title;
      orderId = data?.order?.id ?? null;
      selectedOrderTitle = data?.order?.title ?? "";
      if (data?.order) linkedOrder = { id: data.order.id, title: data.order.title, financialYear: data.order.financialYear, pId: data.order.pId };
      companyId = data?.company?.id;
      const savedNo = data?.workOrderNo ?? "";
      if (!savedNo && isMaster && data?.company) {
        const prefix = data.company.name.trim().split(/\s+/)[0].toUpperCase().slice(0, 4);
        workOrderNo = `${prefix}${_year2}-`;
      } else {
        workOrderNo = savedNo;
      }
      if (data?.workOrderDate) workOrderDate = formatDateForInput(data.workOrderDate);
      if (data?.installationDate) installationDate = formatDateForInput(data.installationDate);
      dispatchAddress = data?.dispatchAddress;
      orderByName = data?.orderByName ?? "";
      installationEngineer = data?.installationEngineer;
      poNumber = data?.poNumber;
      items = (data?.items || []).map(i => ({ ...i, unit: i.unit || "Pcs" }));
      remarks = data?.remarks;
      dispatchPincode = data?.dispatchPincode;
      packingType = data?.packingType;
      packingCharges = data?.packingCharges;
      inCoterms = data?.inCoterms;
      inCotermsBy = data?.inCotermsBy;
      transporterName = data?.transporterName;
      paymentMethod = data?.paymentMethod;
    } catch (error) {
      errorMessage = "Failed to load workorder data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }
  });

  onMount(async () => {
    const currentUser = checkAuth();
    const cached = get(companiesAllStore);
    if (cached && cached.length > 0) {
      companies = cached;
      if (!companyId && currentUser?.companyId) {
        const matched = companies.find(c => c.id === Number(currentUser.companyId));
        if (matched) companyId = matched.id;
      }
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
      if (!companyId && currentUser?.companyId) {
        const matched = companies.find(c => c.id === Number(currentUser.companyId));
        if (matched) companyId = matched.id;
      }
    } catch (err) {
      errorMessage = "Failed to load company data.";
    }
  });
</script>

<svelte:window on:beforeunload={handleBeforeUnload} />

{#if loadingData}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">

    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-0">Edit Work Order</h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/workorder">Work Orders</a></li>
              <li class="breadcrumb-item active">Edit</li>
            </ol>
          </nav>
        </div>
      </div>
      <a href="/admin/workorder/{workOrderId}" class="btn btn-primary btn-sm">
        <i class="ti ti-eye me-1"></i>View WO
      </a>
    </div>

    <!-- Step Indicator -->
    <div class="card border mb-3">
      <div class="card-body py-2">
        <div class="d-flex align-items-center" style="gap:0;">
          <button type="button" on:click={() => (activeTab = 1)}
            class="d-flex align-items-center gap-2 border-0 bg-transparent py-1 flex-shrink-0"
            style="cursor:pointer;padding-left:0;">
            <span class="d-flex align-items-center justify-content-center rounded-circle fw-bold"
              style="width:28px;height:28px;font-size:13px;flex-shrink:0;
                     background:{activeTab === 1 ? 'var(--bs-primary)' : '#dee2e6'};
                     color:{activeTab === 1 ? '#fff' : '#6c757d'};">1</span>
            <span class="fw-semibold" style="color:{activeTab === 1 ? 'var(--bs-primary)' : '#6c757d'};white-space:nowrap;">
              Step 1 — Basic Details &amp; Delivery Info
            </span>
          </button>
          <div style="flex:1;height:2px;background:{activeTab === 2 ? 'var(--bs-primary)' : '#dee2e6'};margin:0 12px;"></div>
          <button type="button" on:click={goToStep2}
            class="d-flex align-items-center gap-2 border-0 bg-transparent py-1 flex-shrink-0"
            style="cursor:pointer;padding-right:0;">
            <span class="d-flex align-items-center justify-content-center rounded-circle fw-bold"
              style="width:28px;height:28px;font-size:13px;flex-shrink:0;
                     background:{activeTab === 2 ? 'var(--bs-primary)' : '#dee2e6'};
                     color:{activeTab === 2 ? '#fff' : '#6c757d'};">2</span>
            <span class="fw-semibold" style="color:{activeTab === 2 ? 'var(--bs-primary)' : '#6c757d'};white-space:nowrap;">
              Step 2 — Products / Items &amp; Notes
            </span>
          </button>
        </div>
      </div>
    </div>

    <form on:submit={handleSubmit} class="needs-validation" novalidate>

      <!-- ══ TAB 1 ══ -->
      {#if activeTab === 1}

        <!-- Basic Information -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-info-circle me-2 text-primary"></i>Basic Information — Work Order Details</h6>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-3 gap-2">
              {#if linkedOrder}
                <div class="col-span-2">
                  <label class="form-label">Order</label>
                  <div class="form-control d-flex align-items-center gap-2" style="background:#f8f9fa;cursor:default;">
                    <i class="ti ti-file-description text-primary" style="font-size:15px;flex-shrink:0;"></i>
                    <a href="/admin/order/{linkedOrder.id}" class="fw-semibold text-primary text-decoration-none text-truncate" style="font-size:13px;">
                      {#if linkedOrder.financialYear && linkedOrder.pId}
                        {linkedOrder.financialYear}/{String(linkedOrder.pId).padStart(6,"0")}
                      {:else}
                        Order #{linkedOrder.id}
                      {/if}
                      {#if linkedOrder.title}
                        <span class="text-muted fw-normal ms-1">{linkedOrder.title}</span>
                      {/if}
                    </a>
                  </div>
                </div>
              {:else}
                <div class="col-span-2">
                  <label class="form-label fw-semibold">
                    Work Order Title / Description
                    <span class="text-danger">*</span>
                    <span class="text-muted fw-normal small ms-1">(Brief name for this work order — what is being made or supplied)</span>
                  </label>
                  <input
                    type="text"
                    class="form-control"
                    class:is-invalid={formErrors.title}
                    bind:value={title}
                    placeholder="e.g. Hydraulic Press Assembly, Panel Wiring for ABC Ltd, Pump Installation – Phase 2"
                  />
                  <div class="form-text text-muted" style="font-size:11px;">
                    <i class="ti ti-info-circle me-1"></i>Keep it short but clear — this title appears on the printed work order sheet.
                  </div>
                  {#if formErrors.title}<ul class="text-danger mt-1 text-xs"><li>{formErrors.title[0]}</li></ul>{/if}
                </div>
              {/if}

              <div id="field-company">
                <label class="form-label fw-semibold">
                  Company / Customer Name
                  <span class="text-danger">*</span>
                  <span class="text-muted fw-normal small ms-1">(Which company is this work order for?)</span>
                </label>
                <TypeableSelect
                  objectMode={true}
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                  value={companyId}
                  placeholder="Search and select company..."
                  on:change={(e) => { companyId = e.detail; formErrors.companyId = null; }}
                />
                {#if formErrors.companyId}
                  <ul class="text-danger mt-1 text-xs"><li>{formErrors.companyId[0]}</li></ul>
                {:else}
                  <div class="form-text text-muted" style="font-size:11px;">
                    <i class="ti ti-search me-1"></i>Type a few letters to search. The Work Order Number is generated from this company name.
                  </div>
                {/if}
              </div>

              <div>
                <label class="form-label">Work Order Number
                  {#if !isMaster}<span class="text-muted small">(Generated Automatically — cannot be changed)</span>{/if}
                </label>
                {#if isMaster}
                  <input
                    type="text"
                    class="form-control"
                    class:is-invalid={woNoWarning}
                    bind:value={workOrderNo}
                    on:input={onWoNoInput}
                    placeholder={woNoPrefix ? `${woNoPrefix}**` : "e.g. ACME26-001"}
                  />
                  {#if woNoChecking}
                    <small class="text-muted">Checking availability...</small>
                  {:else if woNoWarning}
                    <small class="text-danger">{woNoWarning}</small>
                  {/if}
                {:else}
                  <input type="text" class="form-control bg-light text-muted" readonly value={workOrderNo} placeholder="—" />
                {/if}
              </div>

              <div>
                <label class="form-label">Work Order Date <span class="text-muted small">(Date of this Work Order)</span></label>
                <input type="date" class="form-control" bind:value={workOrderDate} />
              </div>
              <div>
                <label class="form-label">Purchase Order Number (PO No.) <span class="text-muted small">(Customer's PO Reference)</span></label>
                <input type="text" class="form-control" bind:value={poNumber} placeholder="e.g. PO-2025-001" />
              </div>
            </div>
          </div>
        </div>

        <!-- Dispatch & Logistics -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-truck me-2 text-primary"></i>Dispatch &amp; Delivery Logistics — Where &amp; How the Order Will Be Sent</h6>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="form-label">Delivery / Dispatch Address <span class="text-muted small">(Full address where goods will be sent)</span></label>
                <input type="text" class="form-control" bind:value={dispatchAddress} placeholder="e.g. 12, Industrial Area, Pune" />
              </div>
              <div>
                <label class="form-label">Delivery Pincode <span class="text-muted small">(6-digit PIN of delivery location)</span></label>
                <input type="text" class="form-control" bind:value={dispatchPincode} placeholder="e.g. 411001" />
              </div>
              <div>
                <label class="form-label">Transporter / Courier Name <span class="text-muted small">(Who will carry the goods)</span></label>
                <input type="text" class="form-control" bind:value={transporterName} placeholder="e.g. DTDC, Gati, Self" />
              </div>
              <div>
                <label class="form-label">Packing Type <span class="text-muted small">(How goods will be packed)</span></label>
                <TypeableSelect
                  options={["Bubble Wrap", "Wooden Packing"]}
                  value={packingType ?? ""}
                  placeholder="Select — e.g. Bubble Wrap or Wooden Packing"
                  on:change={(e) => (packingType = e.detail || null)}
                />
              </div>
              {#if packingType === "Wooden Packing"}
                <div>
                  <label class="form-label">Wooden Packing Charges <span class="text-muted small">(Who pays for wooden packing)</span></label>
                  <select class="form-select" bind:value={packingCharges}>
                    <option value={null}>— Select who pays for packing —</option>
                    <option value="Paid">Paid (We pay)</option>
                    <option value="Unpaid">Unpaid (Customer pays)</option>
                  </select>
                </div>
              {/if}
              <div>
                <label class="form-label">Incoterms<span class="text-muted small">(Is delivery within India or outside?)</span></label>
                <select class="form-select" bind:value={inCoterms}>
                  <option value={null}>— Select delivery destination —</option>
                  {#each inCotermsArray as c}<option value={c}>{c}</option>{/each}
                </select>
              </div>
              <div>
                <label class="form-label">Incoterms By<span class="text-muted small">(How delivery responsibility is shared)</span></label>
                <select class="form-select" bind:value={inCotermsBy}>
                  <option value={null}>— Select delivery mode —</option>
                  {#if inCoterms === "Outside India"}
                    {#each inCotermsOutsideArray as c}<option value={c}>{c}</option>{/each}
                  {:else}
                    {#each inCotermsInArray as c}<option value={c}>{c}</option>{/each}
                  {/if}
                </select>
              </div>
              <div>
                <label class="form-label">Payment Method <span class="text-muted small">(Has freight charge been paid?)</span></label>
                <select class="form-select" bind:value={paymentMethod}>
                  <option value={null}>— Select payment method —</option>
                  {#each paymentMethodArray as m}<option value={m}>{m}</option>{/each}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Installation -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-tools me-2 text-primary"></i>Installation Details — Site Visit &amp; Engineer Assignment</h6>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="form-label">Order Placed By (Person Name) <span class="text-muted small">(Name of person who placed this order)</span></label>
                <input type="text" class="form-control" bind:value={orderByName} placeholder="e.g. Rajesh Kumar" />
              </div>
              <div>
                <label class="form-label">Installation Engineer Name <span class="text-muted small">(Engineer who will install at site)</span></label>
                <input type="text" class="form-control" bind:value={installationEngineer} placeholder="e.g. Suresh Patil" />
              </div>
              <div>
                <label class="form-label">Installation Date <span class="text-muted small">(Expected date of installation at site)</span></label>
                <input type="date" class="form-control" bind:value={installationDate} />
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-end mt-3">
          <button type="button" class="btn btn-primary" on:click={goToStep2}>
            Next: Add Products / Items <i class="ti ti-arrow-right ms-1"></i>
          </button>
        </div>

      {/if}

      <!-- ══ TAB 2 ══ -->
      {#if activeTab === 2}

        <!-- Items -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-list-details me-2 text-primary"></i>Product / Item List — What Will Be Manufactured or Supplied <span class="badge bg-primary ms-2">{items.length} item{items.length !== 1 ? 's' : ''}</span></h6>
            <button type="button" class="btn btn-sm btn-primary" on:click={addItem}>
              <i class="ti ti-plus me-1"></i>Add New Item
            </button>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered mb-0">
                <thead class="table-light">
                  <tr>
                    <th class="px-3 py-2 text-center" style="width:45px">S.No</th>
                    <th class="px-3 py-2">Item / Product Name &amp; Description</th>
                    <th class="px-3 py-2 text-center" style="width:90px">Quantity</th>
                    <th class="px-3 py-2 text-center" style="width:110px">Unit of Measure</th>
                    <th class="px-3 py-2 text-center" style="width:90px">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as item, index}
                    <tr>
                      <td class="px-3 py-2 text-center text-muted small align-middle">{index + 1}</td>
                      <td class="px-2 py-1">
                        <input type="text" class="form-control form-control-sm" bind:value={item.item} placeholder="Enter item name or description" />
                      </td>
                      <td class="px-2 py-1">
                        <input type="text" class="form-control form-control-sm text-center" bind:value={item.quantity} placeholder="0" />
                      </td>
                      <td class="px-2 py-1">
                        <select class="form-select form-select-sm" bind:value={item.unit}>
                          {#each unitOptions as u}<option value={u}>{u}</option>{/each}
                        </select>
                      </td>
                      <td class="px-2 py-2 text-center align-middle">
                        <button type="button" class="btn btn-sm btn-soft-danger"
                          on:click={() => { if (confirm('Remove this item?')) removeItem(index); }}>
                          <i class="ti ti-trash me-1"></i>Remove
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr>
                      <td colspan="5" class="text-center py-4">
                        <p class="text-muted mb-2">No items added yet. Click the button below to add your first item.</p>
                        <button type="button" class="btn btn-primary" on:click={addItem}>
                          <i class="ti ti-plus me-1"></i>Add First Item
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {#if items.length > 0}
          <div class="d-flex justify-content-start mb-3">
            <button type="button" class="btn btn-outline-primary" on:click={addItem}>
              <i class="ti ti-plus me-1"></i>Add Another Item
            </button>
          </div>
        {/if}

        <!-- Remarks -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-notes me-2 text-primary"></i>Remarks / Special Instructions — Any Additional Notes for This Work Order</h6>
          </div>
          <div class="card-body">
            <textarea class="form-control" rows="3" bind:value={remarks} placeholder="e.g. Handle with care, deliver before 5PM, contact site manager before arrival..."></textarea>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-between gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" on:click={() => (activeTab = 1)}>
            <i class="ti ti-arrow-left me-1"></i>Back to Step 1 — Basic Details
          </button>
          <div class="d-flex gap-2">
            <button class="btn btn-primary btn-lg" type="submit" disabled={loading}>
              <i class="ti ti-check me-1"></i>{loading ? "Saving Changes..." : "Save Changes — Update Work Order"}
            </button>
          </div>
        </div>

      {/if}

    </form>
  </div>
</div>
