<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { API_BASE_URL } from "$lib/constants/constants";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { authApiFetch } from "$lib/api/client";
  import { companiesAllStore } from "$lib/stores/dataStores";
  import { checkAuth } from "$lib/utils/auth";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";

  export let order;
  export let samples = [];
  export let loadingSamples = false;
  export let canMutateOrder = true;
  export let sampleSaving = false;
  export let setSampleFlag = async () => {};
  export let setSampleCompany = async () => {};
  export let addSampleMovement = async () => {};
  export let updateSampleMovement = async () => {};
  export let markSampleReceived = async () => {};
  export let deleteSampleMovement = async () => {};
  export let addSampleEvent = async () => {};
  export let approveSample = async () => {};
  export let rejectSample = async () => {};
  export let openImageLightbox = () => {};

  const UNIT_OPTIONS = ["Pcs", "Set", "Kg", "Nos", "Box"];
  const MOVEMENT_STATUS_OPTIONS = [
    "Prepared",
    "Sent",
    "In Transit",
    "Received",
    "Returned",
    "Lost",
    "Damaged",
    "Cancelled",
  ];
  const MARK_RECEIVABLE_STATUSES = ["Prepared", "Sent", "In Transit"];

  const currentUser = checkAuth();
  const defaultSampleCompanyId =
    currentUser?.companyId != null ? Number(currentUser.companyId) : null;

  let companies = [];
  let showCompanyModal = false;
  let editCompanyId = null;
  let companyModalError = "";

  onMount(async () => {
    const cached = get(companiesAllStore);
    if (cached?.length) {
      companies = cached;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = Array.isArray(data) ? data : data?.data || [];
      companiesAllStore.set(companies);
    } catch (_) {
      companies = [];
    }
  });

  /** Sample company name (from order when sample is on). */
  $: sampleCompany =
    order?.sampleCompany?.name ||
    companies.find((c) => Number(c.id) === Number(order?.sampleCompanyId))
      ?.name ||
    null;

  function openCompanyModal() {
    editCompanyId =
      order?.sampleCompanyId != null
        ? Number(order.sampleCompanyId)
        : defaultSampleCompanyId;
    companyModalError = "";
    showCompanyModal = true;
  }

  function closeCompanyModal() {
    showCompanyModal = false;
    editCompanyId = null;
    companyModalError = "";
  }

  async function saveSampleCompany() {
    if (editCompanyId == null) {
      companyModalError = "Select a company.";
      return;
    }
    companyModalError = "";
    const ok = await setSampleCompany(editCompanyId);
    if (ok !== false) closeCompanyModal();
  }

  let showModal = false;
  let showEditModal = false;
  let editSampleId = null;
  let editDirection = "Outbound";
  let editStatus = "Sent";
  let editTracking = "";
  let editNotes = "";
  let editSentDate = "";
  let editReceivedDate = "";
  let editRequestedDate = "";
  let editExpectedDeliveryDate = "";
  let editExpectedReturnDate = "";
  let editReturnedDate = "";
  let editFollowUpDate = "";
  let showDecisionModal = false;
  let showEventModal = false;
  let eventSampleId = null;
  let eventNote = "";
  let eventFiles = [];
  let eventError = "";
  let decisionAction = "approve"; // approve | reject
  let direction = "Outbound";
  let status = "Sent";
  let tracking = "";
  let notes = "";
  let sentDate = new Date().toISOString().slice(0, 10);
  let requestedDate = "";
  let expectedDeliveryDate = "";
  let expectedReturnDate = "";
  let followUpDate = "";
  let decisionNote = "";
  let decisionError = "";
  let items = [{ name: "", quantity: "1", unit: "Pcs", note: "" }];
  let formError = "";

  $: decided =
    order?.sampleDecision === "Approved" || order?.sampleDecision === "Rejected";
  $: decisionCls =
    order?.sampleDecision === "Approved"
      ? "bg-success"
      : order?.sampleDecision === "Rejected"
        ? "bg-danger"
        : "bg-warning text-dark";
  $: decisionIsApprove = decisionAction === "approve";

  function blankItem() {
    return { name: "", quantity: "1", unit: "Pcs", note: "" };
  }

  function toDateInput(d) {
    if (!d) return "";
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }

  function openModal() {
    direction = "Outbound";
    status = "Sent";
    tracking = "";
    notes = "";
    sentDate = new Date().toISOString().slice(0, 10);
    requestedDate = "";
    expectedDeliveryDate = "";
    expectedReturnDate = "";
    followUpDate = "";
    items = [blankItem()];
    formError = "";
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    formError = "";
  }

  function openEditModal(s) {
    editSampleId = s.id;
    editDirection = s.direction || "Outbound";
    editStatus = s.status || "Sent";
    editTracking = s.tracking || "";
    editNotes = s.notes || "";
    editSentDate = toDateInput(s.sentDate);
    editReceivedDate = toDateInput(s.receivedDate);
    editRequestedDate = toDateInput(s.requestedDate);
    editExpectedDeliveryDate = toDateInput(s.expectedDeliveryDate);
    editExpectedReturnDate = toDateInput(s.expectedReturnDate);
    editReturnedDate = toDateInput(s.returnedDate);
    editFollowUpDate = toDateInput(s.followUpDate);
    showEditModal = true;
  }

  function closeEditModal() {
    showEditModal = false;
    editSampleId = null;
  }

  async function submitEdit() {
    const ok = await updateSampleMovement(editSampleId, {
      direction: editDirection,
      status: editStatus,
      tracking: editTracking.trim() || null,
      notes: editNotes.trim() || null,
      sentDate: editSentDate ? new Date(editSentDate).toISOString() : undefined,
      receivedDate: editReceivedDate
        ? new Date(editReceivedDate).toISOString()
        : undefined,
      requestedDate: editRequestedDate
        ? new Date(editRequestedDate).toISOString()
        : null,
      expectedDeliveryDate: editExpectedDeliveryDate
        ? new Date(editExpectedDeliveryDate).toISOString()
        : null,
      expectedReturnDate: editExpectedReturnDate
        ? new Date(editExpectedReturnDate).toISOString()
        : null,
      returnedDate: editReturnedDate
        ? new Date(editReturnedDate).toISOString()
        : null,
      followUpDate: editFollowUpDate
        ? new Date(editFollowUpDate).toISOString()
        : null,
    });
    if (ok !== false) closeEditModal();
  }

  function movementBadgeClass(st) {
    if (st === "Received") return "bg-success";
    if (st === "Cancelled") return "bg-dark";
    if (st === "Returned") return "bg-info text-dark";
    if (st === "Lost" || st === "Damaged") return "bg-danger";
    if (st === "In Transit") return "bg-primary";
    if (st === "Prepared") return "bg-secondary";
    return "bg-warning text-dark";
  }

  function openDecisionModal(action) {
    if (!samples?.length) {
      decisionError = "";
      formError = "Add at least one sample before approve or reject.";
      openModal();
      return;
    }
    decisionAction = action;
    decisionNote = "";
    decisionError = "";
    showDecisionModal = true;
  }

  function closeDecisionModal() {
    showDecisionModal = false;
    decisionNote = "";
    decisionError = "";
  }

  async function submitDecision() {
    const note = decisionNote.trim();
    if (!note) {
      decisionError = "Decision note is required.";
      return;
    }
    decisionError = "";
    const ok = decisionIsApprove
      ? await approveSample(note)
      : await rejectSample(note);
    if (ok !== false) closeDecisionModal();
  }

  function openEventModal(sampleId) {
    eventSampleId = sampleId;
    eventNote = "";
    eventFiles = [];
    eventError = "";
    showEventModal = true;
  }

  function closeEventModal() {
    showEventModal = false;
    eventSampleId = null;
    eventNote = "";
    eventFiles = [];
    eventError = "";
  }

  function onEventFilesChange(e) {
    eventFiles = Array.from(e.currentTarget?.files || []);
  }

  async function submitEvent() {
    const note = eventNote.trim();
    if (!note && !eventFiles.length) {
      eventError = "Add a note and/or at least one image.";
      return;
    }
    eventError = "";
    const ok = await addSampleEvent(
      eventSampleId,
      {
        note: note || undefined,
        type: eventFiles.length ? (note ? "update" : "image") : "note",
      },
      eventFiles,
    );
    if (ok !== false) closeEventModal();
  }

  function mediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const base = (API_BASE_URL || "").replace(/\/$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  function formatEventTime(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function addItemRow() {
    items = [...items, blankItem()];
  }

  function removeItemRow(index) {
    if (items.length <= 1) {
      items = [blankItem()];
      return;
    }
    items = items.filter((_, i) => i !== index);
  }

  function getValidItems() {
    return items
      .map((it) => ({
        name: (it.name || "").trim(),
        quantity: (it.quantity || "").toString().trim() || null,
        unit: (it.unit || "").trim() || null,
        note: (it.note || "").trim() || null,
      }))
      .filter((it) => it.name);
  }

  function formatItemsSummary(s) {
    const list = Array.isArray(s?.items) ? s.items.filter((it) => it?.name) : [];
    if (list.length) {
      return list
        .map((it) => {
          const qty = [it.quantity, it.unit].filter(Boolean).join(" ");
          return qty ? `${it.name} (${qty})` : it.name;
        })
        .join(", ");
    }
    if (s?.description) {
      return s.quantity ? `${s.description} (${s.quantity})` : s.description;
    }
    return "—";
  }

  async function submitMovement() {
    formError = "";
    const validItems = getValidItems();
    if (!validItems.length) {
      formError = "Add at least one item with a name.";
      return;
    }

    const first = validItems[0];
    const ok = await addSampleMovement({
      direction,
      items: validItems,
      description: validItems.map((it) => it.name).join(", "),
      quantity: first.quantity
        ? `${first.quantity}${first.unit ? ` ${first.unit}` : ""}`
        : null,
      tracking: tracking.trim() || null,
      notes: notes.trim() || null,
      sentDate: sentDate ? new Date(sentDate).toISOString() : undefined,
      requestedDate: requestedDate
        ? new Date(requestedDate).toISOString()
        : undefined,
      expectedDeliveryDate: expectedDeliveryDate
        ? new Date(expectedDeliveryDate).toISOString()
        : undefined,
      expectedReturnDate: expectedReturnDate
        ? new Date(expectedReturnDate).toISOString()
        : undefined,
      followUpDate: followUpDate
        ? new Date(followUpDate).toISOString()
        : undefined,
      status,
    });
    if (ok !== false) closeModal();
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });
  }
