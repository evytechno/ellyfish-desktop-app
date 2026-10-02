<script>
  import { onMount } from "svelte";
  import Swal from "sweetalert2";
  import { checkAuth, canAccess } from "$lib/utils/auth";

  let currentUser = null;

  /**
   * Column layout: each group = one column of frequently used pages.
   * `module` → canAccess module key (admin permissions).
   * `roles` → optional role allow-list (same as sidebar).
   */
  const columns = [
    {
      title: "Install ops",
      items: [
        {
          href: "/admin/installation",
          label: "Installation queue",
          hint: "Crew / Head / close-out",
          icon: "ti ti-tool",
          module: "installation",
        },
        {
          href: "/admin/order-list/completed",
          label: "Completed",
          hint: "Finished orders",
          icon: "ti ti-circle-check",
          module: "orders",
        },
        {
          href: "/admin/sample-delay-remarks",
          label: "Delay Remarks",
          hint: "Sample delay notes",
          icon: "ti ti-alert-triangle",
          roles: ["master", "admin"],
          module: "orders",
        },
      ],
    },
    {
      title: "Orders",
      items: [
        {
          href: "/admin/order",
          label: "All orders",
          hint: "Full order list",
          icon: "ti ti-shopping-cart",
          module: "orders",
        },
        {
          href: "/admin/order/won",
          label: "Won",
          hint: "Deal won",
          icon: "ti ti-trophy",
          module: "orders",
        },
        {
          href: "/admin/order/last-activity",
          label: "No Follow Up",
          hint: "Needs attention",
          icon: "ti ti-clock-exclamation",
          module: "orders",
        },
        {
          href: "/admin/order/lost",
          label: "Lost",
          hint: "Deal lost",
          icon: "ti ti-x",
          module: "orders",
        },
        {
          href: "/admin/order-list/excel",
          label: "Excel list",
          hint: "Order spreadsheet view",
          icon: "ti ti-file-spreadsheet",
          module: "orders",
        },
      ],
    },
    {
      title: "CRM",
      items: [
        {
          href: "/admin/invoice",
          label: "Invoice (PI)",
          hint: "Proforma invoices",
          icon: "ti ti-invoice",
          module: "invoices",
        },
        {
          href: "/admin/client",
          label: "Clients",
          hint: "Client master",
          icon: "ti ti-building-store",
          module: "clients",
        },
        {
          href: "/admin/payment",
          label: "Employee Expenses",
          hint: "Payments / expenses",
          icon: "ti ti-wallet",
          module: "user_payments",
        },
        {
          href: "/admin/feedback",
          label: "Feedback",
          hint: "Order feedback",
          icon: "ti ti-message-star",
          module: "feedback",
        },
        {
          href: "/admin/group-chat",
          label: "Group Chat",
          hint: "Team chats",
          icon: "ti ti-messages",
          module: "group_chat",
        },
        {
          href: "/admin/query",
          label: "Queries",
          hint: "Support queries",
          icon: "ti ti-help-circle",
          module: "queries",
        },
      ],
    },
    {
      title: "People & setup",
      items: [
        {
          href: "/admin/user",
          label: "Users",
          hint: "CRM users",
          icon: "ti ti-user",
          module: "users",
        },
        {
          href: "/admin/app-user",
          label: "App Users",
          hint: "ShipMate logins",
          icon: "ti ti-device-mobile",
          roles: ["master"],
        },
        {
          href: "/admin/company",
          label: "Companies",
          hint: "Company master (list/add/edit)",
          icon: "ti ti-building",
          roles: ["master"],
        },
        {
          href: "/admin/category",
          label: "Categories",
          hint: "Order categories",
          icon: "ti ti-category",
          module: "category",
        },
        {
          href: "/admin/setting",
          label: "Settings",
          hint: "System settings",
          icon: "ti ti-settings",
          roles: ["master"],
        },
        {
          href: "/admin/reports/user-activity",
          label: "User Activity",
          hint: "Activity report",
          icon: "ti ti-chart-bar",
          roles: ["master", "admin"],
          module: "reports",
        },
        {
          href: "/admin/reports/pi-sales",
          label: "PI Sales",
          hint: "Invoice sales report",
          icon: "ti ti-report-money",
          roles: ["master", "admin"],
          module: "pi_sales",
        },
      ],
    },
  ];

  /** Sync on load so columns render (not only after onMount). */
  currentUser = typeof window !== "undefined" ? checkAuth() : null;

  onMount(() => {
    currentUser = checkAuth();
    if (!["master", "admin", "manager"].includes(currentUser?.role)) {
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "Shortcuts are for master / admin / manager.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
    }
  });

  function itemAllowed(item, user) {
    if (!user) return false;
    if (item.roles && !item.roles.includes(user.role)) return false;
    if (item.module && !canAccess(item.module, "view", user)) return false;
    return true;
  }

  $: visibleColumns = columns
    .map((col) => ({
      ...col,
      items: col.items.filter((item) => itemAllowed(item, currentUser)),
    }))
    .filter((col) => col.items.length > 0);

  $: roleLabel =
    currentUser?.role === "master"
      ? "Master"
      : currentUser?.role === "admin"
        ? "Admin"
        : currentUser?.role === "manager"
          ? "Manager"
          : currentUser?.role || "";
