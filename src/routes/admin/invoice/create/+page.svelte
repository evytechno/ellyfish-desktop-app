<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";

  let loadingData = true;
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  let orderId = null;
  let order = null;
  let pi = null;
  let workOrder = null;

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
  $: grandTotal = totalAmountValue;

  function recalculate() {
    items = items.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price ?? item.unitPrice) || 0;
      return { ...item, total: parseFloat((qty * price).toFixed(2)) };
    });
    const itemsSub = items.reduce((s, i) => s + (i.total || 0), 0);
    const extraSub = extraItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const base = itemsSub + extraSub - (parseFloat(discount) || 0);
    taxItems = taxItems.map((t) => ({
      ...t,
      total: parseFloat(((base * (parseFloat(t.percentage) || 0)) / 100).toFixed(2)),
    }));
    const taxTotal = taxItems.reduce((s, t) => s + (t.total || 0), 0);
    totalAmountValue = parseFloat((base + taxTotal).toFixed(2));
  }

  $: items, extraItems, taxItems, discount, recalculate();

  function formatDateForInput(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  }

  function formatDocRef(fy, num, pad = 6) {
    if (fy == null && num == null) return "—";
    return `${fy ?? ""}/${String(num ?? "").padStart(pad, "0")}`;
  }

  function shipToChange(e) {
    if (e.target.checked) {
      shipToName = billToName;
      shipToAddress = billToAddress;
      shipToGSTNumber = billToGSTNumber;
      shipToMobile = billToMobile;
      shipToEmail = billToEmail;
    }
  }

  function addItem() {
    items = [...items, { item: "", quantity: "0", unit: "Pcs", price: 0, hsCode: "", total: 0 }];
  }

  function removeItem(i) {
    items = items.filter((_, idx) => idx !== i);
    recalculate();
  }

  function addExtraItem() {
    extraItems = [...extraItems, { item: "", total: 0 }];
  }

  function removeExtraItem(i) {
    extraItems = extraItems.filter((_, idx) => idx !== i);
    recalculate();
  }

  function addTaxItem() {
    taxItems = [...taxItems, { item: "", percentage: 0, total: 0 }];
  }

  function removeTaxItem(i) {
    taxItems = taxItems.filter((_, idx) => idx !== i);
    recalculate();
  }

  function fieldError(name) {
    return formErrors[name]?.[0] ?? null;
  }

  onMount(async () => {
    orderId =
      $page.url.searchParams.get("orderId") ||
      $page.url.searchParams.get("fromOrder");

    if (!orderId) {
      errorMessage = "No order specified. Open this page from an order to create a tax invoice.";
      loadingData = false;
      return;
    }

    try {
      order = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}/basic`);
      pi = order?.orderPayments?.[0] ?? null;
      workOrder = order?.workOrders?.[0] ?? null;

      if (!pi) {
        errorMessage =
          "No Proforma Invoice found for this order. Create a PI before generating a tax invoice.";
        loadingData = false;
        return;
      }
      if (!workOrder) {
        errorMessage =
          "No Work Order found for this order. Create a Work Order before generating a tax invoice.";
        loadingData = false;
        return;
      }

      const warnings = [];
      const piItems = pi.items ?? [];
      const woItems = workOrder.items ?? [];

      if (piItems.length !== woItems.length) {
        warnings.push(
          `PI has ${piItems.length} item(s) but Work Order has ${woItems.length} item(s).`,
        );
      }
      woItems.forEach((wi) => {
        if (!wi.quantity || parseFloat(wi.quantity) === 0) {
          warnings.push(`Item "${wi.item}" has zero quantity in the Work Order.`);
        }
        const piItem = piItems.find((p) => p.item === wi.item);
        if (piItem && parseFloat(wi.quantity) > parseFloat(piItem.quantity || 0)) {
          warnings.push(
            `Item "${wi.item}": dispatch qty (${wi.quantity}) exceeds quoted qty (${piItem.quantity}).`,
          );
        }
      });

      if (warnings.length > 0) {
        const result = await Swal.fire({
          title: "Review before continuing",
          html: warnings.map((w) => `<div class="text-start mb-1">⚠️ ${w}</div>`).join(""),
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Proceed anyway",
          cancelButtonText: "Go back",
        });
        if (!result.isConfirmed) {
          goto(`/admin/order/${orderId}`);
          return;
        }
      }

      title = pi.title ?? "";
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
      extraItems = (pi.extraItems ?? []).map((i) => ({ ...i }));
      taxItems = (pi.taxItems ?? []).map((t) => ({ ...t }));

      items = piItems.map((piItem, idx) => {
        const woItem = woItems[idx];
        return {
          item: piItem.item ?? "",
          quantity: woItem?.quantity ?? piItem.quantity ?? "0",
          unit: piItem.unit || "Pcs",
          price: piItem.price ?? piItem.unitPrice ?? 0,
          hsCode: piItem.hsCode ?? "",
          total: 0,
        };
      });

      // Invoice date: PI date → WO date → today
      invoiceDate =
        formatDateForInput(pi.invoiceDate) ||
        formatDateForInput(workOrder.workOrderDate) ||
        new Date().toISOString().split("T")[0];

      recalculate();
    } catch (err) {
      errorMessage = "Failed to load order data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  async function handleSubmit() {
    loading = true;
    formErrors = {};
    errorMessage = "";
    try {
      // Use pi.companySnapshot if available, else build from pi.company (the relation object)
      const piSnap = pi?.companySnapshot;
      const piCompany = pi?.company;
      const companySnapshot = piSnap?.name ? piSnap : {
        name: piCompany?.name,
        address: piCompany?.address,
        mobile: piCompany?.mobile,
        email: piCompany?.email,
        gstNumber: piCompany?.gstNumber,
        logo: piCompany?.logo,
      };
      const bankSnapshot = pi?.selectedBankAccount ?? {
        accountHolderName: piCompany?.accountHolderName,
        bankName: piCompany?.bankName,
        accountNumber: piCompany?.accountNumber,
        branchAddress: piCompany?.branchAddress,
        ifscCode: piCompany?.ifscCode,
        swiftCode: pi?.swiftCode ?? "",
      };

      const payload = {
        orderId: Number(orderId),
        piId: pi.id,
        workOrderId: workOrder.id,
        invoiceDate,
        title,
        poNumber,
        currency,
        discount,
        totalAmountTitle,
        totalAmountValue,
        items,
        extraItems,
        taxItems,
        priceTerms,
        swiftCode,
        termsConditions,
        remarks,
        billToName,
        billToAddress,
        billToGSTNumber,
        billToMobile,
        billToEmail,
        shipToName,
        shipToAddress,
        shipToGSTNumber,
        shipToMobile,
        shipToEmail,
        companySnapshot,
        bankSnapshot,
      };

      const data = await authApiFetch(API_ROUTES.INVOICE, {
        method: "POST",
        data: JSON.stringify(payload),
      });

      Swal.fire("Success!", data.message, "success");
      goto(`/admin/invoice/tax/${data.data.id}`);
    } catch (error) {
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
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Create Tax Invoice</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/invoice/tax">Tax Invoices</a></li>
            <li class="breadcrumb-item active" aria-current="page">Create</li>
          </ol>
        </nav>
      </div>
      {#if orderId && !errorMessage}
        <a href="/admin/order/{orderId}" class="btn btn-outline-secondary btn-sm">
          <i class="ti ti-arrow-left me-1"></i>Back to Order
        </a>
      {/if}
    </div>

    {#if errorMessage}
      <div class="alert alert-danger d-flex align-items-start gap-2">
        <i class="ti ti-alert-circle fs-20 mt-1"></i>
        <div>{errorMessage}</div>
      </div>
    {/if}

    {#if !errorMessage && order}
      <div class="alert alert-info d-flex align-items-start gap-2 mb-4">
        <i class="ti ti-info-circle fs-20 mt-1"></i>
        <div class="small">
          <strong>Pre-filled from Proforma Invoice &amp; Work Order.</strong>
          Line item quantities use Work Order dispatch quantities; prices and tax come from the PI.
        </div>
      </div>

      <div class="card mb-3 border">
        <div class="card-body py-3">
          <div class="row g-3 text-center text-md-start">
            <div class="col-md-4">
              <div class="text-muted small text-uppercase fw-semibold mb-1">Order</div>
              <a href="/admin/order/{order.id}" class="fw-semibold text-primary">
                {order.financialYear}/{String(order.pId ?? "").padStart(6, "0")}
              </a>
              {#if order.title}
                <div class="small text-muted text-truncate">{order.title}</div>
              {/if}
            </div>
            <div class="col-md-4">
              <div class="text-muted small text-uppercase fw-semibold mb-1">Proforma Invoice</div>
              <a href="/admin/invoice/{pi.id}" class="fw-semibold text-primary">
                {formatDocRef(pi.financialYear, pi.invoiceNo)}
              </a>
            </div>
            <div class="col-md-4">
              <div class="text-muted small text-uppercase fw-semibold mb-1">Work Order</div>
              <a href="/admin/workorder/{workOrder.id}" class="fw-semibold text-primary">
                {formatDocRef(workOrder.financialYear, workOrder.workOrderNo)}
              </a>
            </div>
          </div>
        </div>
      </div>

      <form on:submit|preventDefault={handleSubmit}>
        <!-- Invoice Information -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0"><i class="ti ti-file-invoice me-2"></i>Invoice Information</h6>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label" for="invoiceDate">Invoice Date</label>
                <input
                  type="date"
                  id="invoiceDate"
                  class="form-control"
                  class:is-invalid={fieldError("invoiceDate")}
                  bind:value={invoiceDate}
                />
                {#if fieldError("invoiceDate")}
                  <div class="invalid-feedback d-block">{fieldError("invoiceDate")}</div>
                {/if}
              </div>
              <div class="col-md-4">
                <label class="form-label" for="title">Title</label>
                <input
                  type="text"
                  id="title"
                  class="form-control"
                  class:is-invalid={fieldError("title")}
                  bind:value={title}
                  placeholder="Invoice title"
                />
                {#if fieldError("title")}
                  <div class="invalid-feedback d-block">{fieldError("title")}</div>
                {/if}
              </div>
              <div class="col-md-4">
                <label class="form-label" for="poNumber">PO Number</label>
                <input
                  type="text"
                  id="poNumber"
                  class="form-control"
                  class:is-invalid={fieldError("poNumber")}
                  bind:value={poNumber}
                  placeholder="Purchase order number"
                />
                {#if fieldError("poNumber")}
                  <div class="invalid-feedback d-block">{fieldError("poNumber")}</div>
                {/if}
              </div>
              <div class="col-md-4">
                <label class="form-label" for="currency">Currency</label>
                <select
                  id="currency"
                  class="select form-control"
                  class:is-invalid={fieldError("currency")}
                  bind:value={currency}
                >
                  {#each currencies as c}
                    <option value={c.code}>{c.code}</option>
                  {/each}
                </select>
                {#if fieldError("currency")}
                  <div class="invalid-feedback d-block">{fieldError("currency")}</div>
                {/if}
              </div>
              <div class="col-md-4">
                <label class="form-label" for="priceTerms">Price Terms</label>
                <input
                  type="text"
                  id="priceTerms"
                  class="form-control"
                  class:is-invalid={fieldError("priceTerms")}
                  bind:value={priceTerms}
                  placeholder="e.g. FOB, CIF"
                />
                {#if fieldError("priceTerms")}
                  <div class="invalid-feedback d-block">{fieldError("priceTerms")}</div>
                {/if}
              </div>
              <div class="col-md-4">
                <label class="form-label" for="swiftCode">SWIFT Code</label>
                <input
                  type="text"
                  id="swiftCode"
                  class="form-control"
                  class:is-invalid={fieldError("swiftCode")}
                  bind:value={swiftCode}
                  placeholder="SWIFT / BIC code"
                />
                {#if fieldError("swiftCode")}
                  <div class="invalid-feedback d-block">{fieldError("swiftCode")}</div>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Bill To -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0"><i class="ti ti-receipt me-2"></i>Bill To</h6>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="billToName">Name</label>
                <input
                  type="text"
                  id="billToName"
                  class="form-control"
                  class:is-invalid={fieldError("billToName")}
                  bind:value={billToName}
                  placeholder="Name"
                />
                {#if fieldError("billToName")}
                  <div class="invalid-feedback d-block">{fieldError("billToName")}</div>
                {/if}
              </div>
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="billToEmail">Email</label>
                <input
                  type="email"
                  id="billToEmail"
                  class="form-control"
                  class:is-invalid={fieldError("billToEmail")}
                  bind:value={billToEmail}
                  placeholder="Email"
                />
                {#if fieldError("billToEmail")}
                  <div class="invalid-feedback d-block">{fieldError("billToEmail")}</div>
                {/if}
              </div>
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="billToMobile">Mobile</label>
                <input
                  type="text"
                  id="billToMobile"
                  class="form-control"
                  class:is-invalid={fieldError("billToMobile")}
                  bind:value={billToMobile}
                  placeholder="Mobile"
                />
                {#if fieldError("billToMobile")}
                  <div class="invalid-feedback d-block">{fieldError("billToMobile")}</div>
                {/if}
              </div>
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="billToGSTNumber">GST Number</label>
                <input
                  type="text"
                  id="billToGSTNumber"
                  class="form-control"
                  class:is-invalid={fieldError("billToGSTNumber")}
                  bind:value={billToGSTNumber}
                  placeholder="GSTIN"
                />
                {#if fieldError("billToGSTNumber")}
                  <div class="invalid-feedback d-block">{fieldError("billToGSTNumber")}</div>
                {/if}
              </div>
              <div class="col-12">
                <label class="form-label" for="billToAddress">Address</label>
                <textarea
                  id="billToAddress"
                  class="form-control"
                  class:is-invalid={fieldError("billToAddress")}
                  rows="2"
                  bind:value={billToAddress}
                  placeholder="Billing address"
                ></textarea>
                {#if fieldError("billToAddress")}
                  <div class="invalid-feedback d-block">{fieldError("billToAddress")}</div>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Ship To -->
        <div class="card mb-3">
          <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
            <h6 class="mb-0"><i class="ti ti-truck-delivery me-2"></i>Ship To</h6>
            <div class="form-check mb-0">
              <input
                type="checkbox"
                class="form-check-input"
                id="shipToSameAsBillTo"
                bind:checked={shipToSameAsBillTo}
                on:change={shipToChange}
              />
              <label class="form-check-label" for="shipToSameAsBillTo">
                Same as Bill To
              </label>
            </div>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="shipToName">Name</label>
                <input
                  type="text"
                  id="shipToName"
                  class="form-control"
                  class:is-invalid={fieldError("shipToName")}
                  bind:value={shipToName}
                  placeholder="Name"
                  disabled={shipToSameAsBillTo}
                />
                {#if fieldError("shipToName")}
                  <div class="invalid-feedback d-block">{fieldError("shipToName")}</div>
                {/if}
              </div>
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="shipToEmail">Email</label>
                <input
                  type="email"
                  id="shipToEmail"
                  class="form-control"
                  class:is-invalid={fieldError("shipToEmail")}
                  bind:value={shipToEmail}
                  placeholder="Email"
                  disabled={shipToSameAsBillTo}
                />
                {#if fieldError("shipToEmail")}
                  <div class="invalid-feedback d-block">{fieldError("shipToEmail")}</div>
                {/if}
              </div>
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="shipToMobile">Mobile</label>
                <input
                  type="text"
                  id="shipToMobile"
                  class="form-control"
                  class:is-invalid={fieldError("shipToMobile")}
                  bind:value={shipToMobile}
                  placeholder="Mobile"
                  disabled={shipToSameAsBillTo}
                />
                {#if fieldError("shipToMobile")}
                  <div class="invalid-feedback d-block">{fieldError("shipToMobile")}</div>
                {/if}
              </div>
              <div class="col-md-6 col-lg-3">
                <label class="form-label" for="shipToGSTNumber">GST Number</label>
                <input
                  type="text"
                  id="shipToGSTNumber"
                  class="form-control"
                  class:is-invalid={fieldError("shipToGSTNumber")}
                  bind:value={shipToGSTNumber}
                  placeholder="GSTIN"
                  disabled={shipToSameAsBillTo}
                />
                {#if fieldError("shipToGSTNumber")}
                  <div class="invalid-feedback d-block">{fieldError("shipToGSTNumber")}</div>
                {/if}
              </div>
              <div class="col-12">
                <label class="form-label" for="shipToAddress">Address</label>
                <textarea
                  id="shipToAddress"
                  class="form-control"
                  class:is-invalid={fieldError("shipToAddress")}
                  rows="2"
                  bind:value={shipToAddress}
                  placeholder="Shipping address"
                  disabled={shipToSameAsBillTo}
                ></textarea>
                {#if fieldError("shipToAddress")}
                  <div class="invalid-feedback d-block">{fieldError("shipToAddress")}</div>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Line Items -->
        <div class="card mb-3">
          <div class="card-header d-flex align-items-center justify-content-between">
            <h6 class="mb-0"><i class="ti ti-list-details me-2"></i>Line Items</h6>
            <span class="badge bg-light text-dark border">{items.length} item(s)</span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-bordered table-nowrap align-middle mb-2">
                <thead class="table-light">
                  <tr>
                    <th>Item</th>
                    <th style="width:80px">Qty</th>
                    <th style="width:100px">Unit</th>
                    <th style="width:120px">Unit Price</th>
                    <th style="width:110px">HS Code</th>
                    <th style="width:120px" class="text-end">Total</th>
                    <th style="width:50px"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as item, i}
                    <tr>
                      <td>
                        <input type="text" class="form-control form-control-sm" bind:value={item.item} />
                      </td>
                      <td>
                        <input
                          type="text"
                          class="form-control form-control-sm"
                          bind:value={item.quantity}
                          on:input={recalculate}
                        />
                      </td>
                      <td>
                        <select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>
                          {#each ["Pcs","Kg","g","L","mL","m","cm","Set","Box","Nos"] as u}
                            <option value={u}>{u}</option>
                          {/each}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          class="form-control form-control-sm"
                          bind:value={item.price}
                          on:input={recalculate}
                        />
                      </td>
                      <td>
                        <input type="text" class="form-control form-control-sm" bind:value={item.hsCode} />
                      </td>
                      <td class="text-end fw-medium">
                        {currencySymbol} {(item.total ?? 0).toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          class="btn btn-icon btn-sm text-danger"
                          on:click={() => removeItem(i)}
                          title="Remove item"
                          disabled={items.length <= 1}
                        >
                          <i class="ti ti-x"></i>
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr>
                      <td colspan="6" class="text-center text-muted py-3">No line items</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" on:click={addItem}>
              <i class="ti ti-plus me-1"></i>Add Item
            </button>
          </div>
        </div>

        <!-- Extra Items -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0"><i class="ti ti-square-rounded-plus me-2"></i>Extra Items</h6>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-bordered table-nowrap align-middle mb-2">
                <thead class="table-light">
                  <tr>
                    <th>Name</th>
                    <th style="width:160px">Amount</th>
                    <th style="width:50px"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each extraItems as ei, i}
                    <tr>
                      <td>
                        <input type="text" class="form-control form-control-sm" bind:value={ei.item} />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          class="form-control form-control-sm"
                          bind:value={ei.total}
                          on:input={recalculate}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          class="btn btn-icon btn-sm text-danger"
                          on:click={() => removeExtraItem(i)}
                          title="Remove"
                        >
                          <i class="ti ti-x"></i>
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr>
                      <td colspan="3" class="text-center text-muted py-3">No extra items</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" on:click={addExtraItem}>
              <i class="ti ti-plus me-1"></i>Add Extra Item
            </button>
          </div>
        </div>

        <!-- Tax -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0"><i class="ti ti-receipt-tax me-2"></i>Tax</h6>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-bordered table-nowrap align-middle mb-2">
                <thead class="table-light">
                  <tr>
                    <th>Name</th>
                    <th style="width:120px">Percentage (%)</th>
                    <th style="width:120px" class="text-end">Amount</th>
                    <th style="width:50px"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each taxItems as tax, i}
                    <tr>
                      <td>
                        <input type="text" class="form-control form-control-sm" bind:value={tax.item} />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          class="form-control form-control-sm"
                          bind:value={tax.percentage}
                          on:input={recalculate}
                        />
                      </td>
                      <td class="text-end fw-medium">
                        {currencySymbol} {(tax.total ?? 0).toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          class="btn btn-icon btn-sm text-danger"
                          on:click={() => removeTaxItem(i)}
                          title="Remove"
                        >
                          <i class="ti ti-x"></i>
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr>
                      <td colspan="4" class="text-center text-muted py-3">No tax rows</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" on:click={addTaxItem}>
              <i class="ti ti-plus me-1"></i>Add Tax
            </button>
          </div>
        </div>

        <!-- Amount & Summary -->
        <div class="row g-3 mb-3">
          <div class="col-lg-7">
            <div class="card h-100">
              <div class="card-header">
                <h6 class="mb-0"><i class="ti ti-notes me-2"></i>Terms &amp; Remarks</h6>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label" for="termsConditions">Terms &amp; Conditions</label>
                  <textarea
                    id="termsConditions"
                    class="form-control"
                    rows="3"
                    bind:value={termsConditions}
                    placeholder="Terms and conditions"
                  ></textarea>
                </div>
                <div class="mb-0">
                  <label class="form-label" for="remarks">Remarks</label>
                  <textarea
                    id="remarks"
                    class="form-control"
                    rows="2"
                    bind:value={remarks}
                    placeholder="Additional remarks"
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="card h-100">
              <div class="card-header">
                <h6 class="mb-0"><i class="ti ti-calculator me-2"></i>Amount Summary</h6>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label" for="discount">Discount</label>
                  <input
                    type="number"
                    step="any"
                    id="discount"
                    class="form-control"
                    class:is-invalid={fieldError("discount")}
                    bind:value={discount}
                    on:input={recalculate}
                    placeholder="0"
                  />
                  {#if fieldError("discount")}
                    <div class="invalid-feedback d-block">{fieldError("discount")}</div>
                  {/if}
                </div>
                <div class="mb-3">
                  <label class="form-label" for="totalAmountTitle">Total Label</label>
                  <input
                    type="text"
                    id="totalAmountTitle"
                    class="form-control"
                    bind:value={totalAmountTitle}
                    placeholder="Total Amount"
                  />
                </div>
                <div class="border rounded p-3 bg-light">
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Subtotal</span>
                    <span class="fw-medium">
                      {currencySymbol}
                      {(itemsSubtotal + extraSubtotal).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {#if (parseFloat(discount) || 0) !== 0}
                    <div class="d-flex justify-content-between mb-2">
                      <span class="text-muted">Discount</span>
                      <span>
                        − {currencySymbol}
                        {Number(discount).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  {/if}
                  {#each taxItems as t}
                    {#if t.item}
                      <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted">
                          {t.item}{t.percentage ? ` (${t.percentage}%)` : ""}
                        </span>
                        <span>
                          {currencySymbol}
                          {(t.total ?? 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    {/if}
                  {/each}
                  <div class="d-flex justify-content-between border-top pt-2 mt-2">
                    <span class="fw-semibold">{totalAmountTitle}</span>
                    <span class="fw-semibold fs-16 text-primary">
                      {currencySymbol}
                      {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-end gap-2 flex-wrap">
          <a href="/admin/order/{orderId}" class="btn btn-outline-secondary">Cancel</a>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {#if loading}
              <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              Creating…
            {:else}
              <i class="ti ti-check me-1"></i>Create Tax Invoice
            {/if}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
