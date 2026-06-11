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
  let loadingData = true;

  let companies = [];
  let selectedOrderTitle = "";
  let activeTab = 1;
  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos"];

  // Form state
  let workOrderType = "order";
  let title = null;
  let orderId = null;
  let linkedOrder = null;
  let companyId = null;
  let workOrderDate = null;
  let orderNo = "";
  let poNumber = "";
  let items = [];
  let remarks = "";
  let dispatchAddress = "";
  let installationDate = null;
  let installationEngineer = "";
  let dispatchPincode = "";
  let packingType = null;
  let packingCharges = null;
  let inCoterms = null;
  let inCotermsBy = null;
  let transporterName = "";
  let paymentMethod = null;

  let loading = false;
  let errorMessage = "";
  let formErrors = {};

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
      title, items, remarks, orderNo, poNumber, dispatchAddress,
      installationEngineer, dispatchPincode, packingType, packingCharges,
      inCoterms, inCotermsBy, transporterName, paymentMethod,
    };
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
    items = [...items, { item: "", quantity: "0", unit: "Pcs", price: 0, hsCode: "", total: 0 }];
  }

  function removeItem(index) {
    items = items.filter((_, i) => i !== index);
  }

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}`);
      workOrderType = data?.order ? "order" : "self";
      title = data?.title;
      orderId = data?.order?.id ?? null;
      selectedOrderTitle = data?.order?.title ?? "";
      if (data?.order) linkedOrder = { id: data.order.id, title: data.order.title, financialYear: data.order.financialYear, pId: data.order.pId };
      companyId = data?.company?.id;
      if (data?.workOrderDate) workOrderDate = formatDateForInput(data.workOrderDate);
      if (data?.installationDate) installationDate = formatDateForInput(data.installationDate);
      dispatchAddress = data?.dispatchAddress;
      installationEngineer = data?.installationEngineer;
      poNumber = data?.poNumber;
      orderNo = data?.orderNo;
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
              Basic Info & Logistics
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
              Items & Remarks
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
            <h6 class="mb-0 fw-semibold"><i class="ti ti-info-circle me-2 text-primary"></i>Basic Information</h6>
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
                  <label class="form-label">Title <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" class:is-invalid={formErrors.title} bind:value={title} placeholder="Title" />
                  {#if formErrors.title}<ul class="text-danger mt-1 text-xs"><li>{formErrors.title[0]}</li></ul>{/if}
                </div>
              {/if}

              <div id="field-company">
                <label class="form-label">Company <span class="text-danger">*</span></label>
                <select class="form-control" class:is-invalid={formErrors.companyId} bind:value={companyId}>
                  <option value={null}>Select Company</option>
                  {#each companies as c}<option value={c.id}>{c.name}</option>{/each}
                </select>
                {#if formErrors.companyId}<ul class="text-danger mt-1 text-xs"><li>{formErrors.companyId[0]}</li></ul>{/if}
              </div>

              <div>
                <label class="form-label">Work Order Number</label>
                <input type="text" class="form-control" class:is-invalid={formErrors.orderNo} bind:value={orderNo} placeholder="Work Order Number" />
                {#if formErrors.orderNo}<ul class="text-danger mt-1 text-xs"><li>{formErrors.orderNo[0]}</li></ul>{/if}
              </div>
              <div>
                <label class="form-label">Work Order Date</label>
                <input type="date" class="form-control" bind:value={workOrderDate} />
              </div>
              <div>
                <label class="form-label">PO Number</label>
                <input type="text" class="form-control" bind:value={poNumber} placeholder="PO Number" />
              </div>
            </div>
          </div>
        </div>

        <!-- Dispatch & Logistics -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-truck me-2 text-primary"></i>Dispatch & Logistics</h6>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="form-label">Dispatch Address</label>
                <input type="text" class="form-control" bind:value={dispatchAddress} placeholder="Dispatch Address" />
              </div>
              <div>
                <label class="form-label">Dispatch Pincode</label>
                <input type="text" class="form-control" bind:value={dispatchPincode} placeholder="Dispatch Pincode" />
              </div>
              <div>
                <label class="form-label">Transporter Name</label>
                <input type="text" class="form-control" bind:value={transporterName} placeholder="Transporter Name" />
              </div>
              <div>
                <label class="form-label">Packing Type</label>
                <select class="form-control" bind:value={packingType}>
                  <option value={null}>Select Packing Type</option>
                  <option value="Bubble Wrap">Bubble Wrap</option>
                  <option value="Wooden Packing">Wooden Packing</option>
                </select>
              </div>
              {#if packingType === "Wooden Packing"}
                <div>
                  <label class="form-label">Packing Charges</label>
                  <select class="form-control" bind:value={packingCharges}>
                    <option value={null}>Select Packing Charges</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
              {/if}
              <div>
                <label class="form-label">In COTERMS</label>
                <select class="form-control" bind:value={inCoterms}>
                  <option value={null}>Select In COTERMS</option>
                  {#each inCotermsArray as c}<option value={c}>{c}</option>{/each}
                </select>
              </div>
              <div>
                <label class="form-label">In COTERMS By</label>
                <select class="form-control" bind:value={inCotermsBy}>
                  <option value={null}>Select In COTERMS By</option>
                  {#if inCoterms === "Outside India"}
                    {#each inCotermsOutsideArray as c}<option value={c}>{c}</option>{/each}
                  {:else}
                    {#each inCotermsInArray as c}<option value={c}>{c}</option>{/each}
                  {/if}
                </select>
              </div>
              <div>
                <label class="form-label">Payment Method</label>
                <select class="form-control" bind:value={paymentMethod}>
                  <option value={null}>Select Payment Method</option>
                  {#each paymentMethodArray as m}<option value={m}>{m}</option>{/each}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Installation -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-tools me-2 text-primary"></i>Installation</h6>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="form-label">Installation Engineer</label>
                <input type="text" class="form-control" bind:value={installationEngineer} placeholder="Installation Engineer" />
              </div>
              <div>
                <label class="form-label">Installation Date</label>
                <input type="date" class="form-control" bind:value={installationDate} />
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-end mt-3">
          <button type="button" class="btn btn-primary" on:click={goToStep2}>
            Next: Items & Remarks <i class="ti ti-arrow-right ms-1"></i>
          </button>
        </div>

      {/if}

      <!-- ══ TAB 2 ══ -->
      {#if activeTab === 2}

        <!-- Items -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-list-details me-2 text-primary"></i>Items <span class="badge bg-primary ms-2">{items.length}</span></h6>
            <button type="button" class="btn btn-sm btn-primary" on:click={addItem}>
              <i class="ti ti-plus me-1"></i>Add Item
            </button>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-bordered mb-0">
                <thead class="table-light">
                  <tr>
                    <th class="px-3 py-2 text-center" style="width:45px">S.No</th>
                    <th class="px-3 py-2">Item Description</th>
                    <th class="px-3 py-2 text-center" style="width:80px">Qty</th>
                    <th class="px-3 py-2 text-center" style="width:100px">Unit</th>
                    <th class="px-3 py-2 text-center" style="width:46px"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as item, index}
                    <tr>
                      <td class="px-3 py-2 text-center text-muted small align-middle">{index + 1}</td>
                      <td class="px-2 py-1">
                        <input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.item} placeholder="Item description" />
                      </td>
                      <td class="px-2 py-1">
                        <input type="text" class="form-control form-control-sm border-0 shadow-none text-center" bind:value={item.quantity} />
                      </td>
                      <td class="px-2 py-1">
                        <select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>
                          {#each unitOptions as u}<option value={u}>{u}</option>{/each}
                        </select>
                      </td>
                      <td class="px-2 py-2 text-center align-middle">
                        <button type="button" class="btn btn-sm btn-icon btn-soft-danger rounded-pill" on:click={() => removeItem(index)}>
                          <i class="ti ti-trash"></i>
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr><td colspan="5" class="text-center text-muted py-3">No items added</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Remarks -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-notes me-2 text-primary"></i>Remarks</h6>
          </div>
          <div class="card-body">
            <textarea class="form-control" rows="3" bind:value={remarks} placeholder="Remarks"></textarea>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" on:click={() => (activeTab = 1)}>
            <i class="ti ti-arrow-left me-1"></i>Back to Info
          </button>
          <button type="button" class="btn btn-light" on:click={() => window.history.back()}>Cancel</button>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Work Order"}
          </button>
        </div>

      {/if}

    </form>
  </div>
</div>
