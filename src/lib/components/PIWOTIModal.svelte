<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { companiesAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { checkAuth } from "$lib/utils/auth";
  import Swal from "sweetalert2";

  // ── Props ─────────────────────────────────────────────────────────────────
  export let open = false;
  export let type = "PI";   // "PI" | "WO" | "TI"
  export let order = null;

  const dispatch = createEventDispatcher();

  // ── Derived ───────────────────────────────────────────────────────────────
  $: pi  = order?.orderPayments?.[0] ?? null;
  $: wo  = order?.workOrders?.[0]   ?? null;
  $: ti  = order?.invoices?.[0]     ?? null;
  $: doc = type === "PI" ? pi : type === "WO" ? wo : ti;
  $: isView   = !!doc;
  $: isCreate = !doc;
  $: modalTitle = type === "PI" ? "Proforma Invoice" : type === "WO" ? "Work Order" : "Tax Invoice";
  $: detailUrl  = type === "PI"
    ? `/admin/invoice/${pi?.id}`
    : type === "WO"
    ? `/admin/workorder/${wo?.id}`
    : `/admin/invoice/tax/${ti?.id}`;

  // ── Shared ────────────────────────────────────────────────────────────────
  let step      = 1;
  let loading   = false;
  let formErrors = {};
  let companies  = [];
  let companyId  = null;
  let bankAccounts       = [];
  let selectedBankAccount = null;

  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos"];

  // ── PI / TI fields ────────────────────────────────────────────────────────
  let invoiceDate      = today();
  let piTitle          = "";
  let poNumber         = "";
  let poDate           = null;
  let currency         = "INR";
  let paymentMethod    = "Other";
  let piStatus         = "Unpaid";
  let priceTerms       = "";
  let swiftCode        = "";
  let termsConditions  = "";
  let remarks          = "";
  let discount         = 0;
  let totalAmountTitle = "Total Amount";
  let totalAmountValue = 0;

  // Bill To
  let billToName       = "";
  let billToAddress    = "";
  let billToGSTNumber  = "";
  let billToMobile     = "";
  let billToEmail      = "";
  // Ship To
  let shipToName       = "";
  let shipToAddress    = "";
  let shipToGSTNumber  = "";
  let shipToMobile     = "";
  let shipToEmail      = "";
  let shipToSameAsBillTo = false;

  let items      = [];
  let extraItems = [];
  let taxItems   = [];

  // ── WO fields ─────────────────────────────────────────────────────────────
  let workOrderDate        = today();
  let orderNo              = "";
  let woPoNumber           = "";
  let dispatchAddress      = "";
  let dispatchPincode      = "";
  let transporterName      = "";
  let packingType          = null;
  let packingCharges       = null;
  let inCoterms            = null;
  let inCotermsBy          = null;
  let woPaymentMethod      = null;
  let installationEngineer = "";
  let installationDate     = null;
  let woItems              = [];
  let woRemarks            = "";

  const inCotermsArray        = ["In India", "Outside India"];
  const inCotermsInArray      = ["Ex", "Door Delivery", "Godown"];
  const inCotermsOutsideArray = ["Ex", "FOB", "CIF"];
  const paymentMethodArray    = ["To Pay", "Paid"];

  // ── Steps config ──────────────────────────────────────────────────────────
  $: steps = type === "PI"
    ? ["Basic Info & Bill/Ship To", "Line Items", "Charges, Tax & Notes"]
    : type === "WO"
    ? ["Basic Info & Logistics", "Items & Remarks"]
    : ["Invoice Info & Bill/Ship To", "Items, Charges & Tax"];

  // ── Totals (plain let — updated explicitly via recompute()) ──────────────
  let itemsSubtotal = 0;
  let extraSubtotal = 0;
  let baseAmount    = 0;
  let taxTotal      = 0;

  $: currencySymbol = currency === "USD" ? "$" : "₹";

  /**
   * Explicit recompute — called after any change that affects totals.
   * Avoids Svelte reactive-ordering issues entirely.
   */
  function recompute() {
    itemsSubtotal    = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    extraSubtotal    = extraItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    baseAmount       = itemsSubtotal + extraSubtotal - (parseFloat(discount) || 0);
    taxTotal         = taxItems.reduce((s, t) =>
      s + parseFloat(((baseAmount * (parseFloat(t.percentage) || 0)) / 100).toFixed(2)), 0);
    totalAmountValue = Math.round(baseAmount + taxTotal);
  }

  // Helper: single tax item amount for template display
  function taxItemTotal(t) {
    return parseFloat(((baseAmount * (parseFloat(t.percentage) || 0)) / 100).toFixed(2));
  }

  // ── Init on open ──────────────────────────────────────────────────────────
  $: if (open && order) init();

  function today() { return new Date().toISOString().split("T")[0]; }

  function companyChange(id) {
    const c = companies.find(c => c.id == id);
    bankAccounts        = c?.bankAccounts || [];
    selectedBankAccount = bankAccounts[0] || null;
  }

  function bankLabel(b) {
    const parts = [];
    if (b.label)         parts.push(b.label);
    if (b.bankName)      parts.push(b.bankName);
    if (b.accountNumber) parts.push(`(••••${String(b.accountNumber).slice(-4)})`);
    return parts.join(" — ");
  }

  function init() {
    step       = 1;
    formErrors = {};
    loading    = false;
    shipToSameAsBillTo = false;

    const currentUser = checkAuth();
    companies = get(companiesAllStore) || [];
    if (!companyId && currentUser?.companyId) {
      const m = companies.find(c => c.id === Number(currentUser.companyId));
      if (m) { companyId = m.id; companyChange(m.id); }
    }

    if (type === "PI") {
      invoiceDate      = today();
      piTitle          = order?.title || "";
      poNumber         = ""; poDate = null;
      currency         = order?.currency || "INR";
      paymentMethod    = "Other";
      piStatus         = "Unpaid";
      priceTerms       = order?.priceTerms || "";
      swiftCode        = "";
      termsConditions  = "";
      remarks          = "";
      discount         = 0;

      const client = order?.orderContacts?.[0]?.clientContact || order?.orderClients?.[0];
      billToName      = client?.name    || order?.company || "";
      billToAddress   = client?.address || "";
      billToGSTNumber = order?.gstNumber || "";
      billToMobile    = client?.mobile  || "";
      billToEmail     = client?.email   || "";
      shipToName      = billToName;
      shipToAddress   = billToAddress;
      shipToGSTNumber = billToGSTNumber;
      shipToMobile    = billToMobile;
      shipToEmail     = billToEmail;

      items = order?.price
        ? [{ item: order.title || "Supply of Goods", quantity: 1, unit: "Pcs", unitPrice: parseFloat(order.price), hsCode: "", total: parseFloat(order.price) }]
        : [{ item: "", quantity: 1, unit: "Pcs", unitPrice: 0, hsCode: "", total: 0 }];
      extraItems = [];
      taxItems   = [
        { item: "CGST", percentage: 9,  total: 0 },
        { item: "SGST", percentage: 9,  total: 0 },
        { item: "IGST", percentage: 18, total: 0 },
      ];

    } else if (type === "WO") {
      workOrderDate        = today();
      orderNo              = ""; woPoNumber = "";
      dispatchAddress      = ""; dispatchPincode = "";
      transporterName      = "";
      packingType          = null; packingCharges = null;
      inCoterms            = null; inCotermsBy = null;
      woPaymentMethod      = null;
      installationEngineer = ""; installationDate = null;
      woRemarks            = "";
      woItems = pi?.items?.length
        ? pi.items.map(i => ({ item: i.item || "", quantity: i.quantity || 1, unit: i.unit || "Pcs" }))
        : [{ item: "", quantity: 1, unit: "Pcs" }];

    } else if (type === "TI") {
      invoiceDate     = today();
      piTitle         = pi?.title || order?.title || "";
      poNumber        = pi?.poNumber || "";
      currency        = pi?.currency || order?.currency || "INR";
      priceTerms      = pi?.priceTerms || "";
      swiftCode       = pi?.swiftCode || "";
      termsConditions = pi?.termsConditions || "";
      remarks         = pi?.remarks || "";
      discount        = pi?.discount || 0;

      billToName      = pi?.billToName      || "";
      billToAddress   = pi?.billToAddress   || "";
      billToGSTNumber = pi?.billToGSTNumber || "";
      billToMobile    = pi?.billToMobile    || "";
      billToEmail     = pi?.billToEmail     || "";
      shipToName      = pi?.shipToName      || "";
      shipToAddress   = pi?.shipToAddress   || "";
      shipToGSTNumber = pi?.shipToGSTNumber || "";
      shipToMobile    = pi?.shipToMobile    || "";
      shipToEmail     = pi?.shipToEmail     || "";

      const piItems = pi?.items ?? [];
      const woItemsList = wo?.items ?? [];
      items = piItems.map((piItem, idx) => {
        const woItem  = woItemsList[idx];
        const price   = parseFloat(piItem.price ?? piItem.unitPrice ?? 0);
        const qty     = parseFloat(woItem?.quantity ?? piItem.quantity ?? 1);
        return { item: piItem.item || "", quantity: qty, unit: piItem.unit || "Pcs", unitPrice: price, hsCode: piItem.hsCode || "", total: parseFloat((qty * price).toFixed(2)) };
      });
      extraItems = (pi?.extraItems ?? []).map(i => ({ ...i }));
      taxItems   = (pi?.taxItems   ?? []).map(t => ({ item: t.item, percentage: t.percentage }));
      if (!taxItems.length) {
        taxItems = [
          { item: "CGST", percentage: 9 },
          { item: "SGST", percentage: 9 },
          { item: "IGST", percentage: 18 },
        ];
      }
    }
    // Always recompute totals after init so display is immediately correct
    recompute();
  }

  // ── Item helpers ──────────────────────────────────────────────────────────
  function updateItemTotal(i) {
    items = items.map((it, idx) => {
      if (idx !== i) return it;
      const qty   = parseFloat(it.quantity)  || 0;
      const price = parseFloat(it.unitPrice) || 0;
      return { ...it, total: parseFloat((qty * price).toFixed(2)) };
    });
    recompute();
  }

  function addItem()      { items      = [...items,      { item: "", quantity: 1, unit: "Pcs", unitPrice: 0, hsCode: "", total: 0 }]; recompute(); }
  function removeItem(i)  { items      = items.filter((_, idx) => idx !== i); recompute(); }
  function addExtra()     { extraItems = [...extraItems, { item: "", total: 0 }]; recompute(); }
  function removeExtra(i) { extraItems = extraItems.filter((_, idx) => idx !== i); recompute(); }
  function addTax()       { taxItems   = [...taxItems,   { item: "", percentage: 0 }]; recompute(); }
  function removeTax(i)   { taxItems   = taxItems.filter((_, idx) => idx !== i); recompute(); }
  function addWoItem()    { woItems    = [...woItems,    { item: "", quantity: 1, unit: "Pcs" }]; }
  function removeWoItem(i){ woItems    = woItems.filter((_, idx) => idx !== i); }

  function shipToChange() {
    if (shipToSameAsBillTo) {
      shipToName = billToName; shipToAddress = billToAddress;
      shipToGSTNumber = billToGSTNumber; shipToMobile = billToMobile; shipToEmail = billToEmail;
    }
  }

  // ── Step navigation ───────────────────────────────────────────────────────
  function nextStep() {
    formErrors = {};
    // TI uses companySnapshot from PI — no companyId needed
    if (type !== "TI" && !companyId) { formErrors.company = "Company is required."; return; }

    if (type === "PI" && step === 2) {
      if (!items.length) { Swal.fire("Warning", "Add at least one item.", "warning"); return; }
      const emptyIdx = items.findIndex(i => !i.item.trim());
      if (emptyIdx !== -1) { Swal.fire("Warning", `Item #${emptyIdx + 1} has no description.`, "warning"); return; }
    }

    if (type === "WO" && step === 1) {
      if (!woItems.length) { Swal.fire("Warning", "Add at least one item.", "warning"); return; }
    }

    if (type === "TI" && step === 2) {
      if (!items.length) { Swal.fire("Warning", "Add at least one item.", "warning"); return; }
      const emptyIdx = items.findIndex(i => !i.item.trim());
      if (emptyIdx !== -1) { Swal.fire("Warning", `Item #${emptyIdx + 1} has no description.`, "warning"); return; }
    }

    step++;
  }
  function prevStep() { step--; }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    formErrors = {};
    // TI uses companySnapshot from PI — no companyId needed
    if (type !== "TI" && !companyId) { formErrors.company = "Company is required."; return; }

    if (type !== "WO") {
      if (!items.length) { Swal.fire("Warning", "Add at least one item.", "warning"); return; }
      const emptyIdx = items.findIndex(i => !i.item.trim());
      if (emptyIdx !== -1) { Swal.fire("Warning", `Item #${emptyIdx + 1} has no description.`, "warning"); return; }
      if (totalAmountValue === 0) { Swal.fire("Warning", "Total amount cannot be zero.", "warning"); return; }
    }

    if (type === "WO") {
      if (!woItems.length) { Swal.fire("Warning", "Add at least one item.", "warning"); return; }
      const emptyIdx = woItems.findIndex(i => !i.item.trim());
      if (emptyIdx !== -1) { Swal.fire("Warning", `Item #${emptyIdx + 1} has no description.`, "warning"); return; }
    }

    loading = true;
    try {
      if      (type === "PI") await submitPI();
      else if (type === "WO") await submitWO();
      else                    await submitTI();
    } catch (e) {
      Swal.fire("Error!", e?.message || "An unexpected error occurred.", "error");
    } finally { loading = false; }
  }

  async function submitPI() {
    const payload = {
      orderId: order.id, companyId, selectedBankAccount,
      title: piTitle, currency,
      paymentMethod, status: piStatus, priceTerms, swiftCode,
      termsConditions, remarks,
      discount: Math.round(discount || 0),
      totalAmountTitle,
      totalAmountValue: Math.round(totalAmountValue || 0),
      items,
      extraItems,
      taxItems: taxItems.map(t => ({ ...t, total: taxItemTotal(t) })),
      billToName, billToAddress, billToGSTNumber, billToMobile, billToEmail,
      shipToName, shipToAddress, shipToGSTNumber, shipToMobile, shipToEmail,
    };
    // Only include date & optional string fields if they have a value
    // (mirrors full-page form behavior — avoids sending null to @IsDateString DTO fields)
    if (invoiceDate) payload.invoiceDate = invoiceDate;
    if (poDate)      payload.poDate      = poDate;
    if (poNumber)    payload.poNumber    = poNumber;
    await authApiFetch(API_ROUTES.ORDER_PAYMENT, { method: "POST", data: JSON.stringify(payload) });
    await done("Proforma Invoice created successfully.");
  }

  async function submitWO() {
    const payload = {
      orderId: order.id, companyId,
      title: order.title || "",
      items: woItems, remarks: woRemarks,
      dispatchAddress, dispatchPincode, transporterName,
      packingType, packingCharges, inCoterms, inCotermsBy,
      paymentMethod: woPaymentMethod,
      installationEngineer,
      // Only include date/optional fields when they have a value
      ...(workOrderDate    && { workOrderDate }),
      ...(orderNo          && { orderNo }),
      ...(woPoNumber       && { poNumber: woPoNumber }),
      ...(installationDate && { installationDate }),
    };
    await authApiFetch(API_ROUTES.WORK_ORDER, { method: "POST", data: JSON.stringify(payload) });
    await done("Work Order created successfully.");
  }

  async function submitTI() {
    const piCompany   = pi?.company;
    const piSnap      = pi?.companySnapshot;
    const companySnapshot = piSnap?.name ? piSnap : {
      name: piCompany?.name, address: piCompany?.address,
      mobile: piCompany?.mobile, email: piCompany?.email,
      gstNumber: piCompany?.gstNumber, logo: piCompany?.logo,
    };
    const bankSnapshot = pi?.selectedBankAccount ?? {
      accountHolderName: piCompany?.accountHolderName,
      bankName: piCompany?.bankName,
      accountNumber: piCompany?.accountNumber,
      branchAddress: piCompany?.branchAddress,
      ifscCode: piCompany?.ifscCode,
    };
    const payload = {
      orderId: order.id, piId: pi?.id, workOrderId: wo?.id,
      companySnapshot, bankSnapshot,
      title: piTitle, currency,
      discount: Math.round(discount || 0),
      totalAmountTitle,
      totalAmountValue: Math.round(totalAmountValue || 0),
      items,
      extraItems,
      taxItems: taxItems.map(t => ({ ...t, total: taxItemTotal(t) })),
      priceTerms, swiftCode, termsConditions, remarks,
      billToName, billToAddress, billToGSTNumber, billToMobile, billToEmail,
      shipToName, shipToAddress, shipToGSTNumber, shipToMobile, shipToEmail,
      // Only send date fields when they have a value
      ...(invoiceDate && { invoiceDate }),
      ...(poNumber    && { poNumber }),
    };
    await authApiFetch(API_ROUTES.INVOICE, { method: "POST", data: JSON.stringify(payload) });
    await done("Tax Invoice created successfully.");
  }

  async function done(msg) {
    dispatch("close");
    dispatch("refresh");
    await Swal.fire({ icon: "success", title: "Success!", text: msg, timer: 1800, showConfirmButton: false });
  }

  function close() { dispatch("close"); }

  // ── View helpers ──────────────────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtRef(fy, no) {
    if (!fy || !no) return "—";
    return `${fy} / ${String(no).padStart(6, "0")}`;
  }
  function fmtCur(val, cur = "INR") {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur }).format(val || 0);
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div class="fixed inset-0 z-[1055] bg-black/50" on:click={close} role="presentation"></div>

  <!-- Modal -->
  <div class="fixed inset-0 z-[1060] flex items-center justify-center p-3" role="dialog" aria-modal="true">
    <div
      class="bg-white rounded-xl shadow-2xl flex flex-col"
      style="width:100%; max-width:820px; max-height:92vh;"
      on:click|stopPropagation role="presentation"
    >

      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <div class="flex items-center gap-2">
          <span class="badge text-xs font-bold px-2 py-1 rounded
            {type === 'PI' ? 'bg-blue-100 text-blue-700' : type === 'WO' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}">
            {type}
          </span>
          <h5 class="mb-0 fw-semibold text-sm">{modalTitle}</h5>
          {#if isView}
            <span class="badge bg-success text-white" style="font-size:10px;">Created</span>
          {:else}
            <span class="badge bg-secondary text-white" style="font-size:10px;">New</span>
          {/if}
        </div>
        <button class="btn-close" style="font-size:11px;" on:click={close}></button>
      </div>

      <!-- ── Step Indicator (create only) ──────────────────────────────── -->
      {#if isCreate}
        <div class="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
          <div class="d-flex align-items-center" style="gap:0;">
            {#each steps as s, i}
              <button type="button"
                class="d-flex align-items-center gap-2 border-0 bg-transparent py-0 flex-shrink-0"
                style="cursor:pointer; padding:0;"
                on:click={() => { if (i + 1 < step) step = i + 1; }}
              >
                <span class="d-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0"
                  style="width:26px;height:26px;font-size:12px;
                    background:{step === i+1 ? 'var(--bs-primary)' : step > i+1 ? '#198754' : '#dee2e6'};
                    color:{step >= i+1 ? '#fff' : '#6c757d'};">
                  {#if step > i+1}<i class="ti ti-check" style="font-size:12px;"></i>{:else}{i+1}{/if}
                </span>
                <span class="fw-semibold" style="font-size:12px; white-space:nowrap;
                  color:{step === i+1 ? 'var(--bs-primary)' : step > i+1 ? '#198754' : '#6c757d'};">
                  {s}
                </span>
              </button>
              {#if i < steps.length - 1}
                <div style="flex:1; height:2px; background:{step > i+1 ? '#198754' : '#dee2e6'}; margin:0 10px;"></div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      <!-- ── Body ──────────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto px-5 py-4">

        <!-- ═══════════════ VIEW MODE ═══════════════ -->
        {#if isView}
          {#if type === "PI" && pi}
            <div class="row g-3 mb-3">
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">PI Number</div><div class="fw-semibold font-mono">{fmtRef(pi.financialYear, pi.invoiceNo)}</div></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Date</div><div>{fmtDate(pi.invoiceDate)}</div></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Status</div><span class="badge {pi.status === 'Paid' ? 'bg-success' : pi.status === 'Partially Paid' ? 'bg-warning text-dark' : 'bg-secondary'}">{pi.status}</span></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Total</div><div class="fw-bold text-success">{fmtCur(pi.totalAmountValue, pi.currency)}</div></div>
              {#if pi.poNumber}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">PO Number</div><div class="font-mono">{pi.poNumber}</div></div>{/if}
              {#if pi.currency}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Currency</div><div>{pi.currency}</div></div>{/if}
              {#if pi.paymentMethod}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Payment</div><div>{pi.paymentMethod}</div></div>{/if}
            </div>
            {#if (pi.items || []).length}
              <div class="table-responsive mb-3">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light"><tr><th>Item</th><th class="text-center">Qty</th><th class="text-center">Unit</th><th class="text-end">Price</th><th class="text-end">Total</th></tr></thead>
                  <tbody>
                    {#each pi.items as it}
                      <tr><td>{it.item}</td><td class="text-center">{it.quantity}</td><td class="text-center">{it.unit || "Pcs"}</td><td class="text-end">{fmtCur(it.price ?? it.unitPrice, pi.currency)}</td><td class="text-end fw-semibold">{fmtCur(it.total, pi.currency)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
            {#if pi.billToName || pi.billToAddress}
              <div class="row g-3 mt-1" style="overflow:hidden;">
                <div class="col-12 col-md-6" style="min-width:0; overflow:hidden;">
                  <div class="fw-semibold small mb-1 text-primary"><i class="ti ti-file-invoice me-1"></i>Bill To</div>
                  <div style="font-size:12px; line-height:1.6; overflow-wrap:break-word; word-break:break-word;">
                    {#if pi.billToName}<div class="fw-medium">{pi.billToName}</div>{/if}
                    {#if pi.billToGSTNumber}<div class="text-muted">GST: {pi.billToGSTNumber}</div>{/if}
                    {#if pi.billToMobile}<div class="text-muted">{pi.billToMobile}</div>{/if}
                    {#if pi.billToEmail}<div class="text-muted">{pi.billToEmail}</div>{/if}
                    {#if pi.billToAddress}<div class="text-muted">{pi.billToAddress}</div>{/if}
                  </div>
                </div>
                <div class="col-12 col-md-6" style="min-width:0; overflow:hidden;">
                  <div class="fw-semibold small mb-1 text-success"><i class="ti ti-truck me-1"></i>Ship To</div>
                  <div style="font-size:12px; line-height:1.6; overflow-wrap:break-word; word-break:break-word;">
                    {#if pi.shipToName}<div class="fw-medium">{pi.shipToName}</div>{/if}
                    {#if pi.shipToGSTNumber}<div class="text-muted">GST: {pi.shipToGSTNumber}</div>{/if}
                    {#if pi.shipToMobile}<div class="text-muted">{pi.shipToMobile}</div>{/if}
                    {#if pi.shipToEmail}<div class="text-muted">{pi.shipToEmail}</div>{/if}
                    {#if pi.shipToAddress}<div class="text-muted">{pi.shipToAddress}</div>{/if}
                  </div>
                </div>
              </div>
            {/if}

          {:else if type === "WO" && wo}
            <div class="row g-3 mb-3">
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">WO Number</div><div class="fw-semibold font-mono">{fmtRef(wo.financialYear, wo.workOrderNo)}</div></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Date</div><div>{fmtDate(wo.workOrderDate)}</div></div>
              {#if wo.orderNo}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Order No.</div><div class="font-mono">{wo.orderNo}</div></div>{/if}
              {#if wo.poNumber}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">PO Number</div><div class="font-mono">{wo.poNumber}</div></div>{/if}
              {#if wo.dispatchAddress}<div class="col-12 col-md-6"><div class="text-muted" style="font-size:11px;">Dispatch Address</div><div>{wo.dispatchAddress} {wo.dispatchPincode || ""}</div></div>{/if}
              {#if wo.transporterName}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Transporter</div><div>{wo.transporterName}</div></div>{/if}
              {#if wo.packingType}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Packing</div><div>{wo.packingType}</div></div>{/if}
              {#if wo.installationEngineer}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Engineer</div><div>{wo.installationEngineer}</div></div>{/if}
              {#if wo.installationDate}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Installation Date</div><div>{fmtDate(wo.installationDate)}</div></div>{/if}
            </div>
            {#if (wo.items || []).length}
              <div class="table-responsive mb-3">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light"><tr><th>Item</th><th class="text-center">Qty</th><th class="text-center">Unit</th></tr></thead>
                  <tbody>
                    {#each wo.items as it}<tr><td>{it.item}</td><td class="text-center">{it.quantity}</td><td class="text-center">{it.unit || "Pcs"}</td></tr>{/each}
                  </tbody>
                </table>
              </div>
            {/if}
            {#if wo.remarks}<div class="mb-2"><div class="text-muted" style="font-size:11px;">Remarks</div><div class="text-sm">{wo.remarks}</div></div>{/if}

          {:else if type === "TI" && ti}
            <div class="row g-3 mb-3">
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">TI Number</div><div class="fw-semibold font-mono">{fmtRef(ti.financialYear, ti.invoiceNo)}</div></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Date</div><div>{fmtDate(ti.invoiceDate)}</div></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Status</div><span class="badge {ti.isLocked ? 'bg-danger' : 'bg-warning text-dark'}">{ti.isLocked ? "Locked" : "Draft"}</span></div>
              <div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Total</div><div class="fw-bold text-success">{fmtCur(ti.totalAmountValue, ti.currency)}</div></div>
              {#if ti.poNumber}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">PO Number</div><div class="font-mono">{ti.poNumber}</div></div>{/if}
              {#if ti.currency}<div class="col-6 col-md-3"><div class="text-muted" style="font-size:11px;">Currency</div><div>{ti.currency}</div></div>{/if}
            </div>
            {#if (ti.items || []).length}
              <div class="table-responsive mb-3">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light"><tr><th>Item</th><th class="text-center">Qty</th><th class="text-center">Unit</th><th class="text-end">Total</th></tr></thead>
                  <tbody>
                    {#each ti.items as it}<tr><td>{it.item}</td><td class="text-center">{it.quantity}</td><td class="text-center">{it.unit || "Pcs"}</td><td class="text-end fw-semibold">{fmtCur(it.total, ti.currency)}</td></tr>{/each}
                  </tbody>
                </table>
              </div>
            {/if}
            {#if ti.billToName || ti.billToAddress}
              <div class="row g-3 mt-1" style="overflow:hidden;">
                <div class="col-12 col-md-6">
                  <div class="fw-semibold small mb-1 text-primary"><i class="ti ti-file-invoice me-1"></i>Bill To</div>
                  <div style="font-size:12px; line-height:1.5; word-break:break-word;">
                    {#if ti.billToName}<div class="fw-medium">{ti.billToName}</div>{/if}
                    {#if ti.billToGSTNumber}<div class="text-muted">GST: {ti.billToGSTNumber}</div>{/if}
                    {#if ti.billToMobile}<div class="text-muted">{ti.billToMobile}</div>{/if}
                    {#if ti.billToEmail}<div class="text-muted">{ti.billToEmail}</div>{/if}
                    {#if ti.billToAddress}<div class="text-muted">{ti.billToAddress}</div>{/if}
                  </div>
                </div>
                <div class="col-12 col-md-6">
                  <div class="fw-semibold small mb-1 text-success"><i class="ti ti-truck me-1"></i>Ship To</div>
                  <div style="font-size:12px; line-height:1.5; word-break:break-word;">
                    {#if ti.shipToName}<div class="fw-medium">{ti.shipToName}</div>{/if}
                    {#if ti.shipToGSTNumber}<div class="text-muted">GST: {ti.shipToGSTNumber}</div>{/if}
                    {#if ti.shipToMobile}<div class="text-muted">{ti.shipToMobile}</div>{/if}
                    {#if ti.shipToEmail}<div class="text-muted">{ti.shipToEmail}</div>{/if}
                    {#if ti.shipToAddress}<div class="text-muted">{ti.shipToAddress}</div>{/if}
                  </div>
                </div>
              </div>
            {/if}
          {/if}

        <!-- ═══════════════ CREATE MODE ═══════════════ -->
        {:else}

          <!-- ════ PI STEPS ════ -->
          {#if type === "PI"}

            <!-- Step 1: Basic Info & Bill/Ship To -->
            {#if step === 1}
              <div class="row g-3">
                <!-- Company -->
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Company <span class="text-danger">*</span></label>
                  <select class="form-select form-select-sm" class:is-invalid={formErrors.company}
                    bind:value={companyId} on:change={(e) => companyChange(e.target.value)}>
                    <option value={null}>— Select Company —</option>
                    {#each companies as c}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                  {#if formErrors.company}<div class="invalid-feedback">{formErrors.company}</div>{/if}
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Bank Account</label>
                  <select class="form-select form-select-sm" bind:value={selectedBankAccount}>
                    <option value={null}>— Select Bank —</option>
                    {#each bankAccounts as b}<option value={b}>{bankLabel(b)}</option>{/each}
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Invoice Date</label>
                  <input type="date" class="form-control form-control-sm" bind:value={invoiceDate} />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">PO Number</label>
                  <input type="text" class="form-control form-control-sm" bind:value={poNumber} placeholder="e.g. PO-2024-001" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">PO Date</label>
                  <input type="date" class="form-control form-control-sm" bind:value={poDate} />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Currency</label>
                  <select class="form-select form-select-sm" bind:value={currency}>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Payment Method</label>
                  <select class="form-select form-select-sm" bind:value={paymentMethod}>
                    <option value="Other">Other</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Wire Transfer">Wire Transfer</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Status</label>
                  <select class="form-select form-select-sm" bind:value={piStatus}>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                    <option value="Partially Paid">Partially Paid</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Price Terms</label>
                  <input type="text" class="form-control form-control-sm" bind:value={priceTerms} placeholder="e.g. 30 days net" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Swift Code</label>
                  <input type="text" class="form-control form-control-sm" bind:value={swiftCode} placeholder="e.g. HDFCINBB" />
                </div>
              </div>

              <!-- Bill To / Ship To -->
              <div class="row g-0 border rounded mt-3 overflow-hidden">
                <div class="col-md-6 p-3 border-end">
                  <div class="fw-semibold small text-primary mb-2"><i class="ti ti-file-invoice me-1"></i>Bill To</div>
                  <div class="d-flex flex-column gap-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Name" bind:value={billToName} />
                    <input type="text" class="form-control form-control-sm" placeholder="GST Number" bind:value={billToGSTNumber} />
                    <input type="email" class="form-control form-control-sm" placeholder="Email" bind:value={billToEmail} />
                    <input type="text" class="form-control form-control-sm" placeholder="Mobile" bind:value={billToMobile} />
                    <textarea class="form-control form-control-sm" rows="2" placeholder="Address" bind:value={billToAddress}></textarea>
                  </div>
                </div>
                <div class="col-md-6 p-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="fw-semibold small text-success"><i class="ti ti-truck me-1"></i>Ship To</div>
                    <label class="d-flex align-items-center gap-1 small mb-0" style="cursor:pointer;">
                      <input type="checkbox" bind:checked={shipToSameAsBillTo} on:change={shipToChange} />
                      <span class="text-muted">Same as Bill To</span>
                    </label>
                  </div>
                  <div class="d-flex flex-column gap-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Name" bind:value={shipToName} disabled={shipToSameAsBillTo} />
                    <input type="text" class="form-control form-control-sm" placeholder="GST Number" bind:value={shipToGSTNumber} disabled={shipToSameAsBillTo} />
                    <input type="email" class="form-control form-control-sm" placeholder="Email" bind:value={shipToEmail} disabled={shipToSameAsBillTo} />
                    <input type="text" class="form-control form-control-sm" placeholder="Mobile" bind:value={shipToMobile} disabled={shipToSameAsBillTo} />
                    <textarea class="form-control form-control-sm" rows="2" placeholder="Address" bind:value={shipToAddress} disabled={shipToSameAsBillTo}></textarea>
                  </div>
                </div>
              </div>

            <!-- Step 2: Line Items -->
            {:else if step === 2}
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fw-semibold" style="font-size:13px;">Line Items <span class="badge bg-primary ms-1">{items.length}</span></span>
                <button type="button" class="btn btn-sm btn-outline-primary" on:click={addItem}><i class="ti ti-plus me-1"></i>Add Item</button>
              </div>
              <div class="table-responsive">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th class="text-center" style="width:36px;">#</th>
                      <th>Item Description</th>
                      <th class="text-center" style="width:70px;">Qty</th>
                      <th class="text-center" style="width:90px;">Unit</th>
                      <th class="text-center" style="width:100px;">Unit Price</th>
                      <th style="width:100px;">HS Code</th>
                      <th class="text-end" style="width:90px;">Total</th>
                      <th style="width:36px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each items as item, i}
                      <tr>
                        <td class="text-center text-muted small align-middle">{i+1}</td>
                        <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.item} placeholder="Item description" /></td>
                        <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" min="0" bind:value={item.quantity} on:input={() => updateItemTotal(i)} /></td>
                        <td class="p-1"><select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>{#each unitOptions as u}<option>{u}</option>{/each}</select></td>
                        <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" min="0" step="0.01" bind:value={item.unitPrice} on:input={() => updateItemTotal(i)} /></td>
                        <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.hsCode} placeholder="HS Code" /></td>
                        <td class="text-end fw-semibold align-middle px-2">{(item.total || 0).toFixed(2)}</td>
                        <td class="text-center align-middle p-1">
                          <button type="button" class="btn btn-sm btn-icon btn-soft-danger rounded-pill" on:click={() => removeItem(i)}><i class="ti ti-trash"></i></button>
                        </td>
                      </tr>
                    {:else}
                      <tr><td colspan="8" class="text-center text-muted py-3">No items — click Add Item</td></tr>
                    {/each}
                    <tr class="table-light">
                      <td colspan="6" class="text-end fw-semibold px-3 py-2">Subtotal</td>
                      <td class="text-end fw-bold px-2">{itemsSubtotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

            <!-- Step 3: Charges, Tax & Notes -->
            {:else if step === 3}
              <div class="row g-3">
                <!-- Extra Charges -->
                <div class="col-md-6">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-semibold small text-uppercase text-muted">Extra Charges</span>
                    <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addExtra}><i class="ti ti-plus me-1"></i>Add</button>
                  </div>
                  {#if !extraItems.length}
                    <div class="text-muted small fst-italic py-1">No extra charges</div>
                  {:else}
                    <table class="table table-sm table-bordered mb-0">
                      <thead class="table-light"><tr><th>Charge</th><th class="text-end" style="width:90px;">Amount</th><th style="width:36px;"></th></tr></thead>
                      <tbody>
                        {#each extraItems as ei, i}
                          <tr>
                            <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={ei.item} placeholder="e.g. Freight" /></td>
                            <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" min="0" step="0.01" bind:value={ei.total} on:input={recompute} /></td>
                            <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeExtra(i)}><i class="ti ti-x"></i></button></td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </div>
                <!-- Tax Items -->
                <div class="col-md-6">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-semibold small text-uppercase text-muted">Tax Items</span>
                    <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addTax}><i class="ti ti-plus me-1"></i>Add</button>
                  </div>
                  <table class="table table-sm table-bordered mb-0">
                    <thead class="table-light"><tr><th>Tax</th><th class="text-center" style="width:80px;">Rate %</th><th class="text-end" style="width:90px;">Amount</th><th style="width:36px;"></th></tr></thead>
                    <tbody>
                      {#each taxItems as t, i}
                        <tr>
                          <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={t.item} placeholder="CGST / IGST" /></td>
                          <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" min="0" max="100" step="0.5" bind:value={t.percentage} on:input={recompute} /></td>
                          <td class="p-1 text-end fw-semibold align-middle small">{taxItemTotal(t).toFixed(2)}</td>
                          <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeTax(i)}><i class="ti ti-x"></i></button></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <!-- Discount + Total Label + Total Override + Grand Total -->
                <div class="col-12">
                  <div class="row g-2">
                    <div class="col-md-3">
                      <label class="form-label fw-semibold" style="font-size:12px;">Discount ({currencySymbol})</label>
                      <input type="number" min="0" step="0.01" class="form-control form-control-sm" bind:value={discount} on:input={recompute} />
                    </div>
                    <div class="col-md-3">
                      <label class="form-label fw-semibold" style="font-size:12px;">Total Label</label>
                      <input type="text" class="form-control form-control-sm" bind:value={totalAmountTitle} placeholder="Total Amount" />
                    </div>
                    <div class="col-md-3">
                      <label class="form-label fw-semibold" style="font-size:12px;">Total Override <span class="text-muted fw-normal">(0 = auto)</span></label>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text">{currencySymbol}</span>
                        <input type="number" min="0" step="0.01" class="form-control" bind:value={totalAmountValue} />
                      </div>
                    </div>
                    <div class="col-md-3 d-flex align-items-end justify-content-end pb-1">
                      <div class="text-end">
                        <div class="text-muted" style="font-size:11px;">{totalAmountTitle || "Grand Total"}</div>
                        <div class="fw-bold text-success fs-5">{currencySymbol} {(totalAmountValue || 0).toLocaleString("en-IN")}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Notes & Terms -->
                <div class="col-md-6">
                  <label class="form-label fw-semibold" style="font-size:12px;">Remarks</label>
                  <textarea class="form-control form-control-sm" rows="3" bind:value={remarks} placeholder="Additional remarks..."></textarea>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold" style="font-size:12px;">Terms & Conditions</label>
                  <textarea class="form-control form-control-sm" rows="3" bind:value={termsConditions} placeholder="Terms and conditions..."></textarea>
                </div>
              </div>
            {/if}

          <!-- ════ WO STEPS ════ -->
          {:else if type === "WO"}

            <!-- Step 1: Basic Info & Logistics -->
            {#if step === 1}
              <div class="fw-semibold small text-uppercase text-muted mb-2">Basic Information</div>
              <div class="row g-3 mb-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Company <span class="text-danger">*</span></label>
                  <select class="form-select form-select-sm" class:is-invalid={formErrors.company} bind:value={companyId}>
                    <option value={null}>— Select Company —</option>
                    {#each companies as c}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                  {#if formErrors.company}<div class="invalid-feedback">{formErrors.company}</div>{/if}
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Work Order Date</label>
                  <input type="date" class="form-control form-control-sm" bind:value={workOrderDate} />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Order No.</label>
                  <input type="text" class="form-control form-control-sm" bind:value={orderNo} placeholder="Work order number" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">PO Number</label>
                  <input type="text" class="form-control form-control-sm" bind:value={woPoNumber} placeholder="PO Number" />
                </div>
              </div>

              <div class="fw-semibold small text-uppercase text-muted mb-2">Dispatch & Logistics</div>
              <div class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label fw-semibold" style="font-size:12px;">Dispatch Address</label>
                  <input type="text" class="form-control form-control-sm" bind:value={dispatchAddress} placeholder="Dispatch address" />
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-semibold" style="font-size:12px;">Dispatch Pincode</label>
                  <input type="text" class="form-control form-control-sm" bind:value={dispatchPincode} placeholder="Pincode" />
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-semibold" style="font-size:12px;">Transporter</label>
                  <input type="text" class="form-control form-control-sm" bind:value={transporterName} placeholder="Transporter name" />
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-semibold" style="font-size:12px;">Packing Type</label>
                  <select class="form-select form-select-sm" bind:value={packingType}>
                    <option value={null}>— Select —</option>
                    <option value="Bubble Wrap">Bubble Wrap</option>
                    <option value="Wooden Packing">Wooden Packing</option>
                  </select>
                </div>
                {#if packingType === "Wooden Packing"}
                  <div class="col-md-3">
                    <label class="form-label fw-semibold" style="font-size:12px;">Packing Charges</label>
                    <select class="form-select form-select-sm" bind:value={packingCharges}>
                      <option value={null}>— Select —</option>
                      <option value="Paid">Paid</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  </div>
                {/if}
                <div class="col-md-3">
                  <label class="form-label fw-semibold" style="font-size:12px;">In COTERMS</label>
                  <select class="form-select form-select-sm" bind:value={inCoterms}>
                    <option value={null}>— Select —</option>
                    {#each inCotermsArray as c}<option>{c}</option>{/each}
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-semibold" style="font-size:12px;">In COTERMS By</label>
                  <select class="form-select form-select-sm" bind:value={inCotermsBy}>
                    <option value={null}>— Select —</option>
                    {#if inCoterms === "Outside India"}
                      {#each inCotermsOutsideArray as c}<option>{c}</option>{/each}
                    {:else}
                      {#each inCotermsInArray as c}<option>{c}</option>{/each}
                    {/if}
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-semibold" style="font-size:12px;">Payment Method</label>
                  <select class="form-select form-select-sm" bind:value={woPaymentMethod}>
                    <option value={null}>— Select —</option>
                    {#each paymentMethodArray as m}<option>{m}</option>{/each}
                  </select>
                </div>
              </div>

              <div class="fw-semibold small text-uppercase text-muted mb-2">Installation</div>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Installation Engineer</label>
                  <input type="text" class="form-control form-control-sm" bind:value={installationEngineer} placeholder="Engineer name" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Installation Date</label>
                  <input type="date" class="form-control form-control-sm" bind:value={installationDate} />
                </div>
              </div>

            <!-- Step 2: Items & Remarks -->
            {:else if step === 2}
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fw-semibold" style="font-size:13px;">Items <span class="badge bg-primary ms-1">{woItems.length}</span></span>
                <button type="button" class="btn btn-sm btn-outline-primary" on:click={addWoItem}><i class="ti ti-plus me-1"></i>Add Item</button>
              </div>
              <div class="table-responsive mb-3">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th class="text-center" style="width:36px;">#</th>
                      <th>Item Description</th>
                      <th class="text-center" style="width:80px;">Qty</th>
                      <th class="text-center" style="width:100px;">Unit</th>
                      <th style="width:36px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each woItems as item, i}
                      <tr>
                        <td class="text-center text-muted small align-middle">{i+1}</td>
                        <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.item} placeholder="Item description" /></td>
                        <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" min="0" bind:value={item.quantity} /></td>
                        <td class="p-1"><select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>{#each unitOptions as u}<option>{u}</option>{/each}</select></td>
                        <td class="text-center align-middle p-1">
                          <button type="button" class="btn btn-sm btn-icon btn-soft-danger rounded-pill" on:click={() => removeWoItem(i)}><i class="ti ti-trash"></i></button>
                        </td>
                      </tr>
                    {:else}
                      <tr><td colspan="5" class="text-center text-muted py-3">No items — click Add Item</td></tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              <div>
                <label class="form-label fw-semibold" style="font-size:12px;">Remarks</label>
                <textarea class="form-control form-control-sm" rows="3" bind:value={woRemarks} placeholder="Additional remarks..."></textarea>
              </div>
            {/if}

          <!-- ════ TI STEPS ════ -->
          {:else if type === "TI"}

            <!-- Step 1: Invoice Info & Bill/Ship To -->
            {#if step === 1}
              <!-- PI + WO reference banner -->
              {#if pi && wo}
                <div class="alert alert-info py-2 px-3 mb-3 d-flex align-items-center gap-3 flex-wrap" style="font-size:12px;">
                  <i class="ti ti-info-circle"></i>
                  <span>Pre-filled from <strong>PI {pi.financialYear}/{String(pi.invoiceNo).padStart(6,"0")}</strong> &amp; <strong>WO {wo.financialYear}/{String(wo.workOrderNo).padStart(6,"0")}</strong>. Quantities from Work Order, prices from PI.</span>
                </div>
              {/if}
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Invoice Date</label>
                  <input type="date" class="form-control form-control-sm" bind:value={invoiceDate} />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Title</label>
                  <input type="text" class="form-control form-control-sm" bind:value={piTitle} placeholder="Invoice title" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">PO Number</label>
                  <input type="text" class="form-control form-control-sm" bind:value={poNumber} placeholder="Purchase order number" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Currency</label>
                  <select class="form-select form-select-sm" bind:value={currency}>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Price Terms</label>
                  <input type="text" class="form-control form-control-sm" bind:value={priceTerms} placeholder="e.g. 30 days net" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold" style="font-size:12px;">Swift Code</label>
                  <input type="text" class="form-control form-control-sm" bind:value={swiftCode} placeholder="e.g. HDFCINBB" />
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold" style="font-size:12px;">Remarks</label>
                  <textarea class="form-control form-control-sm" rows="2" bind:value={remarks} placeholder="Additional remarks..."></textarea>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold" style="font-size:12px;">Terms & Conditions</label>
                  <textarea class="form-control form-control-sm" rows="2" bind:value={termsConditions} placeholder="Terms and conditions..."></textarea>
                </div>
              </div>

              <!-- Bill To / Ship To -->
              <div class="row g-0 border rounded mt-3 overflow-hidden">
                <div class="col-md-6 p-3 border-end">
                  <div class="fw-semibold small text-primary mb-2"><i class="ti ti-file-invoice me-1"></i>Bill To</div>
                  <div class="d-flex flex-column gap-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Name" bind:value={billToName} />
                    <input type="text" class="form-control form-control-sm" placeholder="GST Number" bind:value={billToGSTNumber} />
                    <input type="email" class="form-control form-control-sm" placeholder="Email" bind:value={billToEmail} />
                    <input type="text" class="form-control form-control-sm" placeholder="Mobile" bind:value={billToMobile} />
                    <textarea class="form-control form-control-sm" rows="2" placeholder="Address" bind:value={billToAddress}></textarea>
                  </div>
                </div>
                <div class="col-md-6 p-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="fw-semibold small text-success"><i class="ti ti-truck me-1"></i>Ship To</div>
                    <label class="d-flex align-items-center gap-1 small mb-0" style="cursor:pointer;">
                      <input type="checkbox" bind:checked={shipToSameAsBillTo} on:change={shipToChange} />
                      <span class="text-muted">Same as Bill To</span>
                    </label>
                  </div>
                  <div class="d-flex flex-column gap-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Name" bind:value={shipToName} disabled={shipToSameAsBillTo} />
                    <input type="text" class="form-control form-control-sm" placeholder="GST Number" bind:value={shipToGSTNumber} disabled={shipToSameAsBillTo} />
                    <input type="email" class="form-control form-control-sm" placeholder="Email" bind:value={shipToEmail} disabled={shipToSameAsBillTo} />
                    <input type="text" class="form-control form-control-sm" placeholder="Mobile" bind:value={shipToMobile} disabled={shipToSameAsBillTo} />
                    <textarea class="form-control form-control-sm" rows="2" placeholder="Address" bind:value={shipToAddress} disabled={shipToSameAsBillTo}></textarea>
                  </div>
                </div>
              </div>

            <!-- Step 2: Items, Charges & Tax -->
            {:else if step === 2}
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fw-semibold" style="font-size:13px;">Line Items <span class="badge bg-primary ms-1">{items.length}</span></span>
                <button type="button" class="btn btn-sm btn-outline-primary" on:click={addItem}><i class="ti ti-plus me-1"></i>Add Item</button>
              </div>
              <div class="table-responsive mb-3">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th class="text-center" style="width:36px;">#</th>
                      <th>Item Description</th>
                      <th class="text-center" style="width:70px;">Qty</th>
                      <th class="text-center" style="width:90px;">Unit</th>
                      <th class="text-center" style="width:100px;">Unit Price</th>
                      <th style="width:100px;">HS Code</th>
                      <th class="text-end" style="width:90px;">Total</th>
                      <th style="width:36px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each items as item, i}
                      <tr>
                        <td class="text-center text-muted small align-middle">{i+1}</td>
                        <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.item} placeholder="Item description" /></td>
                        <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" min="0" bind:value={item.quantity} on:input={() => updateItemTotal(i)} /></td>
                        <td class="p-1"><select class="form-select form-select-sm border-0 shadow-none" bind:value={item.unit}>{#each unitOptions as u}<option>{u}</option>{/each}</select></td>
                        <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" min="0" step="0.01" bind:value={item.unitPrice} on:input={() => updateItemTotal(i)} /></td>
                        <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={item.hsCode} placeholder="HS Code" /></td>
                        <td class="text-end fw-semibold align-middle px-2">{(item.total || 0).toFixed(2)}</td>
                        <td class="text-center align-middle p-1"><button type="button" class="btn btn-sm btn-icon btn-soft-danger rounded-pill" on:click={() => removeItem(i)}><i class="ti ti-trash"></i></button></td>
                      </tr>
                    {:else}
                      <tr><td colspan="8" class="text-center text-muted py-3">No items</td></tr>
                    {/each}
                    <tr class="table-light"><td colspan="6" class="text-end fw-semibold px-3 py-2">Subtotal</td><td class="text-end fw-bold px-2">{itemsSubtotal.toFixed(2)}</td><td></td></tr>
                  </tbody>
                </table>
              </div>

              <div class="row g-3">
                <!-- Extra Charges -->
                <div class="col-md-5">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-semibold small text-uppercase text-muted">Extra Charges</span>
                    <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addExtra}><i class="ti ti-plus me-1"></i>Add</button>
                  </div>
                  {#if !extraItems.length}
                    <div class="text-muted small fst-italic py-1">No extra charges</div>
                  {:else}
                    <table class="table table-sm table-bordered mb-0">
                      <thead class="table-light"><tr><th>Charge</th><th class="text-end" style="width:90px;">Amount</th><th style="width:36px;"></th></tr></thead>
                      <tbody>
                        {#each extraItems as ei, i}
                          <tr>
                            <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={ei.item} placeholder="e.g. Freight" /></td>
                            <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-end" min="0" step="0.01" bind:value={ei.total} on:input={recompute} /></td>
                            <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeExtra(i)}><i class="ti ti-x"></i></button></td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </div>
                <!-- Tax Items -->
                <div class="col-md-7">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-semibold small text-uppercase text-muted">Tax Items</span>
                    <button type="button" class="btn btn-xs btn-outline-secondary" on:click={addTax}><i class="ti ti-plus me-1"></i>Add</button>
                  </div>
                  <table class="table table-sm table-bordered mb-0">
                    <thead class="table-light"><tr><th>Tax</th><th class="text-center" style="width:80px;">Rate %</th><th class="text-end" style="width:90px;">Amount</th><th style="width:36px;"></th></tr></thead>
                    <tbody>
                      {#each taxItems as t, i}
                        <tr>
                          <td class="p-1"><input type="text" class="form-control form-control-sm border-0 shadow-none" bind:value={t.item} placeholder="CGST / IGST" /></td>
                          <td class="p-1"><input type="number" class="form-control form-control-sm border-0 shadow-none text-center" min="0" max="100" step="0.5" bind:value={t.percentage} on:input={recompute} /></td>
                          <td class="p-1 text-end fw-semibold align-middle small">{taxItemTotal(t).toFixed(2)}</td>
                          <td class="p-1 text-center"><button type="button" class="btn btn-sm text-danger" on:click={() => removeTax(i)}><i class="ti ti-x"></i></button></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <!-- Discount + Total Label + Override + Grand Total -->
                <div class="col-12 border-top pt-3">
                  <div class="row g-2">
                    <div class="col-md-3">
                      <label class="form-label fw-semibold" style="font-size:12px;">Discount ({currencySymbol})</label>
                      <input type="number" min="0" step="0.01" class="form-control form-control-sm" bind:value={discount} on:input={recompute} />
                    </div>
                    <div class="col-md-3">
                      <label class="form-label fw-semibold" style="font-size:12px;">Total Label</label>
                      <input type="text" class="form-control form-control-sm" bind:value={totalAmountTitle} placeholder="Total Amount" />
                    </div>
                    <div class="col-md-3">
                      <label class="form-label fw-semibold" style="font-size:12px;">Total Override <span class="text-muted fw-normal">(0 = auto)</span></label>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text">{currencySymbol}</span>
                        <input type="number" min="0" step="0.01" class="form-control" bind:value={totalAmountValue} />
                      </div>
                    </div>
                    <div class="col-md-3 d-flex align-items-end justify-content-end pb-1">
                      <div class="text-end">
                        <div class="text-muted" style="font-size:11px;">{totalAmountTitle || "Grand Total"}</div>
                        <div class="fw-bold text-success fs-5">{currencySymbol} {(totalAmountValue || 0).toLocaleString("en-IN")}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/if}

          {/if}
        {/if}
      </div>

      <!-- ── Footer ──────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-gray-200 flex-shrink-0 gap-2 flex-shrink-0">
        {#if isView}
          <a href={detailUrl} class="btn btn-sm btn-primary"><i class="ti ti-external-link me-1"></i>Full Detail</a>
          <button type="button" class="btn btn-sm btn-outline-secondary" on:click={close}>Close</button>
        {:else}
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={close}>Cancel</button>
            {#if step > 1}
              <button type="button" class="btn btn-sm btn-outline-secondary" on:click={prevStep}>
                <i class="ti ti-arrow-left me-1"></i>Back
              </button>
            {/if}
          </div>
          <div class="d-flex gap-2">
            {#if step < steps.length}
              <button type="button" class="btn btn-sm btn-primary" on:click={nextStep}>
                Next <i class="ti ti-arrow-right ms-1"></i>
              </button>
            {:else}
              <button type="button" class="btn btn-sm btn-success" disabled={loading} on:click={submit}>
                {#if loading}
                  <span class="spinner-border spinner-border-sm me-1"></span>Saving…
                {:else}
                  <i class="ti ti-check me-1"></i>Create {type}
                {/if}
              </button>
            {/if}
          </div>
        {/if}
      </div>

    </div>
  </div>
{/if}
