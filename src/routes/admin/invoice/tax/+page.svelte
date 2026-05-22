<script>
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";

  let loadingData = true;
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  // Listing state
  let invoices = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let search = "";
  let searchTimeout;

  // Offcanvas mode
  let formType = "Create";
  let updateInvoiceId = null;
  let offcanvasTitle = "Create Tax Invoice";

  // Snapshot data (Create mode only)
  let companySnapshot = null;
  let bankSnapshot = null;
  let piId = null;
  let workOrderId = null;
  let linkedOrderId = null;

  // Form fields
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
  let priceTerms = "";
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

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];

  $: currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? "₹";
  $: itemsSubtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  $: extraSubtotal = extraItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  $: grandTotal = parseFloat(((itemsSubtotal + extraSubtotal - (parseFloat(discount) || 0)) + taxItems.reduce((s, t) => s + (parseFloat(t.total) || 0), 0)).toFixed(2));

  function recalculate() {
    items = items.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return { ...item, total: parseFloat((qty * price).toFixed(2)) };
    });
    const iSub = items.reduce((s, i) => s + (i.total || 0), 0);
    const eSub = extraItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const b = iSub + eSub - (parseFloat(discount) || 0);
    taxItems = taxItems.map((t) => ({
      ...t,
      total: parseFloat(((b * t.percentage) / 100).toFixed(2)),
    }));
    totalAmountValue = parseFloat((b + taxItems.reduce((s, t) => s + (t.total || 0), 0)).toFixed(2));
  }

  function formatDateForInput(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  }

  function openOffcanvas() {
    const $ = jQuery;
    $(".offcanvas-backdrop").remove();
    const overlay = $('<div class="offcanvas-backdrop fade show"></div>');
    overlay.insertBefore(".main-wrapper");
    $("#offcanvas_add").addClass("show");
    $("body").css({ overflow: "hidden", paddingRight: "15px" });
  }

  function closeOffcanvas() {
    const $ = jQuery;
    $("#offcanvas_add").removeClass("show");
    $(".offcanvas-backdrop").remove();
    $("body").css({ overflow: "", paddingRight: "" });
  }

  function resetForm() {
    formErrors = {};
    errorMessage = "";
    updateInvoiceId = null;
    companySnapshot = null;
    bankSnapshot = null;
    piId = null;
    workOrderId = null;
    linkedOrderId = null;
    invoiceDate = "";
    title = "";
    poNumber = "";
    currency = "INR";
    discount = 0;
    totalAmountTitle = "Total Amount";
    totalAmountValue = 0;
    items = [];
    extraItems = [];
    taxItems = [];
    priceTerms = "";
    swiftCode = "";
    termsConditions = "";
    remarks = "";
    billToName = "";
    billToAddress = "";
    billToGSTNumber = "";
    billToMobile = "";
    billToEmail = "";
    shipToName = "";
    shipToAddress = "";
    shipToGSTNumber = "";
    shipToMobile = "";
    shipToEmail = "";
    shipToSameAsBillTo = false;
  }

  async function prefillFromOrder(fromOrderId) {
    try {
      const order = await authApiFetch(`${API_ROUTES.ORDER}/${fromOrderId}`);
      if (!order) { Swal.fire("Error", "Order not found.", "error"); return false; }

      const pi = order.orderPayments?.[0];
      const wo = order.workOrders?.[0];

      if (!pi) { Swal.fire("Error", "No Proforma Invoice found. Create a PI first.", "error"); return false; }
      if (!wo) { Swal.fire("Error", "No Work Order found. Create a Work Order first.", "error"); return false; }

      piId = pi.id;
      workOrderId = wo.id;
      linkedOrderId = order.id;

      const warnings = [];
      const piItems = pi.items ?? [];
      const woItems = wo.items ?? [];
      if (piItems.length !== woItems.length) {
        warnings.push(`PI has ${piItems.length} items but Work Order has ${woItems.length} items.`);
      }
      woItems.forEach((wi, idx) => {
        const qty = parseFloat(wi.quantity) || 0;
        if (qty === 0) warnings.push(`Item "${wi.item || idx + 1}" has zero quantity in Work Order.`);
        if (piItems[idx]) {
          const piQty = parseFloat(piItems[idx].quantity) || 0;
          if (piQty > 0 && qty > piQty) {
            warnings.push(`Item "${wi.item}" dispatch qty (${qty}) exceeds quoted qty (${piQty}).`);
          }
        }
      });

      if (warnings.length > 0) {
        const result = await Swal.fire({
          title: "Warning",
          html: `<ul class="text-start">${warnings.map((w) => `<li>⚠️ ${w}</li>`).join("")}</ul>`,
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Proceed Anyway",
          cancelButtonText: "Cancel",
        });
        if (!result.isConfirmed) return false;
      }

      invoiceDate = formatDateForInput(wo.workOrderDate ?? pi.invoiceDate);
      title = pi.title ?? order.title ?? "";
      poNumber = pi.poNumber ?? "";
      currency = pi.currency ?? "INR";
      discount = pi.discount ?? 0;
      totalAmountTitle = pi.totalAmountTitle ?? "Total Amount";
      priceTerms = pi.priceTerms ?? "";
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
      extraItems = (pi.extraItems ?? []).map((e) => ({ ...e }));
      taxItems = (pi.taxItems ?? []).map((t) => ({ ...t, total: 0 }));
      items = piItems.map((piItem, idx) => ({
        item: piItem.item ?? "",
        quantity: woItems[idx]?.quantity ?? piItem.quantity ?? "0",
        price: piItem.price ?? 0,
        hsCode: piItem.hsCode ?? "",
        total: 0,
      }));

      const company = order.company;
      companySnapshot = company ? {
        name: company.name, address: company.address, mobile: company.mobile,
        email: company.email, gstNumber: company.gstNumber, logo: company.logo,
      } : null;
      bankSnapshot = pi.selectedBankAccount ?? (company ? {
        bankName: company.bankName, accountHolderName: company.accountHolderName,
        accountNumber: company.accountNumber, ifscCode: company.ifscCode,
        branchAddress: company.branchAddress,
      } : null);

      recalculate();
      return true;
    } catch (err) {
      Swal.fire("Error", "Failed to load order data.", "error");
      return false;
    }
  }

  async function prefillFromInvoice(id) {
    try {
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${id}`);
      if (data.isLocked) { Swal.fire("Locked", "This invoice is locked and cannot be edited.", "error"); return false; }
      updateInvoiceId = data.id;
      invoiceDate = formatDateForInput(data.invoiceDate);
      title = data.title ?? "";
      poNumber = data.poNumber ?? "";
      currency = data.currency ?? "INR";
      discount = data.discount ?? 0;
      totalAmountTitle = data.totalAmountTitle ?? "Total Amount";
      totalAmountValue = data.totalAmountValue ?? 0;
      items = (data.items ?? []).map((i) => ({ ...i }));
      extraItems = (data.extraItems ?? []).map((i) => ({ ...i }));
      taxItems = (data.taxItems ?? []).map((t) => ({ ...t }));
      priceTerms = data.priceTerms ?? "";
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
      return { ok: true, orderId: data.order?.id };
    } catch (err) {
      Swal.fire("Error", "Failed to load invoice data.", "error");
      return false;
    }
  }

  onMount(async () => {
    await fetchInvoices();

    const fromOrderId = $page.url.searchParams.get("fromOrder");
    const editId = $page.url.searchParams.get("editId");
    const syncId = $page.url.searchParams.get("syncId");

    if (fromOrderId) {
      resetForm();
      formType = "Create";
      offcanvasTitle = "Create Tax Invoice";
      const ok = await prefillFromOrder(fromOrderId);
      if (ok) openOffcanvas();
    } else if (editId) {
      resetForm();
      formType = "Edit";
      offcanvasTitle = "Edit Tax Invoice";
      const result = await prefillFromInvoice(Number(editId));
      if (result) openOffcanvas();
    } else if (syncId) {
      try {
        const inv = await authApiFetch(`${API_ROUTES.INVOICE}/${syncId}`);
        if (inv.isLocked) { Swal.fire("Locked", "This invoice is locked.", "error"); return; }
        if (!inv.order?.id) { Swal.fire("Error", "No order linked to this invoice.", "error"); return; }
        resetForm();
        formType = "Edit";
        offcanvasTitle = "Sync Tax Invoice from PI";
        updateInvoiceId = inv.id;
        const ok = await prefillFromOrder(inv.order.id);
        if (ok) openOffcanvas();
      } catch (err) {
        Swal.fire("Error", "Failed to load invoice.", "error");
      }
    }
  });

  async function fetchInvoices() {
    loadingData = true;
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(rowsPerPage),
        ...(search ? { search } : {}),
      });
      const data = await authApiFetch(`${API_ROUTES.INVOICE}?${params}`);
      invoices = data.data ?? [];
      totalItems = data.total ?? 0;
    } catch (err) {
      errorMessage = "Failed to load invoices.";
    } finally {
      setTimeout(() => { loadingData = false; }, 300);
    }
  }

  function handleSearch(e) {
    clearTimeout(searchTimeout);
    search = e.target.value;
    searchTimeout = setTimeout(() => { currentPage = 1; fetchInvoices(); }, 400);
  }

  function shipToChange(e) {
    if (e.target.checked) {
      shipToName = billToName; shipToAddress = billToAddress;
      shipToGSTNumber = billToGSTNumber; shipToMobile = billToMobile; shipToEmail = billToEmail;
    }
  }

  function addItem() { items = [...items, { item: "", quantity: "0", price: 0, hsCode: "", total: 0 }]; }
  function removeItem(i) { items = items.filter((_, idx) => idx !== i); recalculate(); }
  function addExtraItem() { extraItems = [...extraItems, { item: "", total: 0 }]; }
  function removeExtraItem(i) { extraItems = extraItems.filter((_, idx) => idx !== i); recalculate(); }
  function addTaxItem() { taxItems = [...taxItems, { item: "", percentage: 0, total: 0 }]; }
  function removeTaxItem(i) { taxItems = taxItems.filter((_, idx) => idx !== i); recalculate(); }

  async function handleSubmit(event) {
    event.preventDefault();
    loading = true;
    formErrors = {};
    errorMessage = "";
    try {
      let data;
      if (formType === "Create") {
        const payload = {
          orderId: linkedOrderId, piId, workOrderId,
          invoiceDate: invoiceDate || undefined, title, poNumber, currency, discount,
          totalAmountTitle, totalAmountValue,
          items, extraItems, taxItems,
          priceTerms, swiftCode, termsConditions, remarks,
          billToName, billToAddress, billToGSTNumber, billToMobile, billToEmail,
          shipToName, shipToAddress, shipToGSTNumber, shipToMobile, shipToEmail,
          companySnapshot, bankSnapshot,
        };
        data = await authApiFetch(API_ROUTES.INVOICE, { method: "POST", data: JSON.stringify(payload) });
        Swal.fire("Success!", data.message, "success");
        closeOffcanvas();
        goto(`/admin/invoice/tax/${data.data.id}`);
      } else {
        const payload = {
          invoiceDate: invoiceDate || undefined, title, poNumber, currency, discount,
          totalAmountTitle, totalAmountValue,
          items, extraItems, taxItems,
          priceTerms, swiftCode, termsConditions, remarks,
          billToName, billToAddress, billToGSTNumber, billToMobile, billToEmail,
          shipToName, shipToAddress, shipToGSTNumber, shipToMobile, shipToEmail,
        };
        data = await authApiFetch(`${API_ROUTES.INVOICE}/${updateInvoiceId}`, { method: "PUT", data: JSON.stringify(payload) });
        Swal.fire("Success!", data.message, "success");
        closeOffcanvas();
        resetForm();
        fetchInvoices();
      }
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }

  const columns = [
    {
      key: "invoiceNo",
      label: "Invoice No",
      render: (val, row) =>
        `<a href="/admin/invoice/tax/${row.id}" class="text-danger">#${String(row.invoiceNo).padStart(6, "0")}</a>`,
    },
    {
      key: "invoiceDate",
      label: "Invoice Date",
      render: (val) => {
        if (!val) return "-";
        const d = new Date(val);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      },
    },
    { key: "companySnapshot", label: "Company", render: (val) => val?.name ?? "-" },
    {
      key: "order",
      label: "Order",
      render: (val) =>
        val
          ? `<a href="/admin/order/${val.id}" class="text-primary">${val.financialYear}/${String(val.pId).padStart(6, "0")}</a>`
          : "-",
    },
    {
      key: "totalAmountValue",
      label: "Amount",
      render: (val, row) => {
        const sym = row.currency === "USD" ? "$" : "₹";
        return `${sym} ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      },
    },
    {
      key: "isLocked",
      label: "Status",
      render: (val) =>
        val
          ? `<span class="badge bg-success">Locked</span>`
          : `<span class="badge bg-warning text-dark">Draft</span>`,
    },
  ];

  const actions = [
    {
      label: "View",
      icon: "ti ti-eye",
      onClick: (id) => goto(`/admin/invoice/tax/${id}`),
      color: "btn-soft-primary",
    },
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: async (id) => {
        resetForm();
        formType = "Edit";
        offcanvasTitle = "Edit Tax Invoice";
        const result = await prefillFromInvoice(id);
        if (result) openOffcanvas();
      },
      color: "btn-soft-info",
    },
  ];
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content">
    <div class="pageHeader d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Tax Invoices</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">Tax Invoices</li>
          </ol>
        </nav>
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {/if}

    <div class="card">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <input
            type="text"
            class="form-control"
            style="max-width:280px"
            placeholder="Search invoices..."
            on:input={handleSearch}
          />
        </div>

        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...invoices]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
          serverMode={true}
          on:pageChange={(e) => { currentPage = e.detail; fetchInvoices(); }}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; fetchInvoices(); }}
        />
      </div>
    </div>
  </div>
</div>

<!-- Offcanvas -->
<div class="offcanvas offcanvas-end offcanvas-large" tabindex="-1" id="offcanvas_add">
  <div class="offcanvas-header border-bottom">
    <h5 class="mb-0">{offcanvasTitle}</h5>
    <button
      type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      on:click={closeOffcanvas}
      aria-label="Close"
    ></button>
  </div>
  <div class="offcanvas-body">
    {#if errorMessage}
      <div class="alert alert-danger mb-3">{errorMessage}</div>
    {/if}
    <form on:submit={handleSubmit} class="space-y-4">
      <div class="grid grid-cols-2 gap-3">

        <div>
          <label class="form-label" for="invoiceDate">Invoice Date</label>
          <input type="date" id="invoiceDate" class="form-control" bind:value={invoiceDate} />
        </div>
        <div>
          <label class="form-label" for="title">Title</label>
          <input type="text" id="title" class="form-control" bind:value={title} placeholder="Title" />
        </div>
        <div>
          <label class="form-label" for="poNumber">PO Number</label>
          <input type="text" id="poNumber" class="form-control" bind:value={poNumber} placeholder="PO Number" />
        </div>
        <div>
          <label class="form-label" for="currency">Currency</label>
          <select id="currency" class="select form-control" bind:value={currency}>
            {#each currencies as c}
              <option value={c.code}>{c.code}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="form-label" for="priceTerms">Price Terms</label>
          <input type="text" id="priceTerms" class="form-control" bind:value={priceTerms} placeholder="Price Terms" />
        </div>
        <div>
          <label class="form-label" for="swiftCode">Swift Code</label>
          <input type="text" id="swiftCode" class="form-control" bind:value={swiftCode} placeholder="Swift Code" />
        </div>

        <!-- Bill To -->
        <div class="col-span-2 border-top pt-2"><h6 class="m-0">Bill To</h6></div>
        <div>
          <label class="form-label">Name</label>
          <input type="text" class="form-control" bind:value={billToName} placeholder="Name" />
        </div>
        <div>
          <label class="form-label">Email</label>
          <input type="text" class="form-control" bind:value={billToEmail} placeholder="Email" />
        </div>
        <div>
          <label class="form-label">Mobile</label>
          <input type="text" class="form-control" bind:value={billToMobile} placeholder="Mobile" />
        </div>
        <div>
          <label class="form-label">GST Number</label>
          <input type="text" class="form-control" bind:value={billToGSTNumber} placeholder="GST Number" />
        </div>
        <div class="col-span-2">
          <label class="form-label">Address</label>
          <textarea class="form-control" rows="2" bind:value={billToAddress} placeholder="Address"></textarea>
        </div>

        <div class="col-span-2">
          <div class="flex items-center gap-2">
            <input type="checkbox" id="shipToSame" bind:checked={shipToSameAsBillTo} on:change={shipToChange} />
            <label class="form-label mb-0" for="shipToSame">Ship To same as Bill To</label>
          </div>
        </div>

        <!-- Ship To -->
        <div class="col-span-2 border-top pt-2"><h6 class="m-0">Ship To</h6></div>
        <div>
          <label class="form-label">Name</label>
          <input type="text" class="form-control" bind:value={shipToName} placeholder="Name" />
        </div>
        <div>
          <label class="form-label">Email</label>
          <input type="text" class="form-control" bind:value={shipToEmail} placeholder="Email" />
        </div>
        <div>
          <label class="form-label">Mobile</label>
          <input type="text" class="form-control" bind:value={shipToMobile} placeholder="Mobile" />
        </div>
        <div>
          <label class="form-label">GST Number</label>
          <input type="text" class="form-control" bind:value={shipToGSTNumber} placeholder="GST Number" />
        </div>
        <div class="col-span-2">
          <label class="form-label">Address</label>
          <textarea class="form-control" rows="2" bind:value={shipToAddress} placeholder="Address"></textarea>
        </div>

        <div class="col-span-2 border-top"></div>

        <!-- Items -->
        <div class="col-span-2">
          <div class="font-semibold text-black mb-2">Items :</div>
          <div class="table-responsive mb-2">
            <table class="w-full border table-nowrap">
              <thead class="table-light border-bottom bg-gray-100">
                <tr>
                  <th class="p-2">Item</th>
                  <th class="p-2">Qty</th>
                  <th class="p-2">Unit Price</th>
                  <th class="p-2">HS Code</th>
                  <th class="p-2">Total</th>
                  <th class="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {#each items as item, i}
                  <tr>
                    <td class="p-2"><input type="text" class="form-control" bind:value={item.item} /></td>
                    <td class="p-2"><input type="text" class="form-control" bind:value={item.quantity} on:input={recalculate} /></td>
                    <td class="p-2"><input type="number" step="any" class="form-control" bind:value={item.price} on:input={recalculate} /></td>
                    <td class="p-2"><input type="text" class="form-control" bind:value={item.hsCode} /></td>
                    <td class="p-2 text-center">{currencySymbol} {(item.total ?? 0).toFixed(2)}</td>
                    <td class="p-2">
                      <button type="button" class="btn btn-icon btn-sm text-danger" on:click={() => removeItem(i)}>
                        <i class="ti ti-xbox-x"></i>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <button type="button" class="text-primary" on:click={addItem}>
            <i class="ti ti-plus me-1"></i>Add Item
          </button>
        </div>

        <!-- Extra Items -->
        <div class="col-span-2">
          <div class="font-semibold text-black mb-2">Extra Items :</div>
          <div class="table-responsive mb-2">
            <table class="w-full border table-nowrap">
              <thead class="table-light border-bottom bg-gray-100">
                <tr>
                  <th class="p-2">Name</th>
                  <th class="p-2">Total Price</th>
                  <th class="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {#each extraItems as ei, i}
                  <tr>
                    <td class="p-2"><input type="text" class="form-control" bind:value={ei.item} /></td>
                    <td class="p-2"><input type="number" step="any" class="form-control" bind:value={ei.total} on:input={recalculate} /></td>
                    <td class="p-2">
                      <button type="button" class="btn btn-icon btn-sm text-danger" on:click={() => removeExtraItem(i)}>
                        <i class="ti ti-xbox-x"></i>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <button type="button" class="text-primary" on:click={addExtraItem}>
            <i class="ti ti-plus me-1"></i>Add Extra Item
          </button>
        </div>

        <!-- Tax Items -->
        <div class="col-span-2">
          <div class="font-semibold text-black mb-2">Tax Items :</div>
          <div class="table-responsive mb-2">
            <table class="w-full border table-nowrap">
              <thead class="table-light border-bottom bg-gray-100">
                <tr>
                  <th class="p-2">Name</th>
                  <th class="p-2">Percentage (%)</th>
                  <th class="p-2">Amount</th>
                  <th class="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {#each taxItems as tax, i}
                  <tr>
                    <td class="p-2"><input type="text" class="form-control" bind:value={tax.item} /></td>
                    <td class="p-2"><input type="number" step="any" class="form-control" bind:value={tax.percentage} on:input={recalculate} /></td>
                    <td class="p-2 text-center">{currencySymbol} {(tax.total ?? 0).toFixed(2)}</td>
                    <td class="p-2">
                      <button type="button" class="btn btn-icon btn-sm text-danger" on:click={() => removeTaxItem(i)}>
                        <i class="ti ti-xbox-x"></i>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <button type="button" class="text-primary" on:click={addTaxItem}>
            <i class="ti ti-plus me-1"></i>Add Tax Item
          </button>
        </div>

        <div class="col-span-2">
          <label class="form-label" for="discount">Discount</label>
          <input type="number" step="any" id="discount" class="form-control" bind:value={discount} on:input={recalculate} placeholder="Discount" />
        </div>

        <div>
          <label class="form-label" for="totalAmountTitle">Total Amount Title</label>
          <input type="text" id="totalAmountTitle" class="form-control" bind:value={totalAmountTitle} placeholder="Total Amount Title" />
        </div>
        <div>
          <label class="form-label" for="totalAmountValue">Total Amount Override</label>
          <input type="number" step="any" id="totalAmountValue" class="form-control" bind:value={totalAmountValue} placeholder="Leave 0 to use calculated" />
        </div>

        <!-- Summary -->
        <div class="col-span-2">
          <div class="border rounded p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="fs-14 fw-semibold">Subtotal</span>
              <span class="fs-14 fw-semibold">
                {currencySymbol} {(itemsSubtotal + extraSubtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {#if (parseFloat(discount) || 0) !== 0}
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fs-14">Discount</span>
                <span class="fs-14">- {currencySymbol} {Number(discount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            {/if}
            {#each taxItems as t}
              {#if t.item}
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="fs-14">{t.item}{t.percentage ? ` (${t.percentage}%)` : ""}</span>
                  <span class="fs-14">{currencySymbol} {(t.total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              {/if}
            {/each}
            <div class="d-flex align-items-center justify-content-between border-top pt-2">
              <span class="fs-14 fw-semibold">Total</span>
              <span class="fs-14 fw-semibold">
                {currencySymbol} {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div class="col-span-2">
          <label class="form-label" for="termsConditions">Terms & Conditions</label>
          <textarea id="termsConditions" class="form-control" rows="3" bind:value={termsConditions} placeholder="Terms & Conditions"></textarea>
        </div>
        <div class="col-span-2">
          <label class="form-label" for="remarks">Remarks</label>
          <textarea id="remarks" class="form-control" rows="2" bind:value={remarks} placeholder="Remarks"></textarea>
        </div>

      </div>

      <div class="d-flex align-items-center justify-content-end mt-4 gap-2">
        <button type="button" class="btn btn-light" on:click={closeOffcanvas}>Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={loading}>
          {formType === "Create" ? (loading ? "Creating..." : "Create Invoice") : (loading ? "Saving..." : "Save Changes")}
        </button>
      </div>
    </form>
  </div>
</div>
