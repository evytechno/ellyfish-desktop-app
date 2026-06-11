<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import OrderSearchSelect from "$lib/components/OrderSearchSelect.svelte";
  import { companiesAllStore } from "$lib/stores/dataStores";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { get } from "svelte/store";

  let loadingData = true;
  let loading = false;
  let formErrors = {};
  let currentUser = null;
  let companies = [];
  let invoiceId;
  $: invoiceId = $page.params.id;

  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos"];
  let activeTab = 1;

  // Form state
  let invoiceType = "order";
  let title = "";
  let orderId = null;
  let orderInitialTitle = "";
  let linkedOrder = null;
  let companyId = null;
  let invoiceDate = null;
  let poDate = null;
  let poNumber = "";
  let discount = 0;
  let totalAmountTitle = "Total Amount";
  let totalAmountValue = 0;
  let items = [];
  let extraItems = [];
  let taxItems = [];
  let isOutOfIndia = false;
  let priceTerms = "";
  let swiftCode = "";
  let currency = "INR";
  let paymentMethod = "Other";
  let status = "Unpaid";
  let termsConditions = "";
  let remarks = "";
  let shipToSameAsBillTo = false;
  let billToName = ""; let billToAddress = ""; let billToGSTNumber = ""; let billToMobile = ""; let billToEmail = "";
  let shipToName = ""; let shipToAddress = ""; let shipToGSTNumber = ""; let shipToMobile = ""; let shipToEmail = "";
  let selectedBankAccount = null;
  let bankAccounts = [];

  // Reactive calculations
  $: itemsSubtotal = items.reduce((s, i) => s + (i.total || 0), 0);
  $: subtotal = itemsSubtotal - discount;
  $: extratotal = extraItems.reduce((s, i) => s + (i.total || 0), 0);
  $: subplustotal = subtotal + extratotal;
  $: taxtotal = taxItems.reduce((s, i) => s + (i.total || 0), 0);
  $: total = Math.round(subplustotal + taxtotal);
  $: subtotal, recalculateTaxes();

  function recalculateTaxes() {
    taxItems = taxItems.map(i => ({ ...i, total: parseFloat(((i.percentage / 100) * subtotal).toFixed(2)) }));
  }

  function updateItemTotal(index) {
    items[index].total = parseFloat(((items[index].quantity || 0) * (items[index].unitPrice || 0)).toFixed(2));
    items = [...items];
  }

  function addItem() { items = [...items, { item: "", quantity: 1, unit: "Pcs", unitPrice: 0, hsCode: "", total: 0 }]; }
  function removeItem(i) { items = items.filter((_, idx) => idx !== i); }
  function addExtraItem() { extraItems = [...extraItems, { item: "", total: 0 }]; }
  function removeExtraItem(i) { extraItems = extraItems.filter((_, idx) => idx !== i); }
  function addTaxItem() { taxItems = [...taxItems, { item: "", percentage: 0, total: 0 }]; }
  function removeTaxItem(i) { taxItems = taxItems.filter((_, idx) => idx !== i); }

  function toggleIndia(outOfIndia) {
    isOutOfIndia = outOfIndia;
    if (outOfIndia) {
      taxItems = [];
    } else {
      taxItems = [
        { item: "CGST", percentage: 9, total: 0 },
        { item: "SGST", percentage: 9, total: 0 },
        { item: "IGST", percentage: 18, total: 0 },
      ];
      recalculateTaxes();
    }
  }

  function shipToChange(e) {
    if (e.target.checked) {
      shipToName = billToName; shipToAddress = billToAddress;
      shipToGSTNumber = billToGSTNumber; shipToMobile = billToMobile; shipToEmail = billToEmail;
    }
  }

  function companyChange(id) {
    const company = companies.find(c => c.id == id);
    bankAccounts = company?.bankAccounts || [];
    selectedBankAccount = bankAccounts[0] || null;
  }

  async function orderValueChange(id) {
    if (!id || isNaN(id) || id <= 0) return;
    try {
      const order = await authApiFetch(`${API_ROUTES.ORDER}/${id}`);
      if (!order) return;
      // auto-select company from order
      if (!companyId && order.company) {
        const matched = companies.find(c => c.name?.toLowerCase().trim() === order.company?.toLowerCase().trim());
        if (matched) { companyId = matched.id; companyChange(matched.id); }
      }
    } catch {}
  }

  function bankLabel(b) {
    const parts = [];
    if (b.label) parts.push(b.label);
    if (b.bankName) parts.push(b.bankName);
    if (b.accountNumber) parts.push(`(••••${String(b.accountNumber).slice(-4)})`);
    return parts.join(" — ");
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
    if (items.length === 0) {
      Swal.fire("Warning!", "Please add at least one line item.", "warning");
      scrollToId("field-items");
      return;
    }
    const emptyIdx = items.findIndex(i => !i.item || !i.item.trim());
    if (emptyIdx !== -1) {
      Swal.fire("Warning!", "Please fill in all item descriptions.", "warning");
      scrollToId(`field-item-${emptyIdx}`);
      return;
    }
    activeTab = 2;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    formErrors = {};
    if (!companyId) { formErrors.companyId = ["Company is required."]; return; }
    if (items.length === 0) { Swal.fire("Warning!", "Please add at least one line item.", "warning"); return; }
    if (total === 0) { Swal.fire("Warning!", "Invoice total amount cannot be zero.", "warning"); return; }
    loading = true;
    try {
      const payload = {
        title, items, extraItems, taxItems, isOutOfIndia, priceTerms, swiftCode, currency,
        paymentMethod, status, termsConditions, remarks, poNumber, discount,
        totalAmountTitle, totalAmountValue: totalAmountValue || total,
        selectedBankAccount, billToName, billToAddress, billToGSTNumber,
        billToMobile, billToEmail, shipToName, shipToAddress, shipToGSTNumber,
        shipToMobile, shipToEmail, companyId,
      };
      if (invoiceDate) payload.invoiceDate = invoiceDate;
      if (poDate) payload.poDate = poDate;
      if (linkedOrder && orderId) payload.orderId = orderId;

      const data = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/${invoiceId}`, {
        method: "PUT",
        data: JSON.stringify(payload),
      });
      Swal.fire("Success!", data.message, "success");
      goto("/admin/invoice/" + invoiceId);
    } catch (error) {
      loading = false;
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") formErrors = errs;
      else Swal.fire("Error!", "An unexpected error occurred.", "error");
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    currentUser = checkAuth();
    loadingData = true;
    try {
      const [comp, inv] = await Promise.all([
        authApiFetch(`${API_ROUTES.COMPANY}/all`),
        authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/${$page.params.id}`),
      ]);
      companies = comp;

      invoiceType      = inv.orderId ? "order" : "self";
      title            = inv.title || "";
      orderId          = inv.orderId || null;
      orderInitialTitle = inv.order?.title || "";
      if (inv.order) linkedOrder = { id: inv.order.id, title: inv.order.title, financialYear: inv.order.financialYear, pId: inv.order.pId };
      companyId        = inv.companyId || inv.company?.id || null;
      invoiceDate      = inv.invoiceDate ? inv.invoiceDate.split("T")[0] : null;
      poDate           = inv.poDate ? inv.poDate.split("T")[0] : null;
      poNumber         = inv.poNumber || "";
      discount         = inv.discount || 0;
      totalAmountTitle = inv.totalAmountTitle || "Total Amount";
      totalAmountValue = inv.totalAmountValue || 0;
      items            = (inv.items || []).map(i => ({ ...i, unit: i.unit || "Pcs" }));
      extraItems       = inv.extraItems || [];
      isOutOfIndia     = inv.isOutOfIndia || false;
      taxItems         = inv.taxItems != null
        ? inv.taxItems
        : (inv.isOutOfIndia ? [] : [{ item: "CGST", percentage: 9, total: 0 }, { item: "SGST", percentage: 9, total: 0 }, { item: "IGST", percentage: 18, total: 0 }]);
      priceTerms       = inv.priceTerms || "";
      swiftCode        = inv.swiftCode || "";
      currency         = inv.currency || "INR";
      paymentMethod    = inv.paymentMethod || "Other";
      status           = inv.status || "Unpaid";
      termsConditions  = inv.termsConditions || "";
      remarks          = inv.remarks || "";
      billToName = inv.billToName || ""; billToAddress = inv.billToAddress || "";
      billToGSTNumber = inv.billToGSTNumber || ""; billToMobile = inv.billToMobile || ""; billToEmail = inv.billToEmail || "";
      shipToName = inv.shipToName || ""; shipToAddress = inv.shipToAddress || "";
      shipToGSTNumber = inv.shipToGSTNumber || ""; shipToMobile = inv.shipToMobile || ""; shipToEmail = inv.shipToEmail || "";
      if (companyId) {
        const company = companies.find(c => c.id == companyId);
        bankAccounts = company?.bankAccounts || [];
        // match saved bank by id so bind:value gets the exact same object reference
        const savedBank = inv.selectedBankAccount;
        selectedBankAccount = savedBank
          ? (bankAccounts.find(b => b.id === savedBank.id) ?? bankAccounts[0] ?? null)
          : (bankAccounts[0] ?? null);
      } else {
        selectedBankAccount = null;
      }
    } catch (e) {
      Swal.fire("Error!", "Failed to load invoice data.", "error");
    }
    setTimeout(() => { loadingData = false; }, 300);
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
          <h4 class="mb-0">Edit Proforma Invoice</h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/invoice">Invoices</a></li>
              <li class="breadcrumb-item"><a href="/admin/invoice/{invoiceId}">PI Detail</a></li>
              <li class="breadcrumb-item active">Edit</li>
            </ol>
          </nav>
        </div>
      </div>
      <a href="/admin/invoice/{invoiceId}" class="btn btn-primary">
        <i class="ti ti-eye me-1"></i>View PI
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
              Basic Info & Items
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
              Charges, Tax & Summary
              {#if total > 0}
                <span class="badge bg-primary ms-1">{currency} {total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              {/if}
            </span>
          </button>
        </div>
      </div>
    </div>

    <form on:submit={handleSubmit} novalidate>

      <!-- ══ TAB 1 ══ -->
      {#if activeTab === 1}
      <div class="row g-4">
        <div class="col-12">

          <!-- Basic Information -->
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white">
              <h6 class="mb-0 fw-semibold"><i class="ti ti-info-circle me-2 text-primary"></i>Basic Information</h6>
            </div>
            <div class="card-body">
              <div class="grid grid-cols-3 gap-2">
                {#if linkedOrder}
                  <div class="col-span-1">
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
                  <div class="col-span-1">
                    <label class="form-label">Title <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" bind:value={title} placeholder="Enter invoice title" />
                  </div>
                {/if}

                <div class="col-span-1" id="field-company">
                  <label class="form-label">Company <span class="text-danger">*</span></label>
                  <select class="form-control" class:is-invalid={formErrors.companyId}
                    bind:value={companyId} on:change={(e) => companyChange(e.target.value)}>
                    <option value={null}>— Select company —</option>
                    {#each companies as c}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                  {#if formErrors.companyId}
                    <ul class="text-danger mt-1 text-xs"><li>{formErrors.companyId[0]}</li></ul>
                  {/if}
                </div>

                <div>
                  <label class="form-label">Bank Account</label>
                  <select class="form-control" bind:value={selectedBankAccount}>
                    <option value={null}>— Select bank —</option>
                    {#each bankAccounts as b}<option value={b}>{bankLabel(b)}</option>{/each}
                  </select>
                </div>

                <div>
                  <label class="form-label">Invoice Date</label>
                  <input type="date" class="form-control" bind:value={invoiceDate} />
                </div>

                <div>
                  <label class="form-label">PO Number</label>
                  <input type="text" class="form-control" bind:value={poNumber} placeholder="e.g. PO-2024-001" />
                </div>

                <div>
                  <label class="form-label">PO Date</label>
                  <input type="date" class="form-control" bind:value={poDate} />
                </div>

                <div>
                  <label class="form-label">Currency</label>
                  <select class="form-control" bind:value={currency}>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                  </select>
                </div>

                <div>
                  <label class="form-label">Payment Method</label>
                  <select class="form-control" bind:value={paymentMethod}>
                    <option value="Other">Other</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Wire Transfer">Wire Transfer</option>
                  </select>
                </div>

                <div>
                  <label class="form-label">Status</label>
                  <select class="form-control" bind:value={status}>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                    <option value="Partially Paid">Partially Paid</option>
                  </select>
                </div>

                <div>
                  <label class="form-label">Price Terms</label>
                  <input type="text" class="form-control" bind:value={priceTerms} placeholder="e.g. 30 days net" />
                </div>

              </div>
            </div>
          </div>

          <!-- Bill To / Ship To -->
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white">
              <h6 class="mb-0 fw-semibold"><i class="ti ti-user me-2 text-primary"></i>Bill To / Ship To</h6>
            </div>
            <div class="card-body p-0">
              <div class="row g-0">
                <div class="col-md-6 p-4 border-end">
                  <h6 class="fw-semibold mb-3 small text-uppercase text-primary">
                    <i class="ti ti-file-invoice me-1"></i>Bill To
                  </h6>
                  <div class="grid grid-cols-1 gap-2">
                    <div><label class="form-label">Name</label><input type="text" class="form-control" bind:value={billToName} placeholder="Company or person name" /></div>
                    <div><label class="form-label">GST Number</label><input type="text" class="form-control" bind:value={billToGSTNumber} placeholder="e.g. 22AAAAA0000A1Z5" /></div>
                    <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={billToEmail} placeholder="billing@company.com" /></div>
                    <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={billToMobile} placeholder="+91 98765 43210" /></div>
                    <div><label class="form-label">Address</label><textarea class="form-control" rows="3" bind:value={billToAddress} placeholder="Full billing address"></textarea></div>
                  </div>
                </div>
                <div class="col-md-6 p-4">
                  <div class="d-flex align-items-center justify-content-between mb-3">
                    <h6 class="fw-semibold mb-0 small text-uppercase text-success">
                      <i class="ti ti-truck me-1"></i>Ship To
                    </h6>
                    <label class="d-flex align-items-center gap-2 cursor-pointer small mb-0">
                      <input type="checkbox" bind:checked={shipToSameAsBillTo} on:change={shipToChange} />
                      <span class="text-muted">Same as Bill To</span>
                    </label>
                  </div>
                  <div class="grid grid-cols-1 gap-2">
                    <div><label class="form-label">Name</label><input type="text" class="form-control" bind:value={shipToName} placeholder="Company or person name" /></div>
                    <div><label class="form-label">GST Number</label><input type="text" class="form-control" bind:value={shipToGSTNumber} placeholder="e.g. 22AAAAA0000A1Z5" /></div>
                    <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={shipToEmail} placeholder="shipping@company.com" /></div>
                    <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={shipToMobile} placeholder="+91 98765 43210" /></div>
                    <div><label class="form-label">Address</label><textarea class="form-control" rows="3" bind:value={shipToAddress} placeholder="Full shipping address"></textarea></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Line Items -->
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between" id="field-items">
              <h6 class="mb-0 fw-semibold">
                <i class="ti ti-list-details me-2 text-primary"></i>Line Items
                <span class="badge bg-primary ms-2">{items.length}</span>
              </h6>
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
                      <th class="px-3 py-2" style="min-width:200px">Item Description</th>
                      <th class="px-3 py-2 text-center" style="width:70px">Qty</th>
                      <th class="px-3 py-2 text-center" style="width:100px">Unit</th>
                      <th class="px-3 py-2 text-center" style="width:120px">Unit Price</th>
                      <th class="px-3 py-2" style="width:120px">HS Code</th>
                      <th class="px-3 py-2 text-end" style="width:110px">Total</th>
                      <th class="px-3 py-2 text-center" style="width:46px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each items as item, i}
                      <tr id="field-item-{i}">
                        <td class="px-3 py-2 text-center text-muted small align-middle">{i + 1}</td>
                        <td class="px-2 py-1">
                          <input type="text" class="form-control form-control-sm border-0 shadow-none"
                            bind:value={item.item} placeholder="Describe the item clearly" />
                        </td>
                        <td class="px-2 py-1">
                          <input type="number" class="form-control form-control-sm border-0 shadow-none text-center"
                            bind:value={item.quantity} on:input={() => updateItemTotal(i)} min="0" step="1" placeholder="1" />
                        </td>
                        <td class="px-2 py-1">
                          <select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>
                            {#each unitOptions as u}<option value={u}>{u}</option>{/each}
                          </select>
                        </td>
                        <td class="px-2 py-1">
                          <input type="number" class="form-control form-control-sm border-0 shadow-none text-end"
                            bind:value={item.unitPrice} on:input={() => updateItemTotal(i)} min="0" step="0.01" placeholder="0.00" />
                        </td>
                        <td class="px-2 py-1">
                          <input type="text" class="form-control form-control-sm border-0 shadow-none"
                            bind:value={item.hsCode} placeholder="e.g. 8422.30" />
                        </td>
                        <td class="px-3 py-2 text-end fw-semibold align-middle">
                          {(item.total || 0).toFixed(2)}
                        </td>
                        <td class="px-2 py-2 text-center align-middle">
                          <button type="button" class="btn btn-sm btn-icon btn-soft-danger rounded-pill"
                            on:click={() => removeItem(i)} title="Remove item">
                            <i class="ti ti-trash"></i>
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                  <tfoot class="table-light">
                    <tr>
                      <td colspan="6" class="px-3 py-2 text-end fw-semibold text-muted">Items Subtotal</td>
                      <td class="px-3 py-2 text-end fw-bold">{itemsSubtotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-end">
            <button type="button" class="btn btn-primary" on:click={goToStep2}>
              Next: Charges & Summary <i class="ti ti-arrow-right ms-1"></i>
            </button>
          </div>

        </div>
      </div>
      {/if}

      <!-- ══ TAB 2 ══ -->
      {#if activeTab === 2}
      <div class="row g-4">

        <div class="col-lg-8">

          <!-- Extra Charges & Taxes -->
          <div class="card border mb-3">
            <div class="card-header py-2 d-flex align-items-center justify-content-between flex-wrap gap-2"
              style="background:{isOutOfIndia ? '#fff8e1' : '#f0f9f0'};">
              <h6 class="mb-0 fw-semibold"><i class="ti ti-receipt-tax me-2 text-primary"></i>Extra Charges & Taxes</h6>
              <div class="d-flex align-items-center gap-3 ms-auto">
                <span class="fw-semibold small" style="color:{isOutOfIndia ? '#856404' : '#2e7d32'};">
                  <i class="ti ti-world me-1"></i>Supply Type:
                </span>
                <label class="d-flex align-items-center gap-2 cursor-pointer mb-0">
                  <input type="radio" name="indiaType" checked={!isOutOfIndia} on:change={() => toggleIndia(false)} />
                  <span class="small fw-semibold" style="color:#2e7d32;">In India (GST)</span>
                </label>
                <label class="d-flex align-items-center gap-2 cursor-pointer mb-0">
                  <input type="radio" name="indiaType" checked={isOutOfIndia} on:change={() => toggleIndia(true)} />
                  <span class="small fw-semibold" style="color:#856404;">Out of India (Export)</span>
                </label>
              </div>
            </div>
            <div class="card-body">
              <div class="grid grid-cols-2 gap-2">

                <div>
                  <div class="d-flex align-items-center justify-content-between mb-3">
                    <span class="fw-semibold small text-uppercase text-muted">Extra Charges</span>
                    <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addExtraItem}>
                      <i class="ti ti-plus me-1"></i>Add
                    </button>
                  </div>
                  {#if extraItems.length === 0}
                    <div class="text-muted small fst-italic py-2">No extra charges added</div>
                  {:else}
                    <table class="table table-sm table-bordered mb-0">
                      <thead class="table-light">
                        <tr>
                          <th class="py-1 px-2">Charge Name</th>
                          <th class="py-1 px-2 text-end" style="width:100px">Amount</th>
                          <th style="width:40px"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each extraItems as ei, i}
                          <tr>
                            <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={ei.item} placeholder="e.g. Freight, Packing" /></td>
                            <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" bind:value={ei.total} min="0" step="0.01" placeholder="0.00" /></td>
                            <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeExtraItem(i)}><i class="ti ti-x"></i></button></td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </div>

                <div>
                  <div class="d-flex align-items-center justify-content-between mb-3">
                    <span class="fw-semibold small text-uppercase text-muted">Tax Items</span>
                    {#if !isOutOfIndia}
                    <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addTaxItem}>
                      <i class="ti ti-plus me-1"></i>Add
                    </button>
                    {/if}
                  </div>
                  {#if isOutOfIndia}
                  <div class="d-flex align-items-center justify-content-center p-3 rounded"
                    style="background:#fff3cd;border:1px dashed #ffc107;color:#856404;">
                    <i class="ti ti-world-off me-2"></i>
                    <span class="small fw-semibold">Tax not applicable for Out of India (Export)</span>
                  </div>
                  {:else}
                  <table class="table table-sm table-bordered mb-0">
                    <thead class="table-light">
                      <tr>
                        <th class="py-1 px-2">Tax Name</th>
                        <th class="py-1 px-2 text-center" style="width:90px">Rate (%)</th>
                        <th class="py-1 px-2 text-end" style="width:90px">Amount</th>
                        <th style="width:40px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each taxItems as ti, i}
                        <tr>
                          <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={ti.item} placeholder="e.g. CGST, IGST" /></td>
                          <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" bind:value={ti.percentage} on:input={recalculateTaxes} min="0" max="100" step="0.5" placeholder="0" /></td>
                          <td class="p-1 text-end fw-semibold align-middle small">{ti.total?.toFixed(2)}</td>
                          <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeTaxItem(i)}><i class="ti ti-x"></i></button></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {/if}
                </div>

              </div>
            </div>
          </div>

          <!-- Notes & Terms -->
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white">
              <h6 class="mb-0 fw-semibold"><i class="ti ti-notes me-2 text-primary"></i>Notes & Terms</h6>
            </div>
            <div class="card-body">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="form-label">Terms & Conditions</label>
                  <textarea class="form-control" rows="3" bind:value={termsConditions} placeholder="Enter payment terms, delivery conditions..."></textarea>
                </div>
                <div>
                  <label class="form-label">Remarks</label>
                  <textarea class="form-control" rows="3" bind:value={remarks} placeholder="Any additional notes or remarks..."></textarea>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Right: Sticky Summary + Submit -->
        <div class="col-lg-4">
          <div class="card border" style="position:sticky;top:80px;">
            <div class="card-header py-2 bg-white">
              <h6 class="mb-0 fw-semibold"><i class="ti ti-calculator me-2 text-primary"></i>Invoice Summary</h6>
            </div>
            <div class="card-body">

              <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                <span class="text-muted small">Total Items</span>
                <span class="badge bg-primary">{items.length} item{items.length !== 1 ? "s" : ""}</span>
              </div>

              <table class="table table-sm table-borderless mb-0">
                <tbody>
                  <tr><td class="text-muted py-1">Items Subtotal</td><td class="text-end py-1">{currency} {itemsSubtotal.toFixed(2)}</td></tr>
                  {#if discount > 0}
                    <tr><td class="text-muted py-1">Discount</td><td class="text-end py-1 text-danger">− {currency} {discount.toFixed(2)}</td></tr>
                  {/if}
                  {#if extratotal > 0}
                    <tr><td class="text-muted py-1">Extra Charges</td><td class="text-end py-1">+ {currency} {extratotal.toFixed(2)}</td></tr>
                  {/if}
                  {#each taxItems as ti}
                    {#if ti.total > 0}
                      <tr><td class="text-muted py-1">{ti.item} ({ti.percentage}%)</td><td class="text-end py-1">+ {currency} {ti.total.toFixed(2)}</td></tr>
                    {/if}
                  {/each}
                  <tr class="border-top">
                    <td class="fw-bold py-2">Grand Total</td>
                    <td class="text-end py-2">
                      <span class="fw-bold text-primary" style="font-size:1.2rem">{currency} {total.toFixed(2)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <hr class="my-3" />

              <div class="mb-3">
                <label class="form-label small fw-semibold">Discount Amount</label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text">{currency}</span>
                  <input type="number" class="form-control" bind:value={discount} min="0" step="0.01" placeholder="0.00" />
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Total Label</label>
                <input type="text" class="form-control form-control-sm" bind:value={totalAmountTitle} placeholder="Total Amount" />
              </div>

              <div class="mb-4">
                <label class="form-label small fw-semibold">
                  Total Override <span class="text-muted fw-normal">(0 = use calculated)</span>
                </label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text">{currency}</span>
                  <input type="number" class="form-control" bind:value={totalAmountValue} min="0" step="0.01" placeholder="0" />
                </div>
              </div>

              <div class="d-grid gap-2">
                <button type="submit" class="btn btn-primary" disabled={loading}>
                  {#if loading}
                    <span class="spinner-border spinner-border-sm me-2"></span>Saving...
                  {:else}
                    <i class="ti ti-device-floppy me-1"></i>Update Proforma Invoice
                  {/if}
                </button>
                <button type="button" class="btn btn-outline-secondary" on:click={() => (activeTab = 1)}>
                  <i class="ti ti-arrow-left me-1"></i>Back to Items
                </button>
                <a href="/admin/invoice/{invoiceId}" class="btn btn-light text-center">Cancel</a>
              </div>

            </div>
          </div>
        </div>

      </div>
      {/if}

    </form>
  </div>
</div>
