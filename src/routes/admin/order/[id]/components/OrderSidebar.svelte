<script>
  import { afterUpdate } from "svelte";
  import { slide } from "svelte/transition";
  import { open as openExternal } from "@tauri-apps/api/shell";
  import { maskAssignedName } from "$lib/utils/maskUser";
  import { convertDate } from "./utils.js";
  import DOMPurify from "dompurify";

  export let order;
  export let orderInfoExpanded = false;

  // Client modal visibility — bind: from parent
  export let showChangeClientModal = false;
  export let showAddContactModal = false;
  export let showNewClientModal = false;
  export let showEditClientModal = false;

  // Contact management — functions from parent
  export let linkContact;
  export let setPrimaryContact;
  export let unlinkContact;

  // Assigned users modal trigger — function from parent
  export let setAssignedUsers;

  // Local state
  let visibilityMap = {};
  let descCollapsed = true;
  let orderDescEl;

  function toggleVisibility(index) {
    visibilityMap[index] = !visibilityMap[index];
    visibilityMap = visibilityMap;
  }

  function isHtml(str) {
    return str ? /<[a-z][\s\S]*>/i.test(str) : false;
  }

  function safeHtml(str) {
    return DOMPurify.sanitize(str ?? "");
  }

  afterUpdate(() => {
    if (!orderDescEl) return;
    orderDescEl.querySelectorAll("a[href]").forEach((a) => {
      if (a.__externalHandled) return;
      a.__externalHandled = true;
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (href && (href.startsWith("http") || href.startsWith("www"))) {
          e.preventDefault();
          openExternal(href.startsWith("www") ? "https://" + href : href);
        }
      });
    });
  });
</script>

