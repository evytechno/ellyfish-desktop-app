<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  let loadingData = true;
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  let invoiceId;
  $: invoiceId = $page.params.id;

  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos", "Ton"];

  let invoiceDate = "";
  let title = "";
  let poNumber = "";
  let currency = "INR";
  let discount = 0;
  let totalAmountTitle = "Total Amount";
  let totalAmountValue = 0;
  let items = [];
  let extraItems = [];
  let taxItems = [];
  let taxCountry = "India";
  let taxState = "Rajasthan";
  let taxSlab = null;
  const indianStates = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
    "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
    "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
    "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
    "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"
  ];
  let priceTerms = "";
  let inCoterms = null;
  let inCotermsBy = null;
  const inCotermsArray = ["In India", "Outside India"];
  const inCotermsInArray = ["Ex", "Door Delivery", "Godown"];
  const inCotermsOutsideArray = ["Ex", "FOB", "CIF"];
  let swiftCode = "";
  let termsConditions = "";
  let remarks = "";
  let billToName = "";
  let billToAddress = "";
  let billToGSTNumber = "";
  let billToMobile = "";
  let billToEmail = "";
  let shipToName = "";
  let shipToAddress = "";
  let shipToGSTNumber = "";
  let shipToMobile = "";
  let shipToEmail = "";
  let shipToSameAsBillTo = false;

  let companySnapshot = null;
  let bankSnapshot = null;

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];
  $: currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? "₹";
  $: itemsSubtotal = items.reduce((s, i) => s + (i.total || 0), 0);
  $: extraSubtotal = extraItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

  function recalculate() {
    items = items.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price ?? item.unitPrice) || 0;
      return { ...item, total: parseFloat((qty * price).toFixed(2)) };
    });
    const iSub = items.reduce((s, i) => s + (i.total || 0), 0);
    const eSub = extraItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const taxableESub = extraItems.reduce((s, i) => s + (i.taxable !== false ? (parseFloat(i.total) || 0) : 0), 0);
    const taxBase = iSub + taxableESub - (parseFloat(discount) || 0);
    taxItems = taxItems.map((t) => ({
      ...t,
      total: parseFloat(((taxBase * t.percentage) / 100).toFixed(2)),
    }));
    totalAmountValue = parseFloat((iSub + eSub - (parseFloat(discount) || 0) + taxItems.reduce((s, t) => s + (t.total || 0), 0)).toFixed(2));
  }

  $: items, extraItems, taxItems, discount, recalculate();

  function applyTaxSlab() {
    if (taxCountry === "Outside India") {
      taxItems = [];
    } else {
      if (!taxSlab) { taxItems = []; recalculate(); return; }
      const slab = Number(taxSlab);
      if (taxState === "Rajasthan") {
        taxItems = [{ item: "CGST", percentage: slab / 2, total: 0 }, { item: "SGST", percentage: slab / 2, total: 0 }];
      } else {
        taxItems = [{ item: "IGST", percentage: slab, total: 0 }];
      }
    }
    recalculate();
  }

  function formatDateForInput(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  }

  function shipToChange(e) {
    if (e.target.checked) {
      shipToName = billToName; shipToAddress = billToAddress;
      shipToGSTNumber = billToGSTNumber; shipToMobile = billToMobile; shipToEmail = billToEmail;
    }
  }

  function addItem() { items = [...items, { item: "", quantity: "0", unit: "Pcs", price: 0, hsCode: "", total: 0 }]; }
  function removeItem(i) { items = items.filter((_, idx) => idx !== i); }
  function addExtraItem() { extraItems = [...extraItems, { item: "", total: 0, taxable: true }]; }
  function removeExtraItem(i) { extraItems = extraItems.filter((_, idx) => idx !== i); }
  function addTaxItem() { taxItems = [...taxItems, { item: "", percentage: 0, total: 0 }]; recalculate(); }
  function removeTaxItem(i) { taxItems = taxItems.filter((_, idx) => idx !== i); recalculate(); }

  async function selectTaxSlab(slab) {
    if (taxItems.length > 0 && taxSlab !== slab) {
      const result = await Swal.fire({
        title: "Replace Tax Items?",
        text: "This will replace existing tax items with the selected slab. Continue?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, replace",
        cancelButtonText: "Cancel",
      });
      if (!result.isConfirmed) return;
    }
    taxSlab = slab;
    applyTaxSlab();
  }

  function populateFromInvoice(data) {
    invoiceDate = formatDateForInput(data.invoiceDate) || new Date().toISOString().split("T")[0];
    companySnapshot = data.companySnapshot ?? null;
    bankSnapshot = data.bankSnapshot ?? null;
    title = data.title ?? "";
    poNumber = data.poNumber ?? "";
    currency = data.currency ?? "INR";
    discount = data.discount ?? 0;
    totalAmountTitle = data.totalAmountTitle ?? "Total Amount";
    totalAmountValue = data.totalAmountValue ?? 0;
    items = (data.items ?? []).map((i) => ({ ...i, unit: i.unit || "Pcs", price: i.price ?? i.unitPrice ?? 0 }));
    extraItems = (data.extraItems ?? []).map((i) => ({ ...i, taxable: i.taxable ?? true }));
    taxItems = (data.taxItems ?? []).map((t) => ({ ...t }));
    taxCountry = data.country || "India";
    taxState = data.customerState || "Rajasthan";
    taxSlab = data.taxSlab || null;
    priceTerms = data.priceTerms ?? "";
    inCoterms = data.inCoterms ?? null;
    inCotermsBy = data.inCotermsBy ?? null;
    swiftCode = data.swiftCode ?? "";
    termsConditions = data.termsConditions ?? "";
    remarks = data.remarks ?? "";
    billToName = data.billToName ?? "";
    billToAddress = data.billToAddress ?? "";
    billToGSTNumber = data.billToGSTNumber ?? "";
    billToMobile = data.billToMobile ?? "";
    billToEmail = data.billToEmail ?? "";
    shipToName = data.shipToName ?? "";
    shipToAddress = data.shipToAddress ?? "";
    shipToGSTNumber = data.shipToGSTNumber ?? "";
    shipToMobile = data.shipToMobile ?? "";
    shipToEmail = data.shipToEmail ?? "";
  }

  onMount(async () => {
    loadingData = true;
    const syncMode = $page.url.searchParams.get("sync") === "1";
    try {
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${invoiceId}`);
      if (data.isLocked) {
        Swal.fire("Locked", "This invoice is locked and cannot be edited.", "error");
        goto(`/admin/invoice/tax/${invoiceId}`);
        return;
      }

      if (syncMode && data.order?.id) {
        // Sync ALL data from PI (preserve TI invoiceDate)
        try {
          const order = await authApiFetch(`${API_ROUTES.ORDER}/${data.order.id}`);
          const pi = order.orderPayments?.[0];
          const wo = order.workOrders?.[0];
          if (pi && wo) {
            const savedDate = formatDateForInput(data.invoiceDate) || new Date().toISOString().split("T")[0];
            // Sync all PI fields
            title = pi.title ?? "";
            poNumber = pi.poNumber ?? "";
            currency = pi.currency ?? "INR";
            discount = pi.discount ?? 0;
            totalAmountTitle = pi.totalAmountTitle ?? "Total Amount";
            priceTerms = pi.priceTerms ?? "";
            inCoterms = pi.inCoterms ?? null;
            inCotermsBy = pi.inCotermsBy ?? null;
            swiftCode = pi.swiftCode ?? "";
            termsConditions = pi.termsConditions ?? "";
            remarks = pi.remarks ?? "";
            billToName = pi.billToName ?? "";
            billToAddress = pi.billToAddress ?? "";
            billToGSTNumber = pi.billToGSTNumber ?? "";
            billToMobile = pi.billToMobile ?? "";
            billToEmail = pi.billToEmail ?? "";
            shipToName = pi.shipToName ?? "";
            shipToAddress = pi.shipToAddress ?? "";
            shipToGSTNumber = pi.shipToGSTNumber ?? "";
            shipToMobile = pi.shipToMobile ?? "";
            shipToEmail = pi.shipToEmail ?? "";
            extraItems = (pi.extraItems ?? []).map((i) => ({ ...i, taxable: i.taxable ?? true }));
            taxItems = (pi.taxItems ?? []).map((t) => ({ ...t }));
            taxCountry = pi.country || "India";
            taxState = pi.customerState || "Rajasthan";
            taxSlab = pi.taxSlab || null;
            // Items: PI descriptions + WO quantities
            const piItems = pi.items ?? [];
            const woItems = wo.items ?? [];
            items = piItems.map((piItem, idx) => ({
              item: piItem.item ?? "",
              quantity: woItems[idx]?.quantity ?? piItem.quantity ?? "0",
              unit: piItem.unit || "Pcs",
              price: piItem.price ?? piItem.unitPrice ?? 0,
              hsCode: piItem.hsCode ?? "",
              total: 0,
            }));
            // Company & bank from PI
            const piSnap = pi.companySnapshot;
            const liveCompany = order.company;
            companySnapshot = piSnap?.name ? piSnap : (liveCompany ? {
              name: liveCompany.name, address: liveCompany.address,
              mobile: liveCompany.mobile, email: liveCompany.email,
              gstNumber: liveCompany.gstNumber, logo: liveCompany.logo,
            } : companySnapshot);
            bankSnapshot = pi.selectedBankAccount ?? bankSnapshot;
            // Preserve TI's own invoice date
            invoiceDate = savedDate;
            recalculate();
            Swal.fire({ title: "Synced from PI", icon: "info", text: "All data synced from PI. Invoice date preserved. Review and save.", timer: 3000, showConfirmButton: false });
          } else {
            populateFromInvoice(data);
          }
        } catch {
          populateFromInvoice(data);
        }
      } else {
        populateFromInvoice(data);
      }
    } catch (err) {
      errorMessage = "Failed to load invoice data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }
  });

  async function handleSubmit() {
    loading = true;
    formErrors = {};
    errorMessage = "";
    try {
      const payload = {
        invoiceDate, title, poNumber, currency, discount,
        totalAmountTitle, totalAmountValue, items, extraItems, taxItems,
        isOutOfIndia: taxCountry === "Outside India",
        country: taxCountry, customerState: taxCountry === "India" ? taxState : null, taxSlab: taxSlab || null,
        priceTerms, inCoterms, inCotermsBy, swiftCode, termsConditions, remarks,
        billToName, billToAddress, billToGSTNumber, billToMobile, billToEmail,
        shipToName, shipToAddress, shipToGSTNumber, shipToMobile, shipToEmail,
        ...(companySnapshot ? { companySnapshot } : {}),
        ...(bankSnapshot ? { bankSnapshot } : {}),
      };
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${invoiceId}`, {
        method: "PUT",
        data: JSON.stringify(payload),
      });
      Swal.fire("Success!", data.message, "success");
      goto(`/admin/invoice/tax/${invoiceId}`);
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") formErrors = validationErrors;
      else errorMessage = "An unexpected error occurred.";
    } finally {
      loading = false;
    }
  }
