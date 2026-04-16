<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import jQuery from "jquery";
  import { checkAuth } from "$lib/utils/auth";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import UpdateNotification from "$lib/components/UpdateNotification.svelte";

  export let setting;

  let openMenu = null;

  $: currentPath = $page.url.pathname;

  $: if (openMenu !== null) {
    openMenu = null;
  }

  const toggleMenu = (menuName) => {
    openMenu = openMenu === menuName ? null : menuName;
  };

  onMount(() => {
    const $ = jQuery;
    const wrapper = $(".main-wrapper");

    // ✅ Prevent duplicate overlays
    if ($(".sidebar-overlay").length === 0) {
      const overlay = $('<div class="sidebar-overlay"></div>');
      overlay.insertBefore(".main-wrapper");
    }

    const overlay = $(".sidebar-overlay");

    // Event handlers
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

    // Bind events
    $(document).on("click", "#mobile_btn", toggleMenuHandler);
    $(document).on(
      "click",
      ".sidebar-close, .sidebar-overlay",
      closeMenuHandler,
    );
    $(".sidebar-menu a").on("click", submenuClickHandler);
    $(document).on("mouseover", mouseOverHandler);

    // Activate submenu on load
    $(".sidebar-menu ul li.submenu a.active")
      .parents("li.submenu")
      .children("a")
      .addClass("active subdrop")
      .next("ul")
      .show();

    // Sticky sidebar (optional)
    if ($(window).width() > 767 && $(".theiaStickySidebar").length > 0) {
      $(".theiaStickySidebar").theiaStickySidebar({
        additionalMarginTop: 30,
      });
    }

    // ✅ Clean up on destroy
    return () => {
      $(document).off("click", "#mobile_btn", toggleMenuHandler);
      $(document).off(
        "click",
        ".sidebar-close, .sidebar-overlay",
        closeMenuHandler,
      );
      $(".sidebar-menu a").off("click", submenuClickHandler);
      $(document).off("mouseover", mouseOverHandler);
    };
  });

  let currentUser;
  onMount(() => {
    currentUser = checkAuth();
    if (!currentUser) {
    }
  });
</script>

<div class="sidebar no-print" id="sidebar">
  <!-- Start Logo -->
  <div class="sidebar-logo flex items-center h-[57px]">
    <div>
      <!-- Logo Normal -->
      <a href="/admin/dashboard" class="logo logo-normal">
        {#if setting?.logo}
          <img
            src={ATTACHMENT_BASE_URL + setting?.logo}
            class="h-[50px]"
            alt={setting?.title}
          />
        {/if}
      </a>

      <!-- Logo Small -->
      <a href="/admin/dashboard" class="logo-small">
        {#if setting?.logoSmall}
          <img
            src={ATTACHMENT_BASE_URL + setting?.logoSmall}
            alt={setting?.title}
          />
        {/if}
      </a>

      <!-- Logo Dark -->
      <a href="/admin/dashboard" class="dark-logo">
        <img src="/assets/img/logo-white.svg" alt={setting?.title} />
      </a>
    </div>
    <button class="sidenav-toggle-btn btn border-0 p-0 active" id="toggle_btn">
      <i class="ti ti-arrow-bar-to-left"></i>
    </button>

    <!-- Sidebar Menu Close -->
    <button class="sidebar-close">
      <i class="ti ti-x align-middle"></i>
    </button>
  </div>
  <!-- End Logo -->

  <!-- Sidenav Menu -->
  <div class="sidebar-inner simplebar-scrollable-y" data-simplebar="init">
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
                <ul>
                  <li class="menu-title"><span>Main Menu</span></li>
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
                      <li class="submenu">
                        <a
                          href="#orders"
                          class:active={currentPath.startsWith("/admin/order")}
                        >
                          <i class="ti ti-medal"></i><span>Orders</span><span
                            class="menu-arrow"
                          ></span>
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
                              href="/admin/order/last-activity"
                              class:active={currentPath ===
                                "/admin/order/last-activity"}>No Follow Up</a
                            >
                          </li>
                          <li>
                            <a
                              href="/admin/order/won"
                              class:active={currentPath === "/admin/order/won"}
                              >Won</a
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
                              class:active={currentPath === "/admin/order/lost"}
                              >Lost</a
                            >
                          </li>
                        </ul>
                      </li>
                      <li
                        class:active={currentPath.startsWith("/admin/invoice")}
                      >
                        <a
                          href="/admin/invoice"
                          class:active={currentPath.startsWith(
                            "/admin/invoice",
                          )}
                        >
                          <i class="ti ti-invoice"></i><span>Invoice (PI)</span>
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
                        class:active={currentPath.startsWith("/admin/payment")}
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
                      <li class:active={currentPath.startsWith("/admin/stock")}>
                        <a
                          href="/admin/stock"
                          class:active={currentPath.startsWith("/admin/stock")}
                        >
                          <i class="ti ti-package"></i><span>Stock</span>
                        </a>
                      </li>
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
      <div
        class="simplebar-placeholder"
        style="width: 239px; height: 3056px;"
      ></div>
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

  <!-- Update button at sidebar bottom -->
  <div class="p-3 border-t border-gray-100">
    <UpdateNotification />
  </div>
</div>

<style>
  @media print {
    .no-print {
      display: none;
    }
  }
</style>