<!-- Contact Sidebar -->
<div class="col-xl-4">
  <div class="card order-sidebar !sticky top-[75px]">
    <div class="card-body p-0">
      <!-- Order Information -->
      <div class="order-sidebar-section">
        <div class="order-sidebar-section-head">
          <i class="ti ti-info-circle"></i>
          <span>Order Information</span>
        </div>
        <div class="order-sidebar-meta-list">
          <div class="order-sidebar-row">
            <span class="order-sidebar-label"><i class="ti ti-hash"></i>Order ID</span>
            <span class="order-sidebar-value fw-semibold font-mono">
              {order?.financialYear}/{order?.pId?.toString().padStart(6, "0")}
            </span>
          </div>
          {#if order?.workOrderNumber}
            <div class="order-sidebar-row">
              <span class="order-sidebar-label"
                ><i class="ti ti-file-description"></i>Work Order</span
              >
              <span class="order-sidebar-value">{order.workOrderNumber}</span>
            </div>
          {/if}
          {#if order?.inqCode}
            <div class="order-sidebar-row">
              <span class="order-sidebar-label"><i class="ti ti-barcode"></i>Inq. Code</span>
              <span class="order-sidebar-value font-mono">{order.inqCode}</span>
            </div>
          {/if}
          <div class="order-sidebar-row">
            <span class="order-sidebar-label"><i class="ti ti-calendar-event"></i>Order Date</span>
            <span class="order-sidebar-value">
              {order?.orderDate &&
                convertDate(order?.orderDate, {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
            </span>
          </div>
          <div class="order-sidebar-row">
            <span class="order-sidebar-label"><i class="ti ti-clock"></i>Created</span>
            <span class="order-sidebar-value">
              {order?.createdAt &&
                convertDate(order?.createdAt, {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
            </span>
          </div>
          {#if orderInfoExpanded}
            <div
              transition:slide={{ duration: 250 }}
              style="overflow:hidden;margin:0;padding:0;display:flex;flex-direction:column;"
            >
              <div class="order-sidebar-row">
                <span class="order-sidebar-label"><i class="ti ti-file-text"></i>Price Terms</span>
                <span class="order-sidebar-value">{order?.priceTerms || "—"}</span>
              </div>
              <div class="order-sidebar-row">
                <span class="order-sidebar-label"><i class="ti ti-currency-rupee"></i>Price</span>
                <span class="order-sidebar-value fw-semibold text-success">
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: order?.currency || "INR",
                  })
                    .format(order?.price || 0)
                    .replace("₹", "₹ ")
                    .replace("$", "$ ")}
                </span>
              </div>
              <div class="order-sidebar-row">
                <span class="order-sidebar-label"><i class="ti ti-player-play"></i>Start Date</span>
                <span class="order-sidebar-value">
                  {order?.startDate
                    ? convertDate(order?.startDate, {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
              </div>
              <div class="order-sidebar-row">
                <span class="order-sidebar-label"><i class="ti ti-flag"></i>Deadline</span>
                <span class="order-sidebar-value">
                  {order?.deadlineDate
                    ? convertDate(order?.deadlineDate, {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
              </div>
              <div class="order-sidebar-row">
                <span class="order-sidebar-label"><i class="ti ti-source-code"></i>Source</span>
                <span class="order-sidebar-value capitalize">{order?.source || "—"}</span>
              </div>
            </div>
          {/if}
        </div>
        <div class="order-sidebar-expand">
          <button
            type="button"
            class="btn btn-xs btn-outline-secondary"
            on:click={() => (orderInfoExpanded = !orderInfoExpanded)}
          >
            {#if orderInfoExpanded}
              <i class="ti ti-chevron-up me-1"></i>Show less
            {:else}
              <i class="ti ti-chevron-down me-1"></i>Show more
            {/if}
          </button>
        </div>
      </div>

      <!-- Client -->
      <div class="order-sidebar-section">
        <div class="order-sidebar-section-head">
          <i class="ti ti-building-store"></i>
          <span>Client</span>
          <div class="order-sidebar-actions">
            {#if order.client}
              <button
                type="button"
                class="btn btn-xs btn-outline-warning"
                on:click={() => (showChangeClientModal = true)}
              >
                <i class="ti ti-replace me-1"></i>Change
              </button>
              <button
                type="button"
                class="btn btn-xs btn-outline-secondary"
                on:click={() => (showAddContactModal = true)}
              >
                <i class="ti ti-plus me-1"></i>Contact
              </button>
            {:else}
              <button
                type="button"
                class="btn btn-xs btn-outline-primary"
                on:click={() => (showChangeClientModal = true)}
              >
                <i class="ti ti-link me-1"></i>Link
              </button>
              <button
                type="button"
                class="btn btn-xs btn-outline-secondary"
                on:click={() => (showNewClientModal = true)}
              >
                <i class="ti ti-plus me-1"></i>Contact
              </button>
            {/if}
          </div>
        </div>

        {#if order.client}
          <div class="order-sidebar-client-card">
            <div class="d-flex align-items-center justify-content-between gap-2">
              <a href="/admin/client/{order.client.id}" class="order-sidebar-client-name">
                <i class="ti ti-building-store me-1"></i>{order.client.name}
              </a>
              <button
                type="button"
                class="btn btn-xs btn-outline-secondary flex-shrink-0"
                title="Edit client"
                on:click={() => (showEditClientModal = true)}
              >
                <i class="ti ti-pencil"></i>
              </button>
            </div>
            {#if order.client.gstNumber}
              <div class="order-sidebar-client-gst">
                GST: {order.client.gstNumber}
              </div>
            {/if}
          </div>

          {#if order.orderContacts?.length > 0}
            {#each order.orderContacts as oc, index}
              <div class="order-sidebar-contact">
                <div class="d-flex align-items-start gap-2 min-w-0">
                  <span class="avatar avatar-xs rounded-circle flex-shrink-0">
                    <img
                      src="/assets/img/profiles/user.png"
                      alt=""
                      class="img-fluid rounded-circle w-auto h-auto"
                    />
                  </span>
                  <div class="min-w-0">
                    <div
                      class="order-sidebar-contact-name capitalize d-flex align-items-center gap-1"
                    >
                      {#if oc.isPrimary}
                        <i
                          class="ti ti-star-filled text-warning"
                          style="font-size:11px;flex-shrink:0;"
                          title="Primary contact"
                        ></i>
                      {/if}
                      {oc.clientContact?.name}
                      {#if oc.clientContact?.designation}
                        <span class="order-sidebar-contact-role"
                          >({oc.clientContact.designation})</span
                        >
                      {/if}
                    </div>
                    {#if visibilityMap[index]}
                      {#if oc.clientContact?.email}
                        <a
                          href="mailto:{oc.clientContact.email}"
                          class="order-sidebar-contact-detail"
                        >
                          <i class="ti ti-mail"></i>{oc.clientContact.email}
                        </a>
                      {/if}
                      {#if oc.clientContact?.mobile}
                        <a
                          href="tel:{oc.clientContact.mobile}"
                          class="order-sidebar-contact-detail"
                        >
                          <i class="ti ti-phone"></i>{oc.clientContact.mobile}
                        </a>
                      {/if}
                    {/if}
                  </div>
                </div>
                <div class="order-sidebar-contact-actions">
                  <button
                    type="button"
                    on:click={() => !oc.isPrimary && setPrimaryContact(oc.id)}
                    class="btn btn-icon btn-xs {oc.isPrimary ? 'btn-warning' : 'btn-outline-light'}"
                    title={oc.isPrimary ? "Primary contact" : "Set as primary"}
                    style={oc.isPrimary ? "pointer-events:none;" : ""}
                  >
                    <i class="ti {oc.isPrimary ? 'ti-star-filled' : 'ti-star'}"></i>
                  </button>
                  <button
                    type="button"
                    on:click={() => toggleVisibility(index)}
                    class="btn btn-icon btn-xs btn-outline-light"
                    title={visibilityMap[index] ? "Hide details" : "Show details"}
                  >
                    <i class="ti {visibilityMap[index] ? 'ti-eye-off' : 'ti-eye'}"></i>
                  </button>
                  <button
                    type="button"
                    on:click={() => unlinkContact(oc.id, oc.clientContact?.name)}
                    class="btn btn-icon btn-xs btn-outline-light text-danger"
                    title="Remove contact"
                  >
                    <i class="ti ti-x"></i>
                  </button>
                </div>
              </div>
            {/each}
          {:else if order.orderClients?.filter((oc) => !oc.deletedAt && !order.orderContacts?.some((linked) => (linked.clientContact?.mobile && linked.clientContact.mobile === oc.mobile) || linked.clientContact?.name?.toLowerCase() === oc.name?.toLowerCase())).length > 0}
            {#each order.orderClients.filter((oc) => !oc.deletedAt && !order.orderContacts?.some((linked) => (linked.clientContact?.mobile && linked.clientContact.mobile === oc.mobile) || linked.clientContact?.name?.toLowerCase() === oc.name?.toLowerCase())) as oc}
              <div class="order-sidebar-contact-item d-flex align-items-start gap-2 py-1">
                <i class="ti ti-user text-muted mt-1" style="font-size:13px;"></i>
                <div style="font-size:13px;">
                  <div class="fw-semibold">{oc.name || "—"}</div>
                  {#if oc.mobile}<div class="text-muted" style="font-size:12px;">
                      📞 {oc.mobile}
                    </div>{/if}
                  {#if oc.email}<div class="text-muted" style="font-size:12px;">
                      ✉ {oc.email}
                    </div>{/if}
                </div>
              </div>
            {/each}
          {:else}
            <p class="order-sidebar-empty mb-0">No contacts linked yet.</p>
          {/if}

          {#if order.client.contacts?.filter((c) => !order.orderContacts?.some((oc) => oc.clientContact?.id === c.id)).length > 0}
            <div class="order-sidebar-chip-section">
              <div class="order-sidebar-chip-label">
                Quick add from {order.client.name}
              </div>
              <div class="order-sidebar-chip-list">
                {#each order.client.contacts.filter((c) => !order.orderContacts?.some((oc) => oc.clientContact?.id === c.id)) as contact}
                  <button
                    type="button"
                    class="btn btn-xs btn-outline-secondary"
                    on:click={() => linkContact(contact)}
                  >
                    <i class="ti ti-plus me-1"></i>{contact.name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {:else if order.orderClients?.length > 0}
          <!-- Legacy company name from order.company text field -->
          {#if order.company}
            <div class="order-sidebar-client-card mb-2">
              <div class="d-flex align-items-center gap-1">
                <i class="ti ti-building text-muted" style="font-size:13px;"></i>
                <span class="fw-semibold" style="font-size:13px;">{order.company}</span>
              </div>
              {#if order.gstNumber}
                <div class="order-sidebar-client-gst">GST: {order.gstNumber}</div>
              {/if}
            </div>
          {/if}
          <p class="order-sidebar-chip-label mb-2">Legacy contacts</p>
          {#each order.orderClients as orderClient, index}
            {#if orderClient?.deletedAt == null}
              <div class="order-sidebar-contact">
                <div class="d-flex align-items-start gap-2 min-w-0">
                  <span class="avatar avatar-xs rounded-circle flex-shrink-0">
                    <img
                      src="/assets/img/profiles/user.png"
                      alt=""
                      class="img-fluid rounded-circle w-auto h-auto"
                    />
                  </span>
                  <div class="min-w-0">
                    <div class="order-sidebar-contact-name">
                      {orderClient?.name}
                      {#if orderClient?.designation}
                        <span class="order-sidebar-contact-role">({orderClient.designation})</span>
                      {/if}
                    </div>
                    {#if visibilityMap[index]}
                      {#if orderClient?.email}
                        <span class="order-sidebar-contact-detail">
                          <i class="ti ti-mail"></i>{orderClient.email}
                        </span>
                      {/if}
                      {#if orderClient?.mobile}
                        <span class="order-sidebar-contact-detail">
                          <i class="ti ti-phone"></i>{orderClient.mobile}
                        </span>
                      {/if}
                    {/if}
                  </div>
                </div>
                <button
                  type="button"
                  on:click={() => toggleVisibility(index)}
                  class="btn btn-icon btn-xs btn-outline-light flex-shrink-0"
                  title={visibilityMap[index] ? "Hide details" : "Show details"}
                >
                  <i class="ti {visibilityMap[index] ? 'ti-eye-off' : 'ti-eye'}"></i>
                </button>
              </div>
            {/if}
          {/each}
        {:else if order.company}
          <!-- No orderClients but company text exists -->
          <div class="order-sidebar-client-card">
            <div class="d-flex align-items-center gap-1">
              <i class="ti ti-building text-muted" style="font-size:13px;"></i>
              <span class="fw-semibold" style="font-size:13px;">{order.company}</span>
            </div>
            {#if order.gstNumber}
              <div class="order-sidebar-client-gst">GST: {order.gstNumber}</div>
            {/if}
            <div class="text-muted mt-1" style="font-size:11px;">No contacts linked.</div>
          </div>
        {:else}
          <div class="order-sidebar-empty-state">
            <i class="ti ti-link-off"></i>
            <span>No client linked to this order.</span>
          </div>
        {/if}
      </div>

      <!-- Assigned Users -->
      <div class="order-sidebar-section">
        <div class="order-sidebar-section-head">
          <i class="ti ti-users"></i>
          <span>Assigned Users</span>
          <a
            on:click={() => setAssignedUsers()}
            href="#tag"
            class="btn btn-xs btn-outline-primary ms-auto"
            data-bs-toggle="modal"
            data-bs-target="#add_contact"
          >
            <i class="ti ti-plus me-1"></i>Add
          </a>
        </div>

        {#if order.assignedUsers?.some((u) => u.status === "banned")}
          <div
            class="alert alert-danger py-1 px-2 mb-2 d-flex align-items-center gap-1 order-sidebar-alert"
          >
            <i class="ti ti-alert-triangle"></i>
            <span>Some users are <strong>banned</strong> — consider reassigning.</span>
          </div>
        {/if}
        {#if order.assignedUsers?.some((u) => u.status === "inactive")}
          <div
            class="alert alert-warning py-1 px-2 mb-2 d-flex align-items-center gap-1 order-sidebar-alert"
          >
            <i class="ti ti-alert-circle"></i>
            <span>Some users are <strong>inactive</strong>.</span>
          </div>
        {/if}

        {#if order.assignedUsers?.length > 0}
          {#each order.assignedUsers as assignedUser}
            <div class="order-sidebar-user">
              <span class="avatar avatar-xs rounded-circle flex-shrink-0">
                <img
                  src="/assets/img/profiles/user.png"
                  alt=""
                  class="img-fluid rounded-circle w-auto h-auto"
                />
              </span>
              <span class="order-sidebar-user-name">{maskAssignedName(assignedUser)}</span>
              {#if assignedUser?.status === "banned"}
                <span class="badge bg-danger order-sidebar-badge">Banned</span>
              {:else if assignedUser?.status === "inactive"}
                <span class="badge bg-secondary order-sidebar-badge">Inactive</span>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="order-sidebar-empty mb-0">No users assigned.</p>
        {/if}

        <div class="order-sidebar-meta-list order-sidebar-audit mt-3">
          <div class="order-sidebar-row">
            <span class="order-sidebar-label"><i class="ti ti-history"></i>Last Modified</span>
            <span class="order-sidebar-value">
              {order?.updatedAt &&
                convertDate(order?.updatedAt, {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
            </span>
          </div>
          {#if order?.assignedUsers?.[0]?.name}
            <div class="order-sidebar-row">
              <span class="order-sidebar-label"><i class="ti ti-user-edit"></i>Modified By</span>
              <span class="order-sidebar-value">{maskAssignedName(order.assignedUsers[0])}</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Description Section -->
      {#if order?.description}
        <div class="order-sidebar-section" style="border-bottom:none;">
          <div
            class="order-sidebar-section-head"
            style="cursor:pointer;"
            on:click={() => (descCollapsed = !descCollapsed)}
          >
            <i class="ti ti-align-left"></i>
            <span>Description</span>
            <i
              class="ti {descCollapsed ? 'ti-chevron-down' : 'ti-chevron-up'} ms-auto text-muted"
              style="font-size:12px;"
            ></i>
          </div>
          {#if !descCollapsed}
            <div
              bind:this={orderDescEl}
              style="font-size:12px;line-height:1.6;padding:8px 12px;max-height:350px;overflow-y:auto;overflow-x:auto;"
            >
              {#if isHtml(order.description)}
                {@html safeHtml(order.description)}
              {:else}
                <pre
                  style="white-space:pre-wrap;font-family:inherit;margin:0;">{order.description}</pre>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
      <!-- /Description Section -->
    </div>
  </div>
</div>

<!-- /Contact Sidebar -->

<style>
  .order-sidebar {
    border: none;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
    overflow: hidden;
  }
  .order-sidebar-section {
    padding: 1rem 1.125rem;
    border-bottom: 1px solid #eef1f4;
  }
  .order-sidebar-section:last-child {
    border-bottom: none;
  }
  .order-sidebar-section-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.875rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #344767;
  }
  .order-sidebar-section-head > i {
    color: var(--bs-primary, #3554d1);
    font-size: 1rem;
    line-height: 1;
  }
  .order-sidebar-actions {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    justify-content: flex-end;
  }
  .order-sidebar-meta-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .order-sidebar-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.4;
    padding: 5px 0;
  }
  .order-sidebar-label {
    color: #6c757d;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    max-width: 52%;
  }
  .order-sidebar-label i {
    font-size: 0.875rem;
    opacity: 0.8;
  }
  .order-sidebar-value {
    color: #212529;
    text-align: right;
    word-break: break-word;
  }
  .order-sidebar-expand {
    text-align: right;
    margin-top: 1rem;
    padding-top: 0.25rem;
  }
  .order-sidebar-client-card {
    background: #f8fafc;
    border: 1px solid #e8edf2;
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .order-sidebar-client-name {
    display: block;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--bs-primary, #3554d1);
    text-decoration: none;
    line-height: 1.35;
  }
  .order-sidebar-client-name:hover {
    text-decoration: underline;
  }
  .order-sidebar-client-gst {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6c757d;
  }
  .order-sidebar-contact {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: #fff;
    border: 1px solid #e8edf2;
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .order-sidebar-contact-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #212529;
    line-height: 1.35;
  }
  .order-sidebar-contact-role {
    font-size: 0.6875rem;
    font-weight: 400;
    color: #6c757d;
    margin-left: 0.125rem;
  }
  .order-sidebar-contact-detail {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: #6c757d;
    margin-top: 0.2rem;
    text-decoration: none;
    word-break: break-all;
  }
  .order-sidebar-contact-detail:hover {
    color: var(--bs-primary, #3554d1);
  }
  .order-sidebar-contact-actions {
    display: flex;
    gap: 0.125rem;
    flex-shrink: 0;
  }
  .order-sidebar-empty {
    font-size: 0.8125rem;
    color: #6c757d;
    font-style: italic;
  }
  .order-sidebar-empty-state {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f8fafc;
    border: 1px dashed #dee2e6;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    color: #6c757d;
  }
  .order-sidebar-empty-state i {
    font-size: 1.125rem;
    opacity: 0.65;
  }
  .order-sidebar-chip-section {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px dashed #e8edf2;
  }
  .order-sidebar-chip-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #6c757d;
    margin-bottom: 0.5rem;
  }
  .order-sidebar-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .order-sidebar-user {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0;
    font-size: 0.8125rem;
  }
  .order-sidebar-user-name {
    font-weight: 500;
    color: #212529;
  }
  .order-sidebar-badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.2em 0.45em;
  }
  .order-sidebar-alert {
    font-size: 0.75rem;
  }
  .order-sidebar-audit {
    padding-top: 0.75rem;
    border-top: 1px dashed #e8edf2;
  }
  .ribbon {
    position: absolute;
    overflow: hidden;
    width: 75px;
    height: 75px;
    z-index: 99;
  }
  .ribbon-top-right {
    top: -3px;
    right: -3px;
  }
  .ribbon-top-left {
    top: -3px;
    left: -3px;
  }
  .ribbon span {
    position: absolute;
    display: block;
    width: 100px;
    padding: 4px 0;
    color: #fff;
    font-size: 8px;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  }
  .ribbon-top-left span {
    left: -25px;
    top: 15px;
    transform: rotate(-45deg);
  }
</style>
