<script>
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { goto } from "$app/navigation";
  import { clearUser, setUser } from "../../stores/userStore";
  import { checkAuth, logoutUser, getAvailableRoles, getRolePermissions, saveSession } from "$lib/utils/auth";
  import { apiFetch } from "$lib/api/client";
  import Swal from "sweetalert2";
  import Notification from "./Notification.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import { settingStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";

  let setting;

  let currentUser;
  let availableRoles = [];
  let rolePermissions = null;

  const SUBROLE_LABELS = { telecaller: "Telecaller", tech: "Tech", tech_helper: "Tech Helper" };

  function roleBadgeLabel(r) {
    const sub = rolePermissions?.[r]?.subRole;
    return sub ? `${r} (${SUBROLE_LABELS[sub] ?? sub})` : r;
  }

  onMount(() => {
    currentUser = checkAuth();
    availableRoles = getAvailableRoles();
    rolePermissions = getRolePermissions();
    fetchSetting();
  });

  async function fetchSetting() {
    const cached = get(settingStore);
    if (cached) {
      setting = cached;
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.SETTING}`);
      setting = data;
      settingStore.set(data);
    } catch (error) {
      errorMessage = "Failed to load setting data.";
      console.error("Fetch error:", error);
      const validationErrors = errorHandle(error);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  const logout = () => {
    Swal.fire({
      title: "Sign Out Confirmation",
      text: "Are you sure you want to sign out this account.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, sign out it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        clearUser();
        logoutUser();
        Swal.fire("Success!", "Sign out successfully.", "success");
        goto("/login");
      }
    });
  };

  const switchRole = () => {
    const otherRoles = availableRoles.filter(r => r !== currentUser?.role);
    const targetRole = otherRoles.length === 1 ? otherRoles[0] : null;

    Swal.fire({
      title: "Switch Role",
      text: targetRole
        ? `Switch to ${targetRole}?`
        : "You will be taken to the role selection screen.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Switch",
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      if (targetRole) {
        // Only 2 roles — switch directly without select-role page
        try {
          const data = await apiFetch(API_ROUTES.SELECT_ROLE, {
            method: "POST",
            data: JSON.stringify({ userId: Number(currentUser?.id), selectedRole: targetRole }),
          });
          await saveSession(data);
          setUser(data.user);
          await Swal.fire("Success!", `Switched to ${targetRole}.`, "success");
          window.location.href = "/admin/dashboard";
        } catch (error) {
          errorHandle(error);
        }
      } else {
        // 3+ roles — go to select-role page
        localStorage.setItem("pending_user_id", String(currentUser?.id));
        goto("/select-role");
      }
    });
  };
  const setOnlineStatus = () => {
    updateOnlineStatus(!setting?.onlineStatus);
  };

  const updateOnlineStatus = (onlineStatus) => {
    Swal.fire({
      title: "Update Online Status",
      text: `Are you sure you want to set your status to "${onlineStatus ? "Online" : "Offline"}"?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, update",
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      try {
        const data = await authApiFetch(`${API_ROUTES.SETTING}/online-status`, {
          method: "PUT",
          data: { status: onlineStatus },
        });
        setting = data.data;
        settingStore.set(data.data);

        Swal.fire("Success!", data.message, "success");
      } catch (err) {
        Swal.fire("Error", errorHandle(err), "error");
      }
    });
  };

  onMount(() => {
    const $ = jQuery;

    // Apply saved sidebar state; default to collapsed (mini-sidebar)
    const sidebarState = localStorage.getItem("screenModeNightTokenState");
    if (sidebarState === "night") {
      $("body").removeClass("mini-sidebar");
      $("#toggle_btn, #toggle_btn2").addClass("active");
      $(".header-left").addClass("active");
    } else {
      $("body").addClass("mini-sidebar");
      $("#toggle_btn, #toggle_btn2").removeClass("active");
      $(".header-left").removeClass("active");
    }

    const collapseHeader = $("#collapse-header");
    if (collapseHeader.length > 0) {
      document
        .getElementById("collapse-header")
        .addEventListener("click", function () {
          this.classList.toggle("active");
          document.body.classList.toggle("header-collapse");
        });
    }

    // $(document).on("click", function (e) {
    //   const dropdown = $(".profile-dropdown");
    //   const menu = dropdown.find(".dropdown-menu");

    //   if (dropdown.is(e.target) || dropdown.has(e.target).length > 0) {
    //     menu.toggleClass("show");
    //   } else {
    //     menu.removeClass("show");
    //   }
    // });

    $(document).on("click", "#toggle_btn, #toggle_btn2", function () {
      const body = $("body");
      const html = $("html");
      const isMini = body.hasClass("mini-sidebar");
      const isFullWidth = html.attr("data-layout") === "full-width";
      const isHidden = html.attr("data-layout") === "hidden";

      if (isMini) {
        body.removeClass("mini-sidebar");
        $(this).addClass("active");
        localStorage.setItem("screenModeNightTokenState", "night");
        setTimeout(() => $(".header-left").addClass("active"), 100);
      } else {
        body.addClass("mini-sidebar");
        $(this).removeClass("active");
        localStorage.removeItem("screenModeNightTokenState");
        setTimeout(() => $(".header-left").removeClass("active"), 100);
      }

      if (isFullWidth) {
        body.addClass("full-width").removeClass("mini-sidebar");
        $(".sidebar-overlay").addClass("opened");
        $(document).on("click", ".sidebar-close", () =>
          $("body").removeClass("full-width"),
        );
      } else {
        body.removeClass("full-width");
      }

      if (isHidden) {
        body.toggleClass("hidden-layout").removeClass("mini-sidebar");
        $(document).on("click", ".sidebar-close", () =>
          $("body").removeClass("full-width"),
        );
      }

      return false;
    });

    $(".btnFullscreen").on("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });

    $(".theme-image").on("click", function () {
      $(".theme-image").removeClass("active");
      $(this).addClass("active");
    });
  });

  let timerText = "";
  let intervalId;

  // Convert IST offset manually (IST = UTC+5:30)
  function getISTDate() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.5 * 60 * 60 * 1000);
  }

  function startCountdown(remainingSeconds) {
    updateDisplay(remainingSeconds);

    intervalId = setInterval(() => {
      remainingSeconds--;

      if (remainingSeconds < 0) {
        clearInterval(intervalId);
        timerText = "";
        sessionCompleted();
      } else {
        updateDisplay(remainingSeconds);
      }
    }, 1000);
  }

  function updateDisplay(seconds) {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    timerText = `Session Expires in : ${minutes}:${secs}`;
  }

  function checkAndStartTimer() {
    const now = getISTDate();

    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    // Use per-user loginEndTime if set, otherwise fall back to global default 18:10
    const endTimeStr = currentUser?.loginEndTime || "18:10";
    const [endH, endM] = endTimeStr.split(":").map(Number);

    // Warning starts 10 minutes before loginEndTime
    const warnH = endM >= 10 ? endH : endH - 1;
    const warnM = endM >= 10 ? endM - 10 : endM + 50;

    // Convert to UTC for comparison (IST = UTC+5:30)
    const warnTime = new Date(
      Date.UTC(year, month, date, warnH - 5, warnM - 30),
    );
    const endTime = new Date(Date.UTC(year, month, date, endH - 5, endM - 30));

    if (now >= warnTime && now < endTime) {
      const remainingMillis = endTime.getTime() - now.getTime();
      const remainingSeconds = Math.floor(remainingMillis / 1000);
      startCountdown(remainingSeconds);
    } else {
      timerText = "";
    }
  }

  function sessionCompleted() {
    clearUser();
    logoutUser();
    Swal.fire("Warning!", "Your Session time is completed.", "error");
    goto("/login");
  }

  onMount(() => {
    checkAndStartTimer();
  });

  let firstLoad = false;
  let inquiryOrders = [];
  let loadingData = true;
  let loading = false;
  let searchTerm = "";
  let headerInput = ""; // separate — only committed on Enter / button click
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let totalPages = 1;
  let openModal = false;
  onMount(() => {
    setTimeout(() => {
      firstLoad = true;
    }, 500);

    const modalEl = document.getElementById("order_lists");
    if (modalEl) {
      // Restore scroll when modal closes normally
      modalEl.addEventListener("hidden.bs.modal", () => {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
        document.body.classList.remove("modal-open");
      });

      // Intercept order link clicks — close modal first, then navigate
      modalEl.addEventListener("click", (e) => {
        const link = e.target.closest("a[data-order-href]");
        if (!link) return;
        e.preventDefault();
        const href = link.getAttribute("data-order-href");
        // click the existing close button to let Bootstrap close properly
        const closeBtn = modalEl.querySelector("[data-bs-dismiss='modal']");
        if (closeBtn) closeBtn.click();
        // after animation completes, navigate
        setTimeout(() => {
          document.body.style.overflow = "";
          document.body.style.paddingRight = "";
          document.body.classList.remove("modal-open");
          goto(href);
        }, 300);
      });
    }
  });

  let debounceTimeout;
  // Used only by the modal input — auto-fetch on type
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchTerm = value;
    }, 300);
  }

  async function fetchOrders() {
    loadingData = true;
    openModal = true;
    const query = new URLSearchParams({
      search: searchTerm,
      page: currentPage.toString(),
      limit: rowsPerPage.toString(),
    });

    try {
      if (searchTerm.trim().length < 4) {
        totalItems = 0;
        totalPages = 1;
        inquiryOrders = [];
      } else {
        const data = await authApiFetch(
          `${API_ROUTES.ORDER}/all-search-for-inquiry?${query.toString()}`,
          { method: "GET" },
        );

        totalItems = data.total;
        totalPages = data.totalPages;
        inquiryOrders = data.data;
      }
    } catch (error) {
      console.error("Fetch error:", error);
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }
  // Only auto-fetch when modal is open (searchTerm changed by modal input typing)
  $: if (firstLoad && openModal) [searchTerm, currentPage, rowsPerPage], fetchOrders();

  function commitAndSearch() {
    // shared logic for both Enter key and button click
    searchTerm = headerInput;
    currentPage = 1;
    fetchOrders();
    setTimeout(() => {
      const input = document.getElementById("modal-search-input");
      if (input) {
        input.focus();
        input.value = searchTerm;
      }
    }, 350);
  }

  function handleSearchKeydown(e) {
    if (e.key === "Enter") {
      searchTerm = headerInput;
      currentPage = 1;
      document.getElementById("header-search-btn")?.click();
    }
  }

  let statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
  };

  $: columns = [
    {
      key: "title",
      label: "Title",
      render: (val, row) => {
        const isMaster = currentUser?.role === "master";
        const isOwnOrder = currentUser?.subRole === "telecaller" &&
          row.assignedUsers?.some((u) => u.id === currentUser?.id);
        if (isMaster || isOwnOrder) {
          return `<a data-order-href="/admin/order/${row.id}" title="Open Order" style="color:#3b5998;cursor:pointer;" class="d-inline-flex align-items-center gap-1"><i class="ti ti-external-link fs-16"></i>${val ?? "-"}</a>`;
        }
        return val ?? "-";
      },
    },
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        return `<span class="badge ${statusesColors[row?.status] || "bg-gray"}">${
          $statusNamesStore[row?.status]?.name
            ? $statusNamesStore[row?.status]?.name
            : row?.status
        }</span>`;
      },
    },
    {
      key: "clientName",
      label: "client",
      render: (val, row) => {
        return (
          row.orderClients
            .map((c) => `${c?.name} ${c.mobile ? `(${c.mobile})` : ""}`)
            .join(", ") + (row.company ? ` (${row.company})` : "")
        );
      },
    },
    ...(currentUser?.subRole !== "telecaller" ? [{
      key: "assignedUsers",
      label: "assigned Users",
      render: (val, row) => {
        return row.assignedUsers
          .map((c) => `${c?.name}${c?.company ? `(${c?.company?.name})` : ""}`)
          .join(", ");
      },
    }] : []),
    {
      key: "orderDate",
      label: "Order Date",
      render: (val, row) => {
        const d = new Date(row.orderDate);
        return `${
          row.createdAt &&
          new Date(row.orderDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        }`;
      },
    },
    {
      key: "createdAt",
      label: "Created Date",
      render: (val, row) => {
        const d = new Date(row.createdAt);
        return `${
          row?.createdAt &&
          new Date(row.createdAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        }`;
      },
    },
  ];

  let actions = [];

  let reactive = 0;
  $: [setting], reactive++;
