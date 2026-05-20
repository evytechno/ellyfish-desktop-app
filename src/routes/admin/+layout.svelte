<script>
  import "../../app.css";
  import "../../styles/main.css";
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import Header from "$lib/components/Header.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import ServerOffline from "$lib/components/ServerOffline.svelte";
  import InactivityWarning from "$lib/components/InactivityWarning.svelte";
  import { startInactivityTimer, stopInactivityTimer } from "$lib/utils/inactivityTimer";
  import { logoutUser } from "$lib/utils/auth";
  import { onDestroy } from "svelte";

  let showWarning  = false;
  let warningSeconds = 120;
  import { settingStore } from "$lib/stores/dataStores";
  let loadingData = true;
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  let setting = null;
  let errorMessage = "";

  onMount(() => {
    window.$ = jQuery;
    window.jQuery = jQuery;
  });

  import { setupBootstrapHandlers } from "$lib/utils/js/bootstrapHandlers.js";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";

  onMount(() => {
    window.$ = jQuery;
    window.jQuery = jQuery;

    function closeOffcanvas() {
      jQuery("#offcanvas_add").removeClass("show");
      jQuery(".offcanvas-backdrop").remove();
      jQuery("body").css({ overflow: "", paddingRight: "" });
    }

    // Open offcanvas
    jQuery(document).on(
      "click",
      "a[data-bs-target='#offcanvas_add']",
      function () {
        // Remove any existing backdrop before adding a new one
        jQuery(".offcanvas-backdrop").remove();

        // Create and insert a new backdrop
        const overlay = jQuery(
          '<div class="offcanvas-backdrop fade show"></div>'
        );
        overlay.insertBefore(".main-wrapper");

        jQuery("#offcanvas_add").addClass("show");
        jQuery("body").css({ overflow: "hidden", paddingRight: "15px" });
      }
    );

    jQuery(document).on("click", ".offcanvas-backdrop", closeOffcanvas);
    jQuery(document).on(
      "click",
      '[data-bs-dismiss="offcanvas"]',
      closeOffcanvas
    );

    jQuery(document).on("click", function (e) {
      if (!jQuery(e.target).closest(".dropdown").length) {
        jQuery(".dropdown-toggle").removeClass("show");
        jQuery("[data-bs-toggle='dropdown']").removeClass("show");
        jQuery(".dropdown-menu").removeClass("show").removeAttr("style");
      }
    });

    jQuery(document).on("click", "[data-bs-toggle='dropdown']", function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      const toggle = jQuery(this);
      const parent = toggle.closest(".dropdown");
      const menu = parent.find(".dropdown-menu");
      const position = menu.data("popper-placement");

      const isOpen = toggle.hasClass("show");

      jQuery(".dropdown-toggle").removeClass("show");
      jQuery(".dropdown-menu").removeClass("show").removeAttr("style");

      if (!isOpen) {
        toggle.addClass("show");
        menu.addClass("show");

        const toggleOffset = toggle.offset();
        const toggleHeight = toggle.outerHeight();
        const toggleWidth = toggle.outerWidth();
        const menuWidth = menu.outerWidth();

        let top = "0px",
          left = "0px",
          right = "0px",
          bottom = "0px";

        switch (position) {
          case "top-start":
            top = "auto";
            left = "auto";
            right = "0px";
            bottom = "0px";
            break;
          case "top-end":
            top = "auto";
            left = "auto";
            right = "0px";
            bottom = "0px";
            break;
          case "bottom-start":
            top = "auto";
            left = "auto";
            right = "0px";
            bottom = "0px";
            break;
          case "bottom-end":
            top = "auto";
            left = "auto";
            right = "0px";
            bottom = "0px";
            break;
          case "left-start":
            top = "auto";
            left = "auto";
            right = "0px";
            bottom = "0px";
            break;
          case "right-start":
            top = "auto";
            left = "auto";
            right = "0px";
            bottom = "0px";
            break;
          // Add more cases as needed
          default:
            top = "0px";
            left = "0px";
            right = "auto";
            bottom = "auto";
        }

        menu.css({
          position: "absolute",
          inset: `${top} ${left} ${bottom} ${right}`,
          margin: "0px",
          transform: "translate(0px, 41px)",
        });
      } else {
        toggle.removeClass("show");
        menu.removeClass("show").removeAttr("style");
      }
    });

    setupBootstrapHandlers();
    fetchSetting();

    // Start inactivity timer (auto-logout after 30 min)
    startInactivityTimer({
      onWarning: (secs) => {
        warningSeconds = secs;
        showWarning = true;
      },
      onLogout: async () => {
        showWarning = false;
        await logoutUser();
        goto("/login");
      },
    });

    setTimeout(() => {
      jQuery("body").css({ overflow: "", paddingRight: "" });
    }, 1000);
  });

  onDestroy(() => stopInactivityTimer());

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
      // Cache logo for splash screen on next load (prefer logoSmall, fall back to logo)
      const splashLogo = data?.logoSmall || data?.logo;
      if (splashLogo) {
        localStorage.setItem('splash_logo', ATTACHMENT_BASE_URL + splashLogo);
      }
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
</script>

<head>
  <title>{setting?.title ? setting?.title : "Elly Fish"}</title>

  <link
    rel="icon"
    href={setting?.favicon ? ATTACHMENT_BASE_URL + setting?.favicon : ""}
  />
</head>

{#if loadingData}
  <Loader />
{/if}
<ServerOffline />
<InactivityWarning bind:show={showWarning} secondsLeft={warningSeconds} />
<main class="main-wrapper min-h-screen bg-gray-50">
  <Header />
  <Sidebar {setting} />
  <slot />

  <!-- Start Footer -->
  <footer
    class="footer flex justify-between text-md-start text-center no-print"
  >
    <p class="mb-md-0 mb-1">
      Copyright © 2025
      <!-- <a
        href="https://pbjatt.in/"
        target="_blank"
        class="link-primary text-decoration-underline"
      >
        PBJATT
      </a> -->
    </p>
  </footer>
  <!-- End Footer -->
</main>

<style>
  @media print {
    main {
      background-color: #fff !important;
    }
    .no-print {
      display: none;
    }
  }
</style>
