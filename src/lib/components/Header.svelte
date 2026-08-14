<script>
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { goto } from "$app/navigation";
  import { clearUser, setUser } from "../../stores/userStore";
  import { checkAuth, logoutUser, getAvailableRoles, getRolePermissions, saveSession, canAccess } from "$lib/utils/auth";
  import { apiFetch } from "$lib/api/client";
  import Swal from "sweetalert2";
  import Notification from "./Notification.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import { settingStore, usersAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { page } from "$app/stores";
  import { showToast } from "$lib/stores/uiToast";

  let setting;

  let currentUser;
  let availableRoles = [];
  let rolePermissions = null;

  $: currentPath = $page.url.pathname;

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

    checkAndStartTimer();

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
      text: `Are you sure you want to set employee login to "${onlineStatus ? "Online" : "Offline"}"?`,
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

  function emergencyActive() {
    return (
      !!setting?.emergencyLoginEnabled ||
      (Array.isArray(setting?.emergencyLoginUserIds) &&
        setting.emergencyLoginUserIds.length > 0)
    );
  }

  function emergencyButtonLabel() {
    if (setting?.emergencyLoginEnabled) return "Emergency ON";
    const n = setting?.emergencyLoginUserIds?.length || 0;
    if (n > 0) return `Emergency (${n})`;
    return "Allow login";
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function openEmergencyLoginDialog() {
    const selected = new Set(
      (setting?.emergencyLoginUserIds || []).map((id) => Number(id)),
    );
    const modeAll = !!setting?.emergencyLoginEnabled;

    // Open immediately (no wait → no delayed “pop” jerk)
    const result = await Swal.fire({
      title: "Emergency employee login",
      html: `
        <p class="emg-swal-hint">
          Login is locked. Choose who may sign in until you turn this off.
        </p>
        <div class="emg-swal-modes">
          <label class="emg-swal-mode">
            <input type="radio" name="emg-mode" value="all" ${modeAll ? "checked" : ""} />
            Allow all employees
          </label>
          <label class="emg-swal-mode">
            <input type="radio" name="emg-mode" value="specific" ${!modeAll ? "checked" : ""} />
            Allow specific employees
          </label>
        </div>
        <div id="emg-user-list" class="emg-swal-list" style="${!modeAll ? "" : "opacity:0.45;pointer-events:none;"}">
          <p class="emg-swal-loading">Loading employees…</p>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: emergencyActive(),
      confirmButtonText: "Save",
      denyButtonText: "Disable all",
      denyButtonColor: "#dc3545",
      width: 480,
      heightAuto: false,
      scrollbarPadding: false,
      focusConfirm: false,
      allowOutsideClick: () => !Swal.isLoading(),
      showClass: { popup: "swal2-show emg-swal-show" },
      hideClass: { popup: "swal2-hide" },
      customClass: {
        popup: "emg-swal-popup",
        htmlContainer: "emg-swal-html",
      },
      didOpen: async () => {
        const list = document.getElementById("emg-user-list");
        const radios = document.querySelectorAll('input[name="emg-mode"]');
        const syncListState = () => {
          const specific = document.querySelector(
            'input[name="emg-mode"][value="specific"]',
          )?.checked;
          if (list) {
            list.style.opacity = specific ? "1" : "0.45";
            list.style.pointerEvents = specific ? "auto" : "none";
          }
        };
        radios.forEach((r) => r.addEventListener("change", syncListState));

        let users = [];
        try {
          const cached = get(usersAllStore);
          if (cached?.length) {
            users = cached;
          } else {
            const data = await authApiFetch(`${API_ROUTES.USER}/all`);
            users = Array.isArray(data) ? data : data?.data ?? data?.users ?? [];
            if (users?.length) usersAllStore.set(users);
          }
        } catch (err) {
          if (list) {
            list.innerHTML = `<p class="emg-swal-loading">${escapeHtml(errorHandle(err) || "Failed to load users")}</p>`;
          }
          return;
        }

        if (!list) return;
        list.innerHTML =
          users
            .map((u) => {
              const id = Number(u.id);
              const checked = selected.has(id) ? "checked" : "";
              const role = escapeHtml(u.role || "");
              const name = escapeHtml(u.name || "User");
              return `<label class="emg-swal-user">
                <input type="checkbox" class="emg-user" value="${id}" ${checked} />
                <span><strong>${name}</strong> <span class="emg-swal-role">(${role})</span></span>
              </label>`;
            })
            .join("") || `<p class="emg-swal-loading">No employees found.</p>`;
        syncListState();
      },
      preConfirm: () => {
        const mode =
          document.querySelector('input[name="emg-mode"]:checked')?.value ||
          "specific";
        if (mode === "all") return { mode: "all" };
        const ids = [...document.querySelectorAll(".emg-user:checked")].map(
          (el) => Number(el.value),
        );
        if (!ids.length) {
          Swal.showValidationMessage(
            "Select at least one employee, or choose Allow all.",
          );
          return false;
        }
        return { mode: "specific", userIds: ids };
      },
    });

    const toastOk = (msg) =>
      showToast({ type: "success", message: msg, duration: 2800 });

    if (result.isDenied) {
      try {
        const data = await authApiFetch(`${API_ROUTES.SETTING}/emergency-login`, {
          method: "PUT",
          data: { enabled: false },
        });
        setting = data.data;
        settingStore.set(data.data);
        toastOk(data.message);
      } catch (err) {
        showToast({ type: "error", message: errorHandle(err) || "Failed to update" });
      }
      return;
    }

    if (!result.isConfirmed || !result.value) return;

    try {
      let data;
      if (result.value.mode === "all") {
        data = await authApiFetch(`${API_ROUTES.SETTING}/emergency-login`, {
          method: "PUT",
          data: { enabled: true },
        });
      } else {
        data = await authApiFetch(
          `${API_ROUTES.SETTING}/emergency-login-users`,
          {
            method: "PUT",
            data: { userIds: result.value.userIds },
          },
        );
      }
      setting = data.data;
      settingStore.set(data.data);
      toastOk(data.message);
    } catch (err) {
      showToast({ type: "error", message: errorHandle(err) || "Failed to update" });
    }
  }

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
    "Reference": "bg-[#8b5cf6]",
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
        const isPrivileged =
          currentUser?.role === "master" ||
          currentUser?.role === "admin" ||
          currentUser?.role === "manager";
        const isOwnOrder = row.assignedUsers?.some((u) => u.id === currentUser?.id);
        if (isPrivileged || isOwnOrder) {
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

      <!-- Search + quick links -->
      <div class="me-auto flex items-center header-search gap-2">
        <div class="header-search-group flex items-center d-lg-flex d-none">
            <div class="input-icon relative">
              <input
                type="text"
                bind:value={headerInput}
                on:keydown={handleSearchKeydown}
                class="form-control header-search-input"
                placeholder="Search Keyword"
              />
              <button class="input-icon-addon d-inline-flex p-0 header-search-icon" type="button" tabindex="-1">
                <i class="ti ti-command"></i>
              </button>
            </div>

            <button
              id="header-search-btn"
              href="#order_lists"
              data-bs-toggle="modal"
              data-bs-target="#order_lists"
              class="header-control-btn header-search-submit"
              on:click={commitAndSearch}
              type="button"
              title="Search"
            >
              <i class="ti ti-search"></i>
            </button>
            <div class="header-timer text-primary">
              {timerText}
            </div>
          </div>

        <div class="header-quick-links flex items-center gap-1">
          <a
            href="/admin/media"
            class="header-quick-link"
            class:active={currentPath.startsWith("/admin/media")}
            title="Media"
          >
            <i class="ti ti-photo"></i>
            <span class="d-none d-md-inline">Media</span>
          </a>
          {#if ((currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess) && canAccess("orders", "view", currentUser)}
            <a
              href="/admin/order"
              class="header-quick-link"
              class:active={currentPath === "/admin/order" || (currentPath.startsWith("/admin/order/") && !["/admin/order/won", "/admin/order/lost", "/admin/order/last-activity"].some((p) => currentPath.startsWith(p)))}
              title="Orders"
            >
              <i class="ti ti-shopping-cart"></i>
              <span class="d-none d-md-inline">Orders</span>
            </a>
            <a
              href="/admin/order-list/excel"
              class="header-quick-link"
              class:active={currentPath.startsWith("/admin/order-list/excel")}
              title="Excel Orders"
            >
              <i class="ti ti-file-spreadsheet"></i>
              <span class="d-none d-md-inline">Excel Orders</span>
            </a>
          {/if}
          {#if ((currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess) && canAccess("work_order", "view", currentUser)}
            <a
              href="/admin/workorder"
              class="header-quick-link"
              class:active={currentPath.startsWith("/admin/workorder")}
              title="Work Order"
            >
              <i class="ti ti-file-description"></i>
              <span class="d-none d-md-inline">Work Order</span>
            </a>
          {/if}
        </div>
      </div>
    </div>

    <div class="flex items-center">
      <!-- Search for Mobile — all roles -->
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
          <div class="header-item header-login-ctrls">
            {#if !setting?.onlineStatus}
              <button
                type="button"
                class="header-login-btn"
                class:is-emergency={emergencyActive()}
                class:is-locked={!emergencyActive()}
                on:click={() => openEmergencyLoginDialog()}
                title={emergencyActive()
                  ? "Emergency login active — click to manage"
                  : "Login locked — click to allow emergency employee login"}
              >
                {#if emergencyActive()}
                  <i class="ti ti-alert-triangle-filled"></i>
                  <span>{emergencyButtonLabel()}</span>
                {:else}
                  <i class="ti ti-lock"></i>
                  <span>Allow login</span>
                {/if}
              </button>
            {/if}
            <button
              type="button"
              class="header-login-btn"
              class:is-online={!!setting?.onlineStatus}
              class:is-offline={!setting?.onlineStatus}
              on:click={() => setOnlineStatus()}
              title={setting?.onlineStatus
                ? "Employee login Online — click to go Offline"
                : "Employee login Offline — click to go Online"}
            >
              {#if setting?.onlineStatus}
                <i class="ti ti-circle-filled"></i>
                <span>Online</span>
              {:else}
                <i class="ti ti-circle"></i>
                <span>Offline</span>
              {/if}
            </button>
          </div>
        {/key}
      {/if}

      <!-- Notification Dropdown -->
      <Notification />

      {#if canAccess("client_visits", "view", currentUser)}
        <div class="header-item">
          <a
            href="/admin/client-visit"
            class="header-quick-link me-2"
            class:active={currentPath.startsWith("/admin/client-visit")}
            title="Client Visits"
          >
            <i class="ti ti-map-pin"></i>
            <span class="d-none d-md-inline">Visits</span>
          </a>
        </div>
      {/if}

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
            width="28"
            height="28"
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

  /* Shared Cursor-like control size across the whole header */
  :global(.navbar-header) {
    --header-control-h: 28px;
    --header-control-fs: 12px;
    --header-control-radius: 6px;
  }

  .header-search {
    gap: 6px;
    align-items: center;
  }

  /* Search input — match 28px control height (overrides main.css 38px) */
  :global(.navbar-header .header-search .header-search-input),
  :global(.navbar-header .header-search .form-control) {
    box-sizing: border-box !important;
    width: 180px !important;
    height: var(--header-control-h) !important;
    min-height: var(--header-control-h) !important;
    max-height: var(--header-control-h) !important;
    padding: 0 26px 0 10px !important;
    font-size: var(--header-control-fs) !important;
    line-height: calc(var(--header-control-h) - 2px) !important;
    border-radius: var(--header-control-radius) !important;
    border: 1px solid var(--topbar-item-border, #e8e8e8) !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--topbar-item-color, #495057);
  }
  :global(.navbar-header .header-search .form-control::placeholder) {
    font-size: var(--header-control-fs) !important;
    color: #adb5bd;
    opacity: 1;
  }
  :global(.navbar-header .header-search .header-search-icon) {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    padding: 0 !important;
    border: none;
    background: transparent;
    color: #868e96;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.navbar-header .header-search .input-icon) {
    display: inline-flex;
    align-items: center;
    height: var(--header-control-h);
  }

  .header-control-btn,
  .header-quick-link,
  :global(.navbar-header .topbar-menu .header-item .topbar-link),
  :global(.navbar-header .header-item .topbar-link) {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: var(--header-control-h) !important;
    min-height: var(--header-control-h) !important;
    max-height: var(--header-control-h);
    border-radius: var(--header-control-radius) !important;
    font-size: var(--header-control-fs) !important;
    font-weight: 500;
    line-height: 1 !important;
    white-space: nowrap;
    border: 1px solid transparent;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  :global(.navbar-header .topbar-menu .header-item .topbar-link),
  :global(.navbar-header .header-item .topbar-link) {
    width: var(--header-control-h) !important;
    min-width: var(--header-control-h) !important;
    padding: 0 !important;
  }

  .header-control-btn,
  .header-quick-link {
    padding: 0 8px;
  }

  .header-control-btn i,
  .header-quick-link i,
  :global(.navbar-header .topbar-link i),
  :global(.navbar-header .header-item .topbar-link i) {
    font-size: 14px !important;
    line-height: 1;
  }

  .header-search-submit {
    width: var(--header-control-h) !important;
    min-width: var(--header-control-h) !important;
    max-width: var(--header-control-h);
    padding: 0 !important;
    margin: 0 0 0 6px !important;
    gap: 0 !important;
    background: var(--primary, #e41f07);
    color: #fff;
    border-color: var(--primary, #e41f07);
  }

  .header-search-submit i {
    margin: 0 !important;
    padding: 0 !important;
  }

  .header-search-group {
    gap: 0;
    align-items: center;
  }

  .header-search-submit:hover {
    filter: brightness(0.95);
    color: #fff;
  }

  .header-timer {
    font-size: var(--header-control-fs);
    line-height: var(--header-control-h);
    padding-left: 6px;
    white-space: nowrap;
  }

  .header-quick-link {
    color: var(--bs-gray-700, #495057);
    text-decoration: none;
    border-color: var(--topbar-item-border, #e8e8e8);
    background: transparent;
  }

  .header-quick-link:hover {
    background: var(--bs-light, #f8f9fa);
    color: var(--primary, #e41f07);
    border-color: var(--topbar-item-hover-bg, #f0f0f0);
  }

  .header-quick-link.active {
    background: color-mix(in srgb, var(--primary, #e41f07) 10%, transparent);
    color: var(--primary, #e41f07);
    border-color: color-mix(in srgb, var(--primary, #e41f07) 25%, transparent);
  }

  /* Profile avatar matches control height */
  :global(.navbar-header .profile-dropdown > .topbar-link) {
    width: var(--header-control-h) !important;
    min-width: var(--header-control-h) !important;
    height: var(--header-control-h) !important;
    padding: 0 !important;
    border: 1px solid var(--topbar-item-border, #e8e8e8);
    overflow: visible;
  }
  :global(.navbar-header .profile-dropdown > .topbar-link img) {
    width: 26px !important;
    height: 26px !important;
    object-fit: cover;
  }

  /* Master: login lock / emergency / online controls */
  .header-login-ctrls {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-right: 8px;
    flex-shrink: 0;
  }

  .header-login-btn {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: var(--header-control-h, 32px);
    min-height: var(--header-control-h, 32px);
    padding: 0 10px;
    margin: 0;
    border-radius: var(--header-control-radius, 6px);
    border: 1px solid transparent;
    background: transparent;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .header-login-btn i {
    font-size: 14px;
    line-height: 1;
  }

  .header-login-btn span {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }

  .header-login-btn.is-locked {
    color: #b42318;
    background: #fef3f2;
    border-color: #fecdca;
  }

  .header-login-btn.is-locked:hover {
    background: #fee4e2;
    border-color: #fda29b;
  }

  .header-login-btn.is-emergency {
    color: #b54708;
    background: #fffaeb;
    border-color: #fedf89;
  }

  .header-login-btn.is-emergency:hover {
    background: #fef0c7;
    border-color: #fec84b;
  }

  .header-login-btn.is-online {
    color: #067647;
    background: #ecfdf3;
    border-color: #abefc6;
  }

  .header-login-btn.is-online:hover {
    background: #dcfae6;
    border-color: #75e0a7;
  }

  .header-login-btn.is-offline {
    color: #475467;
    background: #f9fafb;
    border-color: #d0d5dd;
  }

  .header-login-btn.is-offline:hover {
    background: #f2f4f7;
    border-color: #98a2b3;
  }

  @media (max-width: 575.98px) {
    .header-login-btn span {
      display: none;
    }
    .header-login-btn {
      padding: 0 8px;
      min-width: var(--header-control-h, 32px);
    }
  }

  /* Emergency Swal — fixed height list so popup doesn’t resize/jerk */
  :global(.emg-swal-popup) {
    padding: 1.25rem 1.25rem 1rem !important;
  }
  :global(.emg-swal-html) {
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
  }
  :global(.emg-swal-hint) {
    font-size: 13px;
    margin: 0 0 12px;
    text-align: left;
    color: #555;
  }
  :global(.emg-swal-modes) {
    text-align: left;
    margin-bottom: 10px;
  }
  :global(.emg-swal-mode) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    cursor: pointer;
  }
  :global(.emg-swal-list) {
    height: 240px;
    max-height: 240px;
    overflow: auto;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 4px 8px;
    text-align: left;
    box-sizing: border-box;
  }
  :global(.emg-swal-user) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    font-size: 13px;
    text-align: left;
  }
  :global(.emg-swal-role) {
    color: #888;
    font-size: 11px;
  }
  :global(.emg-swal-loading) {
    font-size: 12px;
    color: #888;
    margin: 12px 0;
    text-align: center;
  }
  :global(.emg-swal-show) {
    animation: emg-swal-in 0.18s ease-out;
  }
  @keyframes emg-swal-in {
    from {
      opacity: 0;
      transform: scale(0.98) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
