<script>
  import { onDestroy, onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_BASE_URL } from "$lib/constants/constants";
  import Swal from "sweetalert2";
  import { formatDistanceToNow } from "date-fns";
  import { goto } from "$app/navigation";

  import { checkAuth } from "$lib/utils/auth";
  import { invoke } from "@tauri-apps/api/tauri";

  let currentUser = null;
  onMount(() => {
    currentUser = checkAuth();
  });

  let notifications = [];
  let loading;
  let errorMessage = "";
  let formErrors = {};

  async function fetchNotifications() {
    try {
      const query = new URLSearchParams({
        read: false,
      });
      const data = await authApiFetch(
        `${API_ROUTES.NOTIFICATION}?${query.toString()}`,
        {
          method: "GET",
        }
      );

      notifications = data.data;
    } catch (error) {
      console.error("Fetch error:", error);
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
    }
  }

  let eventSource;
  onMount(() => {
    fetchNotifications();
    eventSource = new EventSource(
      `${API_BASE_URL}/${API_ROUTES.NOTIFICATION}/sse`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data?.data?.user?.id === currentUser?.id) {
        let notification = data.data;
        let description = "";
        const time = new Date(notification.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        if (notification.type === "OrderReminder") {
          description = `<div>
          <p class="mb-1 text-wrap text-sm">
          Hey, <span class="text-dark fw-medium">${notification?.user?.name}</span> – Check order '<span class="text-dark fw-medium">${notification?.order?.title}</span>' for “<span class="text-dark">${notification?.message}</span></p>
            <p class="mb-0 text-wrap text-xs">${time}</p>
        <div>`;
        } else {
          description = `<div>
          <p class="mb-1 text-wrap text-sm">
          Hey, <span class="text-dark fw-medium">${notification?.user?.name}</span> – for “<span class="text-dark">${notification?.message}</span></p>
            <p class="mb-0 text-wrap text-xs">${time}</p>
        <div>`;
        }

        Swal.fire({
          toast: true,
          position: "bottom-end",
          html: description,
          showConfirmButton: false,
          timer: 10000,
          timerProgressBar: true,
          background: "#fefefe",
          customClass: {
            popup: "styled-toast",
          },
        });

        notifications = [data.data, ...notifications];
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      eventSource.close();
    };
  });

  onDestroy(() => {
    eventSource?.close();
  });
  $: unreadCount = notifications.filter((n) => !n.read).length;
  $: invoke("set_tray_tooltip", { count: unreadCount }).catch(() => {});

  async function readNotification(id) {
    errorMessage = "";
    loading = true;
    formErrors = {};

    const updateNotification = {
      read: true,
    };

    try {
      const data = await authApiFetch(API_ROUTES.NOTIFICATION + "/" + id, {
        method: "PUT",
        data: JSON.stringify(updateNotification),
      });

      notifications = notifications.filter(
        (notification) => notification.id !== data.data.id
      );
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      console.log("formErrors : ", formErrors);
      loading = false;
    }
  }
</script>

<div class="header-item">
  <div class="dropdown me-2">
    <button
      class="topbar-link btn topbar-link dropdown-toggle drop-arrow-none"
      data-bs-toggle="dropdown"
      data-bs-offset="0,24"
      type="button"
      aria-haspopup="false"
      aria-expanded="false"
    >
      <i class="ti ti-bell-check fs-16 animate-ring"></i>
      {#if unreadCount > 0}
        <span class="badge rounded-pill">{unreadCount}</span>
      {/if}
    </button>

    <div
      class="dropdown-menu p-0 dropdown-menu-end dropdown-menu-lg"
      style="min-height: 300px;"
    >
      <div class="p-2 border-bottom">
        <div class="row align-items-center">
          <div class="col">
            <h6 class="m-0 fs-16 fw-semibold">Notifications</h6>
          </div>
        </div>
      </div>

      <!-- Notification Body -->
      <div
        class="notification-body position-relative z-2 rounded-0 overflow-auto"
        data-simplebar
      >
        <!-- Item-->
        {#if notifications?.length}
          {#each notifications as notification}
            <div
              class="dropdown-item notification-item py-3 text-wrap border-bottom"
              id="notification-2"
            >
              <div class="d-flex">
                <div class="me-2 position-relative flex-shrink-0">
                  <img
                    src="/assets/img/profiles/user.png"
                    class="avatar-md rounded-circle"
                    alt="Img"
                  />
                </div>
                <div class="flex-grow-1">
                  {#if notification?.type === "OrderReminder"}
                    <p class="mb-1 text-wrap">
                      Hey, <span class="text-dark fw-medium"
                        >{notification?.user?.name}</span
                      >
                      – Check order '<button
                        on:click={goto(
                          "/admin/order/" + notification?.order?.id
                        )}
                        class="text-dark fw-medium cursor-pointer"
                        >{notification?.order?.title}</button
                      >' for “<span class="text-dark"
                        >{notification?.message}</span
                      >”
                    </p>
                  {:else}
                    <p class="mb-1 text-wrap">
                      Hey, <span class="text-dark fw-medium"
                        >{notification?.user?.name}</span
                      >
                      – “<span class="text-dark">{notification?.message}</span>”
                    </p>
                  {/if}
                  <div
                    class="d-flex justify-content-between align-items-center"
                  >
                    <span class="fs-12">
                      <i class="ti ti-clock me-1"></i>
                      {notification?.createdAt &&
                        formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          includeSeconds: false,
                        }).replace("about ", "")}
                    </span>
                    <div class="d-flex align-items-center float-end gap-2">
                      {#if notification?.read === false}
                        <button
                          type="button"
                          on:click={() => readNotification(notification?.id)}
                          class="notification-read !block rounded-circle bg-danger"
                          data-bs-toggle="tooltip"
                          title=""
                          data-bs-original-title="Make as Read"
                          aria-label="Make as Read"
                        ></button>
                      {/if}
                      <!-- <button
                      class="btn rounded-circle p-0"
                      data-dismissible="#notification-2"
                    >
                      <i class="ti ti-x"></i>
                    </button> -->
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {:else}
          <div class="p-3 text-wrap text-center">
            <div>No Notifications Found.</div>
          </div>
        {/if}
      </div>

      <!-- View All-->
      <div class="p-2 rounded-bottom border-top text-center">
        <a
          href="/admin/notifications"
          class="text-center text-decoration-underline fs-14 mb-0"
        >
          View All Notifications
        </a>
      </div>
    </div>
  </div>
</div>