</script>

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <div class="d-flex align-items-center gap-2 mb-1">
        <h4 class="mb-0">Shortcuts</h4>
        {#if roleLabel}
          <span class="badge bg-soft-primary text-primary">{roleLabel}</span>
        {/if}
      </div>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">Shortcuts</li>
        </ol>
      </nav>
      <p class="text-muted mb-0 mt-2 text-sm" style="max-width: 40rem;">
        Most-used pages in columns — only links you can access are shown.
      </p>
    </div>

    {#if !currentUser}
      <p class="text-muted text-sm">Loading shortcuts…</p>
    {:else if visibleColumns.length === 0}
      <div class="alert alert-light border mb-0">
        <div class="fw-semibold text-dark mb-1">No shortcuts for your access</div>
        <p class="text-muted small mb-2 mb-md-3">
          Your role can open Shortcuts, but no linked pages match your
          <strong>module permissions</strong>. Ask a master to grant modules under
          <strong>Users → Edit → Module access</strong> (e.g. Orders, Installation, Feedback).
        </p>
        <ul class="small text-muted mb-0 ps-3">
          <li>Master / manager: most pages show by role</li>
          <li>Admin: only modules set to View or Full appear here</li>
        </ul>
      </div>
    {:else}
      <p class="text-muted small mb-3">
        Showing <strong>{visibleColumns.reduce((n, c) => n + c.items.length, 0)}</strong> links
        in <strong>{visibleColumns.length}</strong> groups for your permissions.
      </p>
      <div class="row g-3 g-xl-4">
        {#each visibleColumns as col}
          <div class="col-12 col-md-6 col-xl-3">
            <div class="shortcut-col">
              <div class="shortcut-col-head">
                {col.title}
                <span class="shortcut-col-count">{col.items.length}</span>
              </div>
              <div class="shortcut-col-body">
                {#each col.items as item}
                  <a href={item.href} class="shortcut-link">
                    <span class="shortcut-icon"><i class={item.icon}></i></span>
                    <span class="shortcut-text">
                      <span class="shortcut-label">{item.label}</span>
                      <span class="shortcut-hint">{item.hint}</span>
                    </span>
                    <i class="ti ti-chevron-right shortcut-arrow"></i>
                  </a>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .shortcut-col {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    overflow: hidden;
    height: 100%;
  }
  .shortcut-col-head {
    padding: 0.75rem 1rem;
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #374151;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .shortcut-col-count {
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    background: #e5e7eb;
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
    text-transform: none;
    letter-spacing: 0;
  }
  .shortcut-col-body {
    display: flex;
    flex-direction: column;
    padding: 0.35rem;
  }
  .shortcut-link {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.65rem 0.7rem;
    border-radius: 0.5rem;
    text-decoration: none;
    color: inherit;
    transition: background 0.12s ease;
  }
  .shortcut-link:hover {
    background: #eff6ff;
    color: inherit;
  }
  .shortcut-icon {
    width: 2.1rem;
    height: 2.1rem;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.45rem;
    background: #eff6ff;
    color: #2563eb;
    font-size: 1.05rem;
  }
  .shortcut-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .shortcut-label {
    font-weight: 600;
    font-size: 0.9rem;
    line-height: 1.2;
  }
  .shortcut-hint {
    font-size: 0.72rem;
    color: #6b7280;
    margin-top: 0.1rem;
  }
  .shortcut-arrow {
    color: #9ca3af;
    flex-shrink: 0;
    font-size: 0.95rem;
  }
</style>