</script>

<!-- Header -->
<header class="navbar-header no-print">
  <div class="page-container topbar-menu">
    <div class="flex items-center gap-2">
      <!-- Logo -->
      <a href="/admin/dashboard" class="logo">
        <!-- Logo Normal -->
        <span class="logo-light">
          <span class="logo-lg">
            {#if setting?.logo}
              <img
                src={ATTACHMENT_BASE_URL + setting?.logo}
                class="h-[50px]"
                alt={setting?.title}
              />
            {/if}
          </span>
          <span class="logo-sm">
            {#if setting?.logoSmall}
              <img
                src={ATTACHMENT_BASE_URL + setting?.logoSmall}
                alt={setting?.title}
              />
            {/if}
          </span>
        </span>

        <!-- Logo Dark -->
        <span class="logo-dark">
          <span class="logo-lg">
            <img src="/assets/img/logo-white.svg" alt={setting?.title} />
          </span>
        </span>
      </a>

      <!-- Sidebar Mobile Button -->
      <a id="mobile_btn" class="mobile-btn" href="#sidebar">
        <i class="ti ti-menu-deep fs-24"></i>
      </a>

      <button class="sidenav-toggle-btn btn border-0 p-0" id="toggle_btn2">
        <i class="ti ti-arrow-bar-to-right"></i>
      </button>

      <!-- Search — visible to telecaller and master only -->
      {#if currentUser?.subRole === "telecaller" || currentUser?.role === "master"}
        <div class="me-auto flex items-center header-search d-lg-flex d-none">
          <!-- Search -->
          <div class="input-icon relative me-2">
            <input
              type="text"
              bind:value={headerInput}
              on:keydown={handleSearchKeydown}
              class="form-control"
              placeholder="Search Keyword"
            />
            <button class="input-icon-addon d-inline-flex p-0 header-search-icon">
              <i class="ti ti-command"></i>
            </button>
          </div>

          <button
            id="header-search-btn"
            href="#order_lists"
            data-bs-toggle="modal"
            data-bs-target="#order_lists"
            class="fw-medium bg-primary text-white p-1.5 px-2 rounded"
            on:click={commitAndSearch}
          >
            <i class="ti ti-search"></i>
          </button>
          <!-- /Search -->
          <div class="text-primary pl-2">
            {timerText}
          </div>
        </div>
      {/if}
    </div>

    <div class="flex items-center">
      <!-- Search for Mobile — visible to telecaller and master only -->
      {#if currentUser?.subRole === "telecaller" || currentUser?.role === "master"}
        <div class="header-item flex d-lg-none me-2">
          <button
            class="topbar-link btn"
            data-bs-toggle="modal"
            data-bs-target="#searchModal"
            type="button"
          >
            <i class="ti ti-search fs-16"></i>
          </button>
        </div>
      {/if}

      <!-- Minimize -->
      <div class="header-item">
        <div class="dropdown me-2">
          <a href="#btnFullscreen" class="btn topbar-link btnFullscreen"
            ><i class="ti ti-maximize"></i></a
          >
        </div>
      </div>
      <!-- Minimize -->

      <!-- Light/Dark Mode Button -->
      <!-- <div class="header-item d-none d-sm-flex me-2">
        <button
          class="topbar-link btn topbar-link"
          id="light-dark-mode"
          type="button"
        >
          <i class="ti ti-moon fs-16"></i>
        </button>
      </div> -->
      {#if currentUser?.role === "master"}
        {#key reactive}
          <button
            on:click={() => setOnlineStatus()}
            class="header-item d-none d-sm-flex"
            title="Status"
          >
            <div class="dropdown me-2">
              <div class="btn topbar-link">
                {#if setting?.onlineStatus}
                  <i class="ti ti-circle-filled text-success"></i>
                {:else}
                  <i class="ti ti-circle text-secondary"></i>
                {/if}
              </div>
            </div>
          </button>
        {/key}
      {/if}

      <!-- Notification Dropdown -->
      <Notification />

      <!-- User Dropdown -->
      <div class="dropdown profile-dropdown flex items-center justify-center">
        <a
          href="#profile-dropdown"
          class="topbar-link dropdown-toggle drop-arrow-none relative"
          data-bs-toggle="dropdown"
          data-bs-offset="0,22"
          aria-haspopup="false"
          aria-expanded="false"
        >
          <img
            src="/assets/img/profiles/user.png"
            width="38"
            class="rounded-1 flex"
            alt="userImage"
          />
          <span class="online text-success"
            ><i
              class="ti ti-circle-filled flex bg-white rounded-circle border border-1 border-white"
            ></i></span
          >
        </a>
        <div
          class="dropdown-menu dropdown-menu-end dropdown-menu-md p-2 top-[70px] right-0"
        >
          <div class="flex items-center bg-light rounded-3 p-2 mb-2">
            <img
              src="/assets/img/profiles/user.png"
              class="rounded-circle"
              width="42"
              height="42"
              alt="Img"
            />
            <div class="ms-2">
              <p class="fw-medium text-dark mb-0">{currentUser?.name}</p>
              <span class="d-block fs-13 text-muted">
                <span class="text-xs" style="font-size:10px;opacity:0.7;">Active:</span>
                <span class="text-capitalize fw-semibold ms-1">{currentUser?.role}{currentUser?.subRole ? ` (${currentUser.subRole})` : ''}</span>
              </span>
              {#if availableRoles.length > 1}
                <span class="d-flex flex-wrap gap-1 mt-1">
                  {#each availableRoles as r}
                    <span class="badge text-capitalize" style="font-size:10px; background-color:{r === currentUser?.role ? '#405189' : '#6c757d'}; color:#fff;">{roleBadgeLabel(r)}</span>
                  {/each}
                </span>
              {/if}
            </div>
          </div>

          <!-- Item-->
          <a href="/admin/profile" class="dropdown-item">
            <i class="ti ti-user-circle me-1 align-middle"></i>
            <span class="align-middle">Profile</span>
          </a>

          <!-- Switch Role — only for users with multiple roles -->
          {#if availableRoles.length > 1}
            <button on:click={() => switchRole()} class="dropdown-item text-primary d-flex flex-column align-items-start">
              <span>
                <i class="ti ti-switch-horizontal me-1 fs-17 align-middle"></i>
                <span class="align-middle">Switch Role</span>
              </span>
              <span class="d-flex flex-wrap gap-1 mt-1 ms-4">
                {#each availableRoles.filter(r => r !== currentUser?.role) as r}
                  <span class="badge" style="font-size:10px; background-color:#6c757d; color:#fff;">{roleBadgeLabel(r)}</span>
                {/each}
              </span>
            </button>
          {/if}

          <!-- Item-->
          <div class="pt-2 mt-2 border-top">
            <button on:click={() => logout()} class="dropdown-item text-danger">
              <i class="ti ti-logout me-1 fs-17 align-middle"></i>
              <span class="align-middle">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- Orders Lists -->
<div class="modal fade" id="order_lists" role="dialog">
  <div class="modal-dialog modal-full-width">
    <div class="modal-content">
      <div class="modal-header gap-4 justify-between">
        <h5 class="modal-title">Orders</h5>
        <input
          id="modal-search-input"
          type="text"
          value={searchTerm}
          on:input={(e) => handleSearchChange(e.target.value)}
          on:keydown={(e) => { if (e.key === "Enter") fetchOrders(); }}
          class="form-control max-w-[300px]"
          placeholder="Search Keyword"
        />
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
          on:click={() => { openModal = false; headerInput = searchTerm; }}
        >
        </button>
      </div>
      <div class="modal-body space-y-4">
        {#if openModal}
          {#key inquiryOrders}
            <DynamicDataTable
              loading={loadingData}
              {columns}
              {actions}
              data={inquiryOrders}
              {currentPage}
              {rowsPerPage}
              {totalItems}
              {totalPages}
              serverMode={true}
              on:pageChange={(e) => (currentPage = e.detail)}
              on:rowsPerPageChange={(e) => {
                rowsPerPage = e.detail;
                currentPage = 1;
              }}
              on:search={(e) => {
                searchTerm = e.detail;
                currentPage = 1;
              }}
              headersItemShow={false}
            />
          {/key}
        {/if}
      </div>
    </div>
  </div>
</div>
<!-- /Orders Lists -->

<svelte:body class:menu-opened={slideNav} />

<style>
  @media print {
    .no-print {
      display: none;
    }
  }
</style>
