<script>
  import { onMount } from "svelte";
  import Swal from "sweetalert2";
  import { checkAuth } from "$lib/utils/auth";

  let currentUser = null;

  /**
   * Column layout: each group = one column of frequently used pages.
   * Click → go straight to that route.
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
        },
        {
          href: "/admin/order-list/completed",
          label: "Completed",
          hint: "Finished orders",
          icon: "ti ti-circle-check",
        },
        {
          href: "/admin/sample-delay-remarks",
          label: "Delay Remarks",
          hint: "Sample delay notes",
          icon: "ti ti-alert-triangle",
          roles: ["master", "admin"],
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
        },
        {
          href: "/admin/order/won",
          label: "Won",
          hint: "Deal won",
          icon: "ti ti-trophy",
        },
        {
          href: "/admin/order/last-activity",
          label: "No Follow Up",
          hint: "Needs attention",
          icon: "ti ti-clock-exclamation",
        },
        {
          href: "/admin/order/lost",
          label: "Lost",
          hint: "Deal lost",
          icon: "ti ti-x",
        },
        {
          href: "/admin/order-list/excel",
          label: "Excel list",
          hint: "Order spreadsheet view",
          icon: "ti ti-file-spreadsheet",
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
        },
        {
          href: "/admin/client",
          label: "Clients",
          hint: "Client master",
          icon: "ti ti-building-store",
        },
        {
          href: "/admin/payment",
          label: "Employee Expenses",
          hint: "Payments / expenses",
          icon: "ti ti-wallet",
        },
        {
          href: "/admin/feedback",
          label: "Feedback",
          hint: "Order feedback",
          icon: "ti ti-message-star",
        },
        {
          href: "/admin/group-chat",
          label: "Group Chat",
          hint: "Team chats",
          icon: "ti ti-messages",
        },
        {
          href: "/admin/query",
          label: "Queries",
          hint: "Support queries",
          icon: "ti ti-help-circle",
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
          hint: "Company master",
          icon: "ti ti-building",
        },
        {
          href: "/admin/category",
          label: "Categories",
          hint: "Order categories",
          icon: "ti ti-category",
        },
        {
          href: "/admin/setting",
          label: "Settings",
          hint: "System settings",
          icon: "ti ti-settings",
        },
        {
          href: "/admin/reports/user-activity",
          label: "User Activity",
          hint: "Activity report",
          icon: "ti ti-chart-bar",
        },
        {
          href: "/admin/reports/pi-sales",
          label: "PI Sales",
          hint: "Invoice sales report",
          icon: "ti ti-report-money",
        },
      ],
    },
  ];

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

  function visibleItems(items) {
    const role = currentUser?.role;
    return items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(role);
    });
  }
</script>

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <div class="d-flex align-items-center gap-2 mb-1">
        <h4 class="mb-0">Shortcuts</h4>
        <span class="badge bg-soft-primary text-primary">Manager</span>
      </div>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">Shortcuts</li>
        </ol>
      </nav>
      <p class="text-muted mb-0 mt-2 text-sm" style="max-width: 40rem;">
        Most-used pages in columns — click any link to open it directly.
      </p>
    </div>

    <div class="row g-3 g-xl-4">
      {#each columns as col}
        {@const items = visibleItems(col.items)}
        {#if items.length}
          <div class="col-12 col-md-6 col-xl-3">
            <div class="shortcut-col">
              <div class="shortcut-col-head">{col.title}</div>
              <div class="shortcut-col-body">
                {#each items as item}
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
        {/if}
      {/each}
    </div>
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
