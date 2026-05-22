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

  // Form fields (pre-filled from PI + WO)
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

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];

  $: currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? "₹";

  function recalculate() {
    items = items.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return { ...item, total: parseFloat((qty * price).toFixed(2)) };
    });
    const itemsSubtotal = items.reduce((s, i) => s + (i.total || 0), 0);
    const extraSubtotal = extraItems.reduce((s, i) => s + (i.total || 0), 0);
    const base = itemsSubtotal + extraSubtotal - discount;
    taxItems = taxItems.map((t) => ({
      ...t,
      total: parseFloat(((base * t.percentage) / 100).toFixed(2)),
    }));
    const taxTotal = taxItems.reduce((s, t) => s + (t.total || 0), 0);
    totalAmountValue = parseFloat((base + taxTotal).toFixed(2));
  }

  $: items, extraItems, taxItems, discount, recalculate();

  function formatDateForInput(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  }

  onMount(async () => {
    orderId = $page.url.searchParams.get("orderId");
    if (!orderId) {
      errorMessage = "No order specified.";
      loadingData = false;
      return;
    }
    try {
      order = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
      pi = order?.orderPayments?.[0] ?? null;
      workOrder = order?.workOrders?.[0] ?? null;

      if (!pi) {
        errorMessage = "No Proforma Invoice found for this order.";
        loadingData = false;
        return;
      }
      if (!workOrder) {
        errorMessage = "No Work Order found for this order.";
        loadingData = false;
        return;
      }

      // Check for warnings
      const warnings = [];
      const piItems = pi.items ?? [];
      const woItems = workOrder.items ?? [];

      if (piItems.length !== woItems.length) {
        warnings.push(`PI has ${piItems.length} items but Work Order has ${woItems.length} items.`);
      }
      woItems.forEach((wi) => {
        if (!wi.quantity || parseFloat(wi.quantity) === 0) {
          warnings.push(`Item "${wi.item}" has zero quantity in Work Order.`);
        }
        const piItem = piItems.find((p) => p.item === wi.item);
        if (piItem && parseFloat(wi.quantity) > parseFloat(piItem.quantity || 0)) {
          warnings.push(`Item "${wi.item}" dispatch qty (${wi.quantity}) exceeds quoted qty (${piItem.quantity}).`);
        }
      });

      if (warnings.length > 0) {
        const result = await Swal.fire({
          title: "Warning",
          html: warnings.map((w) => `<div>⚠️ ${w}</div>`).join(""),
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Proceed Anyway",
          cancelButtonText: "Cancel",
        });
        if (!result.isConfirmed) {
          goto(`/admin/order/${orderId}`);
          return;
        }
      }

      // Pre-fill from PI, replace qty from WO
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
      extraItems = pi.extraItems ?? [];
      taxItems = (pi.taxItems ?? []).map((t) => ({ ...t }));

      // Replace qty from WO items
      items = piItems.map((piItem, idx) => {
        const woItem = woItems[idx];
        return {
          item: piItem.item ?? "",
          quantity: woItem?.quantity ?? piItem.quantity ?? "0",
          price: piItem.price ?? 0,
          hsCode: piItem.hsCode ?? "",
          total: 0,
        };
      });

      // Invoice date from WO dispatch date
      invoiceDate = formatDateForInput(workOrder.workOrderDate);

      recalculate();
    } catch (err) {
      errorMessage = "Failed to load order data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }
  });

  async function handleSubmit() {
    loading = true;
    formErrors = {};
    errorMessage = "";
    try {
      const company = order?.company ?? pi?.company;
      const companySnapshot = {
        name: company?.name,
        address: company?.address,
        mobile: company?.mobile,
        email: company?.email,
        gstNumber: company?.gstNumber,
        logo: company?.logo,
      };
      const bankSnapshot = pi?.selectedBankAccount ?? {
        accountHolderName: company?.accountHolderName,
        bankName: company?.bankName,
        accountNumber: company?.accountNumber,
        branchAddress: company?.branchAddress,
        ifscCode: company?.ifscCode,
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
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content">
    <div class="pageHeader d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Create Tax Invoice</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/invoice">Invoices</a></li>
            <li class="breadcrumb-item active">Create Tax Invoice</li>
          </ol>
        </nav>
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {/if}

    {#if !errorMessage && order}
      <form on:submit|preventDefault={handleSubmit}>
        <div class="card">
          <div class="card-body">
            <div class="grid grid-cols-3 gap-3">

              <div>
                <label class="form-label" for="invoiceDate">Invoice Date</label>
                <input
                  type="date"
                  id="invoiceDate"
                  class="form-control"
                  bind:value={invoiceDate}
                />
              </div>

              <div>
                <label class="form-label" for="title">Title</label>
                <input type="text" id="title" class="form-control" bind:value={title} />
              </div>

              <div>
                <label class="form-label" for="poNumber">PO Number</label>
                <input type="text" id="poNumber" class="form-control" bind:value={poNumber} />
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
                <label class="form-label" for="discount">Discount</label>
                <input type="number" id="discount" class="form-control" bind:value={discount} />
              </div>

              <div>
                <label class="form-label" for="priceTerms">Price Terms</label>
                <input type="text" id="priceTerms" class="form-control" bind:value={priceTerms} />
              </div>

              <div class="col-span-3 border-top"></div>

              <!-- Bill To -->
              <div>
                <label class="form-label">Bill To Name</label>
                <input type="text" class="form-control" bind:value={billToName} />
              </div>
              <div>
                <label class="form-label">Bill To Mobile</label>
                <input type="text" class="form-control" bind:value={billToMobile} />
              </div>
              <div>
                <label class="form-label">Bill To GST</label>
                <input type="text" class="form-control" bind:value={billToGSTNumber} />
              </div>
              <div class="col-span-3">
                <label class="form-label">Bill To Address</label>
                <textarea class="form-control" rows="2" bind:value={billToAddress}></textarea>
              </div>

              <!-- Ship To -->
              <div>
                <label class="form-label">Ship To Name</label>
                <input type="text" class="form-control" bind:value={shipToName} />
              </div>
              <div>
                <label class="form-label">Ship To Mobile</label>
                <input type="text" class="form-control" bind:value={shipToMobile} />
              </div>
              <div>
                <label class="form-label">Ship To GST</label>
                <input type="text" class="form-control" bind:value={shipToGSTNumber} />
              </div>
              <div class="col-span-3">
                <label class="form-label">Ship To Address</label>
                <textarea class="form-control" rows="2" bind:value={shipToAddress}></textarea>
              </div>

              <div class="col-span-3 border-top"></div>

              <!-- Items -->
              <div class="col-span-3">
                <div class="font-semibold text-black mb-2">Items :</div>
                <div class="table-responsive mb-3">
                  <table class="w-full border table-nowrap">
                    <thead class="table-light border-bottom bg-gray-100">
                      <tr>
                        <th class="p-2">Item</th>
                        <th class="p-2">Qty</th>
                        <th class="p-2">Unit Price</th>
                        <th class="p-2">HS Code</th>
                        <th class="p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each items as item}
                        <tr>
                          <td class="p-2">
                            <input type="text" class="form-control" bind:value={item.item} />
                          </td>
                          <td class="p-2">
                            <input type="text" class="form-control" bind:value={item.quantity} on:input={recalculate} />
                          </td>
                          <td class="p-2">
                            <input type="number" class="form-control" bind:value={item.price} on:input={recalculate} />
                          </td>
                          <td class="p-2">
                            <input type="text" class="form-control" bind:value={item.hsCode} />
                          </td>
                          <td class="p-2 text-center">
                            {currencySymbol} {item.total?.toFixed(2) ?? "0.00"}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Tax Items -->
              <div class="col-span-3">
                <div class="font-semibold text-black mb-2">Tax :</div>
                <div class="table-responsive mb-3">
                  <table class="w-full border table-nowrap">
                    <thead class="table-light border-bottom bg-gray-100">
                      <tr>
                        <th class="p-2">Tax</th>
                        <th class="p-2">%</th>
                        <th class="p-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each taxItems as tax}
                        <tr>
                          <td class="p-2">{tax.item}</td>
                          <td class="p-2">
                            <input type="number" class="form-control" bind:value={tax.percentage} on:input={recalculate} />
                          </td>
                          <td class="p-2">{currencySymbol} {tax.total?.toFixed(2) ?? "0.00"}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="col-span-2">
                <label class="form-label">Terms & Conditions</label>
                <textarea class="form-control" rows="3" bind:value={termsConditions}></textarea>
              </div>
              <div>
                <label class="form-label">Remarks</label>
                <textarea class="form-control" rows="3" bind:value={remarks}></textarea>
              </div>

              <div class="col-span-3 text-end">
                <strong>Total Amount: {currencySymbol} {totalAmountValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}/-</strong>
              </div>

            </div>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-end mt-4 gap-2">
          <a href="/admin/order/{orderId}" class="btn btn-outline-secondary">Cancel</a>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Tax Invoice"}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
