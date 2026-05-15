<script>
  import { onDestroy, onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_BASE_URL } from "$lib/constants/constants";
  import { formatDistanceToNow } from "date-fns";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { checkAuth, logoutUser } from "$lib/utils/auth";
  import { invoke } from "@tauri-apps/api/tauri";
  import { openQueryCount } from "$lib/stores/queryStore";
  import { incrementUnread } from "$lib/stores/queryUnreadCounts";

  let currentUser = null;
  onMount(() => {
    currentUser = checkAuth();
  });

  // ── sound ─────────────────────────────────────────────────────────────────
  // #10 — Different sound per notification type
  function playNotificationSound(type = "query") {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      if (type === "query_open") {
        // Urgent 3-pulse tone for new open queries
        [0, 0.18, 0.36].forEach((delay, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "square";
          osc.frequency.value = 880 + i * 110;
          gain.gain.setValueAtTime(0, ctx.currentTime + delay);
          gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + delay + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.14);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.15);
        });
      } else if (type === "OrderReminder") {
        // Warm double-chime for order reminders
        [[660, 0], [880, 0.22]].forEach(([freq, delay]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.55);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.55);
        });
      } else {
        // Soft single-note for chat replies / other
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = 780;
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch {
      // fail silently
    }
  }

  // ── toast stack ───────────────────────────────────────────────────────────
  let toasts = [];

  function addToast(notification) {
    const id = `${Date.now()}-${Math.random()}`;
    toasts = [...toasts, { id, notification }];
  }

  function removeToast(id) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  async function clickToast(toast) {
    removeToast(toast.id);
    await readNotification(toast.notification.id);
    const { type, queryId, order } = toast.notification;
    if (type === "OrderReminder" && order?.id) {
      goto(`/admin/order/${order.id}`);
    } else if (type === "query_open") {
      goto("/admin/query/open");
    } else if (queryId) {
      goto(`/admin/query/${queryId}`);
    } else {
      goto("/admin/query");
    }
  }

  // #3 / #5 — Type-aware icon, accent, label
  function toastIcon(type) {
    if (type === "OrderReminder") return "⏰";
    if (type === "query_open") return "🎫";
    if (type === "query") return "💬";
    return "🔔";
  }

  function toastAccent(type) {
    if (type === "OrderReminder") return "#fd7e14";
    if (type === "query_open") return "#dc3545";
    if (type === "query") return "#0d6efd";
    return "#6c757d";
  }

  // #5 — Bell dropdown helpers
  function dropdownIcon(type) {
    if (type === "OrderReminder") return "ti-clock";
    if (type === "query_open") return "ti-ticket";
    if (type === "query") return "ti-message-circle";
    return "ti-bell";
  }

  function dropdownAccent(type) {
    if (type === "OrderReminder") return "#fd7e14";
    if (type === "query_open") return "#dc3545";
    if (type === "query") return "#0d6efd";
    return "#6c757d";
  }

  function dropdownLabel(type) {
    if (type === "OrderReminder") return "Order";
    if (type === "query_open") return "New Query";
    if (type === "query") return "Chat Reply";
    return "Notification";
  }

  function dropdownLabelClass(type) {
    if (type === "OrderReminder") return "bg-warning text-dark";
    if (type === "query_open") return "bg-danger text-white";
    if (type === "query") return "bg-primary text-white";
    return "bg-secondary text-white";
  }

  // #3 — Priority badge helpers
  function priorityBadgeClass(priority) {
    if (priority === "high") return "bg-danger text-white";
    if (priority === "medium") return "bg-warning text-dark";
    if (priority === "low") return "bg-success text-white";
    return "";
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ── notifications bell ────────────────────────────────────────────────────
  let notifications = [];
  let loading;
  let errorMessage = "";
  let formErrors = {};

  async function fetchNotifications() {
    try {
      const query = new URLSearchParams({ read: false });
      const data = await authApiFetch(`${API_ROUTES.NOTIFICATION}?${query.toString()}`, { method: "GET" });
      notifications = data.data;
    } catch (error) {
      console.error("Fetch error:", error);
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
    }
  }

  // #4 — fetch initial open query count for tech users
  async function fetchOpenQueryCount() {
    if (currentUser?.subRole !== "tech") return;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/stats`);
      openQueryCount.set(res.open ?? 0);
    } catch (_) {}
  }

  let eventSource;
  onMount(() => {
    fetchNotifications();
    fetchOpenQueryCount();
    eventSource = new EventSource(`${API_BASE_URL}/${API_ROUTES.NOTIFICATION}/sse`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data?.data?.user?.id === currentUser?.id) {
        if (data?.data?.type === "force_logout") {
          eventSource?.close();
          logoutUser().finally(() => goto("/login"));
          return;
        }
        // Don't show toast if user is already viewing this exact query
        const alreadyOnQuery =
          data.data.queryId &&
          $page.params?.id === String(data.data.queryId);

        if (!alreadyOnQuery) {
          // #10 — play different sound per type
          playNotificationSound(data.data.type);
          addToast(data.data);
        }
        notifications = [data.data, ...notifications];
        // #4 — increment live open count for query_open events
        if (data.data.type === "query_open") {
          openQueryCount.update((n) => n + 1);
        }
        // increment unread count for chat message notifications
        if (data.data.type === "query" && data.data.queryId) {
          incrementUnread(data.data.queryId);
        }
      }
    };

    eventSource.onopen = () => {
      // re-sync bell count and open query count whenever the SSE (re)connects
      fetchNotifications();
      fetchOpenQueryCount();
    };

    eventSource.onerror = () => {
      // do NOT close — browser will auto-reconnect when server is back
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
    try {
      const data = await authApiFetch(API_ROUTES.NOTIFICATION + "/" + id, {
        method: "PUT",
        data: JSON.stringify({ read: true }),
      });
      notifications = notifications.filter((n) => n.id !== data.data.id);
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
</script>

<!-- ── Bell dropdown ─────────────────────────────────────────────────────── -->
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

    <div class="dropdown-menu p-0 dropdown-menu-end dropdown-menu-lg" style="min-height: 300px;">
      <div class="p-2 border-bottom">
        <div class="row align-items-center">
          <div class="col">
            <h6 class="m-0 fs-16 fw-semibold">Notifications</h6>
          </div>
        </div>
      </div>

      <div class="notification-body position-relative z-2 rounded-0 overflow-auto" data-simplebar>
        {#if notifications?.length}
          {#each notifications as notification}
            <!-- #5 — colored left border strip per type -->
            <div
              class="dropdown-item notification-item py-3 text-wrap border-bottom ntf-dropdown-item"
              style="border-left: 3px solid {dropdownAccent(notification?.type)} !important;"
            >
              <div class="d-flex gap-2">
                <!-- Type icon instead of generic avatar -->
                <div
                  class="ntf-type-icon flex-shrink-0"
                  style="background: {dropdownAccent(notification?.type)}1a; color: {dropdownAccent(notification?.type)};"
                >
                  <i class="ti {dropdownIcon(notification?.type)}"></i>
                </div>
                <div class="flex-grow-1 min-w-0">
                  <!-- Type label + priority badge row -->
                  <div class="d-flex align-items-center gap-1 mb-1 flex-wrap">
                    <span class="badge {dropdownLabelClass(notification?.type)} ntf-label-badge">
                      {dropdownLabel(notification?.type)}
                    </span>
                    {#if notification?.priority && notification?.type === "query_open"}
                      <span class="badge {priorityBadgeClass(notification?.priority)} ntf-label-badge">
                        {notification.priority}
                      </span>
                    {/if}
                  </div>
                  <!-- Message -->
                  <p class="mb-1 text-wrap fs-13">
                    {notification?.message}
                  </p>
                  <div class="d-flex justify-content-between align-items-center">
                    <span class="fs-12 text-muted">
                      <i class="ti ti-clock me-1"></i>
                      {notification?.createdAt &&
                        formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          includeSeconds: false,
                        }).replace("about ", "")}
                    </span>
                    {#if notification?.read === false}
                      <button
                        type="button"
                        on:click={() => readNotification(notification?.id)}
                        class="notification-read !block rounded-circle bg-danger"
                        data-bs-toggle="tooltip"
                        title="Mark as Read"
                        aria-label="Mark as Read"
                      ></button>
                    {/if}
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

      <div class="p-2 rounded-bottom border-top text-center">
        <a href="/admin/notifications" class="text-center text-decoration-underline fs-14 mb-0">
          View All Notifications
        </a>
      </div>
    </div>
  </div>
</div>

<!-- ── Toast Stack ────────────────────────────────────────────────────────── -->
<div class="ntf-stack">
  {#each toasts as toast (toast.id)}
    <div
      class="ntf-card"
      style="--accent: {toastAccent(toast.notification.type)}"
      in:fly={{ x: 380, duration: 380, opacity: 0 }}
      out:fly={{ x: 380, duration: 280, opacity: 0 }}
      on:click={() => clickToast(toast)}
      role="button"
      tabindex="0"
      on:keydown={(e) => e.key === "Enter" && clickToast(toast)}
    >
      <!-- Close button -->
      <button
        class="ntf-close"
        on:click|stopPropagation={() => removeToast(toast.id)}
        aria-label="Dismiss"
      >&#x2715;</button>

      <!-- Body -->
      <div class="ntf-body">
        <span class="ntf-icon">{toastIcon(toast.notification.type)}</span>
        <div class="ntf-content">
          <!-- #3 — type label + priority badge -->
          <div class="ntf-badges">
            <span class="ntf-type-badge" style="background: {toastAccent(toast.notification.type)}22; color: {toastAccent(toast.notification.type)};">
              {dropdownLabel(toast.notification.type)}
            </span>
            {#if toast.notification.priority && toast.notification.type === "query_open"}
              <span class="ntf-priority-badge ntf-priority-{toast.notification.priority}">
                {toast.notification.priority === "high" ? "🔴" : toast.notification.priority === "medium" ? "🟡" : "🟢"}
                {toast.notification.priority}
              </span>
            {/if}
          </div>
          <p class="ntf-msg">{toast.notification.message}</p>
          <span class="ntf-time">{formatTime(toast.notification.createdAt)}</span>
        </div>
      </div>

      <!-- Shimmer line -->
      <div class="ntf-line"></div>
    </div>
  {/each}
</div>

<style>
  /* ── Stack container ──────────────────────────────────────────────────── */
  .ntf-stack {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    display: flex;
    flex-direction: column-reverse;
    gap: 12px;
    pointer-events: none;
  }

  /* ── Card ─────────────────────────────────────────────────────────────── */
  .ntf-card {
    pointer-events: all;
    position: relative;
    width: 340px;
    background: rgba(10, 16, 35, 0.82);
    backdrop-filter: blur(22px) saturate(180%);
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-left: 3px solid var(--accent);
    border-radius: 14px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.35),
      0 2px 8px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .ntf-card:hover {
    transform: translateY(-2px) scale(1.01);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.45),
      0 4px 12px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  /* ── Close button ─────────────────────────────────────────────────────── */
  .ntf-close {
    position: absolute;
    top: 10px;
    right: 12px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }

  .ntf-close:hover {
    background: rgba(220, 53, 69, 0.6);
    color: #fff;
    border-color: transparent;
  }

  /* ── Body ─────────────────────────────────────────────────────────────── */
  .ntf-body {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 40px 12px 16px;
  }

  .ntf-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .ntf-content {
    flex: 1;
    min-width: 0;
  }

  .ntf-msg {
    margin: 0 0 5px;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.92);
    line-height: 1.45;
    word-break: break-word;
  }

  .ntf-time {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.38);
    letter-spacing: 0.3px;
  }

  /* ── Shimmer line ─────────────────────────────────────────────────────── */
  .ntf-line {
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--accent) 40%,
      rgba(255, 255, 255, 0.7) 50%,
      var(--accent) 60%,
      transparent 100%
    );
    background-size: 250% 100%;
    animation: ntf-shimmer 2.2s ease-in-out infinite;
  }

  @keyframes ntf-shimmer {
    0%   { background-position: 150% center; }
    100% { background-position: -150% center; }
  }

  /* ── #3 — Toast badges ───────────────────────────────────────────────────── */
  .ntf-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
    flex-wrap: wrap;
  }

  .ntf-type-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 20px;
  }

  .ntf-priority-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 20px;
  }

  .ntf-priority-high   { background: rgba(220,53,69,0.25);  color: #ff8fa3; }
  .ntf-priority-medium { background: rgba(255,193,7,0.25);  color: #ffc107; }
  .ntf-priority-low    { background: rgba(25,135,84,0.25);  color: #75b798; }

  /* ── #5 — Dropdown icon ─────────────────────────────────────────────────── */
  .ntf-dropdown-item {
    transition: background 0.15s;
    padding-left: 14px !important;
  }

  .ntf-type-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .ntf-label-badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    padding: 2px 6px;
  }
</style>
