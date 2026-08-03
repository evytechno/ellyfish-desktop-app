<script>
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { onMount } from "svelte";

  let loadingData = true;
  let firstLoad = false;
  let currentUser;
  let trashBin = false;

  let clients = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let searchTerm = "";

  // Quick view drawer
  let drawerOpen = false;
  let drawerLoading = false;
  let drawerClient = null;

  onMount(() => {
    currentUser = checkAuth();
    if (currentUser?.role !== "master") {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    fetchClients();
    setTimeout(() => { firstLoad = true; }, 500);
  });

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try { await fetchClients(); }
      catch (e) {}
      finally { refresh = false; }
    }, 200);
  }

  async function fetchClients() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
        search: searchTerm || "",
      });
      if (trashBin) query.append("withDeleted", "true");

      const data = await authApiFetch(`${API_ROUTES.CLIENT}?${query.toString()}`, { method: "GET" });
      clients = data.data || [];
      totalItems = data.total ?? clients.length;
    } catch (error) {
      errorHandle(error);
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${day}-${month}-${year} ${String(h).padStart(2, "0")}:${m} ${ampm}`;
  }

  function formatShortDate(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "—";
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  }

  async function openQuickView(id) {
    drawerOpen = true;
    drawerLoading = true;
    drawerClient = null;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/${id}`, { method: "GET" });
      drawerClient = res.data;
    } catch (err) {
      errorHandle(err);
      drawerOpen = false;
    } finally {
      drawerLoading = false;
    }
  }

  function closeQuickView() {
    drawerOpen = false;
    drawerClient = null;
  }

  function maskMobile(m) {
    if (!m) return "—";
    const s = String(m).replace(/\s/g, "");
    if (s.length <= 4) return s;
    return "•".repeat(s.length - 4) + s.slice(-4);
  }

  function maskEmail(e) {
    if (!e) return "—";
    const [user, domain] = String(e).split("@");
    if (!domain) return e;
    const visible =
      user.length > 2
        ? user[0] + "•".repeat(user.length - 2) + user.slice(-1)
        : user[0] + "•";
    return `${visible}@${domain}`;
  }

  let revealed = {}; // { [key]: true } — used by quick view
  function isRevealed(key) {
    return !!revealed[key];
  }
  function toggleReveal(key) {
    revealed = { ...revealed, [key]: !revealed[key] };
  }
  function displaySensitive(key, value, kind) {
    if (!value) return "—";
    if (isRevealed(key)) return value;
    return kind === "email" ? maskEmail(value) : maskMobile(value);
  }

  function applyRevealDom(wrap, open) {
    if (!wrap) return;
    const full = wrap.querySelector(".client-copy-btn")?.dataset.copy || "";
    const kind = wrap.dataset.kind === "email" ? "email" : "mobile";
    const textEl = wrap.querySelector(".client-copy-text");
    const revealBtn = wrap.querySelector(".client-reveal-btn");
    const icon = revealBtn?.querySelector("i");
    if (open) {
      wrap.classList.remove("client-copy-wrap--masked");
      if (textEl) {
        textEl.textContent = full;
        textEl.setAttribute("title", full);
      }
      if (icon) icon.className = "ti ti-eye-off text-muted";
      if (revealBtn) revealBtn.title = "Hide";
    } else {
      wrap.classList.add("client-copy-wrap--masked");
      if (textEl) {
        textEl.textContent = kind === "email" ? maskEmail(full) : maskMobile(full);
        textEl.removeAttribute("title");
      }
      if (icon) icon.className = "ti ti-eye text-muted";
      if (revealBtn) revealBtn.title = "Show";
    }
  }

  function handleTableClick(e) {
    const revealBtn = e.target.closest(".client-reveal-btn");
    if (revealBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = revealBtn.closest(".client-copy-wrap");
      const key = revealBtn.dataset.key;
      const willOpen = wrap?.classList.contains("client-copy-wrap--masked");
      applyRevealDom(wrap, willOpen);
      if (key) revealed = { ...revealed, [key]: !!willOpen };
      return;
    }
    const copyBtn = e.target.closest(".client-copy-btn");
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const value = copyBtn.dataset.copy;
      if (!value) return;
      copyField(copyBtn.dataset.key || value, value).then(() => {
        const icon = copyBtn.querySelector("i");
        if (icon) {
          icon.className = "ti ti-check text-success";
          setTimeout(() => { icon.className = "ti ti-copy text-muted"; }, 1500);
        }
      });
      return;
    }
    const btn = e.target.closest(".client-qv-open");
    if (btn) {
      e.preventDefault();
      const id = Number(btn.dataset.id);
      if (id) openQuickView(id);
    }
  }

  let copiedFieldKey = "";
  let copyTimeout;
  async function copyField(key, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      copiedFieldKey = key;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copiedFieldKey = ""; }, 1500);
    } catch (_) {}
  }

  /** Table cells always start masked; eye toggles via DOM (no full re-render). */
  function sensitiveCellHtml(key, value, kind) {
    if (!value) return "—";
    const masked = kind === "email" ? maskEmail(value) : maskMobile(value);
    return `<span class="client-copy-wrap client-copy-wrap--masked" data-kind="${kind}">
      <span class="client-copy-text">${escapeHtml(masked)}</span>
      <button type="button" class="client-reveal-btn btn btn-link p-0" data-key="${escapeHtml(key)}" title="Show">
        <i class="ti ti-eye text-muted"></i>
      </button>
      <button type="button" class="client-copy-btn btn btn-link p-0" data-key="${escapeHtml(key)}" data-copy="${escapeHtml(value)}" title="${kind === "email" ? "Copy email" : "Copy mobile"}">
        <i class="ti ti-copy text-muted"></i>
      </button>
    </span>`;
  }

  let columns = [
    {
      key: "name",
      label: "Company Name",
      render: (val, row) =>
        `<button type="button" class="client-qv-open btn btn-link p-0 text-danger fw-semibold text-decoration-none d-inline-flex align-items-center gap-1" data-id="${row.id}">
          <i class="ti ti-building-store"></i>${escapeHtml(row.name)}
        </button>`,
    },
    { key: "gstNumber", label: "GST Number", render: (val) => val || "—" },
    {
      key: "mobile",
      label: "Mobile",
      render: (val, row) => sensitiveCellHtml(`mobile-${row.id}`, val, "mobile"),
    },
    {
      key: "email",
      label: "Email",
      render: (val, row) => sensitiveCellHtml(`email-${row.id}`, val, "email"),
    },
    {
      key: "contacts",
      label: "Contacts",
      render: (val, row) =>
        `<span class="badge bg-info text-white">${row.contacts?.length ?? 0}</span>`,
    },
    {
      key: "createdAt",
      label: "Created At",
      render: (val) => formatDate(val),
    },
  ];
  let actions = [
    {
      label: "Quick View",
      icon: "ti ti-eye",
      onClick: (id) => openQuickView(id),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteRecord(id),
      color: "btn-soft-danger",
    },
  ];

  async function deleteRecord(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to archive this client?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, archive it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.CLIENT}/${id}`, { method: "DELETE" });
          clients = clients.filter((c) => c.id !== id);
          if (drawerClient?.id === id) closeQuickView();
          Swal.fire("Archived!", data.message, "success");
        } catch (err) {
          errorHandle(err);
        }
      }
    });
  }

  $: [searchTerm, currentPage, rowsPerPage, trashBin], checkFetchRecord();
  function checkFetchRecord() {
    if (firstLoad) fetchClients();
  }
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper client-page">
  <div class="content pb-0">

    <!-- Page Header -->
    <div class="client-page-header mb-3">
      <div>
        <h4 class="mb-1 client-page-title">Clients</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Clients</li>
          </ol>
        </nav>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <a
          href="#refresh"
          on:click|preventDefault={refreshPage}
          class="btn btn-icon btn-sm btn-outline-light shadow"
          title="Refresh"
        ><i class="ti ti-refresh"></i></a>
        <a
          href="#collapse-header"
          class="btn btn-icon btn-sm btn-outline-light shadow"
          id="collapse-header"
          title="Collapse"
        ><i class="ti ti-transition-top"></i></a>
      </div>
    </div>

    <!-- Card -->
    <div class="card border-0 rounded-0 client-list-card">
      <div class="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap py-2">
        {#if trashBin}
          <button type="button" class="btn btn-sm btn-link text-decoration-none p-0" on:click={() => (trashBin = false)}>
            <i class="ti ti-arrow-narrow-left me-1"></i>Back
          </button>
        {:else}
          <h5 class="mb-0 client-section-title">Clients List</h5>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            {#if currentUser?.role === "master"}
              <button
                type="button"
                on:click={() => (trashBin = true)}
                class="btn btn-sm btn-primary"
                title="Archived clients"
              >
                <i class="ti ti-trash"></i>
              </button>
            {/if}
            <a href="/admin/client/add" class="btn btn-sm btn-primary">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add Client
            </a>
          </div>
        {/if}
      </div>

      <div class="card-body" on:click={handleTableClick}>
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...clients]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
          serverMode={true}
          on:pageChange={(e) => (currentPage = e.detail)}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; }}
          on:search={(e) => { searchTerm = e.detail; currentPage = 1; }}
        />
      </div>
    </div>

  </div>
</div>

<!-- Quick View Drawer -->
{#if drawerOpen}
  <div class="client-qv-backdrop" on:click={closeQuickView} on:keydown={(e) => e.key === "Escape" && closeQuickView()} role="button" tabindex="-1"></div>
{/if}
<aside
  class="client-qv-drawer client-page"
  class:client-qv-drawer--open={drawerOpen}
  aria-hidden={!drawerOpen}
>
  <div class="client-qv-header">
    <div class="client-qv-header-text">
      <div class="client-qv-eyebrow">Quick View</div>
      <h5 class="mb-0 client-section-title text-truncate" title={drawerClient?.name || ""}>
        {drawerClient?.name || (drawerLoading ? "Loading…" : "Client")}
      </h5>
    </div>
    <button type="button" class="btn-close" on:click={closeQuickView} aria-label="Close"></button>
  </div>

  <div class="client-qv-body">
    {#if drawerLoading}
      <div class="client-qv-loading text-muted">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Loading client…
      </div>
    {:else if drawerClient}
      <!-- Company -->
      <div class="client-qv-section">
        <div class="client-qv-section-title">Company</div>
        <dl class="client-qv-dl">
          <div class="client-qv-row">
            <dt>GST</dt>
            <dd>{drawerClient.gstNumber || "—"}</dd>
          </div>
          <div class="client-qv-row">
            <dt>Mobile</dt>
            <dd class="client-qv-value">
              {#if drawerClient.mobile}
                <span class:client-masked={!isRevealed("qv-mobile")}>{displaySensitive("qv-mobile", drawerClient.mobile, "mobile")}</span>
                <button
                  type="button"
                  class="client-copy-btn-svelte"
                  title={isRevealed("qv-mobile") ? "Hide" : "Show"}
                  on:click={() => toggleReveal("qv-mobile")}
                >
                  <i class="ti {isRevealed('qv-mobile') ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                </button>
                <button
                  type="button"
                  class="client-copy-btn-svelte"
                  title="Copy mobile"
                  on:click={() => copyField("qv-mobile", drawerClient.mobile)}
                >
                  <i class="ti {copiedFieldKey === 'qv-mobile' ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                </button>
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div class="client-qv-row">
            <dt>Email</dt>
            <dd class="client-qv-value">
              {#if drawerClient.email}
                <span class="text-break" class:client-masked={!isRevealed("qv-email")}>{displaySensitive("qv-email", drawerClient.email, "email")}</span>
                <button
                  type="button"
                  class="client-copy-btn-svelte"
                  title={isRevealed("qv-email") ? "Hide" : "Show"}
                  on:click={() => toggleReveal("qv-email")}
                >
                  <i class="ti {isRevealed('qv-email') ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                </button>
                <button
                  type="button"
                  class="client-copy-btn-svelte"
                  title="Copy email"
                  on:click={() => copyField("qv-email", drawerClient.email)}
                >
                  <i class="ti {copiedFieldKey === 'qv-email' ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                </button>
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div class="client-qv-row">
            <dt>WhatsApp</dt>
            <dd>{drawerClient.whatsapp || "—"}</dd>
          </div>
          <div class="client-qv-row">
            <dt>Address</dt>
            <dd class="text-break">{drawerClient.address || "—"}</dd>
          </div>
          {#if drawerClient.remark}
            <div class="client-qv-row">
              <dt>Remark</dt>
              <dd class="text-break">{drawerClient.remark}</dd>
            </div>
          {/if}
          <div class="client-qv-row">
            <dt>Created</dt>
            <dd>{formatDate(drawerClient.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <!-- Contacts -->
      <div class="client-qv-section">
        <div class="client-qv-section-title">
          Contacts
          <span class="badge bg-info text-white">{drawerClient.contacts?.length ?? 0}</span>
        </div>
        {#if drawerClient.contacts?.length}
          <ul class="client-qv-list">
            {#each drawerClient.contacts as c}
              <li class="client-qv-contact">
                <div class="fw-semibold">{c.name}{#if c.designation}<span class="text-muted fw-normal"> · {c.designation}</span>{/if}</div>
                <div class="client-qv-contact-meta text-muted">
                  {#if c.mobile}
                    <span class="client-qv-value">
                      <i class="ti ti-phone me-1"></i>
                      <span class:client-masked={!isRevealed(`c-mobile-${c.id}`)}>{displaySensitive(`c-mobile-${c.id}`, c.mobile, "mobile")}</span>
                      <button
                        type="button"
                        class="client-copy-btn-svelte"
                        title={isRevealed(`c-mobile-${c.id}`) ? "Hide" : "Show"}
                        on:click={() => toggleReveal(`c-mobile-${c.id}`)}
                      >
                        <i class="ti {isRevealed(`c-mobile-${c.id}`) ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                      </button>
                      <button
                        type="button"
                        class="client-copy-btn-svelte"
                        title="Copy mobile"
                        on:click={() => copyField(`c-mobile-${c.id}`, c.mobile)}
                      >
                        <i class="ti {copiedFieldKey === `c-mobile-${c.id}` ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                      </button>
                    </span>
                  {/if}
                  {#if c.email}
                    <span class="client-qv-value">
                      <i class="ti ti-mail me-1"></i>
                      <span class:client-masked={!isRevealed(`c-email-${c.id}`)}>{displaySensitive(`c-email-${c.id}`, c.email, "email")}</span>
                      <button
                        type="button"
                        class="client-copy-btn-svelte"
                        title={isRevealed(`c-email-${c.id}`) ? "Hide" : "Show"}
                        on:click={() => toggleReveal(`c-email-${c.id}`)}
                      >
                        <i class="ti {isRevealed(`c-email-${c.id}`) ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                      </button>
                      <button
                        type="button"
                        class="client-copy-btn-svelte"
                        title="Copy email"
                        on:click={() => copyField(`c-email-${c.id}`, c.email)}
                      >
                        <i class="ti {copiedFieldKey === `c-email-${c.id}` ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                      </button>
                    </span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted mb-0 client-qv-empty">No contacts</p>
        {/if}
      </div>

      <!-- Orders -->
      <div class="client-qv-section">
        <div class="client-qv-section-title">
          Orders
          <span class="badge bg-primary">{drawerClient.orders?.length ?? 0}</span>
        </div>
        {#if drawerClient.orders?.length}
          <ul class="client-qv-list">
            {#each drawerClient.orders.slice(0, 8) as o}
              <li class="client-qv-order">
                <a href="/admin/order/{o.id}" class="client-qv-order-link">
                  <span class="fw-semibold text-truncate">#{o.pId ?? o.id} — {o.title || "Untitled"}</span>
                  <span class="text-muted">{formatShortDate(o.orderDate || o.createdAt)}</span>
                </a>
              </li>
            {/each}
          </ul>
          {#if drawerClient.orders.length > 8}
            <p class="text-muted mb-0 client-qv-empty">+{drawerClient.orders.length - 8} more on full page</p>
          {/if}
        {:else}
          <p class="text-muted mb-0 client-qv-empty">No orders</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if drawerClient && !drawerLoading}
    <div class="client-qv-footer">
      <a href="/admin/client/{drawerClient.id}" class="btn btn-sm btn-primary flex-fill">
        <i class="ti ti-external-link me-1"></i>Open Full
      </a>
      <a href="/admin/client-visit/add?clientId={drawerClient.id}" class="btn btn-sm btn-success flex-fill">
        <i class="ti ti-map-pin me-1"></i>Visit
      </a>
    </div>
  {/if}
</aside>

<style>
  .client-page {
    font-size: var(--app-font-size, 0.75rem);
    line-height: var(--app-line-height, 1.45);
  }

  .client-page :global(.content),
  .client-page :global(.card-body),
  .client-page :global(.card-header),
  .client-page :global(.breadcrumb),
  .client-page :global(.form-control),
  .client-page :global(.form-select),
  .client-page :global(.form-control-sm),
  .client-page :global(.form-select-sm),
  .client-page :global(.btn),
  .client-page :global(.btn-sm),
  .client-page :global(table),
  .client-page :global(th),
  .client-page :global(td),
  .client-page :global(.dataTables_wrapper),
  .client-page :global(.dataTables_info),
  .client-page :global(.dataTables_paginate),
  .client-page :global(.pagination),
  .client-page :global(.page-link),
  .client-page :global(input),
  .client-page :global(select) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  .client-page :global(.text-sm),
  .client-page :global(.text-xs),
  .client-page :global(.uppercase) {
    font-size: var(--app-font-size, 0.75rem) !important;
  }

  .client-page :global(.text-muted),
  .client-page :global(small),
  .client-page :global(.badge) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .client-page :global(thead th) {
    font-size: var(--app-font-size, 0.75rem) !important;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.35 !important;
  }

  .client-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .client-page-title {
    font-size: var(--app-font-size-xl, 1rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .client-section-title {
    font-size: var(--app-font-size-lg, 0.875rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .client-list-card :global(th),
  .client-list-card :global(td) {
    padding: 0.4rem 0.55rem;
    vertical-align: middle;
  }

  .client-list-card :global(th.ddt-sn),
  .client-list-card :global(td.ddt-sn) {
    width: 56px !important;
    min-width: 52px !important;
    max-width: 64px !important;
    text-align: center;
    padding-left: 0.35rem !important;
    padding-right: 0.35rem !important;
  }

  .client-list-card :global(.client-copy-wrap) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-width: 118px;
  }

  .client-list-card :global(.client-copy-text) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }

  .client-list-card :global(.client-copy-btn),
  .client-list-card :global(.client-reveal-btn) {
    flex-shrink: 0;
    line-height: 1;
    opacity: 0.55;
  }

  .client-list-card :global(.client-copy-btn:hover),
  .client-list-card :global(.client-reveal-btn:hover) {
    opacity: 1;
  }

  .client-list-card :global(.client-copy-btn i),
  .client-list-card :global(.client-reveal-btn i) {
    font-size: 12px;
  }

  .client-list-card :global(.client-copy-wrap--masked .client-copy-text) {
    letter-spacing: 0.04em;
    color: #6c757d;
  }

  .client-masked {
    letter-spacing: 0.04em;
    color: #6c757d;
  }

  .client-qv-value {
    display: inline-flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }

  .client-copy-btn-svelte {
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    line-height: 1;
    cursor: pointer;
    opacity: 0.55;
  }

  .client-copy-btn-svelte:hover {
    opacity: 1;
  }

  .client-copy-btn-svelte :global(i) {
    font-size: 12px;
  }

  /* ── Quick View Drawer ─────────────────────────────────── */
  .client-qv-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(0, 0, 0, 0.28);
  }

  .client-qv-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 1050;
    width: min(400px, 100vw);
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fff;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
    transform: translateX(100%);
    transition: transform 0.25s ease;
    pointer-events: none;
  }

  .client-qv-drawer--open {
    transform: translateX(0);
    pointer-events: auto;
  }

  .client-qv-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #e9ecef;
    flex-shrink: 0;
  }

  .client-qv-header-text {
    min-width: 0;
    flex: 1;
  }

  .client-qv-eyebrow {
    font-size: var(--app-font-size-sm, 0.6875rem);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6c757d;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .client-qv-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 20px;
  }

  .client-qv-loading {
    display: flex;
    align-items: center;
    padding: 24px 0;
  }

  .client-qv-section {
    margin-bottom: 18px;
  }

  .client-qv-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6c757d;
    padding-bottom: 6px;
    margin-bottom: 10px;
    border-bottom: 1px solid #f1f3f5;
  }

  .client-qv-dl {
    margin: 0;
  }

  .client-qv-row {
    display: grid;
    grid-template-columns: 88px 1fr;
    gap: 8px;
    padding: 5px 0;
    align-items: start;
  }

  .client-qv-row dt {
    margin: 0;
    color: #6c757d;
    font-weight: 500;
  }

  .client-qv-row dd {
    margin: 0;
    font-weight: 500;
  }

  .client-qv-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .client-qv-contact,
  .client-qv-order {
    padding: 8px 10px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
  }

  .client-qv-contact-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 3px;
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .client-qv-order-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    text-decoration: none;
    color: inherit;
  }

  .client-qv-order-link:hover .fw-semibold {
    color: var(--bs-primary);
  }

  .client-qv-empty {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .client-qv-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e9ecef;
    flex-shrink: 0;
    background: #fff;
  }
</style>
