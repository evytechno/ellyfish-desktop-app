<script>
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import jQuery from "jquery";
  import { checkAuth, canAccess } from "$lib/utils/auth";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import UpdateNotification from "$lib/components/UpdateNotification.svelte";
  import { openQueryCount, trainingQueryCount, loadTrainingQueryCount } from "$lib/stores/queryStore";
  import { queryUnreadCounts } from "$lib/stores/queryUnreadCounts";
  import { totalGroupUnread } from "$lib/stores/groupChatStore";

  // Total unread chat messages across all assigned queries (tech only)
  $: totalAssignedUnread = Object.values($queryUnreadCounts).reduce(
    (s, n) => s + n,
    0,
  );

  export let setting;

  $: currentPath = $page.url.pathname;

  let currentUser;

  const COMMON_PATHS = [
    "/admin/category",
    "/admin/company",
    "/admin/user",
    "/admin/history",
    "/admin/setting",
  ];

  function isCommonPath(path) {
    return COMMON_PATHS.some((p) => path.startsWith(p));
  }

  let commonOpen =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("sidebarCommonOpen") !== "false"
      : true;

  function toggleCommonSection() {
    commonOpen = !commonOpen;
    localStorage.setItem("sidebarCommonOpen", String(commonOpen));
  }

  onMount(() => {
    // set user first so conditional menu blocks render before jQuery scans them
    currentUser = checkAuth();
    const sub = currentUser?.subRole;
    if (sub === "tech" || sub === "telecaller" || sub === "tech_helper") {
      loadTrainingQueryCount();
    }

    // Always expand COMMON when viewing a common page
    if (isCommonPath(window.location.pathname)) {
      commonOpen = true;
    }

    const $ = jQuery;
    const wrapper = $(".main-wrapper");

    // prevent duplicate overlays
    if ($(".sidebar-overlay").length === 0) {
      $('<div class="sidebar-overlay"></div>').insertBefore(".main-wrapper");
    }
    const overlay = $(".sidebar-overlay");

    const toggleMenuHandler = function (e) {
      e.preventDefault();
      wrapper.toggleClass("slide-nav");
      overlay.toggleClass("opened");
      $("html").toggleClass("menu-opened");
    };

    const closeMenuHandler = function () {
      wrapper.removeClass("slide-nav");
      overlay.removeClass("opened");
      $("html").removeClass("menu-opened");
    };

    const submenuClickHandler = function (e) {
      const link = $(this);
      const submenu = link.next("ul");
      if (link.parent().hasClass("submenu")) {
        e.preventDefault();
        if (!link.hasClass("subdrop")) {
          link.closest("ul").find("ul").slideUp(250);
          link.closest("ul").find("a").removeClass("subdrop");
          submenu.slideDown(350);
          link.addClass("subdrop");
        } else {
          link.removeClass("subdrop");
          submenu.slideUp(350);
        }
      }
    };

    const mouseOverHandler = function (e) {
      if (
        $("body").hasClass("mini-sidebar") &&
        $("#toggle_btn").is(":visible")
      ) {
        const insideSidebar = $(e.target).closest(
          ".sidebar, .header-left",
        ).length;
        if (insideSidebar) {
          $("body").addClass("expand-menu");
          $(".subdrop + ul").slideDown();
        } else {
          $("body").removeClass("expand-menu");
          $(".subdrop + ul").slideUp();
        }
        return false;
      }
    };

    $(document).on("click", "#mobile_btn", toggleMenuHandler);
    $(document).on(
      "click",
      ".sidebar-close, .sidebar-overlay",
      closeMenuHandler,
    );
    $(document).on("click", ".sidebar-menu a", submenuClickHandler);
    $(document).on("mouseover", mouseOverHandler);

    // activate open submenu after Svelte renders conditional blocks
    setTimeout(() => {
      $(".sidebar-menu ul li.submenu a.active")
        .parents("li.submenu")
        .children("a")
        .addClass("active subdrop")
        .next("ul")
        .show();
    }, 0);

    if ($(window).width() > 767 && $(".theiaStickySidebar").length > 0) {
      $(".theiaStickySidebar").theiaStickySidebar({ additionalMarginTop: 30 });
    }

    return () => {
      $(document).off("click", "#mobile_btn", toggleMenuHandler);
      $(document).off(
        "click",
        ".sidebar-close, .sidebar-overlay",
        closeMenuHandler,
      );
      $(document).off("click", ".sidebar-menu a", submenuClickHandler);
      $(document).off("mouseover", mouseOverHandler);
    };
  });

  // After every navigation: sync submenu open/close state with active links
  afterNavigate(() => {
    if (isCommonPath($page.url.pathname)) {
      commonOpen = true;
    }
    const sub = currentUser?.subRole;
    if (sub === "tech" || sub === "telecaller" || sub === "tech_helper") {
      loadTrainingQueryCount();
    }
    // Wait one tick so Svelte's class:active bindings are in the DOM
    setTimeout(() => {
      const $ = jQuery;
      $(".sidebar-menu li.submenu").each(function () {
        const $li = $(this);
        const hasActive = $li.find("a.active").length > 0;
        if (hasActive) {
          $li.children("a").addClass("subdrop");
          $li.children("ul").show();
        } else {
          $li.children("a").removeClass("subdrop");
          $li.children("ul").hide();
        }
      });
    }, 0);
  });