</script>

<div class="card">
  <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2 py-2">
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <h6 class="mb-0">
        <i class="ti ti-package-export me-2 text-primary"></i>Samples
      </h6>
      {#if order?.isSample}
        <span class="badge {decisionCls}" style="font-size:10px;">
          {order.sampleDecision || "Pending"}
        </span>
        {#if order?.sampleCode}
          <span class="badge bg-light text-dark border" style="font-size:10px;">
            {order.sampleCode}
          </span>
        {/if}
        {#if sampleCompany}
          <span
            class="badge bg-primary-subtle text-primary border border-primary-subtle"
            style="font-size:10px;"
            title="Sample company"
          >
            <i class="ti ti-building me-1"></i>{sampleCompany}
          </span>
        {/if}
        {#if canMutateOrder && !decided}
          <button
            type="button"
            class="btn btn-link btn-sm p-0 text-decoration-none"
            title="Change sample company"
            disabled={sampleSaving}
            on:click={openCompanyModal}
          >
            <i class="ti ti-pencil" style="font-size:14px;"></i>
          </button>
        {/if}
      {/if}
    </div>
    {#if canMutateOrder}
      <div class="form-check form-switch mb-0">
        <input
          class="form-check-input"
          type="checkbox"
          id="isSampleToggle"
          checked={!!order?.isSample}
          disabled={sampleSaving || order?.sampleDecision === "Approved"}
          on:change={async (e) => {
            const next = e.currentTarget.checked;
            const ok = await setSampleFlag(
              next,
              next ? defaultSampleCompanyId : undefined,
            );
            if (ok === false) {
              e.currentTarget.checked = !!order?.isSample;
              return;
            }
            if (next) openModal();
          }}
        />
        <label class="form-check-label" for="isSampleToggle" style="font-size:13px;">
          Sample case
        </label>
      </div>
    {/if}
  </div>

  <div class="card-body">
    {#if !order?.isSample}
      <div class="text-center py-4 text-muted">
        <i class="ti ti-package-off" style="font-size:2rem;"></i>
        <p class="mt-2 mb-0">
          Turn on <strong>Sample case</strong> to log send/receive and approve or reject.
        </p>
      </div>
    {:else}
      {#if order?.sampleDecision === "Approved"}
        <div class="alert alert-success py-2 mb-3" style="font-size:13px;">
          Sample approved — order status set to <strong>Qualified</strong>.
          {#if order.sampleDecisionNote}
            <div class="mt-1 text-muted">{order.sampleDecisionNote}</div>
          {/if}
        </div>
      {:else if order?.sampleDecision === "Rejected"}
        <div class="alert alert-danger py-2 mb-3" style="font-size:13px;">
          Sample rejected — order status set to <strong>Unqualified</strong>.
          {#if order.sampleDecisionNote}
            <div class="mt-1 text-muted">{order.sampleDecisionNote}</div>
          {/if}
        </div>
      {:else if canMutateOrder}
        <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3 p-2 border rounded bg-light">
          <div class="text-muted" style="font-size:12px;">
            {#if !samples?.length}
              Add at least one sample before you can approve or reject.
            {:else}
              Final sample decision — opens a form for a required review note.
            {/if}
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button
              class="btn btn-success btn-sm"
              disabled={sampleSaving || !samples?.length}
              on:click={() => openDecisionModal("approve")}
            >
              <i class="ti ti-check me-1"></i>Approve → Qualified
            </button>
            <button
              class="btn btn-outline-danger btn-sm"
              disabled={sampleSaving || !samples?.length}
              on:click={() => openDecisionModal("reject")}
            >
              <i class="ti ti-x me-1"></i>Reject → Unqualified
            </button>
          </div>
        </div>
      {/if}

      <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
        <div class="text-muted" style="font-size:12px;">
          {#if sampleCompany}
            Company: <strong class="text-dark">{sampleCompany}</strong>
            <span class="mx-1">·</span>
          {/if}
          Outbound = company → client · Inbound = client → company
        </div>
        {#if canMutateOrder && !decided}
          <button
            class="btn btn-primary btn-sm"
            on:click={openModal}
            disabled={sampleSaving}
          >
            <i class="ti ti-plus me-1"></i>Add sample
          </button>
        {/if}
      </div>

      {#if loadingSamples}
        <div class="text-center py-4">
          <span class="spinner-border spinner-border-sm text-primary"></span>
        </div>
      {:else if samples.length === 0}
        <div class="text-center py-4 text-muted">
          <i class="ti ti-package" style="font-size:2rem;"></i>
          <p class="mt-2 mb-2">Add at least one sample <span class="text-danger">*</span> (required).</p>
          {#if canMutateOrder && !decided}
            <button
              class="btn btn-primary btn-sm"
              on:click={openModal}
              disabled={sampleSaving}
            >
              <i class="ti ti-plus me-1"></i>Add sample
            </button>
          {/if}
        </div>
      {:else}
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0">
            <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Received</th>
                <th>Items</th>
                <th>Tracking</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each samples as s, i}
                <tr>
                  <td>{i + 1}</td>
                  <td>
                    <span
                      class="badge {s.direction === 'Outbound' ? 'bg-info' : 'bg-secondary'}"
                      style="font-size:10px;"
                    >
                      {s.direction}
                    </span>
                  </td>
                  <td>
                    <span
                      class="badge {movementBadgeClass(s.status)}"
                      style="font-size:10px;"
                    >
                      {s.status}
                    </span>
                  </td>
                  <td style="font-size:12px; white-space:nowrap;">{formatDate(s.sentDate)}</td>
                  <td style="font-size:12px; white-space:nowrap;">{formatDate(s.receivedDate)}</td>
                  <td style="font-size:12px; max-width:280px;">
                    {#if Array.isArray(s.items) && s.items.filter((it) => it?.name).length}
                      <ul class="mb-0 ps-3" style="font-size:12px;">
                        {#each s.items.filter((it) => it?.name) as it}
                          <li>
                            {it.name}
                            {#if it.quantity || it.unit}
                              <span class="text-muted">
                                ({[it.quantity, it.unit].filter(Boolean).join(" ")})
                              </span>
                            {/if}
                            {#if it.note}
                              <span class="text-muted"> — {it.note}</span>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      {formatItemsSummary(s)}
                    {/if}
                  </td>
                  <td style="font-size:12px;">{s.tracking || "—"}</td>
                  <td class="text-end text-nowrap">
                    {#if canMutateOrder}
                      <button
                        class="btn btn-sm btn-outline-secondary p-0 px-1 me-1"
                        title="Edit sample"
                        disabled={sampleSaving}
                        on:click={() => openEditModal(s)}
                      >
                        <i class="ti ti-pencil" style="font-size:13px;"></i>
                      </button>
                      <button
                        class="btn btn-sm btn-outline-primary p-0 px-1 me-1"
                        title="Add note / images"
                        disabled={sampleSaving}
                        on:click={() => openEventModal(s.id)}
                      >
                        <i class="ti ti-photo-plus" style="font-size:13px;"></i>
                      </button>
                    {/if}
                    {#if canMutateOrder && MARK_RECEIVABLE_STATUSES.includes(s.status) && !decided}
                      <button
                        class="btn btn-sm btn-outline-success p-0 px-1 me-1"
                        title="Mark received"
                        disabled={sampleSaving}
                        on:click={() => markSampleReceived(s.id)}
                      >
                        <i class="ti ti-package-import" style="font-size:13px;"></i>
                      </button>
                    {/if}
                    {#if canMutateOrder && !decided}
                      <button
                        class="btn btn-sm btn-outline-danger p-0 px-1"
                        title="Delete"
                        disabled={sampleSaving}
                        on:click={() => deleteSampleMovement(s.id)}
                      >
                        <i class="ti ti-trash" style="font-size:13px;"></i>
                      </button>
                    {/if}
                  </td>
                </tr>
                <tr class="sample-events-row">
                  <td colspan="8" class="bg-light">
                    <div class="sample-events-list">
                      {#if Array.isArray(s.images) && s.images.length}
                        <div class="mb-2">
                          <div class="text-muted mb-1" style="font-size:11px; font-weight:600;">
                            Current photos
                            <span class="badge bg-primary ms-1" style="font-size:9px;">{s.images.length}</span>
                          </div>
                          <div class="d-flex flex-wrap gap-2">
                            {#each s.images as img, imgIdx}
                              <button
                                type="button"
                                class="sample-event-thumb-btn"
                                title="View full image"
                                on:click={() =>
                                  openImageLightbox(
                                    s.images.map((x) => mediaUrl(x.url)),
                                    imgIdx,
                                  )}
                              >
                                <img
                                  src={mediaUrl(img.url)}
                                  alt={img.fileName || "sample"}
                                  class="sample-event-thumb"
                                />
                              </button>
                            {/each}
                          </div>
                        </div>
                      {/if}
                      <div class="d-flex align-items-center justify-content-between mb-1">
                        <div class="text-muted" style="font-size:11px; font-weight:600;">
                          Events
                          {#if Array.isArray(s.events) && s.events.length}
                            <span class="badge bg-secondary ms-1" style="font-size:9px;">{s.events.length}</span>
                          {/if}
                        </div>
                        {#if canMutateOrder}
                          <button
                            type="button"
                            class="btn btn-sm btn-link p-0"
                            style="font-size:12px;"
                            disabled={sampleSaving}
                            on:click={() => openEventModal(s.id)}
                          >
                            + Add note / images
                          </button>
                        {/if}
                      </div>
                      {#if Array.isArray(s.events) && s.events.length}
                        {#each s.events as ev}
                          <div class="sample-event-item">
                            <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                              <span class="badge bg-secondary" style="font-size:9px;">{ev.type || "update"}</span>
                              {#if ev.status}
                                <span class="badge bg-light text-dark border" style="font-size:9px;">{ev.status}</span>
                              {/if}
                              <span class="text-muted" style="font-size:11px;">{formatEventTime(ev.createdAt)}</span>
                            </div>
                            {#if ev.note}
                              <div style="font-size:12px;">{ev.note}</div>
                            {/if}
                            {#if Array.isArray(ev.images) && ev.images.length}
                              <div class="d-flex flex-wrap gap-2 mt-1">
                                {#each ev.images as img, imgIdx}
                                  <button
                                    type="button"
                                    class="sample-event-thumb-btn"
                                    title="View full image"
                                    on:click={() =>
                                      openImageLightbox(
                                        ev.images.map((x) => mediaUrl(x.url)),
                                        imgIdx,
                                      )}
                                  >
                                    <img
                                      src={mediaUrl(img.url)}
                                      alt={img.fileName || "sample"}
                                      class="sample-event-thumb"
                                    />
                                  </button>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      {:else}
                        <div class="text-muted" style="font-size:12px;">
                          No events yet. Use <strong>Add note / images</strong> to attach reviews or photos.
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if showCompanyModal}
  <div
    id="sampleCompanyModal"
    class="modal fade show d-block sample-company-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-company-modal-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-building text-primary"></i>
            <span>Change sample company</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeCompanyModal}
            aria-label="Close"
          ></button>
        </div>
        <div class="modal-body">
          {#if order?.sampleCode}
            <div class="text-muted mb-2" style="font-size:12px;">
              Current code: <strong class="text-dark">{order.sampleCode}</strong>
              <span class="text-muted"> — will update to match the new company</span>
            </div>
          {/if}
          <label class="form-label" for="editSampleCompany">Company</label>
          <TypeableSelect
            id="editSampleCompany"
            objectMode={true}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={editCompanyId}
            placeholder="Select company..."
            dropdownParent="#sampleCompanyModal"
            on:change={(e) => {
              editCompanyId = e.detail;
              companyModalError = "";
            }}
          />
          {#if companyModalError}
            <div class="text-danger mt-2" style="font-size:12px;">{companyModalError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            disabled={sampleSaving}
            on:click={closeCompanyModal}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={sampleSaving || editCompanyId == null}
            on:click={saveSampleCompany}
          >
            {#if sampleSaving}
              <span class="spinner-border spinner-border-sm me-1"></span>
            {/if}
            Save company
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-package text-danger"></i>
            <span>Add sample{#if !samples?.length} <span class="text-danger">*</span>{/if}</span>
          </h5>
          <button type="button" class="btn-close" on:click={closeModal} aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <label class="sample-label" for="sampleDirection">Direction</label>
              <select id="sampleDirection" class="form-select" bind:value={direction}>
                <option value="Outbound">Outbound (to client)</option>
                <option value="Inbound">Inbound (from client)</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleStatus">Status</label>
              <select id="sampleStatus" class="form-select" bind:value={status}>
                {#each MOVEMENT_STATUS_OPTIONS as st}
                  <option value={st}>{st}</option>
                {/each}
              </select>
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleSentDate">Sent date</label>
              <input id="sampleSentDate" type="date" class="form-control" bind:value={sentDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleTracking">Tracking</label>
              <input
                id="sampleTracking"
                type="text"
                class="form-control"
                bind:value={tracking}
                placeholder="Courier / AWB"
              />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleRequestedDate">Requested</label>
              <input id="sampleRequestedDate" type="date" class="form-control" bind:value={requestedDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleEtaDate">Expected delivery</label>
              <input id="sampleEtaDate" type="date" class="form-control" bind:value={expectedDeliveryDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleExpectedReturnDate">Expected return</label>
              <input id="sampleExpectedReturnDate" type="date" class="form-control" bind:value={expectedReturnDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleFollowUpDate">Follow-up</label>
              <input id="sampleFollowUpDate" type="date" class="form-control" bind:value={followUpDate} />
            </div>
          </div>

          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="sample-label mb-0">Items</label>
            <button type="button" class="btn btn-sm btn-outline-primary sample-add-item-btn" on:click={addItemRow}>
              <i class="ti ti-plus me-1"></i>Add item
            </button>
          </div>

          <div class="sample-items-panel mb-3">
            <div class="sample-items-head d-none d-md-grid">
              <span>Item name</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Note</span>
              <span></span>
            </div>
            {#each items as item, idx}
              <div class="sample-items-row">
                <div>
                  <label class="sample-label d-md-none">Item name</label>
                  <input
                    class="form-control"
                    bind:value={item.name}
                    placeholder="e.g. Mushroom Valve"
                  />
                </div>
                <div>
                  <label class="sample-label d-md-none">Qty</label>
                  <input class="form-control" bind:value={item.quantity} placeholder="1" />
                </div>
                <div>
                  <label class="sample-label d-md-none">Unit</label>
                  <select class="form-select" bind:value={item.unit}>
                    {#each UNIT_OPTIONS as u}
                      <option value={u}>{u}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="sample-label d-md-none">Note</label>
                  <input class="form-control" bind:value={item.note} placeholder="Optional" />
                </div>
                <div class="sample-items-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    title="Remove item"
                    on:click={() => removeItemRow(idx)}
                  >
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </div>
            {/each}
          </div>

          <div class="mb-1">
            <label class="sample-label" for="sampleNotes">Notes</label>
            <input
              id="sampleNotes"
              type="text"
              class="form-control"
              bind:value={notes}
              placeholder="Shipment notes (optional)"
            />
          </div>

          {#if formError}
            <div class="text-danger mt-2" style="font-size:12px;">{formError}</div>
          {/if}
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeModal} disabled={sampleSaving}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={sampleSaving}
            on:click={submitMovement}
          >
            {sampleSaving ? "Saving…" : "Save sample"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showDecisionModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti {decisionIsApprove ? 'ti-check text-success' : 'ti-x text-danger'}"></i>
            <span>{decisionIsApprove ? "Approve sample" : "Reject sample"}</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeDecisionModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>

        <div class="modal-body">
          <p class="text-muted mb-3" style="font-size:13px;">
            {#if decisionIsApprove}
              This will set sample decision to <strong>Approved</strong> and order status to
              <strong>Qualified</strong>.
            {:else}
              This will set sample decision to <strong>Rejected</strong> and order status to
              <strong>Unqualified</strong>.
            {/if}
          </p>
          <label class="sample-label" for="sampleDecisionNote">Decision note <span class="text-danger">*</span></label>
          <textarea
            id="sampleDecisionNote"
            class="form-control"
            rows="4"
            bind:value={decisionNote}
            placeholder="Review note…"
            disabled={sampleSaving}
            on:input={() => (decisionError = "")}
          ></textarea>
          {#if decisionError}
            <div class="text-danger mt-2" style="font-size:12px;">{decisionError}</div>
          {/if}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={closeDecisionModal}
            disabled={sampleSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn {decisionIsApprove ? 'btn-success' : 'btn-danger'}"
            disabled={sampleSaving || !decisionNote.trim()}
            on:click={submitDecision}
          >
            {#if sampleSaving}
              Saving…
            {:else if decisionIsApprove}
              Confirm approve
            {:else}
              Confirm reject
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showEditModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-pencil text-secondary"></i>
            <span>Edit sample</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeEditModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="sample-label" for="editDirection">Direction</label>
              <select id="editDirection" class="form-select" bind:value={editDirection}>
                <option value="Outbound">Outbound</option>
                <option value="Inbound">Inbound</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editStatus">Status</label>
              <select id="editStatus" class="form-select" bind:value={editStatus}>
                {#each MOVEMENT_STATUS_OPTIONS as st}
                  <option value={st}>{st}</option>
                {/each}
              </select>
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editSentDate">Sent date</label>
              <input id="editSentDate" type="date" class="form-control" bind:value={editSentDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editReceivedDate">Received date</label>
              <input id="editReceivedDate" type="date" class="form-control" bind:value={editReceivedDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editRequestedDate">Requested date</label>
              <input id="editRequestedDate" type="date" class="form-control" bind:value={editRequestedDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editExpectedDeliveryDate">Expected delivery</label>
              <input id="editExpectedDeliveryDate" type="date" class="form-control" bind:value={editExpectedDeliveryDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editExpectedReturnDate">Expected return</label>
              <input id="editExpectedReturnDate" type="date" class="form-control" bind:value={editExpectedReturnDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editReturnedDate">Returned date</label>
              <input id="editReturnedDate" type="date" class="form-control" bind:value={editReturnedDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editFollowUpDate">Follow-up date</label>
              <input id="editFollowUpDate" type="date" class="form-control" bind:value={editFollowUpDate} />
            </div>
            <div class="col-md-6">
              <label class="sample-label" for="editTracking">Tracking</label>
              <input
                id="editTracking"
                type="text"
                class="form-control"
                bind:value={editTracking}
                placeholder="Courier / AWB"
              />
            </div>
            <div class="col-12">
              <label class="sample-label" for="editNotes">Notes</label>
              <textarea
                id="editNotes"
                class="form-control"
                rows="3"
                bind:value={editNotes}
                placeholder="Shipment notes"
              ></textarea>
            </div>
          </div>
          <p class="text-muted mt-3 mb-0" style="font-size:12px;">
            Status changes via <strong>Mark received</strong>. Photos/review notes via <strong>Add note / images</strong>.
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeEditModal} disabled={sampleSaving}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" disabled={sampleSaving} on:click={submitEdit}>
            {sampleSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showEventModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-message-plus text-primary"></i>
            <span>Add sample event</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeEventModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>

        <div class="modal-body">
          <p class="text-muted mb-3" style="font-size:13px;">
            Add a note and/or images. New photos are saved on the sample and as an event in the timeline.
          </p>
          <label class="sample-label" for="sampleEventNote">Note</label>
          <textarea
            id="sampleEventNote"
            class="form-control mb-3"
            rows="3"
            bind:value={eventNote}
            placeholder="Review / courier / quality note…"
            disabled={sampleSaving}
            on:input={() => (eventError = "")}
          ></textarea>
          <label class="sample-label" for="sampleEventImages">Images</label>
          <input
            id="sampleEventImages"
            type="file"
            class="form-control"
            accept="image/*,application/pdf"
            multiple
            disabled={sampleSaving}
            on:change={onEventFilesChange}
          />
          {#if eventFiles.length}
            <div class="text-muted mt-1" style="font-size:12px;">
              {eventFiles.length} file(s) selected
            </div>
          {/if}
          {#if eventError}
            <div class="text-danger mt-2" style="font-size:12px;">{eventError}</div>
          {/if}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={closeEventModal}
            disabled={sampleSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={sampleSaving || (!eventNote.trim() && !eventFiles.length)}
            on:click={submitEvent}
          >
            {sampleSaving ? "Saving…" : "Save event"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .sample-company-modal :global(.modal-dialog),
  .sample-company-modal-content,
  .sample-company-modal :global(.modal-body) {
    overflow: visible;
  }

  .sample-company-modal :global(.select2-container) {
    z-index: 1060;
  }

  .sample-company-modal :global(.select2-dropdown) {
    z-index: 1065;
  }

  .sample-add-content {
    border: 0;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  }

  .sample-add-content :global(.modal-header) {
    border-bottom: 1px solid #eef2f7;
    padding: 14px 18px;
  }

  .sample-add-content :global(.modal-body) {
    padding: 18px;
  }

  .sample-add-content :global(.modal-footer) {
    border-top: 1px solid #eef2f7;
    padding: 12px 18px;
  }

  .sample-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
  }

  .sample-add-content :global(.form-control),
  .sample-add-content :global(.form-select) {
    min-height: 38px;
    border-color: #e2e8f0;
    border-radius: 8px;
    font-size: 13px;
  }

  .sample-add-content :global(.form-control:focus),
  .sample-add-content :global(.form-select:focus) {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  .sample-add-item-btn {
    border-radius: 6px;
    font-size: 12px;
    padding: 4px 10px;
  }

  .sample-items-panel {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    overflow: hidden;
  }

  .sample-items-head,
  .sample-items-row {
    display: grid;
    grid-template-columns: minmax(0, 2.2fr) 72px 88px minmax(0, 1.4fr) 40px;
    gap: 10px;
    align-items: end;
    padding: 10px 12px;
  }

  .sample-items-head {
    background: #f8fafc;
    border-bottom: 1px solid #eef2f7;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
  }

  .sample-items-row + .sample-items-row {
    border-top: 1px solid #f1f5f9;
  }

  .sample-items-actions {
    display: flex;
    justify-content: flex-end;
    padding-bottom: 2px;
  }

  .sample-items-actions :global(.btn) {
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
  }

  .sample-events-list {
    padding: 8px 4px;
  }

  .sample-event-item {
    border-left: 3px solid #93c5fd;
    padding: 6px 10px;
    margin-bottom: 8px;
    background: #fff;
    border-radius: 0 6px 6px 0;
  }

  .sample-event-thumb {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    display: block;
  }

  .sample-event-thumb-btn {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
    border-radius: 6px;
  }

  .sample-event-thumb-btn:hover .sample-event-thumb {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }

  @media (max-width: 767.98px) {
    .sample-items-row {
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }

    .sample-items-row > div:first-child,
    .sample-items-row > div:nth-child(4) {
      grid-column: 1 / -1;
    }

    .sample-items-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }
</style>
