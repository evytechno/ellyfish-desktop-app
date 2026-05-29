<script>
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import jQuery from "jquery";
  import { checkAuth } from "$lib/utils/auth";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import UpdateNotification from "$lib/components/UpdateNotification.svelte";
  import { openQueryCount } from "$lib/stores/queryStore";
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

  onMount(() => {
    // set user first so conditional menu blocks render before jQuery scans them
    currentUser = checkAuth();

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
              <div id="sidebar-menu" class="sidebar-menu">
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
                      {#if currentUser?.subRole === "tech_helper"}
                        <li class="submenu">
                          <a
                            href="#queries"
                            class:active={currentPath.startsWith(
                              "/admin/query",
                            )}
                          >
                            <i class="ti ti-subtask"></i><span>Queries</span>
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
                          </ul>
                        </li>
                      {:else if currentUser?.subRole === "tech"}
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
                          </ul>
                        </li>
                      {:else if currentUser?.role !== "user"}
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
                      {:else if currentUser?.subRole === "telecaller"}
                        <li
                          class:active={currentPath.startsWith("/admin/query")}
                        >
                          <a
                            href="/admin/query"
                            class:active={currentPath.startsWith(
                              "/admin/query",
                            )}
                          >
                            <i class="ti ti-help-circle"></i><span>Queries</span
                            >
                          </a>
                        </li>
                      {/if}

                      <!-- Group Chat — visible to all authenticated users -->
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

                      <!-- Orders — hidden from tech/tech_helper unless orderAccess is true -->
                      {#if (currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess}
                        <li class="submenu">
                          <a
                            href="#orders"
                            class:active={currentPath.startsWith(
                              "/admin/order",
                            )}
                          >
                            <i class="ti ti-medal"></i><span>Orders</span>
                            <span class="menu-arrow"></span>
                          </a>
                          <ul>
                            <li>
                              <a
                                href="/admin/order"
                                class:active={currentPath === "/admin/order"}
                                >Orders</a
                              >
                            </li>
                            <li>
                              <a
                                href="/admin/order-list/excel"
                                class:active={currentPath ===
                                  "/admin/order-list/excel"}>Excel Orders</a
                              >
                            </li>
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
                        <li
                          class:active={currentPath.startsWith(
                            "/admin/invoice/tax",
                          )}
                        >
                          <a
                            href="/admin/invoice/tax"
                            class:active={currentPath.startsWith(
                              "/admin/invoice/tax",
                            )}
                          >
                            <i class="ti ti-invoice"></i><span
                              >Invoice (TAX)</span
                            >
                          </a>
                        </li>
                        <li
                          class:active={currentPath.startsWith(
                            "/admin/workorder",
                          )}
                        >
                          <a
                            href="/admin/workorder"
                            class:active={currentPath.startsWith(
                              "/admin/workorder",
                            )}
                          >
                            <i class="ti ti-invoice"></i><span>Work Order</span>
                          </a>
                        </li>
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
                        <li
                          class:active={currentPath.startsWith("/admin/stock")}
                        >
                          <a
                            href="/admin/stock"
                            class:active={currentPath.startsWith(
                              "/admin/stock",
                            )}
                          >
                            <i class="ti ti-package"></i><span>Stock</span>
                          </a>
                        </li>
                      {/if}
                    </ul>
                  </li>
                  {#if currentUser?.role === "master" || currentUser?.role != "user"}
                    <li class="menu-title"><span>COMMAN</span></li>{/if}
                  <li>
                    <ul>
                      {#if currentUser?.role != "user"}
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
                            <i class="ti ti-building"></i><span>Category</span>
                          </a>
                        </li>
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
                      {#if currentUser?.role != "user"}
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
                            <i class="ti ti-tool"></i><span>Setting</span>
                          </a>
                        </li>
                      {/if}
                    </ul>
                  </li>
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
    class="absolute bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-100 z-10"
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
    gap: 8px;
    padding: 8px 10px 8px 26px !important;
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
  :global(.open-queue-badge) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 20px;
    background: #dc3545;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0;
    animation: badge-pulse 2s ease-in-out infinite;
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
    gap: 7px;
    margin: 4px 10px 6px;
    padding: 5px 9px;
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
    font-size: 10px;
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
    margin: 4px 8px 6px;
    padding: 5px;
    justify-content: center;
    gap: 0;
  }
  :global(.mini-sidebar:not(.expand-menu) .sr-label),
  :global(.mini-sidebar:not(.expand-menu) .sr-glow) {
    display: none;
  }
</style>