</script>

<div class="sidebar no-print" id="sidebar">
  <!-- Start Logo -->
  <div class="sidebar-logo flex items-center h-[57px]">
    <div>
      <a href="/admin/dashboard" class="logo logo-normal">
        {#if setting?.logo}
          <img
            src={ATTACHMENT_BASE_URL + setting?.logo}
            class="h-[50px]"
            alt={setting?.title}
          />
        {/if}
      </a>
      <a href="/admin/dashboard" class="logo-small">
        {#if setting?.logoSmall}
          <img
            src={ATTACHMENT_BASE_URL + setting?.logoSmall}
            alt={setting?.title}
          />
        {/if}
      </a>
      <a href="/admin/dashboard" class="dark-logo">
        <img src="/assets/img/logo-white.svg" alt={setting?.title} />
      </a>
    </div>
    <button class="sidenav-toggle-btn btn border-0 p-0 active" id="toggle_btn">
      <i class="ti ti-arrow-bar-to-left"></i>
    </button>
    <button class="sidebar-close">
      <i class="ti ti-x align-middle"></i>
    </button>
  </div>
  <!-- End Logo -->

  <!-- Sidenav Menu -->
  <div class="sidebar-inner simplebar-scrollable-y pb-14" data-simplebar="init">
    <div class="simplebar-wrapper" style="margin: 0px;">
      <div class="simplebar-height-auto-observer-wrapper">
        <div class="simplebar-height-auto-observer"></div>
      </div>
      <div class="simplebar-mask">
        <div class="simplebar-offset" style="right: 0px; bottom: 0px;">
          <div
            class="simplebar-content-wrapper"
            tabIndex="0"
            role="region"
            aria-label="scrollable content"
            style="height: 100%; overflow: hidden scroll;"
          >
            <div class="simplebar-content" style="padding: 0px;">
              <div id="sidebar-menu" class="sidebar-menu" style="padding-bottom: 56px;">
                <div class="mb-2">
                  <!-- Role bar -->
                  {#if currentUser}
                    {@const roleLabel =
                      currentUser.role === "master"
                        ? "Master"
                        : currentUser.role === "admin"
                          ? "Admin"
                          : currentUser.role === "manager"
                            ? "Manager"
                            : currentUser.subRole === "telecaller"
                              ? "Telecaller"
                              : currentUser.subRole === "tech"
                                ? "Technician"
                                : currentUser.subRole === "tech_helper"
                                  ? "Senior Tech"
                                  : "User"}
                    {@const roleColor =
                      currentUser.role === "master"
                        ? "#3b5bdb"
                        : currentUser.role === "admin"
                          ? "#e03131"
                          : currentUser.role === "manager"
                            ? "#0ca678"
                            : currentUser.subRole === "telecaller"
                              ? "#f59f00"
                              : currentUser.subRole === "tech"
                                ? "#0ca678"
                                : currentUser.subRole === "tech_helper"
                                  ? "#7950f2"
                                  : "#6c757d"}
                    {@const roleIcon =
                      currentUser.role === "master"
                        ? "ti ti-crown"
                        : currentUser.role === "admin"
                          ? "ti ti-shield-check"
                          : currentUser.role === "manager"
                            ? "ti ti-briefcase"
                            : currentUser.subRole === "telecaller"
                              ? "ti ti-headset"
                              : currentUser.subRole === "tech"
                                ? "ti ti-wrench"
                                : currentUser.subRole === "tech_helper"
                                  ? "ti ti-tool"
                                  : "ti ti-user"}
                    <div class="sr-bar m-0" style="--rc:{roleColor};">
                      <div class="sr-icon-wrap">
                        <i class="{roleIcon} sr-icon"></i>
                      </div>
                      <span class="sr-label">{roleLabel}</span>
                      <span class="sr-glow"></span>
                    </div>
                  {/if}
                </div>
                <ul>
                  <!-- <li class="menu-title"><span>Main Menu</span></li> -->
                  <li>
                    <ul>
                      {#if currentUser?.role != "user"}
                        <li
                          class:active={currentPath.startsWith(
                            "/admin/admin-dashboard",
                          )}
                        >
                          <a
                            href="/admin/admin-dashboard"
                            class:active={currentPath.startsWith(
                              "/admin/admin-dashboard",
                            )}
                          >
                            <i class="ti ti-dashboard"></i><span
                              >Admin Dashboard</span
                            >
                          </a>
                        </li>
                      {/if}
                      <li
                        class:active={currentPath.startsWith(
                          "/admin/dashboard",
                        )}
                      >
                        <a
                          href="/admin/dashboard"
                          class:active={currentPath.startsWith(
                            "/admin/dashboard",
                          )}
                        >
                          <i class="ti ti-dashboard"></i><span>Dashboard</span>
                        </a>
                      </li>
                    </ul>
                  </li>

                  <li class="menu-title"><span>CRM</span></li>
                  <li>
                    <ul>
                      <!-- Query menu — hidden for plain users with no subRole -->
                      {#if canAccess('queries', 'view', currentUser) && currentUser?.subRole === "tech_helper"}
                        <li class="submenu">
                          <a
                            href="#queries"
                            class:active={currentPath.startsWith(
                              "/admin/query",
                            )}
                          >
                            <i class="ti ti-help-circle"></i><span>Queries</span>
                            {#if totalAssignedUnread > 0}
                              <span class="open-queue-badge"
                                >{totalAssignedUnread > 99
                                  ? "99+"
                                  : totalAssignedUnread}</span
                              >
                            {/if}
                            <span class="menu-arrow"></span>
                          </a>
                          <ul>
                            <li>
                              <a
                                href="/admin/query/sub-queue"
                                class:active={currentPath ===
                                  "/admin/query/sub-queue"}
                              >
                                Open Queue
                              </a>
                            </li>
                            <li>
                              <a
                                href="/admin/query/assigned"
                                class:active={currentPath ===
                                  "/admin/query/assigned"}
                              >
                                My Assigned
                                {#if totalAssignedUnread > 0}
                                  <span class="open-queue-badge ms-1"
                                    >{totalAssignedUnread > 99
                                      ? "99+"
                                      : totalAssignedUnread}</span
                                  >
                                {/if}
                              </a>
                            </li>
                            {#if $trainingQueryCount > 0}
                            <li>
                              <a
                                href="/admin/query/training"
                                class:active={currentPath ===
                                  "/admin/query/training"}
                              >
                                Training
                              </a>
                            </li>
                            {/if}
                          </ul>
                        </li>
                      {:else if canAccess('queries', 'view', currentUser) && currentUser?.subRole === "tech"}
                        <li class="submenu">
                          <a
                            href="#queries"
                            class:active={currentPath.startsWith(
                              "/admin/query",
                            )}
                          >
                            <i class="ti ti-help-circle"></i><span>Queries</span
                            >
                            {#if $openQueryCount > 0}
                              <span class="open-queue-badge"
                                >{$openQueryCount > 99
                                  ? "99+"
                                  : $openQueryCount}</span
                              >
                            {/if}
                            {#if totalAssignedUnread > 0}
                              <span class="open-queue-badge"
                                >{totalAssignedUnread > 99
                                  ? "99+"
                                  : totalAssignedUnread}</span
                              >
                            {/if}
                            <span class="menu-arrow"></span>
                          </a>
                          <ul>
                            <li>
                              <a
                                href="/admin/query/open"
                                class:active={currentPath ===
                                  "/admin/query/open"}
                              >
                                Open Queue
                                {#if $openQueryCount > 0}
                                  <span class="open-queue-badge ms-1"
                                    >{$openQueryCount > 99
                                      ? "99+"
                                      : $openQueryCount}</span
                                  >
                                {/if}
                              </a>
                            </li>
                            <li>
                              <a
                                href="/admin/query/assigned"
                                class:active={currentPath ===
                                  "/admin/query/assigned"}
                              >
                                My Assigned
                                {#if totalAssignedUnread > 0}
                                  <span class="open-queue-badge ms-1"
                                    >{totalAssignedUnread > 99
                                      ? "99+"
                                      : totalAssignedUnread}</span
                                  >
                                {/if}
                              </a>
                            </li>
                            {#if $trainingQueryCount > 0}
                            <li>
                              <a
                                href="/admin/query/training"
                                class:active={currentPath ===
                                  "/admin/query/training"}
                              >
                                Training
                              </a>
                            </li>
                            {/if}
                          </ul>
                        </li>
                      {:else if canAccess('queries', 'view', currentUser) && currentUser?.role !== "user"}
                        <li class="submenu">
                          <a
                            href="#queries"
                            class:active={currentPath.startsWith(
                              "/admin/query",
                            )}
                          >
                            <i class="ti ti-help-circle"></i><span>Queries</span
                            >
                            <span class="menu-arrow"></span>
                          </a>
                          <ul>
                            <li>
                              <a
                                href="/admin/query/dashboard"
                                class:active={currentPath ===
                                  "/admin/query/dashboard"}>Dashboard</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/query/user"
                                class:active={currentPath.startsWith(
                                  "/admin/query/user",
                                )}>User Stats</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/query"
                                class:active={currentPath === "/admin/query"}
                                >All Queries</a
                              >
                            </li>
                          </ul>
                        </li>
                      {:else if canAccess('queries', 'view', currentUser) && currentUser?.subRole === "telecaller"}
                        <li class="submenu">
                          <a
                            href="#queries"
                            class:active={currentPath.startsWith("/admin/query")}
                          >
                            <i class="ti ti-help-circle"></i><span>Queries</span>
                            <span class="menu-arrow"></span>
                          </a>
                          <ul>
                            <li>
                              <a
                                href="/admin/query"
                                class:active={currentPath === "/admin/query"}
                              >
                                My Queries
                              </a>
                            </li>
                            {#if $trainingQueryCount > 0}
                            <li>
                              <a
                                href="/admin/query/training"
                                class:active={currentPath === "/admin/query/training"}
                              >
                                Training
                              </a>
                            </li>
                            {/if}
                          </ul>
                        </li>
                      {/if}

                      <!-- Group Chat -->
                      {#if canAccess('group_chat', 'view', currentUser)}
                      <li
                        class:active={currentPath.startsWith("/admin/group-chat")}
                      >
                        <a
                          href="/admin/group-chat"
                          class:active={currentPath.startsWith("/admin/group-chat")}
                        >
                          <i class="ti ti-messages"></i><span>Group Chat</span>
                          {#if $totalGroupUnread > 0}
                            <span class="open-queue-badge"
                              >{$totalGroupUnread > 99 ? "99+" : $totalGroupUnread}</span
                            >
                          {/if}
                        </a>
                      </li>
                      {/if}

                      <!-- Orders submenu — list shortcuts (Orders / Excel moved to header) -->
                      {#if ((currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess)}
                        {#if canAccess('orders', 'view', currentUser)}
                        <li class="submenu">
                          <a
                            href="#orders"
                            class:active={currentPath.startsWith("/admin/order") || currentPath.startsWith("/admin/order-list")}
                          >
                            <i class="ti ti-shopping-cart"></i><span>Orders</span>
                            <span class="menu-arrow"></span>
                          </a>
                          <ul>
                            <li>
                              <a
                                href="/admin/order/last-activity"
                                class:active={currentPath ===
                                  "/admin/order/last-activity"}>No Follow Up</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/order/won"
                                class:active={currentPath ===
                                  "/admin/order/won"}>Won</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/order-list/dispatched"
                                class:active={currentPath ===
                                  "/admin/order-list/dispatched"}>Dispatched</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/order-list/completed"
                                class:active={currentPath ===
                                  "/admin/order-list/completed"}>Completed</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/order/lost"
                                class:active={currentPath ===
                                  "/admin/order/lost"}>Lost</a
                              >
                            </li>
                          </ul>
                        </li>
                        {/if}
                        {#if canAccess('invoices', 'view', currentUser)}
                        <li
                          class:active={currentPath.startsWith(
                            "/admin/invoice",
                          ) && !currentPath.startsWith("/admin/invoice/tax")}
                        >
                          <a
                            href="/admin/invoice"
                            class:active={currentPath.startsWith(
                              "/admin/invoice",
                            ) && !currentPath.startsWith("/admin/invoice/tax")}
                          >
                            <i class="ti ti-invoice"></i><span
                              >Invoice (PI)</span
                            >
                          </a>
                        </li>
                        {/if}
                        {#if currentUser?.role === "master" || canAccess('clients', 'view', currentUser)}
                        {#if currentUser?.role === "master"}
                          <li
                            class:active={currentPath.startsWith("/admin/client") && !currentPath.startsWith("/admin/client-visit")}
                          >
                            <a
                              href="/admin/client"
                              class:active={currentPath.startsWith("/admin/client") && !currentPath.startsWith("/admin/client-visit")}
                            >
                              <i class="ti ti-building-store"></i><span>Clients</span>
                            </a>
                          </li>
                        {:else if canAccess('clients', 'view', currentUser)}
                          <li
                            class:active={currentPath.startsWith("/admin/client") && !currentPath.startsWith("/admin/client-visit")}
                          >
                            <a
                              href="/admin/client"
                              class:active={currentPath.startsWith("/admin/client") && !currentPath.startsWith("/admin/client-visit")}
                            >
                              <i class="ti ti-building-store"></i><span>Clients</span>
                            </a>
                          </li>
                        {/if}
                        {/if}
                        {#if currentUser?.role === 'master' || currentUser?.role === 'admin'}
                        <li class:active={currentPath.startsWith("/admin/old-inquiries") && !currentPath.startsWith("/admin/old-inquiries/my")}>
                          <a href="/admin/old-inquiries" class:active={currentPath.startsWith("/admin/old-inquiries") && !currentPath.startsWith("/admin/old-inquiries/my")}>
                            <i class="ti ti-database-import"></i><span>Old Inquiries</span>
                          </a>
                        </li>
                        {/if}
                        {#if currentUser?.role === 'user' || currentUser?.role === 'manager'}
                        <li class:active={currentPath.startsWith("/admin/old-inquiries/my")}>
                          <a href="/admin/old-inquiries/my" class:active={currentPath.startsWith("/admin/old-inquiries/my")}>
                            <i class="ti ti-database-import"></i><span>Old Inquiries</span>
                          </a>
                        </li>
                        {/if}
                        <li
                          class:active={currentPath === "/admin/feedback"}
                        >
                          <a
                            href="/admin/feedback"
                            class:active={currentPath === "/admin/feedback"}
                          >
                            <i class="ti ti-message-star"></i><span>Feedback</span>
                          </a>
                        </li>
                        {#if canAccess('user_payments', 'view', currentUser)}
                        <li
                          class:active={currentPath.startsWith(
                            "/admin/payment",
                          )}
                        >
                          <a
                            href="/admin/payment"
                            class:active={currentPath.startsWith(
                              "/admin/payment",
                            )}
                          >
                            <i class="ti ti-wallet"></i><span
                              >Employee Expenses</span
                            >
                          </a>
                        </li>
                        {/if}
                      {/if}
                    </ul>
                  </li>
                  {#if currentUser?.role === "master" || currentUser?.role === "admin"}
                    <li class="menu-title"><span>REPORTS</span></li>
                    <li>
                      <ul>
                        {#if canAccess('reports', 'view', currentUser)}
                        <li class:active={currentPath.startsWith("/admin/reports/user-activity")}>
                          <a
                            href="/admin/reports/user-activity"
                            class:active={currentPath.startsWith("/admin/reports/user-activity")}
                          >
                            <i class="ti ti-chart-bar"></i><span>User Activity</span>
                          </a>
                        </li>
                        <li class:active={currentPath.startsWith("/admin/reports/pi-sales")}>
                          <a
                            href="/admin/reports/pi-sales"
                            class:active={currentPath.startsWith("/admin/reports/pi-sales")}
                          >
                            <i class="ti ti-file-invoice"></i><span>PI Sales</span>
                          </a>
                        </li>
                        {/if}
                      </ul>
                    </li>
                  {/if}

                  {#if currentUser?.role === "master" || currentUser?.role != "user"}
                    <li class="menu-title menu-title-collapse">
                      <button
                        type="button"
                        class="menu-title-toggle"
                        class:collapsed={!commonOpen}
                        on:click={toggleCommonSection}
                        aria-expanded={commonOpen}
                      >
                        <span>COMMON</span>
                        <i class="ti ti-chevron-down menu-title-chevron"></i>
                      </button>
                    </li>
                    {#if commonOpen}
                      <li>
                        <ul>
                          {#if currentUser?.role != "user"}
                            {#if canAccess('category', 'view', currentUser)}
                            <li
                              class:active={currentPath.startsWith(
                                "/admin/category",
                              )}
                            >
                              <a
                                href="/admin/category"
                                class:active={currentPath.startsWith(
                                  "/admin/category",
                                )}
                              >
                                <i class="ti ti-category"></i><span>Category</span>
                              </a>
                            </li>
                            {/if}
                            <li
                              class:active={currentPath.startsWith(
                                "/admin/company",
                              )}
                            >
                              <a
                                href="/admin/company"
                                class:active={currentPath.startsWith(
                                  "/admin/company",
                                )}
                              >
                                <i class="ti ti-building"></i><span>Companies</span>
                              </a>
                            </li>
                            {#if canAccess('users', 'view', currentUser)}
                            <li
                              class:active={currentPath.startsWith("/admin/user")}
                            >
                              <a
                                href="/admin/user"
                                class:active={currentPath.startsWith("/admin/user")}
                              >
                                <i class="ti ti-user-up"></i><span>Users</span>
                              </a>
                            </li>
                            {/if}
                          {/if}
                          {#if currentUser?.role != "user" && canAccess('history', 'view', currentUser)}
                            <li
                              class:active={currentPath.startsWith(
                                "/admin/history",
                              )}
                            >
                              <a
                                href="/admin/history"
                                class:active={currentPath.startsWith(
                                  "/admin/history",
                                )}
                              >
                                <i class="ti ti-clock"></i><span>User History</span>
                              </a>
                            </li>
                          {/if}
                          {#if currentUser?.role === "master"}
                            <li
                              class:active={currentPath.startsWith(
                                "/admin/setting",
                              )}
                            >
                              <a
                                href="/admin/setting"
                                class:active={currentPath.startsWith(
                                  "/admin/setting",
                                )}
                              >
                                <i class="ti ti-settings"></i><span>Setting</span>
                              </a>
                            </li>
                          {/if}
                        </ul>
                      </li>
                    {/if}
                  {/if}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="simplebar-placeholder"></div>
    </div>
    <div
      class="simplebar-track simplebar-horizontal"
      style="visibility: hidden;"
    >
      <div class="simplebar-scrollbar" style="width: 0px; display: none;"></div>
    </div>
    <div
      class="simplebar-track simplebar-vertical"
      style="visibility: visible;"
    >
      <div
        class="simplebar-scrollbar"
        style="height: 101px; transform: translate3d(0px, 0px, 0px); display: block;"
      ></div>
    </div>
  </div>

  <!-- Update button pinned to sidebar bottom -->
  <div
    class="absolute bottom-0 left-0 right-0 px-2 py-2 bg-white border-t border-gray-100 z-10"
  >
    <UpdateNotification />
  </div>
</div>

<style>
  @media print {
    .no-print {
      display: none;
    }
  }

  :global(.tech-query-sub li) {
    list-style: none !important;
  }
  :global(.tech-query-sub li::before),
  :global(.tech-query-sub li::after) {
    display: none !important;
    content: none !important;
  }
  :global(.tech-query-sub li a) {
    display: flex !important;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 24px !important;
  }
  :global(.tech-query-sub li a .sub-icon) {
    font-size: 15px;
    opacity: 0.8;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }
  :global(.tech-query-sub li.active a .sub-icon),
  :global(.tech-query-sub li a.active .sub-icon) {
    opacity: 1;
  }

  /* #4 — Open Queue live count badge */
  :global(.sidebar .sidebar-menu .open-queue-badge) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box;
    min-width: 18px;
    height: 18px;
    padding: 0 5px !important;
    margin: 0 0 0 6px !important;
    border-radius: 999px;
    background: #dc3545;
    color: #fff !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    letter-spacing: 0;
    white-space: nowrap;
    flex: none;
    text-align: center;
    vertical-align: middle;
    font-variant-numeric: tabular-nums;
    animation: badge-pulse 2s ease-in-out infinite;
  }

  /* Mini sidebar: pin count to the icon corner so the icon stays visible */
  :global(.mini-sidebar:not(.expand-menu) .sidebar .sidebar-menu ul li a) {
    position: relative;
  }
  :global(.mini-sidebar:not(.expand-menu) .sidebar .sidebar-menu .open-queue-badge) {
    position: absolute !important;
    top: 1px !important;
    right: 1px !important;
    margin: 0 !important;
    min-width: 14px !important;
    height: 14px !important;
    padding: 0 3px !important;
    font-size: 8px !important;
    line-height: 1 !important;
    z-index: 2;
    pointer-events: none;
  }
  :global(.mini-sidebar:not(.expand-menu) .sidebar .sidebar-menu a > .open-queue-badge ~ .open-queue-badge) {
    top: auto !important;
    bottom: 1px !important;
    right: 1px !important;
  }

  @keyframes badge-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.5);
    }
    50% {
      box-shadow: 0 0 0 5px rgba(220, 53, 69, 0);
    }
  }

  /* ── Role bar ───────────────────────────────────────────────────────────── */
  :global(.sr-bar) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 6px 4px;
    padding: 3px 7px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--rc) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--rc) 25%, transparent);
    overflow: hidden;
  }
  :global(.sr-icon-wrap) {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--rc) 18%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  :global(.sr-icon) {
    font-size: 12px;
    color: var(--rc);
    line-height: 1;
  }
  :global(.sr-label) {
    font-size: 0.6875rem;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--rc);
    white-space: nowrap;
  }
  :global(.sr-glow) {
    position: absolute;
    right: -14px;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--rc) 12%, transparent);
    pointer-events: none;
  }
  /* Collapsed mini-sidebar: just icon centred, no label */
  :global(.mini-sidebar:not(.expand-menu) .sr-bar) {
    margin: 2px 6px 4px;
    padding: 3px;
    justify-content: center;
    gap: 0;
  }
  :global(.mini-sidebar:not(.expand-menu) .sr-label),
  :global(.mini-sidebar:not(.expand-menu) .sr-glow) {
    display: none;
  }

  :global(.menu-title-collapse) {
    margin: 6px 0 4px !important;
  }

  :global(.menu-title-toggle) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    font-size: inherit;
    letter-spacing: inherit;
    text-transform: uppercase;
    color: inherit;
    line-height: inherit;
  }

  :global(.menu-title-toggle:hover) {
    color: var(--primary, #e41f07);
  }

  :global(.menu-title-chevron) {
    font-size: 14px;
    line-height: 1;
    transition: transform 0.2s ease;
    opacity: 0.7;
  }

  :global(.menu-title-toggle.collapsed .menu-title-chevron) {
    transform: rotate(-90deg);
  }
</style>