</script>

{#if loadingData}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">

    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-0">Edit Tax Invoice</h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/invoice/tax">Tax Invoices</a></li>
              <li class="breadcrumb-item"><a href="/admin/invoice/tax/{invoiceId}">Detail</a></li>
              <li class="breadcrumb-item active">Edit</li>
            </ol>
          </nav>
        </div>
      </div>
      <a href="/admin/invoice/tax/{invoiceId}" class="btn btn-primary btn-sm">
        <i class="ti ti-eye me-1"></i>View Invoice
      </a>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {/if}

    {#if !errorMessage && !loadingData}
      <form on:submit|preventDefault={handleSubmit}>

        <!-- Invoice Information -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-file-invoice me-2 text-primary"></i>Invoice Information</h6>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="form-label">Invoice Date</label>
                <input type="date" class="form-control" bind:value={invoiceDate} />
              </div>
              <div>
                <label class="form-label">Title</label>
                <input type="text" class="form-control" bind:value={title} placeholder="Invoice title" />
              </div>
              <div>
                <label class="form-label">PO Number</label>
                <input type="text" class="form-control" bind:value={poNumber} placeholder="PO Number" />
              </div>
              <div>
                <label class="form-label">Currency</label>
                <select class="form-select" bind:value={currency}>
                  {#each currencies as c}<option value={c.code}>{c.code}</option>{/each}
                </select>
              </div>
              <div>
                <label class="form-label">Price Terms</label>
                <input type="text" class="form-control" bind:value={priceTerms} placeholder="e.g. FOB, CIF" />
              </div>
              <div>
                <label class="form-label">Incoterms</label>
                <select class="form-select" bind:value={inCoterms}>
                  <option value={null}>— Select —</option>
                  {#each inCotermsArray as c}<option>{c}</option>{/each}
                </select>
              </div>
              <div>
                <label class="form-label">Incoterms By</label>
                <select class="form-select" bind:value={inCotermsBy}>
                  <option value={null}>— Select —</option>
                  {#if inCoterms === "Outside India"}
                    {#each inCotermsOutsideArray as c}<option>{c}</option>{/each}
                  {:else}
                    {#each inCotermsInArray as c}<option>{c}</option>{/each}
                  {/if}
                </select>
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
                  <div><label class="form-label">Name</label><input type="text" class="form-control" bind:value={billToName} placeholder="Name" /></div>
                  <div><label class="form-label">GST Number</label><input type="text" class="form-control" bind:value={billToGSTNumber} placeholder="GSTIN" /></div>
                  <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={billToEmail} placeholder="billing@company.com" /></div>
                  <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={billToMobile} placeholder="+91 98765 43210" /></div>
                  <div><label class="form-label">Address</label><textarea class="form-control" rows="2" bind:value={billToAddress} placeholder="Full billing address"></textarea></div>
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
                  <div><label class="form-label">Name</label><input type="text" class="form-control" bind:value={shipToName} placeholder="Name" /></div>
                  <div><label class="form-label">GST Number</label><input type="text" class="form-control" bind:value={shipToGSTNumber} placeholder="GSTIN" /></div>
                  <div><label class="form-label">Email</label><input type="email" class="form-control" bind:value={shipToEmail} placeholder="shipping@company.com" /></div>
                  <div><label class="form-label">Mobile</label><input type="text" class="form-control" bind:value={shipToMobile} placeholder="+91 98765 43210" /></div>
                  <div><label class="form-label">Address</label><textarea class="form-control" rows="2" bind:value={shipToAddress} placeholder="Full shipping address"></textarea></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Line Items -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-list-details me-2 text-primary"></i>Line Items <span class="badge bg-primary ms-2">{items.length}</span></h6>
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
                    <tr>
                      <td class="px-3 py-2 text-center text-muted small align-middle">{i + 1}</td>
                      <td class="px-2 py-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.item} placeholder="Item description" /></td>
                      <td class="px-2 py-1"><input type="text" class="form-control form-control-sm border-0 shadow-none text-center" bind:value={item.quantity} on:input={recalculate} /></td>
                      <td class="px-2 py-1">
                        <select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>
                          {#each unitOptions as u}<option value={u}>{u}</option>{/each}
                        </select>
                      </td>
                      <td class="px-2 py-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" bind:value={item.price} on:input={recalculate} /></td>
                      <td class="px-2 py-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.hsCode} /></td>
                      <td class="px-3 py-2 text-end fw-semibold align-middle">{currencySymbol} {item.total?.toFixed(2) ?? "0.00"}</td>
                      <td class="px-2 py-2 text-center align-middle">
                        <button type="button" class="btn btn-sm btn-icon btn-soft-danger rounded-pill" on:click={() => removeItem(i)}>
                          <i class="ti ti-trash"></i>
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr><td colspan="8" class="text-center text-muted py-3">No items</td></tr>
                  {/each}
                </tbody>
                <tfoot class="table-light">
                  <tr>
                    <td colspan="6" class="px-3 py-2 text-end fw-semibold text-muted">Items Subtotal</td>
                    <td class="px-3 py-2 text-end fw-bold">{currencySymbol} {itemsSubtotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <!-- Extra Charges & Tax -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between flex-wrap gap-2">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-receipt-tax me-2 text-primary"></i>Extra Charges & Tax</h6>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-semibold small text-muted">Tax Region :</span>
              <select class="form-select form-select-sm" style="width:auto;" bind:value={taxCountry} on:change={applyTaxSlab}>
                <option value="India">India</option>
                <option value="Outside India">Outside India</option>
              </select>
              {#if taxCountry === "India"}
              <select class="form-select form-select-sm" style="width:auto;" bind:value={taxState} on:change={applyTaxSlab}>
                {#each indianStates as s}<option value={s}>{s}</option>{/each}
              </select>
              {/if}
            </div>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-2 gap-2">

              <!-- Extra Charges -->
              <div class="border rounded p-2">
                <div class="d-flex align-items-center justify-content-between mb-3">
                  <span class="fw-semibold small text-uppercase text-muted">Extra Charges</span>
                  <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addExtraItem}>
                    <i class="ti ti-plus me-1"></i>Add
                  </button>
                </div>
                {#if extraItems.length === 0}
                  <div class="text-muted small fst-italic py-2">No extra charges</div>
                {:else}
                  <table class="table table-sm table-bordered mb-0">
                    <thead class="table-light">
                      <tr>
                        <th class="py-1 px-2">Name</th>
                        <th class="py-1 px-2 text-end" style="width:100px">Amount</th>
                        <th class="py-1 px-2 text-center" style="width:56px">Taxable</th>
                        <th style="width:40px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each extraItems as ei, i}
                        <tr>
                          <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={ei.item} placeholder="e.g. Freight" /></td>
                          <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" bind:value={ei.total} on:input={recalculate} /></td>
                          <td class="p-1 text-center"><input type="checkbox" bind:checked={ei.taxable} on:change={recalculate} title="Include in taxable value" /></td>
                          <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeExtraItem(i)}><i class="ti ti-x"></i></button></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </div>

              <!-- Tax Items -->
              <div class="border rounded p-2">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="fw-semibold small text-uppercase text-muted">Tax Items</span>
                  {#if taxCountry !== "Outside India"}
                  <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addTaxItem}>
                    <i class="ti ti-plus me-1"></i>Add
                  </button>
                  {/if}
                </div>
                {#if taxCountry === "India"}
                <div class="d-flex gap-1 flex-wrap mb-2">
                  {#each [5, 12, 18, 28] as slab}
                    <button type="button"
                      class="btn btn-sm {taxSlab === slab ? 'btn-primary' : 'btn-outline-secondary'}"
                      style="min-width:48px;font-size:11px;"
                      on:click={() => selectTaxSlab(slab)}>
                      {slab}%
                    </button>
                  {/each}
                  {#if taxSlab}
                  <button type="button" class="btn btn-sm btn-outline-danger" style="font-size:11px;"
                    on:click={() => { taxSlab = null; taxItems = []; recalculate(); }}>
                    <i class="ti ti-x"></i>
                  </button>
                  {/if}
                </div>
                {/if}
                {#if taxCountry === "Outside India"}
                <div class="d-flex align-items-center justify-content-center p-3 rounded"
                  style="background:#fff3cd;border:1px dashed #ffc107;color:#856404;">
                  <i class="ti ti-world-off me-2"></i>
                  <span class="small fw-semibold">Tax not applicable (Export)</span>
                </div>
                {:else if taxItems.length > 0}
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th class="py-1 px-2">Tax Name</th>
                      <th class="py-1 px-2 text-center" style="width:90px">Rate (%)</th>
                      <th class="py-1 px-2 text-end" style="width:90px">Amount</th>
                      <th style="width:36px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each taxItems as tax, i}
                      <tr>
                        <td class="p-1 align-middle">{tax.item}</td>
                        <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" bind:value={tax.percentage} on:input={recalculate} /></td>
                        <td class="p-1 text-end fw-semibold align-middle small">{currencySymbol} {tax.total?.toFixed(2) ?? "0.00"}</td>
                        <td class="p-1 text-center align-middle">
                          <button type="button" class="btn btn-sm text-danger p-0" on:click={() => removeTaxItem(i)}>
                            <i class="ti ti-x"></i>
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
                {:else}
                  <div class="text-muted text-center p-2" style="font-size:12px;">Select a tax slab above to auto-fill</div>
                {/if}
              </div>

            </div>
          </div>
        </div>

        <!-- Summary & Notes -->
        <div class="row g-3 mb-3">
          <div class="col-lg-5">
            <div class="card border h-100">
              <div class="card-header py-2 bg-white">
                <h6 class="mb-0 fw-semibold"><i class="ti ti-calculator me-2 text-primary"></i>Amount Summary</h6>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label">Discount</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">{currencySymbol}</span>
                    <input type="number" class="form-control" bind:value={discount} on:input={recalculate} placeholder="0.00" />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Total Label</label>
                  <input type="text" class="form-control form-control-sm" bind:value={totalAmountTitle} placeholder="Total Amount" />
                </div>
                <div class="border rounded p-3 bg-light">
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted small">Subtotal</span>
                    <span class="fw-medium small">{currencySymbol} {(itemsSubtotal + extraSubtotal).toFixed(2)}</span>
                  </div>
                  {#each taxItems as t}
                    {#if t.item}
                      <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted small">{t.item} ({t.percentage}%)</span>
                        <span class="small">{currencySymbol} {(t.total ?? 0).toFixed(2)}</span>
                      </div>
                    {/if}
                  {/each}
                  <div class="d-flex justify-content-between border-top pt-2 mt-1">
                    <span class="fw-semibold">{totalAmountTitle}</span>
                    <span class="fw-semibold text-primary">{currencySymbol} {totalAmountValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-7">
            <div class="card border h-100">
              <div class="card-header py-2 bg-white">
                <h6 class="mb-0 fw-semibold"><i class="ti ti-notes me-2 text-primary"></i>Notes & Terms</h6>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label">Terms & Conditions</label>
                  <textarea class="form-control" rows="3" bind:value={termsConditions} placeholder="Terms and conditions"></textarea>
                </div>
                <div>
                  <label class="form-label">Remarks</label>
                  <textarea class="form-control" rows="2" bind:value={remarks} placeholder="Additional remarks"></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-end gap-2 mt-3">
          <a href="/admin/invoice/tax/{invoiceId}" class="btn btn-outline-secondary">Cancel</a>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Tax Invoice"}
          </button>
        </div>

      </form>
    {/if}
  </div>
</div>
