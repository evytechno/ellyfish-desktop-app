<script>
  import { onDestroy, onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { cubicOut, cubicIn } from "svelte/easing";
  import { flip } from "svelte/animate";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { missedReminderCount } from "$lib/stores/reminderStore";
  import { API_BASE_URL } from "$lib/constants/constants";
  import { formatDistanceToNow } from "date-fns";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { checkAuth, logoutUser } from "$lib/utils/auth";
  import { invoke } from "@tauri-apps/api/tauri";
  import { openQueryCount } from "$lib/stores/queryStore";
  import { incrementUnread } from "$lib/stores/queryUnreadCounts";
  import { uiToasts, dismissToast } from "$lib/stores/uiToast";
  import {
    isPermissionGranted,
    requestPermission,
    sendNotification,
  } from "@tauri-apps/api/notification";

  let currentUser = null;
  let osNotifEnabled = false;

  onMount(async () => {
    currentUser = checkAuth();
    // Request OS notification permission once on startup
    if (window.__TAURI__) {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === "granted";
        }
        osNotifEnabled = granted;
      } catch (_) {}
    }

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
        // Don't show toast if user is already viewing this query
        // For sub_query: only suppress if inline panel is open for that exact sub-query
        // For others: suppress if on the query's own page
        let alreadyOnQuery = false;
        if (data.data.type === "sub_query" && data.data.parentQueryId && data.data.queryId) {
          if (currentUser?.subRole === "tech_helper") {
            // tech_helper views sub-query as a standalone page
            alreadyOnQuery = $page.params?.id === String(data.data.queryId);
          } else {
            // tech views sub-query via parent query + inline panel
            const openSqParam = $page.url.searchParams.get("sq");
            alreadyOnQuery =
              $page.params?.id === String(data.data.parentQueryId) &&
              openSqParam === String(data.data.queryId);
          }
        } else if (data.data.queryId) {
          alreadyOnQuery = $page.params?.id === String(data.data.queryId);
        }

        if (!alreadyOnQuery) {
          // #10 — play different sound per type
          playNotificationSound(data.data.type);
          addToast(data.data);
          // OS notification when app is minimized / in background
          maybeOsNotify(data.data);
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
        // for sub-query notifications, track against the parent query's unread count
        if (data.data.type === "sub_query") {
          incrementUnread(data.data.parentQueryId ?? data.data.queryId);
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

  // Send an OS-level notification only when the window is not focused
  function maybeOsNotify(notification) {
    if (document.hasFocus()) return; // in foreground — in-app toast is enough

    const titles = {
      OrderReminder: "⏰ Order Reminder",
      query_open: "🎫 New Query",
      query: "💬 Query Reply",
      sub_query: "🔧 Sub-Query Update",
    };
    const title = titles[notification.type] || "🔔 Notification";
    const body = notification.message ?? "";

    // Tauri desktop app
    if (window.__TAURI__ && osNotifEnabled) {
      sendNotification({ title, body });
      return;
    }

    // Browser push fallback (web)
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if ("Notification" in window && Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body, icon: "/favicon.ico" });
      });
    }
  }

  // Snooze an OrderReminder — creates a new reminder 30 min from now
  async function snoozeReminder(toast) {
    removeToast(toast.id);
    try {
      await authApiFetch(`${API_ROUTES.ORDER_REMINDER}/${toast.notification.id}/snooze?minutes=30`, {
        method: "POST",
        data: {},
      });
    } catch (_) {}
  }

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
      } else if (type === "sub_query") {
        // Two-note ascending chime for sub-query status updates
        [[660, 0], [820, 0.2]].forEach(([freq, delay]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.38);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.38);
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
    const { type, queryId, parentQueryId, order } = toast.notification;
    if (type === "OrderReminder" && order?.id) {
      goto(`/admin/order/${order.id}`);
    } else if (type === "query_open") {
      // tech_helpers get query_open for sub-queries → sub-queue page
      // tech/others get query_open for main queries → open queue page
      goto(currentUser?.subRole === "tech_helper" ? "/admin/query/sub-queue" : "/admin/query/open");
    } else if (type === "sub_query" && parentQueryId && queryId) {
      // tech_helpers work on sub-queries as standalone pages
      // everyone else (tech) uses the parent query + inline panel
      if (currentUser?.subRole === "tech_helper") {
        goto(`/admin/query/${queryId}`);
      } else {
        goto(`/admin/query/${parentQueryId}?sq=${queryId}`);
      }
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
    if (type === "sub_query") return "🔧";
    return "🔔";
  }

  function toastAccent(type) {
    if (type === "OrderReminder") return "#fd7e14";
    if (type === "query_open") return "#dc3545";
    if (type === "query") return "#0d6efd";
    if (type === "sub_query") return "#0dcaf0";
    return "#6c757d";
  }

  // #5 — Bell dropdown helpers
  function dropdownIcon(type) {
    if (type === "OrderReminder") return "ti-clock";
    if (type === "query_open") return "ti-ticket";
    if (type === "query") return "ti-message-circle";
    if (type === "sub_query") return "ti-subtask";
    return "ti-bell";
  }

  function dropdownAccent(type) {
    if (type === "OrderReminder") return "#fd7e14";
    if (type === "query_open") return "#dc3545";
    if (type === "query") return "#0d6efd";
    if (type === "sub_query") return "#0dcaf0";
    return "#6c757d";
  }

  function dropdownLabel(type) {
    if (type === "OrderReminder") return "Order";
    if (type === "query_open") return "New Query";
    if (type === "query") return "Chat Reply";
    if (type === "sub_query") return "Sub-Query";
    return "Notification";
  }

  function dropdownLabelClass(type) {
    if (type === "OrderReminder") return "bg-warning text-dark";
    if (type === "query_open") return "bg-danger text-white";
    if (type === "query") return "bg-primary text-white";
    if (type === "sub_query") return "bg-info text-dark";
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

  onDestroy(() => {
    eventSource?.close();
  });

  $: unreadCount = notifications.filter((n) => !n.read).length;
  $: invoke("set_tray_tooltip", { count: unreadCount }).catch(() => {});
  $: missedReminderCount.set(notifications.filter((n) => !n.read && n.type === "OrderReminder").length);

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
      <i class="ti ti-bell-ringing animate-ring"></i>
      {#if unreadCount > 0}
        <span class="badge ntf-badge">{unreadCount}</span>
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
  <!-- UI toasts (showToast) -->
  {#each $uiToasts as t (t.id)}
    <div
      class="ntf-flash ntf-flash--{t.type}"
      style="--accent: {t.accent}; --flash-dur: {t.duration}ms"
      in:fly={{ x: 28, y: 10, duration: 420, opacity: 0, easing: cubicOut }}
      out:fly={{ x: 36, y: 0, duration: 260, opacity: 0, easing: cubicIn }}
      animate:flip={{ duration: 280, easing: cubicOut }}
      role="alert"
    >
      <button
        class="ntf-flash__close"
        on:click={() => dismissToast(t.id)}
        aria-label="Dismiss"
      >&#x2715;</button>
      <div class="ntf-flash__body">
        <span class="ntf-flash__icon" aria-hidden="true">{t.icon}</span>
        <div class="ntf-flash__text">
          <span class="ntf-flash__title">{t.title}</span>
          <p class="ntf-flash__msg">{t.message}</p>
        </div>
      </div>
      {#if t.duration > 0}
        <div class="ntf-flash__track" aria-hidden="true">
          <div class="ntf-flash__bar"></div>
        </div>
      {/if}
    </div>
  {/each}

  <!-- Query / notification toasts -->
  {#each toasts as toast (toast.id)}
    <div
      class="ntf-card"
      style="--accent: {toastAccent(toast.notification.type)}"
      in:fly={{ x: 28, duration: 400, opacity: 0, easing: cubicOut }}
      out:fly={{ x: 36, duration: 260, opacity: 0, easing: cubicIn }}
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
          {#if toast.notification.type === "OrderReminder"}
            <button
              class="ntf-snooze-btn"
              on:click|stopPropagation={() => snoozeReminder(toast)}
              title="Snooze 30 minutes"
            >⏱ Snooze 30 min</button>
          {/if}
        </div>
      </div>

      <!-- Shimmer line -->
      <div class="ntf-line"></div>
    </div>
  {/each}
</div>

<style>
  /* ── Bell badge ──────────────────────────────────────────────────────── */
  .ntf-badge {
    position: absolute;
    top: 0;
    right: 0;
    background: #E41F07;
    color: #fff;
    width: 14px;
    height: 14px;
    font-size: 8px;
    font-weight: 600;
    line-height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    padding: 0;
    min-width: unset;
    box-shadow: 0 0 0 1.5px #fff;
  }

  /* ── Stack container ──────────────────────────────────────────────────── */
  .ntf-stack {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    display: flex;
    flex-direction: column-reverse;
    gap: 10px;
    pointer-events: none;
    max-width: min(380px, calc(100vw - 32px));
  }

  /* ── Flash toast (showToast) ──────────────────────────────────────────── */
  .ntf-flash {
    pointer-events: all;
    position: relative;
    width: 100%;
    min-width: 260px;
    max-width: 340px;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    box-shadow:
      0 6px 20px rgba(15, 23, 42, 0.08),
      0 1px 4px rgba(15, 23, 42, 0.04);
    overflow: hidden;
    will-change: transform, opacity;
    font-family: "Golos Text", sans-serif;
  }
  .ntf-flash::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--accent);
  }
  .ntf-flash__title {
    display: block;
    font-size: var(--app-font-size, 12px);
    font-weight: 500;
    color: #212529;
    letter-spacing: 0;
    line-height: 1.35;
    margin-bottom: 2px;
  }
  .ntf-flash__msg {
    margin: 0;
    font-size: var(--app-font-size, 12px);
    font-weight: 400;
    color: #495057;
    line-height: 1.45;
    word-break: break-word;
  }
  .ntf-flash__icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    color: #fff;
    background: var(--accent);
    box-shadow: none;
  }
  .ntf-flash__body {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 32px 10px 12px;
  }
  .ntf-flash__text {
    flex: 1;
    min-width: 0;
    padding-top: 1px;
  }
  .ntf-flash__close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #adb5bd;
    font-size: 11px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .ntf-flash__close:hover {
    background: #f1f3f5;
    color: #495057;
  }
  .ntf-flash__track {
    height: 2px;
    background: #f1f3f5;
  }
  .ntf-flash__bar {
    height: 100%;
    width: 100%;
    background: var(--accent);
    transform-origin: left center;
    animation: ntf-flash-drain var(--flash-dur, 3800ms) linear forwards;
  }
  @keyframes ntf-flash-drain {
    from { transform: scaleX(1); opacity: 0.9; }
    to   { transform: scaleX(0); opacity: 0.55; }
  }
  .ntf-flash--success .ntf-flash__title { color: #2b8a3e; }
  .ntf-flash--error .ntf-flash__title { color: #c92a2a; }
  .ntf-flash--warning .ntf-flash__title { color: #e67700; }
  .ntf-flash--info .ntf-flash__title { color: #364fc7; }

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

  /* ── Snooze button ──────────────────────────────────────────────────────── */
  .ntf-snooze-btn {
    margin-top: 8px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid rgba(253, 126, 20, 0.5);
    background: rgba(253, 126, 20, 0.12);
    color: #fd7e14;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .ntf-snooze-btn:hover {
    background: rgba(253, 126, 20, 0.25);
    border-color: #fd7e14;
  }

</style>
